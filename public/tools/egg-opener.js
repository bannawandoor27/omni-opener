(function () {
  'use strict';

  /**
   * OmniOpener — Production-Grade Python Egg (.egg) Viewer
   * Python Eggs are ZIP-based distribution formats for Python packages.
   */

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const esc = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const parseMetadata = (text) => {
    const results = {};
    if (!text) return results;
    const lines = text.split(/\r?\n/);
    let currentKey = null;

    for (let line of lines) {
      const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1];
        results[currentKey] = match[2].trim();
      } else if (currentKey && line.startsWith(' ')) {
        results[currentKey] += ' ' + line.trim();
      }
    }
    return results;
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.egg',
      dropLabel: 'Drop Python Egg (.egg) file',
      infoHtml: '<strong>Python Eggs</strong> are a legacy distribution format for Python packages, superseded by Wheels. They are essentially ZIP archives containing code and metadata.',

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: (h) => {
            const state = h.getState();
            if (!state.files?.length) return;
            const list = state.files.map(f => f.name).join('\n');
            h.copyToClipboard(list, h.getMountEl().querySelector('#omni-action-copy-list'));
          }
        },
        {
          label: '💾 Download PKG-INFO',
          id: 'dl-meta',
          onClick: (h) => {
            const state = h.getState();
            if (state.rawMetadata) {
              h.download('PKG-INFO', state.rawMetadata);
            } else {
              h.showError('No Metadata', 'PKG-INFO file not found in this Egg.');
            }
          }
        }
      ],

      onInit: (h) => {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing Python Egg...');

        // B1, B4: Ensure JSZip is ready
        const waitForJSZip = async () => {
          if (typeof JSZip !== 'undefined') return;
          for (let i = 0; i < 50; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (typeof JSZip !== 'undefined') return;
          }
          throw new Error('JSZip failed to load');
        };

        try {
          await waitForJSZip();
          const zip = new JSZip();
          const zipData = await zip.loadAsync(content); // B2: content is ArrayBuffer
          
          const files = [];
          let rawMetadata = null;
          let rawRequires = null;

          // B3: Collecting entries using async/await
          const entries = [];
          zipData.forEach((path, entry) => {
            entries.push({ path, entry });
          });

          for (const item of entries) {
            files.push({
              name: item.path,
              size: item.entry._data?.uncompressedSize || 0,
              dir: item.entry.dir,
              entry: item.entry
            });

            const lowerPath = item.path.toLowerCase();
            if (lowerPath === 'egg-info/pkg-info' || lowerPath.endsWith('/pkg-info')) {
              rawMetadata = await item.entry.async('string');
            } else if (lowerPath === 'egg-info/requires.txt' || lowerPath.endsWith('/requires.txt')) {
              rawRequires = await item.entry.async('string');
            }
          }

          if (files.length === 0) {
            h.showError('Empty Archive', 'This .egg file contains no files.');
            return;
          }

          files.sort((a, b) => a.name.localeCompare(b.name));

          h.setState('files', files);
          h.setState('rawMetadata', rawMetadata);
          h.setState('rawRequires', rawRequires);
          h.setState('fileName', file.name);
          h.setState('fileSize', file.size);
          h.setState('searchQuery', '');

          this.renderUI(h);
        } catch (err) {
          console.error(err);
          h.showError('Could not open egg file', 'The file may be corrupted or in an unsupported ZIP format. ' + err.message);
        }
      },

      renderUI: function (h) {
        const state = h.getState();
        if (!state.files) return;

        const files = state.files;
        const metadata = parseMetadata(state.rawMetadata);
        const search = (state.searchQuery || '').toLowerCase();
        const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search));

        let html = '<div class="p-4 md:p-6 max-w-6xl mx-auto space-y-6">';

        // U1: File Info Bar
        html += `
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.egg file</span>
          </div>
        `;

        // Package Details
        if (state.rawMetadata) {
          html += `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Package Details</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">v${esc(metadata.Version || '?.?.?')}</span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- U9: Content Cards -->
                  <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Package Name</div>
                    <div class="text-surface-900 font-semibold truncate">${esc(metadata.Name || 'Unknown')}</div>
                  </div>
                  <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Author</div>
                    <div class="text-surface-900 font-semibold truncate">${esc(metadata.Author || 'N/A')}</div>
                  </div>
                  <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">License</div>
                    <div class="text-surface-900 font-semibold truncate">${esc(metadata.License || 'N/A')}</div>
                  </div>
                  <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Homepage</div>
                    <div class="text-brand-600 font-semibold truncate">
                      ${metadata['Home-page'] ? `<a href="${esc(metadata['Home-page'])}" target="_blank" class="hover:underline">${esc(metadata['Home-page'])}</a>` : 'N/A'}
                    </div>
                  </div>
                </div>

                ${metadata.Summary ? `
                  <div class="rounded-xl border border-surface-200 p-4 bg-surface-50/50">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Summary</div>
                    <p class="text-sm text-surface-700 leading-relaxed">${esc(metadata.Summary)}</p>
                  </div>
                ` : ''}
              </div>

              <div class="space-y-4">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Dependencies</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${(state.rawRequires || '').split('\n').filter(l => l.trim()).length} requirements</span>
                </div>
                <!-- U8: Code blocks -->
                <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950">
                  <pre class="p-4 text-xs font-mono text-gray-100 overflow-y-auto leading-relaxed max-h-[300px]">${esc(state.rawRequires || 'None listed')}</pre>
                </div>
              </div>
            </div>
          `;
        }

        // Contents Section
        html += `
          <div class="space-y-4 pt-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <!-- U10: Section header with counts -->
              <div class="flex items-center gap-3">
                <h3 class="font-semibold text-surface-800">Archive Contents</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${files.length} items</span>
              </div>
              
              <div class="relative w-full sm:w-64">
                <input 
                  type="text" 
                  id="egg-search" 
                  placeholder="Filter by path..." 
                  value="${esc(state.searchQuery)}"
                  class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                >
                <div class="absolute left-3 top-2.5 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
            </div>

            <!-- U7: Tables -->
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50/80">
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredFiles.length === 0 ? `
                    <tr>
                      <td colspan="3" class="px-4 py-12 text-center">
                        <div class="text-surface-400 mb-1">No files matching "${esc(state.searchQuery)}"</div>
                        <div class="text-xs text-surface-400 italic">Try a broader search term</div>
                      </td>
                    </tr>
                  ` : ''}
                  ${filteredFiles.slice(0, 500).map((f) => `
                    <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
                      <td class="px-4 py-2.5 text-surface-700 font-mono text-[13px] break-all">
                        <div class="flex items-center gap-2">
                          <span class="opacity-60 group-hover:opacity-100 transition-opacity">${f.dir ? '📁' : '📄'}</span>
                          <span>${esc(f.name)}</span>
                        </div>
                      </td>
                      <td class="px-4 py-2.5 text-surface-500 text-right font-mono text-xs tabular-nums">
                        ${f.dir ? '-' : formatSize(f.size)}
                      </td>
                      <td class="px-4 py-2.5 text-right">
                        ${f.dir ? '' : `
                          <button 
                            class="dl-file text-brand-600 hover:text-brand-700 font-semibold text-xs py-1 px-2 rounded hover:bg-brand-100 transition-all" 
                            data-path="${esc(f.name)}"
                          >
                            Extract
                          </button>
                        `}
                      </td>
                    </tr>
                  `).join('')}
                  ${filteredFiles.length > 500 ? `
                    <tr>
                      <td colspan="3" class="px-4 py-3 text-center bg-surface-50 text-xs text-surface-500 italic">
                        Showing first 500 items. Use search to filter more precisely.
                      </td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>
        `;

        html += '</div>';
        h.render(html);

        // Events
        const searchInput = h.getMountEl().querySelector('#egg-search');
        if (searchInput) {
          searchInput.addEventListener('input', (e) => {
            h.setState('searchQuery', e.target.value);
            this.renderUI(h);
            const ref = h.getMountEl().querySelector('#egg-search');
            if (ref) {
              ref.focus();
              ref.setSelectionRange(e.target.value.length, e.target.value.length);
            }
          });
        }

        h.getRenderEl().querySelectorAll('.dl-file').forEach(btn => {
          btn.addEventListener('click', async () => {
            const path = btn.dataset.path;
            const fileObj = files.find(f => f.name === path);
            if (!fileObj) return;

            const originalText = btn.textContent;
            btn.textContent = '...';
            btn.disabled = true;

            try {
              const blob = await fileObj.entry.async('blob');
              h.download(path.split('/').pop(), blob);
              btn.textContent = 'Done!';
              setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
              }, 1500);
            } catch (err) {
              btn.textContent = 'Error';
              console.error(err);
              setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
              }, 2000);
            }
          });
        });
      }
    });
  };
})();
