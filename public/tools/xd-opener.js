(function() {
  'use strict';

  /**
   * Adobe XD Opener
   * A production-perfect viewer for .xd files using OmniTool SDK.
   */
  window.initTool = function(toolConfig, mountEl) {
    let jszipLoaded = false;
    let currentPreviewUrl = null;

    // Helper to format bytes to human readable string
    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Helper to escape HTML and prevent XSS
    function escapeHtml(unsafe) {
      if (unsafe === undefined || unsafe === null) return '';
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.xd',
      binary: true,
      onInit: function(helpers) {
        // Load JSZip from CDN
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', function() {
          jszipLoaded = true;
        });
      },
      onDestroy: function() {
        // B5: Revoke object URL on unmount to prevent memory leaks
        if (currentPreviewUrl) {
          URL.revokeObjectURL(currentPreviewUrl);
          currentPreviewUrl = null;
        }
      },
      onFile: async function _onFileFn(file, content, helpers) {
        helpers.showLoading('Initializing Adobe XD engine...');

        try {
          // B1: Check and wait for CDN script
          if (!jszipLoaded && typeof JSZip === 'undefined') {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('JSZip load timeout')), 10000);
              helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => {
                clearTimeout(timeout);
                jszipLoaded = true;
                resolve();
              });
            });
          }

          // B5: Cleanup previous session
          if (currentPreviewUrl) {
            URL.revokeObjectURL(currentPreviewUrl);
            currentPreviewUrl = null;
          }

          helpers.showLoading('Extracting Adobe XD package...');
          
          // B2: content is ArrayBuffer because binary: true
          const zip = await JSZip.loadAsync(content);
          
          const fileEntries = [];
          zip.forEach((path, entry) => {
            fileEntries.push({
              path: path,
              size: entry._data.uncompressedSize || 0,
              isDir: entry.dir
            });
          });

          if (fileEntries.length === 0) {
            helpers.showError('Empty XD File', 'The archive contains no files.');
            return;
          }

          helpers.showLoading('Parsing manifest and artboards...');

          // Extract Manifest
          let manifest = null;
          const manifestFile = zip.file('manifest');
          if (manifestFile) {
            try {
              const manifestStr = await manifestFile.async('string');
              manifest = JSON.parse(manifestStr);
            } catch (e) {
              console.warn('Failed to parse manifest.json', e);
            }
          }

          // Extract Preview Image
          let previewBlob = null;
          const previewFile = zip.file('previews/preview.png');
          if (previewFile) {
            previewBlob = await previewFile.async('blob');
            currentPreviewUrl = URL.createObjectURL(previewBlob);
          }

          // Extract Artboards from artwork graphics
          const artboards = [];
          const artworkFiles = fileEntries.filter(f => f.path.startsWith('artwork/') && f.path.endsWith('/graphics/graphics.json'));
          
          for (const artFile of artworkFiles) {
            try {
              const artDataStr = await zip.file(artFile.path).async('string');
              const data = JSON.parse(artDataStr);
              if (data.children) {
                data.children.forEach(child => {
                  if (child.type === 'artboard' && child.name) {
                    artboards.push({
                      name: child.name,
                      id: child.id,
                      width: child.ux?.width,
                      height: child.ux?.height,
                      x: child.ux?.x,
                      y: child.ux?.y
                    });
                  }
                });
              }
            } catch (e) {
              console.error('Failed to parse artwork file', artFile.path, e);
            }
          }

          helpers.setState({
            allFiles: fileEntries,
            filteredFiles: fileEntries,
            manifest: manifest,
            previewUrl: currentPreviewUrl,
            previewBlob: previewBlob,
            artboards: artboards,
            searchTerm: '',
            sortKey: 'path',
            sortAsc: true
          });

          render(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open Adobe XD file', 'The file may be corrupted, encrypted, or saved in an incompatible format. Adobe XD files are ZIP-based; ensure this is a valid .xd archive.');
        }
      },
      actions: [
        {
          label: '📥 Download PNG Preview',
          id: 'dl-preview',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (state.previewBlob) {
              helpers.download(helpers.getFile().name.replace('.xd', '-preview.png'), state.previewBlob, 'image/png');
            } else {
              helpers.showError('No Preview', 'This Adobe XD file does not contain a preview.png image.');
            }
          }
        },
        {
          label: '📋 Copy Artboard Names',
          id: 'copy-artboards',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.artboards && state.artboards.length > 0) {
              const names = state.artboards.map(a => a.name).join('\n');
              helpers.copyToClipboard(names, btn);
            } else {
              helpers.showError('No Artboards', 'No artboards were found in this file.');
            }
          }
        },
        {
          label: '📄 Export Manifest',
          id: 'export-manifest',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (state.manifest) {
              const blob = new Blob([JSON.stringify(state.manifest, null, 2)], { type: 'application/json' });
              helpers.download('manifest.json', blob, 'application/json');
            } else {
              helpers.showError('No Manifest', 'This file does not contain a standard manifest.');
            }
          }
        }
      ]
    });

    function render(helpers) {
      const state = helpers.getState();
      const file = helpers.getFile();
      
      // U1: File info bar
      let infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-md text-[10px] font-bold uppercase tracking-wider">Adobe XD</span>
          ${state.artboards.length > 0 ? `
            <span class="text-surface-300">|</span>
            <span class="text-brand-600 font-medium">${state.artboards.length} Artboards</span>
          ` : ''}
        </div>
      `;

      // Main Grid Layout
      let html = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <!-- LEFT COLUMN: Preview & Artboards (8 cols) -->
          <div class="lg:col-span-8 space-y-8">
            
            <!-- Preview Section -->
            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-surface-900 flex items-center gap-2">
                  <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  Quick Preview
                </h3>
              </div>
              
              ${state.previewUrl ? `
                <div class="rounded-2xl border border-surface-200 overflow-hidden bg-surface-100 group relative">
                  <div class="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8//8/AwXgYBjVfEIBBgYALx8K6V66L0YAAAAASUVORK5CYII=')] opacity-20"></div>
                  <div class="relative p-6 flex justify-center items-center min-h-[400px]">
                    <img src="${state.previewUrl}" class="max-w-full max-h-[600px] h-auto shadow-2xl rounded-lg border border-white/40 bg-white" alt="Adobe XD Preview" />
                  </div>
                </div>
              ` : `
                <div class="rounded-2xl border-2 border-dashed border-surface-200 bg-surface-50 p-16 text-center">
                  <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4 text-surface-400">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                  </div>
                  <h4 class="text-surface-800 font-semibold">No Preview Image</h4>
                  <p class="text-surface-500 text-sm mt-1 max-w-xs mx-auto">This file was likely saved without a thumbnail preview.</p>
                </div>
              `}
            </section>

            <!-- Artboards List -->
            <section>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-surface-900 flex items-center gap-2">
                  <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                  Artboards
                </h3>
                <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  ${state.artboards.length} Items
                </span>
              </div>

              ${state.artboards.length > 0 ? `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  ${state.artboards.map(art => `
                    <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 hover:shadow-md transition-all group">
                      <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors flex-shrink-0">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>
                        </div>
                        <div class="min-w-0">
                          <div class="font-bold text-surface-900 truncate" title="${escapeHtml(art.name)}">${escapeHtml(art.name)}</div>
                          <div class="text-[11px] text-surface-500 mt-0.5 font-medium">
                            ${art.width ? `${Math.round(art.width)} × ${Math.round(art.height)} px` : 'Responsive / Fluid'}
                          </div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="p-8 border border-surface-200 rounded-xl bg-surface-50 text-center text-surface-400 italic">
                  No artboards detected in this document.
                </div>
              `}
            </section>
          </div>

          <!-- RIGHT COLUMN: Metadata & Files (4 cols) -->
          <div class="lg:col-span-4 space-y-6">
            
            <!-- Document Information Card -->
            <div class="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
              <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50">
                <h3 class="font-bold text-surface-900 flex items-center gap-2 text-sm">
                  <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  File Insights
                </h3>
              </div>
              <div class="p-5 space-y-4">
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Document Name</span>
                  <span class="font-bold text-surface-800">${escapeHtml(state.manifest?.name || 'Untitled')}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Cloud Version</span>
                  <span class="font-bold text-surface-800">${escapeHtml(state.manifest?.version || 'N/A')}</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Total Asset Count</span>
                  <span class="font-bold text-surface-800">${state.allFiles.length} files</span>
                </div>
                <div class="flex justify-between items-center text-xs">
                  <span class="text-surface-500">Format Platform</span>
                  <span class="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 font-medium">${escapeHtml(state.manifest?.platform || 'Universal')}</span>
                </div>
              </div>
            </div>

            <!-- Manifest JSON Snippet -->
            ${state.manifest ? `
              <div class="rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                <div class="px-5 py-3 border-b border-surface-100 bg-gray-950 flex justify-between items-center">
                  <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">manifest.json</span>
                  <div class="flex gap-1.5">
                    <div class="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                    <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
                    <div class="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                  </div>
                </div>
                <div class="bg-gray-950 p-4">
                  <pre class="text-[11px] font-mono text-gray-300 leading-relaxed overflow-x-auto max-h-[160px] custom-scrollbar">${escapeHtml(JSON.stringify(state.manifest, null, 2))}</pre>
                </div>
              </div>
            ` : ''}

            <!-- Archive Browser -->
            <div class="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm flex flex-col max-h-[500px]">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-bold text-surface-900 text-xs uppercase tracking-tight">Package Contents</h3>
                  <span class="text-[10px] font-bold text-surface-400">${state.filteredFiles.length} items</span>
                </div>
                <div class="relative">
                  <input 
                    type="text" 
                    id="xd-file-search" 
                    placeholder="Search package files..." 
                    class="w-full pl-9 pr-4 py-2 text-xs border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all" 
                    value="${escapeHtml(state.searchTerm)}"
                  >
                  <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
              
              <div class="overflow-y-auto overflow-x-hidden flex-grow custom-scrollbar">
                <table class="min-w-full text-[11px]">
                  <thead class="sticky top-0 bg-white/95 backdrop-blur-md z-10 shadow-sm border-b border-surface-100">
                    <tr>
                      <th class="px-4 py-2.5 text-left font-bold text-surface-600 cursor-pointer hover:text-brand-600 transition-colors xd-sort-btn" data-key="path">
                        Path ${state.sortKey === 'path' ? (state.sortAsc ? '↑' : '↓') : ''}
                      </th>
                      <th class="px-4 py-2.5 text-right font-bold text-surface-600 cursor-pointer hover:text-brand-600 transition-colors xd-sort-btn" data-key="size">
                        Size ${state.sortKey === 'size' ? (state.sortAsc ? '↑' : '↓') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-50">
                    ${state.filteredFiles.length > 0 ? state.filteredFiles.slice(0, 150).map(f => `
                      <tr class="hover:bg-brand-50/40 transition-colors">
                        <td class="px-4 py-2 font-mono text-surface-600 truncate max-w-[140px]" title="${escapeHtml(f.path)}">
                          ${f.isDir ? '📁 ' : ''}${escapeHtml(f.path)}
                        </td>
                        <td class="px-4 py-2 text-right text-surface-400 tabular-nums">
                          ${f.isDir ? '<span class="opacity-30">—</span>' : formatBytes(f.size)}
                        </td>
                      </tr>
                    `).join('') : `
                      <tr>
                        <td colspan="2" class="px-4 py-12 text-center text-surface-400 bg-surface-50">
                          <svg class="w-8 h-8 mx-auto mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          No matching files
                        </td>
                      </tr>
                    `}
                    ${state.filteredFiles.length > 150 ? `
                      <tr>
                        <td colspan="2" class="px-4 py-3 text-center text-surface-400 bg-surface-50 text-[10px] font-medium">
                          Showing first 150 of ${state.filteredFiles.length} files
                        </td>
                      </tr>
                    ` : ''}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      `;

      helpers.render(infoBar + html);

      // Re-attach event listeners after render
      attachListeners(helpers);
    }

    function attachListeners(helpers) {
      const state = helpers.getState();
      
      // Search Box
      const searchInput = document.getElementById('xd-file-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase();
          const filtered = state.allFiles.filter(f => f.path.toLowerCase().includes(term));
          helpers.setState({
            searchTerm: term,
            filteredFiles: sortFiles(filtered, state.sortKey, state.sortAsc)
          });
          render(helpers);
          // Restore focus and cursor position
          const freshInput = document.getElementById('xd-file-search');
          if (freshInput) {
            freshInput.focus();
            const len = freshInput.value.length;
            freshInput.setSelectionRange(len, len);
          }
        });
      }

      // Sorting
      document.querySelectorAll('.xd-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.key;
          const asc = state.sortKey === key ? !state.sortAsc : true;
          const sorted = sortFiles(state.filteredFiles, key, asc);
          helpers.setState({
            sortKey: key,
            sortAsc: asc,
            filteredFiles: sorted
          });
          render(helpers);
        });
      });
    }

    function sortFiles(files, key, asc) {
      return [...files].sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        
        if (typeof valA === 'string') {
          return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return asc ? valA - valB : valB - valA;
      });
    }
  };
})();
