(function() {
  'use strict';

  let currentPreviewUrl = null;

  /**
   * Utility to format bytes into human-readable sizes
   */
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * XSS prevention helper
   */
  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Revoke existing object URLs to prevent memory leaks (B5)
   */
  function cleanup() {
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
  }

  /**
   * Wait for a library to be available on window (B1, B4)
   */
  async function waitForLib(globalName, timeout = 5000) {
    if (window[globalName]) return true;
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (window[globalName] || (Date.now() - start) > timeout) {
          clearInterval(interval);
          resolve(!!window[globalName]);
        }
      }, 100);
    });
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.sketch',
      dropLabel: 'Drop a Sketch design file',
      binary: true, // B2: ensures content is ArrayBuffer
      onInit: function(helpers) {
        // Load JSZip for archive processing
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: async function(file, content, helpers) {
        cleanup();
        helpers.showLoading('Opening Sketch bundle...'); // U2, U6

        const isJSZipLoaded = await waitForLib('JSZip');
        if (!isJSZipLoaded) {
          helpers.showError('Dependency Error', 'Failed to load JSZip library. Please check your connection.');
          return;
        }

        try {
          const zip = await JSZip.loadAsync(content);
          
          // Extract Preview Image
          let previewBlob = null;
          const previewFile = zip.file('previews/preview.png');
          if (previewFile) {
            previewBlob = await previewFile.async('blob');
            currentPreviewUrl = URL.createObjectURL(previewBlob);
          }

          // Extract Metadata (meta.json)
          const metaFile = zip.file('meta.json');
          let meta = {};
          if (metaFile) {
            const text = await metaFile.async('text');
            meta = JSON.parse(text);
          }

          // Extract Document Info (document.json)
          const docFile = zip.file('document.json');
          let doc = {};
          if (docFile) {
            const text = await docFile.async('text');
            doc = JSON.parse(text);
          }

          // Extract User Settings (user.json)
          const userFile = zip.file('user.json');
          let user = {};
          if (userFile) {
            const text = await userFile.async('text');
            user = JSON.parse(text);
          }

          // Get file list for the bundle explorer
          const bundleFiles = [];
          zip.forEach((relativePath, zipEntry) => {
            bundleFiles.push({
              path: relativePath,
              size: zipEntry._data.uncompressedSize,
              dir: zipEntry.dir
            });
          });

          helpers.setState('sketch', { 
            file, 
            meta, 
            doc, 
            user, 
            bundleFiles,
            previewBlob 
          });

          renderUI(helpers);
        } catch (err) {
          console.error('[Sketch Opener Error]', err);
          helpers.showError(
            'Could not open Sketch file', 
            'The file may be corrupted, encrypted, or saved in an incompatible version. Ensure it is a valid .sketch ZIP bundle.'
          );
        }
      },
      actions: [
        {
          label: '🖼️ Download Preview',
          id: 'dl-preview',
          onClick: function(helpers) {
            const state = helpers.getState().sketch;
            if (state && state.previewBlob) {
              helpers.download(state.file.name.replace('.sketch', '-preview.png'), state.previewBlob, 'image/png');
            } else {
              alert('This Sketch file does not contain a preview image.');
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function(helpers, btn) {
            const state = helpers.getState().sketch;
            if (state) {
              const exportData = {
                meta: state.meta,
                document: {
                  assets: state.doc.assets,
                  pages: state.doc.pages
                }
              };
              helpers.copyToClipboard(JSON.stringify(exportData, null, 2), btn);
            }
          }
        }
      ]
    });
  };

  function renderUI(helpers) {
    const state = helpers.getState().sketch;
    if (!state) return;

    const { file, meta, doc, bundleFiles } = state;
    const pages = meta.pagesAndArtboards || {};
    const fonts = meta.fonts || [];
    
    // Process pages and artboards
    const pageEntries = Object.keys(pages).map(id => ({
      id,
      name: pages[id].name,
      artboards: Object.keys(pages[id].artboards || {}).map(abId => ({
        id: abId,
        name: pages[id].artboards[abId].name
      }))
    }));

    // Process Colors from assets
    const colors = (doc.assets && doc.assets.colors) || [];

    const html = `
      <div class="max-w-7xl mx-auto p-4 md:p-8">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-8 border border-surface-100 shadow-sm">
          <span class="font-bold text-surface-900">${escape(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">.sketch</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">v${meta.appVersion || 'Unknown'}</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <!-- Left Column: Preview & Pages -->
          <div class="lg:col-span-8 space-y-10">
            
            <!-- Preview Section -->
            <section>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-surface-900 text-lg">Visual Preview</h3>
                <span class="text-[10px] font-mono text-surface-400 bg-surface-100 px-2 py-1 rounded">previews/preview.png</span>
              </div>
              <div class="rounded-2xl border border-surface-200 overflow-hidden bg-surface-50 p-1 md:p-8 flex items-center justify-center min-h-[400px] shadow-inner">
                ${currentPreviewUrl ? 
                  `<img src="${currentPreviewUrl}" class="max-w-full h-auto shadow-2xl rounded border border-white/20" alt="Sketch Preview">` : 
                  `<div class="text-center py-20">
                    <div class="text-5xl mb-4 grayscale opacity-20">🖼️</div>
                    <p class="text-surface-400 font-medium">No preview available for this design</p>
                  </div>`
                }
              </div>
            </section>

            <!-- Pages & Artboards with Search (PART 4) -->
            <section>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div class="flex items-center gap-3">
                  <h3 class="font-bold text-surface-900 text-lg">Pages & Artboards</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">${pageEntries.length}</span>
                </div>
                <div class="relative group">
                  <input type="text" id="omni-search" placeholder="Search artboards..." 
                    class="w-full sm:w-64 pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">🔍</span>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="page-grid">
                ${pageEntries.length > 0 ? pageEntries.map(page => `
                  <div class="page-container rounded-2xl border border-surface-200 bg-white hover:border-brand-300 transition-all shadow-sm overflow-hidden" data-page-name="${escape(page.name)}">
                    <div class="px-5 py-3.5 bg-surface-50/50 border-b border-surface-100 flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full bg-brand-500"></div>
                      <span class="font-bold text-surface-800 text-sm truncate">${escape(page.name)}</span>
                    </div>
                    <div class="p-3 space-y-1 artboard-list">
                      ${page.artboards.length > 0 ? page.artboards.map(ab => `
                        <div class="artboard-card group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-brand-50 transition-colors cursor-default" data-ab-name="${escape(ab.name)}">
                          <div class="flex items-center gap-3 min-w-0">
                            <span class="text-surface-300 text-[10px] group-hover:text-brand-400">▣</span>
                            <span class="text-xs text-surface-600 font-medium truncate">${escape(ab.name)}</span>
                          </div>
                          <span class="opacity-0 group-hover:opacity-100 text-[10px] text-brand-500 font-bold uppercase tracking-tighter transition-opacity">Select</span>
                        </div>
                      `).join('') : `
                        <div class="px-3 py-4 text-center text-[11px] text-surface-400 italic">No artboards in this page</div>
                      `}
                    </div>
                  </div>
                `).join('') : `
                  <div class="col-span-full py-16 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                    <p class="text-surface-400 font-medium">No pages or artboards found</p>
                  </div>
                `}
              </div>
            </section>

          </div>

          <!-- Right Column: Sidebar -->
          <div class="lg:col-span-4 space-y-8">
            
            <!-- App Details Card -->
            <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm">
              <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] mb-5">Source Application</h4>
              <div class="flex items-center gap-4 mb-6">
                <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-2xl shadow-lg shadow-brand-500/20 text-white">🎨</div>
                <div>
                  <div class="text-base font-bold text-surface-900">${escape(meta.app || 'Sketch')}</div>
                  <div class="text-xs text-surface-500 font-medium">Build ${escape(meta.build || 'N/A')}</div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-4 pt-5 border-t border-surface-100">
                <div>
                  <div class="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1">Version</div>
                  <div class="text-xs font-bold text-surface-700">${escape(meta.appVersion || 'Unknown')}</div>
                </div>
                <div>
                  <div class="text-[9px] font-bold text-surface-400 uppercase tracking-wider mb-1">Variant</div>
                  <div class="text-xs font-bold text-surface-700">${meta.variant || 'Standard'}</div>
                </div>
              </div>
            </div>

            <!-- Color Palette -->
            ${colors.length > 0 ? `
              <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">
                <div class="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
                  <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em]">Document Colors</h4>
                  <span class="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-bold">${colors.length}</span>
                </div>
                <div class="p-5 grid grid-cols-4 gap-3">
                  ${colors.map(c => {
                    const r = Math.round(c.red * 255);
                    const g = Math.round(c.green * 255);
                    const b = Math.round(c.blue * 255);
                    const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
                    return `
                      <div class="group relative">
                        <div class="w-full aspect-square rounded-lg border border-surface-100 shadow-sm transition-transform group-hover:scale-110 cursor-pointer" 
                          style="background-color: ${hex}" title="${hex}"></div>
                        <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">${hex}</div>
                      </div>
                    `;
                  }).join('')}
                </div>
                <div class="h-4"></div> <!-- Spacer for absolute labels -->
              </div>
            ` : ''}

            <!-- Fonts Used Card (U9/U10) -->
            <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">
              <div class="px-5 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/30">
                <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em]">Typography</h4>
                <span class="text-[10px] bg-surface-200 text-surface-600 px-2 py-0.5 rounded-full font-bold">${fonts.length}</span>
              </div>
              <div class="max-h-64 overflow-y-auto">
                ${fonts.length > 0 ? `
                  <div class="divide-y divide-surface-50">
                    ${fonts.map(font => `
                      <div class="px-5 py-3 hover:bg-surface-50 transition-colors flex items-center gap-3">
                        <span class="text-surface-300">Aa</span>
                        <span class="text-xs font-semibold text-surface-700 truncate">${escape(font)}</span>
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <div class="p-8 text-center">
                    <p class="text-[11px] text-surface-400 italic">No embedded font data</p>
                  </div>
                `}
              </div>
            </div>

            <!-- Bundle Explorer (Archive Excellence) -->
            <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">
              <div class="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
                <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em]">Bundle Structure</h4>
                <span class="text-[10px] font-mono text-surface-400">${bundleFiles.length} files</span>
              </div>
              <div class="p-2">
                <div class="max-h-[300px] overflow-y-auto rounded-xl border border-surface-50">
                  <table class="min-w-full text-[10px]">
                    <thead class="bg-surface-50 sticky top-0">
                      <tr>
                        <th class="px-3 py-2 text-left font-bold text-surface-500 uppercase tracking-tighter">Path</th>
                        <th class="px-3 py-2 text-right font-bold text-surface-500 uppercase tracking-tighter">Size</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-50">
                      ${bundleFiles.map(f => `
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-3 py-1.5 text-surface-600 truncate max-w-[140px] font-mono" title="${escape(f.path)}">
                            ${f.dir ? '📁 ' : ''}${escape(f.path)}
                          </td>
                          <td class="px-3 py-1.5 text-right text-surface-400 font-mono">${formatSize(f.size)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Live Search Implementation (Part 4)
    const searchInput = document.getElementById('omni-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const containers = document.querySelectorAll('.page-container');

        containers.forEach(container => {
          const pageName = container.getAttribute('data-page-name').toLowerCase();
          const artboards = container.querySelectorAll('.artboard-card');
          let hasMatch = pageName.includes(query);

          artboards.forEach(ab => {
            const abName = ab.getAttribute('data-ab-name').toLowerCase();
            if (abName.includes(query) || pageName.includes(query)) {
              ab.style.display = 'flex';
              hasMatch = true;
            } else {
              ab.style.display = 'none';
            }
          });

          container.style.display = hasMatch ? 'block' : 'none';
        });
      });
    }
  }

})();
