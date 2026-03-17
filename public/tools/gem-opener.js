(function() {
  'use strict';

  // --- Utilities ---
  
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Robust Tar Parser (minimal implementation for .gem)
  function parseTar(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const files = [];
    let offset = 0;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      
      // Check for null block (end of archive)
      if (header[0] === 0 && header[1] === 0) {
        offset += 512;
        if (offset < bytes.length && bytes[offset] === 0) break;
        continue;
      }

      const name = decoder.decode(header.subarray(0, 100)).split('\0')[0];
      const sizeStr = decoder.decode(header.subarray(124, 136)).trim();
      const size = parseInt(sizeStr, 8) || 0;
      const type = String.fromCharCode(header[156]);
      
      const contentOffset = offset + 512;
      const fileData = bytes.subarray(contentOffset, contentOffset + size);

      // We only care about normal files and directories for .gem
      if (type === '0' || type === '\0' || type === '5') {
        files.push({
          name: name.replace(/\/+$/, ''),
          size: size,
          isDir: type === '5' || name.endsWith('/'),
          data: fileData
        });
      }

      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  function formatRequirement(req) {
    if (!req) return 'Any';
    if (typeof req === 'string') return req;
    
    const extract = (v) => {
      if (typeof v === 'string') return v;
      if (v && v.version) return v.version;
      return String(v);
    };

    if (req.requirements && Array.isArray(req.requirements)) {
      return req.requirements.map(r => Array.isArray(r) ? r.map(extract).join(' ') : extract(r)).join(', ');
    }
    return extract(req);
  }

  // --- Main Tool Definition ---

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gem',
      dropLabel: 'Drop Ruby Gem',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js');
      },
      onFile: async function(file, content, helpers) {
        helpers.showLoading('Reading Gem structure...');

        // Ensure libraries are loaded (B1 Fix)
        const checkLibs = () => typeof pako !== 'undefined' && typeof jsyaml !== 'undefined';
        if (!checkLibs()) {
          let attempts = 0;
          while (!checkLibs() && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (!checkLibs()) {
            helpers.showError('Loading Error', 'External libraries (pako, js-yaml) failed to load. Please check your connection.');
            return;
          }
        }

        try {
          const outerFiles = parseTar(content);
          const metadataGz = outerFiles.find(f => f.name.includes('metadata.gz'));
          const dataTarGz = outerFiles.find(f => f.name.includes('data.tar.gz'));

          if (!metadataGz) throw new Error('Missing metadata.gz');

          helpers.showLoading('Decompressing metadata...');
          const decompressedMeta = pako.ungzip(metadataGz.data);
          const metaText = new TextDecoder().decode(decompressedMeta);
          
          // Ruby-specific YAML cleanup
          const cleanYaml = metaText.replace(/!ruby\/object:[^\s]+/g, '').replace(/!ruby\/symbol/g, '');
          let metadata;
          try {
            metadata = jsyaml.load(cleanYaml) || {};
          } catch (e) {
            console.warn('YAML Parse Error, trying fallback', e);
            metadata = {};
          }

          let dataFiles = [];
          if (dataTarGz) {
            helpers.showLoading('Extracting data.tar.gz...');
            const decompressedData = pako.ungzip(dataTarGz.data);
            dataFiles = parseTar(decompressedData);
          }

          helpers.setState('gem', {
            file,
            metadata,
            dataFiles,
            metaText,
            raw: { metadataGz, dataTarGz },
            searchQuery: '',
            activeTab: 'files'
          });

          render(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open gem file', 'The file may be corrupted or in an unsupported format. Error: ' + err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Specification',
          id: 'copy-spec',
          onClick: (helpers, btn) => {
            const state = helpers.getState().gem;
            if (state) helpers.copyToClipboard(state.metaText, btn);
          }
        },
        {
          label: '📥 Download Source',
          id: 'dl-data',
          onClick: (helpers) => {
            const state = helpers.getState().gem;
            if (state?.raw?.dataTarGz) {
              helpers.download('data.tar.gz', new Blob([state.raw.dataTarGz.data], { type: 'application/gzip' }));
            }
          }
        }
      ]
    });
  };

  function render(helpers) {
    const state = helpers.getState().gem;
    if (!state) return;
    const { file, metadata, dataFiles, metaText, searchQuery, activeTab } = state;

    const filteredFiles = dataFiles.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const version = metadata.version?.version || metadata.version || '0.0.0';
    const authors = Array.isArray(metadata.authors) ? metadata.authors.join(', ') : (metadata.author || 'Unknown');
    const license = Array.isArray(metadata.licenses) ? metadata.licenses.join(', ') : (metadata.license || 'None');
    const homepage = metadata.homepage || '';

    const html = `
      <div class="p-4 max-w-5xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.gem file</span>
        </div>

        <!-- Header Card -->
        <div class="mb-8">
          <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h1 class="text-2xl font-bold text-surface-900 leading-tight">
                  ${escapeHtml(metadata.name || 'Untitled Gem')}
                </h1>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full border border-brand-200">
                  v${escapeHtml(version)}
                </span>
              </div>
              <p class="text-surface-600 text-lg leading-relaxed mb-4">${escapeHtml(metadata.summary || 'No summary provided.')}</p>
              
              <div class="flex flex-wrap gap-y-3 gap-x-6 text-sm">
                <div class="flex flex-col">
                  <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider">Authors</span>
                  <span class="text-surface-700 font-semibold">${escapeHtml(authors)}</span>
                </div>
                <div class="flex flex-col">
                  <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider">License</span>
                  <span class="text-surface-700 font-semibold">${escapeHtml(license)}</span>
                </div>
                ${homepage ? `
                  <div class="flex flex-col">
                    <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider">Home</span>
                    <a href="${escapeHtml(homepage)}" target="_blank" class="text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition-colors">
                      Website
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                ` : ''}
              </div>
            </div>

            <div class="w-full md:w-64 bg-white border border-surface-200 rounded-2xl p-4 shadow-sm">
              <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">Specifications</h3>
              <div class="space-y-3">
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Platform</span>
                  <span class="text-surface-900 font-mono font-medium">${escapeHtml(metadata.platform || 'ruby')}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Ruby</span>
                  <span class="text-surface-900 font-mono font-medium">${escapeHtml(formatRequirement(metadata.required_ruby_version))}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Released</span>
                  <span class="text-surface-900 font-medium">${metadata.date ? new Date(metadata.date).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div class="pt-3 mt-3 border-t border-surface-100 flex justify-between items-center">
                  <span class="text-xs text-surface-500">Registry</span>
                  <a href="https://rubygems.org/gems/${encodeURIComponent(metadata.name)}" target="_blank" class="text-xs font-bold text-brand-600 hover:underline">RubyGems.org</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-6 border-b border-surface-200 mb-6 overflow-x-auto no-scrollbar">
          <button class="tab-btn pb-3 text-sm font-semibold transition-all relative ${activeTab === 'files' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-surface-500 hover:text-surface-700 border-b-2 border-transparent'}" data-tab="files">
            Files <span class="ml-1 opacity-50">${dataFiles.length}</span>
          </button>
          <button class="tab-btn pb-3 text-sm font-semibold transition-all relative ${activeTab === 'deps' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-surface-500 hover:text-surface-700 border-b-2 border-transparent'}" data-tab="deps">
            Dependencies <span class="ml-1 opacity-50">${(metadata.dependencies || []).length}</span>
          </button>
          <button class="tab-btn pb-3 text-sm font-semibold transition-all relative ${activeTab === 'spec' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-surface-500 hover:text-surface-700 border-b-2 border-transparent'}" data-tab="spec">
            Specification
          </button>
        </div>

        <!-- Tab Content -->
        <div id="content-files" class="${activeTab === 'files' ? '' : 'hidden'}">
          <div class="mb-4 relative">
            <input type="text" id="file-search" value="${escapeHtml(searchQuery)}" placeholder="Search within package..." class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
            <svg class="absolute left-3.5 top-3 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          <div class="overflow-x-auto rounded-xl border border-surface-200">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50 border-b border-surface-200">
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700">Path</th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 w-32">Size</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100 bg-white">
                ${filteredFiles.length === 0 ? `
                  <tr>
                    <td colspan="2" class="px-4 py-12 text-center text-surface-400 italic">No files found matching "${escapeHtml(searchQuery)}"</td>
                  </tr>
                ` : filteredFiles.slice(0, 500).map(f => `
                  <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-2 text-surface-700 font-mono text-[11px] flex items-center gap-2">
                      <span class="text-surface-400 group-hover:text-brand-500 transition-colors">${f.isDir ? '📁' : '📄'}</span>
                      <span class="truncate">${escapeHtml(f.name)}</span>
                    </td>
                    <td class="px-4 py-2 text-surface-500 text-right font-mono text-[11px]">
                      ${f.isDir ? '—' : formatSize(f.size)}
                    </td>
                  </tr>
                `).join('')}
                ${filteredFiles.length > 500 ? `
                  <tr><td colspan="2" class="px-4 py-3 text-center text-surface-400 bg-surface-50 text-xs">... and ${filteredFiles.length - 500} more files</td></tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </div>

        <div id="content-deps" class="${activeTab === 'deps' ? '' : 'hidden'}">
          ${renderDependencies(metadata.dependencies)}
        </div>

        <div id="content-spec" class="${activeTab === 'spec' ? '' : 'hidden'}">
          <!-- U8: Code Block -->
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[600px]">${escapeHtml(metaText)}</pre>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
    attachEvents(helpers);
  }

  function renderDependencies(deps) {
    if (!deps || !Array.isArray(deps) || deps.length === 0) {
      return `
        <div class="flex flex-col items-center justify-center py-16 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 text-surface-400">
          <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
          <p class="font-medium italic">No dependencies listed in this gem's specification.</p>
        </div>
      `;
    }

    const groups = {
      Runtime: deps.filter(d => d.type === ':runtime' || d.type === 'runtime' || !d.type),
      Development: deps.filter(d => d.type === ':development' || d.type === 'development')
    };

    return Object.entries(groups).filter(([_, items]) => items.length > 0).map(([title, items]) => `
      <div class="mb-8 last:mb-0">
        <!-- U10: Section Header -->
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-surface-800 text-sm tracking-wide uppercase">${title} Dependencies</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold border border-brand-200">${items.length}</span>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          ${items.map(d => `
            <!-- U9: Content Card -->
            <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 hover:shadow-md transition-all group">
              <div class="font-bold text-surface-900 mb-2 truncate group-hover:text-brand-600 transition-colors" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
              <div class="flex items-center gap-1.5 font-mono text-[10px] text-surface-500 bg-surface-50 px-2 py-1 rounded border border-surface-100 w-fit">
                <svg class="w-3 h-3 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                ${escapeHtml(formatRequirement(d.requirement || d.version_requirements))}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function attachEvents(helpers) {
    const container = helpers.getRenderEl();
    
    // Tab switching
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.dataset.tab;
        helpers.setState('gem', { ...helpers.getState().gem, activeTab: tab });
        render(helpers);
      };
    });

    // Search logic (B7/FA Fix: Archives search)
    const searchInput = container.querySelector('#file-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        helpers.setState('gem', { ...helpers.getState().gem, searchQuery: e.target.value });
        render(helpers);
        const newSearch = helpers.getRenderEl().querySelector('#file-search');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(e.target.value.length, e.target.value.length);
        }
      };
    }
  }

})();
