/**
 * OmniOpener — Python Wheel (.whl) Viewer
 * Uses OmniTool SDK and JSZip.
 */
(function () {
  'use strict';

  // --- Helpers ---
  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const esc = (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const parseMetadata = (text) => {
    const results = {};
    const lines = text.split(/\r?\n/);
    let currentKey = null;

    for (let line of lines) {
      // Metadata headers end at the first empty line. Everything after is Description.
      if (line.trim() === '' && Object.keys(results).length > 0) break;

      const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1];
        const value = match[2].trim();
        if (results[currentKey]) {
          if (Array.isArray(results[currentKey])) {
            results[currentKey].push(value);
          } else {
            results[currentKey] = [results[currentKey], value];
          }
        } else {
          results[currentKey] = value;
        }
      } else if (currentKey && line.startsWith('       ')) {
        // Continuation line
        const val = line.trim();
        if (Array.isArray(results[currentKey])) {
          results[currentKey][results[currentKey].length - 1] += ' ' + val;
        } else {
          results[currentKey] += ' ' + val;
        }
      }
    }
    return results;
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.whl',
      dropLabel: 'Drop a Python Wheel (.whl) here',
      infoHtml: '<strong>Python Wheel Viewer</strong> — Extract metadata and explore the contents of .whl distribution archives directly in your browser.',

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h) {
            const files = h.getState().files;
            if (!files || files.length === 0) return;
            const list = files.map(f => f.name).join('\n');
            h.copyToClipboard(list, h.getMountEl().querySelector('#omni-action-copy-list'));
          }
        },
        {
          label: '📄 Download METADATA',
          id: 'dl-metadata',
          onClick: function (h) {
            const meta = h.getState().rawMetadata;
            if (meta) {
              h.download('METADATA', meta, 'text/plain');
            } else {
              h.showError('Missing METADATA', 'This wheel file does not contain a METADATA file in its .dist-info directory.');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
      },

      onDestroy: function (h) {
        // No persistent resources to clean up (no createObjectURL)
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Extracting Wheel archive...');

        // B1: Race condition check for JSZip
        const ensureZip = async () => {
          if (typeof JSZip !== 'undefined') return true;
          return new Promise(resolve => {
            let attempts = 0;
            const check = setInterval(() => {
              attempts++;
              if (typeof JSZip !== 'undefined') {
                clearInterval(check);
                resolve(true);
              } else if (attempts > 50) {
                clearInterval(check);
                resolve(false);
              }
            }, 100);
          });
        };

        const ready = await ensureZip();
        if (!ready) {
          h.showError('Library Load Failed', 'Could not load JSZip from CDN. Please check your connection.');
          return;
        }

        try {
          const zip = new JSZip();
          const zipData = await zip.loadAsync(content);
          
          const files = [];
          let metadataPath = null;
          let rawMetadata = null;

          zipData.forEach((relativePath, zipEntry) => {
            files.push({
              name: relativePath,
              size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
              dir: zipEntry.dir
            });

            if (relativePath.endsWith('.dist-info/METADATA')) {
              metadataPath = relativePath;
            }
          });

          if (files.length === 0) {
            h.showError('Empty Archive', 'This wheel file contains no files.');
            return;
          }

          files.sort((a, b) => a.name.localeCompare(b.name));

          if (metadataPath) {
            rawMetadata = await zipData.file(metadataPath).async('string');
          }

          h.setState('files', files);
          h.setState('rawMetadata', rawMetadata);
          h.setState('fileName', file.name);
          h.setState('fileSize', file.size);
          h.setState('filter', '');

          // B8: Use named function for self-reference
          _renderUI(h);

        } catch (err) {
          console.error(err);
          h.showError('Parsing Failed', 'Could not open .whl file. It might be corrupted or not a valid ZIP archive.');
        }

        // B8: Define renderUI as a standalone function within closure to avoid 'this' issues
        function _renderUI(h) {
          const state = h.getState();
          const files = state.files || [];
          const rawMetadata = state.rawMetadata;
          const metadata = rawMetadata ? parseMetadata(rawMetadata) : null;
          const filter = (state.filter || '').toLowerCase();
          const filteredFiles = files.filter(f => f.name.toLowerCase().includes(filter));

          let html = '<div class="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">';

          // U1: File info bar
          html += `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(state.fileSize)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.whl file</span>
            </div>
          `;

          // Package Metadata Panel
          if (metadata) {
            html += `
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-lg text-surface-800">Package Distribution</h3>
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-700 border border-brand-200">
                    v${esc(metadata.Version || '?.?.?')}
                  </span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Package Name</div>
                    <div class="text-surface-900 font-semibold truncate" title="${esc(metadata.Name)}">${esc(metadata.Name || 'Unknown')}</div>
                  </div>
                  <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Author / Maintainer</div>
                    <div class="text-surface-900 font-semibold truncate" title="${esc(metadata.Author)}">${esc(metadata.Author || 'N/A')}</div>
                  </div>
                  <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">License</div>
                    <div class="text-surface-900 font-semibold truncate" title="${esc(metadata.License)}">${esc(metadata.License || 'N/A')}</div>
                  </div>
                </div>

                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Summary</div>
                  <p class="text-surface-700 leading-relaxed text-sm">${esc(metadata.Summary || 'No summary provided for this package.')}</p>
                  ${metadata['Home-page'] ? `
                    <div class="mt-4 pt-4 border-t border-surface-100 flex items-center gap-2">
                      <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                      <a href="${esc(metadata['Home-page'])}" target="_blank" class="text-brand-600 hover:text-brand-700 text-sm font-medium underline underline-offset-2 break-all">
                        ${esc(metadata['Home-page'])}
                      </a>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }

          // Archive Content List (U10)
          html += `
            <div class="space-y-3 pt-2">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Archive Contents</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${files.length} items</span>
              </div>

              <div class="relative group">
                <input 
                  type="text" 
                  id="file-filter" 
                  placeholder="Filter files by path..." 
                  value="${esc(state.filter)}"
                  class="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-surface-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all shadow-sm group-hover:border-surface-300"
                >
                <div class="absolute left-3.5 top-3 text-surface-400 group-hover:text-brand-500 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

              <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50/50">
                      <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">File Path</th>
                      <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
          `;

          if (filteredFiles.length === 0) {
            html += `
              <tr>
                <td colspan="2" class="px-4 py-12 text-center">
                  <div class="text-surface-400 mb-1">
                    <svg class="w-10 h-10 mx-auto opacity-20 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    ${files.length === 0 ? 'This wheel archive is empty.' : 'No files matching "'+esc(state.filter)+'"'}
                  </div>
                </td>
              </tr>
            `;
          } else {
            // B7: Pagination/Truncation for large archives
            const limit = 500;
            const displayFiles = filteredFiles.slice(0, limit);
            
            displayFiles.forEach(f => {
              html += `
                <tr class="${f.dir ? 'bg-surface-50/30' : ''} hover:bg-brand-50/50 transition-colors group cursor-default">
                  <td class="px-4 py-2.5 text-surface-700 font-mono text-[13px] break-all">
                    <div class="flex items-center gap-2.5">
                      ${f.dir 
                        ? '<svg class="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>'
                        : '<svg class="w-4 h-4 text-surface-300 group-hover:text-brand-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>'
                      }
                      <span class="${f.dir ? 'font-medium' : ''}">${esc(f.name)}</span>
                    </div>
                  </td>
                  <td class="px-4 py-2.5 text-surface-500 text-right font-mono text-xs whitespace-nowrap">
                    ${f.dir ? '-' : formatSize(f.size)}
                  </td>
                </tr>
              `;
            });

            if (filteredFiles.length > limit) {
              html += `
                <tr class="bg-surface-50">
                  <td colspan="2" class="px-4 py-4 text-center text-surface-500 text-xs italic">
                    Showing first ${limit} of ${filteredFiles.length} items. Use the search box to find specific entries.
                  </td>
                </tr>
              `;
            }
          }

          html += `
                  </tbody>
                </table>
              </div>
            </div>
          `;

          html += '</div>';

          h.render(html);

          // Re-bind search with cursor positioning fix
          const input = h.getMountEl().querySelector('#file-filter');
          if (input) {
            input.addEventListener('input', (e) => {
              const val = e.target.value;
              h.setState('filter', val);
              _renderUI(h);
              const newInput = h.getMountEl().querySelector('#file-filter');
              if (newInput) {
                newInput.focus();
                newInput.setSelectionRange(val.length, val.length);
              }
            });
          }
        }
      }
    });
  };

})();
