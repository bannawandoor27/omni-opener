/**
 * OmniOpener — Python Wheel (.whl) Viewer
 * Uses OmniTool SDK and JSZip.
 */
(function () {
  'use strict';

  // --- Helpers ---
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    if (!bytes) return '-';
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
    let inDescription = false;
    let description = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (inDescription) {
        description.push(line);
        continue;
      }

      // Metadata headers end at the first empty line. Everything after is Description.
      if (line.trim() === '' && Object.keys(results).length > 0) {
        inDescription = true;
        continue;
      }

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
      } else if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
        // Continuation line
        const val = line.trim();
        if (Array.isArray(results[currentKey])) {
          results[currentKey][results[currentKey].length - 1] += ' ' + val;
        } else {
          results[currentKey] += ' ' + val;
        }
      }
    }

    if (description.length > 0) {
      results['Description'] = description.join('\n').trim();
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
        // Clean up if needed
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Extracting Wheel archive...');

        // B1: Wait for JSZip if it's still loading
        const getZip = async () => {
          if (typeof JSZip !== 'undefined') return JSZip;
          return new Promise((resolve, reject) => {
            let count = 0;
            const interval = setInterval(() => {
              if (typeof JSZip !== 'undefined') {
                clearInterval(interval);
                resolve(JSZip);
              }
              if (++count > 50) {
                clearInterval(interval);
                reject(new Error('JSZip timeout'));
              }
            }, 100);
          });
        };

        try {
          const JSZipLib = await getZip();
          const zip = new JSZipLib();
          const zipData = await zip.loadAsync(content);
          
          const files = [];
          let metadataPath = null;
          let wheelPath = null;
          let rawMetadata = null;
          let rawWheel = null;

          zipData.forEach((relativePath, zipEntry) => {
            files.push({
              name: relativePath,
              size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
              dir: zipEntry.dir
            });

            if (relativePath.endsWith('.dist-info/METADATA')) {
              metadataPath = relativePath;
            }
            if (relativePath.endsWith('.dist-info/WHEEL')) {
              wheelPath = relativePath;
            }
          });

          if (files.length === 0) {
            h.showError('Empty Archive', 'This wheel file contains no files.');
            return;
          }

          if (metadataPath) {
            rawMetadata = await zipData.file(metadataPath).async('string');
          }
          if (wheelPath) {
            rawWheel = await zipData.file(wheelPath).async('string');
          }

          h.setState('files', files);
          h.setState('rawMetadata', rawMetadata);
          h.setState('rawWheel', rawWheel);
          h.setState('fileName', file.name);
          h.setState('fileSize', file.size);
          h.setState('filter', '');
          h.setState('sortCol', 'name');
          h.setState('sortDir', 'asc');

          _renderUI(h);

        } catch (err) {
          console.error(err);
          h.showError('Parsing Failed', 'Could not open .whl file. It might be corrupted or not a valid ZIP archive.');
        }

        function _renderUI(h) {
          const state = h.getState();
          const files = state.files || [];
          const rawMetadata = state.rawMetadata;
          const rawWheel = state.rawWheel;
          const metadata = rawMetadata ? parseMetadata(rawMetadata) : null;
          const wheelInfo = rawWheel ? parseMetadata(rawWheel) : null;
          
          const filter = (state.filter || '').toLowerCase();
          const sortCol = state.sortCol || 'name';
          const sortDir = state.sortDir || 'asc';

          let filteredFiles = files.filter(f => f.name.toLowerCase().includes(filter));
          
          filteredFiles.sort((a, b) => {
            let valA = a[sortCol];
            let valB = b[sortCol];
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();
            
            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
          });

          let html = '<div class="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">';

          // U1: File info bar
          html += `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-100 shadow-sm">
              <span class="font-bold text-surface-900">${esc(state.fileName)}</span>
              <span class="text-surface-300">|</span>
              <span class="font-medium">${formatSize(state.fileSize)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500 bg-surface-200/50 px-2 py-0.5 rounded text-[11px] uppercase tracking-wider font-bold">Python Wheel</span>
            </div>
          `;

          // Package Metadata Section
          if (metadata) {
            html += `
              <div class="space-y-6">
                <div class="flex items-center justify-between border-b border-surface-100 pb-2">
                  <h2 class="text-xl font-bold text-surface-900">Distribution Metadata</h2>
                  <span class="px-3 py-1 rounded-full text-xs font-bold bg-brand-100 text-brand-700 border border-brand-200 shadow-sm">
                    Version ${esc(metadata.Version || 'Unknown')}
                  </span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div class="rounded-2xl border border-surface-200 p-5 bg-white hover:border-brand-300 hover:shadow-md transition-all group">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Package Name</div>
                    <div class="text-surface-900 font-bold text-lg truncate" title="${esc(metadata.Name)}">${esc(metadata.Name || 'Unknown')}</div>
                  </div>
                  <div class="rounded-2xl border border-surface-200 p-5 bg-white hover:border-brand-300 hover:shadow-md transition-all group">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Author / Maintainer</div>
                    <div class="text-surface-900 font-bold text-lg truncate" title="${esc(metadata.Author)}">${esc(metadata.Author || metadata.Maintainer || 'N/A')}</div>
                  </div>
                  <div class="rounded-2xl border border-surface-200 p-5 bg-white hover:border-brand-300 hover:shadow-md transition-all group">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">License</div>
                    <div class="text-surface-900 font-bold text-lg truncate" title="${esc(metadata.License)}">${esc(metadata.License || 'N/A')}</div>
                  </div>
                </div>

                <div class="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
                  <div class="bg-surface-50/50 px-5 py-3 border-b border-surface-100">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Summary & Details</div>
                  </div>
                  <div class="p-6 space-y-4">
                    <p class="text-surface-700 leading-relaxed font-medium">${esc(metadata.Summary || 'No summary provided.')}</p>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      ${metadata['Home-page'] ? `
                        <div class="flex items-start gap-3">
                          <div class="p-2 bg-brand-50 rounded-lg text-brand-600">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Home Page</div>
                            <a href="${esc(metadata['Home-page'])}" target="_blank" class="text-sm font-semibold text-brand-600 hover:text-brand-700 truncate block underline decoration-brand-200 underline-offset-4">${esc(metadata['Home-page'])}</a>
                          </div>
                        </div>
                      ` : ''}
                      ${metadata['Requires-Python'] ? `
                        <div class="flex items-start gap-3">
                          <div class="p-2 bg-amber-50 rounded-lg text-amber-600">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                          </div>
                          <div>
                            <div class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Python Required</div>
                            <div class="text-sm font-semibold text-surface-900">${esc(metadata['Requires-Python'])}</div>
                          </div>
                        </div>
                      ` : ''}
                    </div>

                    ${wheelInfo ? `
                      <div class="mt-6 pt-6 border-t border-surface-100">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">Wheel Specification</div>
                        <div class="flex flex-wrap gap-4">
                          <div class="text-xs bg-surface-100 text-surface-700 px-3 py-1.5 rounded-lg border border-surface-200">
                            <span class="font-bold">Generator:</span> ${esc(wheelInfo.Generator || 'N/A')}
                          </div>
                          <div class="text-xs bg-surface-100 text-surface-700 px-3 py-1.5 rounded-lg border border-surface-200">
                            <span class="font-bold">Tag:</span> ${esc(wheelInfo.Tag || 'N/A')}
                          </div>
                          <div class="text-xs bg-surface-100 text-surface-700 px-3 py-1.5 rounded-lg border border-surface-200">
                            <span class="font-bold">Root-Is-Purelib:</span> ${esc(wheelInfo['Root-Is-Purelib'] || 'N/A')}
                          </div>
                        </div>
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }

          // Archive Content Section
          html += `
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <h3 class="text-lg font-bold text-surface-800">Archive Contents</h3>
                  <span class="text-[11px] font-bold bg-surface-100 text-surface-600 px-2.5 py-1 rounded-full border border-surface-200">${files.length} items</span>
                </div>
                
                <div class="relative w-64 group">
                  <input 
                    type="text" 
                    id="file-filter" 
                    placeholder="Search paths..." 
                    value="${esc(state.filter)}"
                    class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm group-hover:border-surface-300"
                  >
                  <div class="absolute left-3 top-2.5 text-surface-400 group-hover:text-brand-500 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </div>
                </div>
              </div>

              <div class="overflow-x-auto rounded-2xl border border-surface-200 shadow-sm bg-white">
                <table class="min-w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-5 py-4 text-left font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" onclick="window._omni_sort('name')">
                        <div class="flex items-center gap-2">
                          File Path
                          ${sortCol === 'name' ? `<span class="text-brand-600">${sortDir === 'asc' ? '▲' : '▼'}</span>` : '<span class="text-surface-300 opacity-0 group-hover:opacity-100">↕</span>'}
                        </div>
                      </th>
                      <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-5 py-4 text-right font-bold text-surface-700 border-b border-surface-200 w-40 cursor-pointer hover:bg-surface-100 transition-colors" onclick="window._omni_sort('size')">
                        <div class="flex items-center justify-end gap-2">
                          ${sortCol === 'size' ? `<span class="text-brand-600">${sortDir === 'asc' ? '▲' : '▼'}</span>` : '<span class="text-surface-300 opacity-0 group-hover:opacity-100">↕</span>'}
                          Size
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
          `;

          if (filteredFiles.length === 0) {
            html += `
              <tr>
                <td colspan="2" class="px-5 py-16 text-center">
                  <div class="text-surface-300 mb-2">
                    <svg class="w-12 h-12 mx-auto opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line></svg>
                  </div>
                  <div class="text-surface-500 font-medium">
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
                <tr class="${f.dir ? 'bg-surface-50/30' : ''} hover:bg-brand-50/30 transition-colors group cursor-default">
                  <td class="px-5 py-3 text-surface-700 font-mono text-[13px] break-all">
                    <div class="flex items-center gap-3">
                      ${f.dir 
                        ? '<svg class="w-4 h-4 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>'
                        : '<svg class="w-4 h-4 text-surface-400 group-hover:text-brand-500 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>'
                      }
                      <span class="${f.dir ? 'font-semibold text-surface-800' : ''}">${esc(f.name)}</span>
                    </div>
                  </td>
                  <td class="px-5 py-3 text-surface-500 text-right font-mono text-xs whitespace-nowrap">
                    ${f.dir ? '-' : `<span class="font-medium text-surface-700">${formatSize(f.size).split(' ')[0]}</span> <span class="text-[10px] opacity-70 uppercase">${formatSize(f.size).split(' ')[1] || ''}</span>`}
                  </td>
                </tr>
              `;
            });

            if (filteredFiles.length > limit) {
              html += `
                <tr class="bg-surface-50/50">
                  <td colspan="2" class="px-5 py-5 text-center text-surface-400 text-xs font-medium italic">
                    Showing first ${limit} of ${filteredFiles.length} items. Use the search box above to filter.
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

          // Long Description / README if present
          if (metadata && metadata.Description) {
            html += `
              <div class="space-y-4 pt-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-bold text-surface-800">Long Description</h3>
                </div>
                <div class="rounded-2xl border border-surface-200 overflow-hidden shadow-sm bg-gray-950">
                  <div class="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-white/5">
                    <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">ReStructuredText / Markdown</span>
                    <button class="text-gray-400 hover:text-white transition-colors" onclick="window._omni_copy_desc()">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                    </button>
                  </div>
                  <pre id="description-pre" class="p-6 text-[13px] font-mono text-gray-300 overflow-x-auto leading-relaxed max-h-[500px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"><code>${esc(metadata.Description)}</code></pre>
                </div>
              </div>
            `;
          }

          html += '</div>';

          h.render(html);

          // B9: Events
          const mount = h.getMountEl();
          
          const input = mount.querySelector('#file-filter');
          if (input) {
            input.addEventListener('input', (e) => {
              const val = e.target.value;
              h.setState('filter', val);
              // B8: Use named function
              _renderUI(h);
              const newInput = h.getMountEl().querySelector('#file-filter');
              if (newInput) {
                newInput.focus();
                newInput.setSelectionRange(val.length, val.length);
              }
            });
          }

          window._omni_sort = (col) => {
            const current = h.getState().sortCol;
            const dir = h.getState().sortDir;
            if (current === col) {
              h.setState('sortDir', dir === 'asc' ? 'desc' : 'asc');
            } else {
              h.setState('sortCol', col);
              h.setState('sortDir', 'asc');
            }
            _renderUI(h);
          };

          window._omni_copy_desc = () => {
            const pre = mount.querySelector('#description-pre');
            if (pre) {
              h.copyToClipboard(pre.textContent, mount.querySelector('button[onclick="window._omni_copy_desc()"]'));
            }
          };
        }
      }
    });
  };

})();
