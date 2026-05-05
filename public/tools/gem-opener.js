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

  function formatSize(b) {
    if (!b || b < 0) return '0 B';
    if (b > 1e6) return (b / 1e6).toFixed(2) + ' MB';
    if (b > 1e3) return (b / 1024).toFixed(2) + ' KB';
    return b + ' B';
  }

  /**
   * Basic TAR parser (reused from tar-opener.js logic for consistency)
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
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
      previewUrls.forEach(url => URL.revokeObjectURL(url));
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

      onFile: function _onFile(file, content, h) {
        cleanup();
        h.showLoading('Extracting Ruby Gem...');

        // Short timeout to ensure pako is ready and UI updates
        setTimeout(async function() {
          if (typeof pako === 'undefined') {
            return h.showError('Dependency Error', 'The compression library (pako) failed to load. Please refresh.');
          }

          try {
            // 1. Extract outer tar
            const outerFiles = parseTar(content);
            const metadataFile = outerFiles.find(f => f.name === 'metadata.gz');
            const dataFile = outerFiles.find(f => f.name === 'data.tar.gz');

            if (!metadataFile || !dataFile) {
              throw new Error('Invalid .gem format: missing metadata.gz or data.tar.gz');
            }

            // 2. Decompress & Parse Metadata
            const metaYaml = new TextDecoder().decode(pako.ungzip(metadataFile.data));
            
            // Basic regex-based YAML parsing for key fields to show in overview
            const gemName = (metaYaml.match(/^name:\s*(.+)$/m) || [])[1] || 'Unknown';
            const gemVersion = (metaYaml.match(/^version:\s*version:\s*(.+)$/m) || metaYaml.match(/^version:\s*(.+)$/m) || [])[1] || '?.?.?';
            const gemSummary = (metaYaml.match(/^summary:\s*(.+)$/m) || [])[1] || '';
            const gemAuthors = (metaYaml.match(/^authors:\s*\n\s*-\s*(.+)$/m) || [])[1] || '';

            // 3. Decompress & Extract Data Tar
            h.showLoading('Reading source files...');
            const dataTar = pako.ungzip(dataFile.data);
            const innerFiles = parseTar(dataTar.buffer);

            h.setState({
              file,
              fileBuffer: content,
              gemInfo: {
                name: gemName.replace(/['"]/g, ''),
                version: gemVersion.replace(/['"]/g, ''),
                summary: gemSummary.replace(/['"]/g, ''),
                authors: gemAuthors.replace(/['"]/g, '')
              },
              metadata: metaYaml,
              files: innerFiles.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1))),
              activeTab: 'files',
              searchQuery: ''
            });

            renderTool(h);
          } catch (err) {
            h.showError('Failed to parse Gem', err.message);
          }
        }, 50);
      }
    });

    function renderTool(h) {
      const state = h.getState();
      const { gemInfo, files, activeTab, searchQuery } = state;
      
      const filteredFiles = searchQuery 
        ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : files;

      const html = `
        <div class="p-6 max-w-6xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
            <span class="font-bold text-surface-800">${esc(state.file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-[10px] font-bold uppercase tracking-wider">Ruby Gem</span>
          </div>

          <!-- Hero Section -->
          <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center text-white text-2xl shadow-lg shadow-red-100">💎</div>
                <div>
                  <h1 class="text-3xl font-black text-surface-900 tracking-tight">${esc(gemInfo.name)} <span class="text-surface-400 font-medium text-xl ml-2">${esc(gemInfo.version)}</span></h1>
                  <p class="text-surface-500 font-medium">${esc(gemInfo.summary)}</p>
                </div>
              </div>
            </div>
            <div class="flex gap-2">
              <button id="btn-dl-gem" class="px-5 py-2.5 bg-surface-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-all shadow-sm">Download .gem</button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mb-6 p-1 bg-surface-100 rounded-xl w-fit">
            <button class="tab-btn px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'files' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}" data-tab="files">Files</button>
            <button class="tab-btn px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'metadata' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}" data-tab="metadata">Specification</button>
            <button class="tab-btn px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'info' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}" data-tab="info">About</button>
          </div>

          <div class="tab-content">
            ${activeTab === 'files' ? renderFilesTab(filteredFiles, searchQuery) : ''}
            ${activeTab === 'metadata' ? renderMetadataTab(state.metadata) : ''}
            ${activeTab === 'info' ? renderInfoTab(gemInfo) : ''}
          </div>
        </div>
      `;

      h.render(html);
      attachEvents(h);
    }

    function renderFilesTab(files, query) {
      return `
        <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <!-- U10: Section Header with Count -->
            <div class="flex items-center gap-3">
              <h3 class="font-bold text-surface-800 text-lg">Source Contents</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">${files.length} items</span>
            </div>
            <!-- Search Box -->
            <div class="relative w-full sm:w-72">
              <input type="text" id="file-search" placeholder="Filter files..." value="${esc(query)}" 
                class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none text-sm">
              <span class="absolute left-3.5 top-3 text-surface-400">🔍</span>
            </div>
          </div>

          <!-- U7: Table -->
          <div class="overflow-x-auto rounded-2xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr class="bg-surface-50">
                  <th class="sticky top-0 px-6 py-4 text-left font-bold text-surface-700 border-b border-surface-200 text-xs uppercase tracking-wider">File Path</th>
                  <th class="sticky top-0 px-6 py-4 text-left font-bold text-surface-700 border-b border-surface-200 text-xs uppercase tracking-wider w-32">Size</th>
                  <th class="sticky top-0 px-6 py-4 text-right font-bold text-surface-700 border-b border-surface-200 text-xs uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${files.length === 0 ? `
                  <tr><td colspan="3" class="px-6 py-12 text-center text-surface-400 italic">No files found matching your search</td></tr>
                ` : files.map(f => `
                  <tr class="group hover:bg-brand-50/50 transition-colors">
                    <td class="px-6 py-3.5 text-surface-700 font-mono text-[13px] flex items-center gap-3">
                      <span class="text-lg opacity-70">${f.isDir ? '📁' : getFileIcon(f.name)}</span>
                      <span class="${f.isDir ? 'font-bold text-surface-900' : ''}">${esc(f.name)}</span>
                    </td>
                    <td class="px-6 py-3.5 text-surface-500 font-mono text-[12px] whitespace-nowrap">
                      ${f.isDir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-6 py-3.5 text-right">
                      ${!f.isDir ? `<button class="btn-get text-brand-600 font-black text-[11px] uppercase tracking-widest hover:text-brand-700 py-1 px-2 rounded-md hover:bg-brand-100 transition-all" data-name="${esc(f.name)}">Get</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderMetadataTab(metadata) {
      return `
        <div class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-surface-800 text-lg">Gemspec (YAML)</h3>
            <button id="btn-copy-spec" class="text-[11px] font-bold uppercase tracking-widest bg-surface-100 text-surface-600 px-3 py-1.5 rounded-lg hover:bg-surface-200 transition-all">Copy YAML</button>
          </div>
          <!-- U8: Code Block -->
          <div class="rounded-2xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-6 text-[13px] font-mono bg-gray-950 text-gray-200 overflow-x-auto leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-surface-700">${esc(metadata)}</pre>
          </div>
        </div>
      `;
    }

    function renderInfoTab(gem) {
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <!-- U9: Content Card -->
          <div class="rounded-2xl border border-surface-200 p-6 space-y-4 bg-white shadow-sm">
            <h3 class="font-bold text-surface-800 text-lg border-b border-surface-100 pb-2">Gem Details</h3>
            <div class="space-y-3">
              <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-surface-400 tracking-wider">Name</span>
                <span class="text-surface-900 font-bold">${esc(gem.name)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-surface-400 tracking-wider">Version</span>
                <span class="text-surface-900 font-bold">${esc(gem.version)}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase font-black text-surface-400 tracking-wider">Authors</span>
                <span class="text-surface-900 font-bold">${esc(gem.authors || 'N/A')}</span>
              </div>
            </div>
          </div>
          <div class="rounded-2xl border border-surface-200 p-6 space-y-4 bg-white shadow-sm">
            <h3 class="font-bold text-surface-800 text-lg border-b border-surface-100 pb-2">About Format</h3>
            <p class="text-sm text-surface-600 leading-relaxed">
              RubyGems use a standard <strong>POSIX Tar</strong> container. Inside, you'll find:
            </p>
            <ul class="text-sm text-surface-600 space-y-2 list-disc pl-5">
              <li><code class="bg-surface-100 px-1 rounded text-red-600">metadata.gz</code>: The YAML gem specification.</li>
              <li><code class="bg-surface-100 px-1 rounded text-red-600">data.tar.gz</code>: The library source code.</li>
              <li><code class="bg-surface-100 px-1 rounded text-red-600">checksums.yaml.gz</code>: Integrity hashes.</li>
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

      // Search
      const searchInput = el.querySelector('#file-search');
      if (searchInput) {
        searchInput.oninput = (e) => {
          h.setState('searchQuery', e.target.value);
          renderTool(h);
          const newInp = h.getRenderEl().querySelector('#file-search');
          if (newInp) {
            newInp.focus();
            newInp.setSelectionRange(newInp.value.length, newInp.value.length);
          }
        };
      }

      // Download Gem
      const dlBtn = el.querySelector('#btn-dl-gem');
      if (dlBtn) dlBtn.onclick = () => h.download(state.file.name, state.fileBuffer);

      // Copy Spec
      const copyBtn = el.querySelector('#btn-copy-spec');
      if (copyBtn) copyBtn.onclick = (e) => h.copyToClipboard(state.metadata, e.target);

      // Extract single file
      el.querySelectorAll('.btn-get').forEach(btn => {
        btn.onclick = () => {
          const fileName = btn.dataset.name;
          const file = state.files.find(f => f.name === fileName);
          if (file && file.data) {
            h.download(fileName.split('/').pop(), file.data);
          }
        };
      });
    }

    function getFileIcon(name) {
      const ext = name.split('.').pop().toLowerCase();
      if (['rb', 'rake', 'gemspec'].includes(ext)) return '💎';
      if (['js', 'ts', 'json', 'yml', 'yaml', 'md', 'txt'].includes(ext)) return '📜';
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'].includes(ext)) return '🖼️';
      return '📄';
    }
  };
})();
