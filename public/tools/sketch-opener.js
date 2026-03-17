(function() {
  'use strict';

  let currentPreviewUrl = null;

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanup() {
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.sketch',
      dropLabel: 'Drop a .sketch file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: async function(file, content, helpers) {
        cleanup();
        helpers.showLoading('Analyzing Sketch bundle...');

        // Ensure JSZip is loaded (B1, B4)
        if (typeof JSZip === 'undefined') {
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Library Load Failed', 'JSZip could not be loaded from CDN. Please check your internet connection.');
            return;
          }
        }

        try {
          // B2: binary:true ensures 'content' is ArrayBuffer. JSZip handles it.
          const zip = await JSZip.loadAsync(content);
          
          // Extract Preview
          let previewBlob = null;
          const previewFile = zip.file('previews/preview.png');
          if (previewFile) {
            previewBlob = await previewFile.async('blob');
            currentPreviewUrl = URL.createObjectURL(previewBlob); // B5: Revoked in cleanup()
          }

          // Extract Meta
          const metaFile = zip.file('meta.json');
          let meta = {};
          if (metaFile) {
            const metaText = await metaFile.async('text');
            meta = JSON.parse(metaText);
          }

          // Extract Document for extra info
          const docFile = zip.file('document.json');
          let doc = {};
          if (docFile) {
            const docText = await docFile.async('text');
            doc = JSON.parse(docText);
          }

          helpers.setState('sketchData', { file, meta, doc, previewBlob });
          renderUI(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open sketch file', 'The file may be corrupted or in an unsupported format. Try saving it in a newer version of Sketch.');
        }
      },
      actions: [
        {
          label: '🖼️ Save Preview',
          id: 'dl-preview',
          onClick: function(helpers) {
            const state = helpers.getState().sketchData;
            if (state && state.previewBlob) {
              helpers.download(state.file.name.replace('.sketch', '-preview.png'), state.previewBlob, 'image/png');
            } else {
              alert('No preview image found in this Sketch file.');
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function(helpers, btn) {
            const state = helpers.getState().sketchData;
            if (state && state.meta) {
              helpers.copyToClipboard(JSON.stringify(state.meta, null, 2), btn);
            }
          }
        }
      ],
      infoHtml: '<strong>Note:</strong> All processing happens locally in your browser. Your Sketch designs are never uploaded to a server.'
    });
  };

  function renderUI(helpers) {
    const state = helpers.getState().sketchData;
    if (!state) return;
    const { file, meta, doc } = state;
    
    const pages = meta.pagesAndArtboards || {};
    const fonts = meta.fonts || [];
    const structure = Object.keys(pages).map(pageId => {
      const page = pages[pageId];
      const artboards = Object.keys(page.artboards || {}).map(abId => ({
        id: abId,
        name: page.artboards[abId].name
      }));
      return { id: pageId, name: page.name, artboards };
    });

    const html = `
      <div class="max-w-6xl mx-auto p-4 lg:p-6">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${escape(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Sketch v${meta.appVersion || 'Unknown'}</span>
          ${meta.version ? `<span class="ml-auto text-[10px] font-mono bg-surface-200 px-2 py-0.5 rounded text-surface-500">Format v${meta.version}</span>` : ''}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-8 space-y-8">
            <!-- Preview Section -->
            <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
              <div class="px-4 py-3 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                <h3 class="font-semibold text-surface-800">Preview</h3>
                <span class="text-[10px] text-surface-400 font-mono">previews/preview.png</span>
              </div>
              <div class="p-6 flex items-center justify-center bg-surface-100 min-h-[300px] relative">
                ${currentPreviewUrl ? 
                  `<img src="${currentPreviewUrl}" class="max-w-full h-auto shadow-2xl rounded-sm border border-white/50" alt="Sketch Preview">` : 
                  `<div class="text-center text-surface-400 py-12">
                    <div class="text-4xl mb-2">🖼️</div>
                    <p>No preview generated for this file</p>
                  </div>`
                }
              </div>
            </div>

            <!-- Pages & Artboards with Search (PART 4 Excellence) -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                  Pages & Artboards
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${structure.length} Pages</span>
                </h3>
                <div class="relative">
                  <input type="text" id="sketch-search" placeholder="Filter artboards..." 
                    class="pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-48 transition-all">
                  <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="structure-grid">
                ${structure.length > 0 ? structure.map(page => `
                  <div class="page-card rounded-xl border border-surface-200 bg-white hover:border-brand-300 transition-all overflow-hidden" data-page="${escape(page.name)}">
                    <div class="px-4 py-2.5 bg-surface-50 border-b border-surface-100 flex items-center gap-2">
                      <span class="text-brand-500">📄</span>
                      <span class="font-medium text-sm text-surface-700 truncate">${escape(page.name)}</span>
                    </div>
                    <div class="p-2 space-y-0.5 artboard-list">
                      ${page.artboards.length > 0 ? page.artboards.map(ab => `
                        <div class="artboard-item px-3 py-1.5 text-xs text-surface-600 hover:bg-brand-50 rounded transition-colors flex items-center gap-2" data-name="${escape(ab.name)}">
                          <span class="text-[10px] text-surface-300">▣</span>
                          <span class="truncate">${escape(ab.name)}</span>
                        </div>
                      `).join('') : `<div class="px-3 py-1.5 text-xs text-surface-400 italic">No artboards</div>`}
                    </div>
                  </div>
                `).join('') : `
                  <div class="col-span-full py-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-200 text-surface-400">
                    No pages or artboards found
                  </div>
                `}
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="lg:col-span-4 space-y-6">
            <!-- App Details -->
            <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
              <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">Application</h3>
              <div class="space-y-4">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-xl">🎨</div>
                  <div>
                    <div class="text-sm font-semibold text-surface-800">${escape(meta.app || 'Sketch')}</div>
                    <div class="text-[10px] text-surface-500">Build: ${escape(meta.build || 'N/A')}</div>
                  </div>
                </div>
                <div class="pt-4 border-t border-surface-100 grid grid-cols-2 gap-4">
                  <div>
                    <div class="text-[10px] text-surface-400 uppercase font-bold">App Version</div>
                    <div class="text-xs font-medium text-surface-700">${escape(meta.appVersion || 'Unknown')}</div>
                  </div>
                  <div>
                    <div class="text-[10px] text-surface-400 uppercase font-bold">Variant</div>
                    <div class="text-xs text-surface-700">${meta.variant || 'Standard'}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Fonts Used -->
            <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
              <div class="px-4 py-3 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Fonts Used</h3>
                <span class="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded font-medium">${fonts.length}</span>
              </div>
              <div class="max-h-[240px] overflow-y-auto">
                ${fonts.length > 0 ? `
                  <div class="divide-y divide-surface-50">
                    ${fonts.map(font => `
                      <div class="px-4 py-2.5 hover:bg-surface-50 transition-colors">
                        <div class="text-xs font-medium text-surface-700 truncate">${escape(font)}</div>
                      </div>
                    `).join('')}
                  </div>
                ` : `
                  <div class="p-6 text-center text-xs text-surface-400 italic">No embedded font info</div>
                `}
              </div>
            </div>

            <!-- Save History -->
            ${meta.saveHistory && meta.saveHistory.length > 0 ? `
              <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
                <div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50">
                  <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Recent Versions</h3>
                </div>
                <div class="p-4 space-y-3">
                  ${meta.saveHistory.slice(0, 5).map(h => `
                    <div class="flex items-start gap-3">
                      <div class="mt-1 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0"></div>
                      <div class="min-w-0">
                        <div class="text-[10px] font-semibold text-surface-700 truncate">${escape(h.app)} ${escape(h.appVersion)}</div>
                        <div class="text-[9px] text-surface-400">Build ${h.build}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Live search functionality
    const searchInput = document.getElementById('sketch-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.page-card');
        
        cards.forEach(card => {
          const pageName = card.getAttribute('data-page').toLowerCase();
          const items = card.querySelectorAll('.artboard-item');
          let hasVisibleArtboard = false;

          items.forEach(item => {
            const abName = item.getAttribute('data-name').toLowerCase();
            if (abName.includes(term) || pageName.includes(term)) {
              item.style.display = 'flex';
              hasVisibleArtboard = true;
            } else {
              item.style.display = 'none';
            }
          });

          if (hasVisibleArtboard || pageName.includes(term)) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });
      });
    }
  }

})();
