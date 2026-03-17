(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    let jszipLoaded = false;
    let currentPreviewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.xd',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', function() {
          jszipLoaded = true;
        });
      },
      onFile: async function(file, content, helpers) {
        helpers.showLoading('Analyzing Adobe XD structure...');

        try {
          // B1: Wait for JSZip to load if not already
          if (!jszipLoaded && typeof JSZip === 'undefined') {
            await new Promise((resolve) => {
              helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => {
                jszipLoaded = true;
                resolve();
              });
            });
          }

          // B5: Revoke previous preview URL to prevent memory leaks
          if (currentPreviewUrl) {
            URL.revokeObjectURL(currentPreviewUrl);
            currentPreviewUrl = null;
          }

          // B2: content is ArrayBuffer (binary:true)
          const zip = await JSZip.loadAsync(content);
          
          const fileEntries = [];
          zip.forEach((path, entry) => {
            fileEntries.push({
              path: path,
              size: entry._data.uncompressedSize || 0,
              isDir: entry.dir
            });
          });

          // U2: Descriptive loading message
          helpers.showLoading('Extracting artboards and metadata...');

          // Extract Manifest
          let manifest = null;
          const manifestFile = zip.file('manifest');
          if (manifestFile) {
            try {
              manifest = JSON.parse(await manifestFile.async('string'));
            } catch (e) {
              console.error('Failed to parse manifest', e);
            }
          }

          // Extract Preview
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
              const data = JSON.parse(await zip.file(artFile.path).async('string'));
              if (data.children) {
                data.children.forEach(child => {
                  if (child.type === 'artboard' && child.name) {
                    artboards.push({
                      name: child.name,
                      id: child.id,
                      width: child.ux?.width,
                      height: child.ux?.height
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
            searchTerm: ''
          });

          render(helpers);
        } catch (err) {
          // U3: Friendly error message
          helpers.showError('Could not open XD file', 'This file might be corrupted, encrypted, or saved in an incompatible format. Adobe XD files are ZIP-based; ensure this is a valid .xd archive.');
        }
      },
      actions: [
        {
          label: '📋 Copy Artboards',
          id: 'copy-artboards',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.artboards && state.artboards.length > 0) {
              const names = state.artboards.map(a => a.name).join('\n');
              helpers.copyToClipboard(names, btn);
            } else {
              alert('No artboards found to copy.');
            }
          }
        },
        {
          label: '📥 Save Preview',
          id: 'save-preview',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (state.previewBlob) {
              helpers.download(helpers.getFile().name.replace('.xd', '-preview.png'), state.previewBlob, 'image/png');
            } else {
              alert('No preview image available in this XD file.');
            }
          }
        }
      ]
    });

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(unsafe) {
      if (!unsafe) return '';
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function render(helpers) {
      const state = helpers.getState();
      const file = helpers.getFile();
      
      // U1: File info bar
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.xd Adobe XD file</span>
          ${state.artboards.length > 0 ? `
            <span class="text-surface-300">|</span>
            <span class="text-brand-600 font-medium">${state.artboards.length} Artboards</span>
          ` : ''}
        </div>
      `;

      // Main Content
      let contentHtml = `
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div class="xl:col-span-2 space-y-6">
            <!-- Preview Section -->
            ${state.previewUrl ? `
              <div class="rounded-xl border border-surface-200 overflow-hidden bg-surface-50">
                <div class="px-4 py-3 border-b border-surface-200 bg-white flex items-center justify-between">
                  <h3 class="font-semibold text-surface-800">Quick Preview</h3>
                  <span class="text-xs text-surface-400 font-mono">previews/preview.png</span>
                </div>
                <div class="p-4 flex justify-center bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2M8ceL6fwY0wNjYGMxqYGBgSDA6GvBfMv8fD8mBv9R3AAn6OAL98D8D8icAsU0fBfX53XAAAAAASUVORK5CYII=')]">
                  <img src="${state.previewUrl}" class="max-w-full h-auto shadow-2xl rounded border border-white/20" alt="Adobe XD Preview" />
                </div>
              </div>
            ` : `
              <div class="rounded-xl border-2 border-dashed border-surface-200 p-12 text-center text-surface-400">
                <div class="text-4xl mb-3">🖼️</div>
                <p>No preview image found in this XD file.</p>
              </div>
            `}

            <!-- Artboards Section -->
            ${state.artboards.length > 0 ? `
              <div>
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Artboards</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${state.artboards.length} items</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  ${state.artboards.map(art => `
                    <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white group">
                      <div class="flex items-start justify-between">
                        <div>
                          <div class="font-semibold text-surface-900 group-hover:text-brand-700 transition-colors">${escapeHtml(art.name)}</div>
                          <div class="text-xs text-surface-500 mt-1">
                            ${art.width && art.height ? `${Math.round(art.width)} × ${Math.round(art.height)} px` : 'Custom size'}
                          </div>
                        </div>
                        <div class="text-surface-300 group-hover:text-brand-300 transition-colors">
                          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path></svg>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <div class="space-y-6">
            <!-- Metadata Card -->
            <div class="rounded-xl border border-surface-200 p-4 bg-white">
              <h3 class="font-semibold text-surface-800 mb-4 flex items-center gap-2">
                <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Document Info
              </h3>
              <div class="space-y-3 text-sm">
                <div class="flex justify-between items-center py-2 border-b border-surface-50">
                  <span class="text-surface-500">Name</span>
                  <span class="font-medium text-surface-900 truncate max-w-[150px]">${escapeHtml(state.manifest?.name || 'Untitled')}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-surface-50">
                  <span class="text-surface-500">Version</span>
                  <span class="font-medium text-surface-900">${escapeHtml(state.manifest?.version || 'Unknown')}</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-surface-50">
                  <span class="text-surface-500">Format</span>
                  <span class="font-medium text-surface-900">Adobe XD</span>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-surface-50">
                  <span class="text-surface-500">Files In Archive</span>
                  <span class="font-medium text-surface-900">${state.allFiles.length}</span>
                </div>
              </div>
            </div>

            <!-- Internal Structure with Search (Format Excellence: ARCHIVE) -->
            <div class="rounded-xl border border-surface-200 overflow-hidden bg-white">
              <div class="p-4 border-b border-surface-200">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800 text-sm">Contents</h3>
                  <span class="text-[10px] uppercase tracking-wider font-bold text-surface-400">Internal Files</span>
                </div>
                <div class="relative">
                  <input type="text" id="xd-file-search" placeholder="Search files..." class="w-full pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all" value="${escapeHtml(state.searchTerm)}">
                  <svg class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
              <div class="max-h-[300px] overflow-y-auto">
                <table class="min-w-full text-[11px]">
                  <thead class="sticky top-0 bg-surface-50/95 backdrop-blur shadow-sm">
                    <tr>
                      <th class="px-4 py-2 text-left font-semibold text-surface-600">Path</th>
                      <th class="px-4 py-2 text-right font-semibold text-surface-600">Size</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${state.filteredFiles.length > 0 ? state.filteredFiles.slice(0, 100).map(f => `
                      <tr class="hover:bg-brand-50/50 transition-colors">
                        <td class="px-4 py-2 font-mono text-surface-600 truncate max-w-[180px]" title="${escapeHtml(f.path)}">
                          ${escapeHtml(f.path)}
                        </td>
                        <td class="px-4 py-2 text-right text-surface-400 tabular-nums">
                          ${f.isDir ? '—' : formatBytes(f.size)}
                        </td>
                      </tr>
                    `).join('') : `
                      <tr>
                        <td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">No matching files</td>
                      </tr>
                    `}
                    ${state.filteredFiles.length > 100 ? `
                      <tr>
                        <td colspan="2" class="px-4 py-2 text-center text-surface-400 bg-surface-50">
                          And ${state.filteredFiles.length - 100} more files...
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

      helpers.render(infoBar + contentHtml);

      // Handle search input after render
      const searchInput = document.getElementById('xd-file-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase();
          const filtered = state.allFiles.filter(f => f.path.toLowerCase().includes(term));
          helpers.setState({
            searchTerm: term,
            filteredFiles: filtered
          });
          render(helpers);
          // Focus back after re-render
          const newSearch = document.getElementById('xd-file-search');
          if (newSearch) {
            newSearch.focus();
            newSearch.setSelectionRange(term.length, term.length);
          }
        });
      }
    }
  };
})();
