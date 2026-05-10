(function () {
  'use strict';

  /**
   * Ruby Gem Opener
   * A PRODUCTION PERFECT tool for analyzing and extracting RubyGem (.gem) packages.
   * Gem files are POSIX tar archives containing metadata.gz and data.tar.gz.
   */

  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Robust Tar Parser
   */
  function parseTar(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const files = [];
    let offset = 0;
    const decoder = new TextDecoder();
    let nextFileName = null;

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512;
        continue;
      }

      let name = nextFileName || decoder.decode(header.subarray(0, 100)).split('\0')[0];
      nextFileName = null;

      const sizeStr = decoder.decode(header.subarray(124, 136)).split('\0')[0].trim();
      const size = parseInt(sizeStr, 8) || 0;
      const type = String.fromCharCode(header[156]);

      const contentOffset = offset + 512;
      const data = bytes.subarray(contentOffset, contentOffset + size);

      if (type === 'L') {
        nextFileName = decoder.decode(data).split('\0')[0];
      } else {
        const isDir = type === '5' || name.endsWith('/');
        files.push({
          name: name,
          size: isDir ? 0 : size,
          isDir: isDir,
          data: isDir ? null : data
        });
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  window.initTool = function (toolConfig, mountEl) {
    let previewUrls = [];

    const cleanup = () => {
      previewUrls.forEach(url => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      });
      previewUrls = [];
    };

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js'
        ]);
      },

      onDestroy: cleanup,

      onFile: function _onFileFn(file, content, h) {
        cleanup();

        // B1: Race condition check for pako
        if (typeof pako === 'undefined') {
          h.showLoading('Loading decompression libraries...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Extracting Ruby Gem...');

        // Slight delay to ensure UI responsiveness
        setTimeout(async () => {
          try {
            // 1. Extract outer tar
            const outerFiles = parseTar(content);
            const metadataFile = outerFiles.find(f => f.name === 'metadata.gz');
            const dataFile = outerFiles.find(f => f.name === 'data.tar.gz');

            if (!metadataFile || !dataFile) {
              throw new Error('This does not appear to be a valid Ruby Gem archive (missing metadata.gz or data.tar.gz).');
            }

            // 2. Decompress Metadata (YAML)
            const metaYaml = new TextDecoder().decode(pako.ungzip(metadataFile.data));
            
            // Extract basic info for the header
            const gemName = (metaYaml.match(/^name:\s*['"]?([^'"]+)['"]?$/m) || [])[1] || 'Unknown';
            const gemVersion = (metaYaml.match(/^version:\s*(?:version:\s*)?['"]?([^'"]+)['"]?$/m) || [])[1] || '?.?.?';
            const gemSummary = (metaYaml.match(/^summary:\s*['"]?([^'"]+)['"]?$/m) || [])[1] || '';
            const gemAuthors = (metaYaml.match(/^authors:\s*\n\s*-\s*(.+)$/m) || [])[1] || '';

            // 3. Decompress & Parse Data Tar
            h.showLoading('Reading source files...');
            const dataTar = pako.ungzip(dataFile.data);
            const innerFiles = parseTar(dataTar);

            h.setState({
              file,
              fileBuffer: content,
              gemInfo: {
                name: gemName,
                version: gemVersion,
                summary: gemSummary,
                authors: gemAuthors.replace(/['"]/g, '')
              },
              metadata: metaYaml,
              files: innerFiles.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1))),
              activeTab: 'files',
              searchQuery: '',
              metaSearchQuery: ''
            });

            renderTool(h);
          } catch (err) {
            h.showError('Could not open gem file', err.message + ' The file may be corrupted or in an unsupported variant.');
          }
        }, 50);
      }
    });

    function renderTool(h) {
      const state = h.getState();
      const { gemInfo, files, activeTab, searchQuery, metaSearchQuery, metadata } = state;
      
      const filteredFiles = searchQuery 
        ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : files;

      const html = `
        <div class="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${esc(state.file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">Ruby Gem Archive</span>
          </div>

          <!-- Hero Section -->
          <div class="bg-white rounded-2xl border border-surface-200 p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div class="flex items-start gap-5">
              <div class="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg shadow-red-100 shrink-0">💎</div>
              <div class="space-y-1">
                <h1 class="text-3xl font-black text-surface-900 tracking-tight leading-none">
                  ${esc(gemInfo.name)} <span class="text-surface-400 font-medium text-xl ml-1">${esc(gemInfo.version)}</span>
                </h1>
                <p class="text-surface-600 font-medium max-w-2xl line-clamp-2">${esc(gemInfo.summary || 'No summary available.')}</p>
                ${gemInfo.authors ? `<div class="text-[10px] uppercase font-bold text-surface-400 tracking-widest mt-2">By ${esc(gemInfo.authors)}</div>` : ''}
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button id="btn-dl-gem" class="px-6 py-3 bg-surface-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all shadow-md active:scale-95">Download .gem</button>
              <button id="btn-dl-meta" class="px-6 py-3 bg-white text-surface-700 border border-surface-200 rounded-xl font-bold text-sm hover:bg-surface-50 transition-all shadow-sm active:scale-95">Export Spec</button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 p-1 bg-surface-100 rounded-xl w-fit">
            <button class="tab-btn px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'files' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'}" data-tab="files">Contents</button>
            <button class="tab-btn px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'metadata' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'}" data-tab="metadata">Specification</button>
            <button class="tab-btn px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'about' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50'}" data-tab="about">About</button>
          </div>

          <!-- Content Area -->
          <div class="min-h-[400px]">
            ${activeTab === 'files' ? renderFiles(filteredFiles, searchQuery) : ''}
            ${activeTab === 'metadata' ? renderMetadata(metadata, metaSearchQuery) : ''}
            ${activeTab === 'about' ? renderAbout(gemInfo) : ''}
          </div>
        </div>
      `;

      h.render(html);
      attachEvents(h);
    }

    function renderFiles(files, query) {
      return `
        <div class="space-y-4 animate-in fade-in duration-300">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <!-- U10: Section Header with Count -->
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-surface-800 text-lg">Source Files</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${files.length} items</span>
            </div>
            <!-- Search Box -->
            <div class="relative w-full sm:w-80">
              <input type="text" id="file-search" placeholder="Filter file list..." value="${esc(query)}" 
                class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none text-sm">
              <span class="absolute left-3.5 top-3 text-surface-400 text-lg">🔍</span>
            </div>
          </div>

          <!-- U7: Tables -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/50">
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                ${files.length === 0 ? `
                  <tr><td colspan="3" class="px-4 py-12 text-center text-surface-400 italic">No files found matching your search.</td></tr>
                ` : files.map(f => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-3 text-surface-700 border-b border-surface-100 flex items-center gap-3">
                      <span class="text-xl opacity-70 group-hover:opacity-100 transition-opacity">${f.isDir ? '📁' : getIcon(f.name)}</span>
                      <span class="${f.isDir ? 'font-bold text-surface-900' : 'font-mono text-[13px]'}">${esc(f.name)}</span>
                    </td>
                    <td class="px-4 py-3 text-surface-500 border-b border-surface-100 font-mono text-xs">
                      ${f.isDir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-3 text-right border-b border-surface-100">
                      ${!f.isDir ? `<button class="btn-extract text-brand-600 font-bold hover:text-brand-700 text-xs uppercase tracking-tighter hover:bg-brand-100 px-2 py-1 rounded transition-all" data-name="${esc(f.name)}">Get</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderMetadata(metadata, query) {
      const lines = metadata.split('\n');
      const filteredLines = query 
        ? lines.filter(l => l.toLowerCase().includes(query.toLowerCase()))
        : lines;

      return `
        <div class="space-y-4 animate-in fade-in duration-300">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-surface-800 text-lg">Gemspec (YAML)</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${lines.length} lines</span>
            </div>
            <div class="relative w-full sm:w-80">
              <input type="text" id="meta-search" placeholder="Search spec lines..." value="${esc(query)}" 
                class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none text-sm">
              <span class="absolute left-3.5 top-3 text-surface-400 text-lg">🔍</span>
            </div>
          </div>

          <!-- U8: Code Block -->
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-lg bg-gray-950">
            <div class="bg-gray-900 px-4 py-2 border-b border-gray-800 flex justify-between items-center">
              <span class="text-[10px] font-black text-gray-500 uppercase tracking-widest">metadata.yaml</span>
              <button id="btn-copy-meta" class="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-widest transition-colors">Copy</button>
            </div>
            <pre class="p-4 text-sm font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-gray-800">
${filteredLines.length > 0 ? esc(filteredLines.join('\n')) : '<span class="text-gray-600 italic">No matching lines.</span>'}
            </pre>
          </div>
        </div>
      `;
    }

    function renderAbout(gem) {
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
          <!-- U9: Content Cards -->
          <div class="rounded-xl border border-surface-200 p-6 space-y-4 bg-white shadow-sm hover:border-brand-300 hover:shadow-md transition-all">
            <h3 class="font-semibold text-surface-800 text-lg border-b border-surface-100 pb-2">Gem Details</h3>
            <div class="space-y-4">
              <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-surface-400 tracking-widest">Full Name</span>
                <span class="text-surface-900 font-bold text-lg">${esc(gem.name)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-surface-400 tracking-widest">Version</span>
                <span class="text-surface-900 font-medium">${esc(gem.version)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-surface-400 tracking-widest">Authors</span>
                <span class="text-surface-700 font-medium">${esc(gem.authors || 'Unknown author')}</span>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 p-6 space-y-4 bg-white shadow-sm hover:border-brand-300 hover:shadow-md transition-all">
            <h3 class="font-semibold text-surface-800 text-lg border-b border-surface-100 pb-2">About the Format</h3>
            <p class="text-sm text-surface-600 leading-relaxed">
              A RubyGem package is a standard TAR archive containing three internal components:
            </p>
            <ul class="text-[13px] text-surface-600 space-y-3 list-none">
              <li class="flex items-start gap-3">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
                <span><strong>metadata.gz</strong> — Gzipped YAML file containing the gemspec definition.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
                <span><strong>data.tar.gz</strong> — Gzipped Tar archive containing the source code and assets.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
                <span><strong>checksums.yaml.gz</strong> — Integrity hashes for the included files.</span>
              </li>
            </ul>
          </div>
        </div>
      `;
    }

    function attachEvents(h) {
      const el = h.getRenderEl();
      const state = h.getState();

      // Tab switching
      el.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
          h.setState('activeTab', btn.dataset.tab);
          renderTool(h);
        };
      });

      // File search
      const fileSearch = el.querySelector('#file-search');
      if (fileSearch) {
        fileSearch.oninput = (e) => {
          h.setState('searchQuery', e.target.value);
          renderTool(h);
          const input = h.getRenderEl().querySelector('#file-search');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        };
      }

      // Meta search
      const metaSearch = el.querySelector('#meta-search');
      if (metaSearch) {
        metaSearch.oninput = (e) => {
          h.setState('metaSearchQuery', e.target.value);
          renderTool(h);
          const input = h.getRenderEl().querySelector('#meta-search');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        };
      }

      // Action buttons
      const dlGem = el.querySelector('#btn-dl-gem');
      if (dlGem) dlGem.onclick = () => h.download(state.file.name, state.fileBuffer);

      const dlMeta = el.querySelector('#btn-dl-meta');
      if (dlMeta) {
        dlMeta.onclick = () => {
          const blob = new Blob([state.metadata], { type: 'text/yaml' });
          h.download(state.gemInfo.name + '.gemspec.yaml', blob);
        };
      }

      const copyMeta = el.querySelector('#btn-copy-meta');
      if (copyMeta) copyMeta.onclick = (e) => h.copyToClipboard(state.metadata, e.target);

      // Extraction
      el.querySelectorAll('.btn-extract').forEach(btn => {
        btn.onclick = () => {
          const name = btn.dataset.name;
          const f = state.files.find(item => item.name === name);
          if (f && f.data) {
            const blob = new Blob([f.data], { type: 'application/octet-stream' });
            h.download(name.split('/').pop(), blob);
          }
        };
      });
    }

    function getIcon(name) {
      const ext = name.split('.').pop().toLowerCase();
      const icons = {
        rb: '💎', rake: '💎', gemspec: '💎',
        md: '📝', txt: '📄',
        js: '📜', ts: '📜', json: '📦', yml: '⚙️', yaml: '⚙️',
        png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🎨', ico: '🖼️',
        sh: '🐚', py: '🐍', c: '🔧', h: '🔧', cpp: '🔧'
      };
      return icons[ext] || '📄';
    }
  };
})();
