(function () {
  'use strict';

  const AG_PSD_URL = 'https://cdn.jsdelivr.net/npm/ag-psd@2.1.25/dist/bundle.js';

  window.initTool = function (toolConfig, mountEl) {
    let lastUrl = null;

    const cleanup = () => {
      if (lastUrl) {
        URL.revokeObjectURL(lastUrl);
        lastUrl = null;
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.psd',
      binary: true,
      actions: [
        {
          label: '📥 Download PNG',
          id: 'dl-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            h.showLoading('Preparing download...');
            canvas.toBlob((blob) => {
              h.hideLoading();
              const filename = h.getFile().name.replace(/\.psd$/i, '') + '.png';
              h.download(filename, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Image',
          id: 'copy-img',
          onClick: function (h, btn) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            
            const copyBase64 = () => {
              const dataUrl = canvas.toDataURL('image/png');
              h.copyToClipboard(dataUrl, btn);
            };

            if (typeof ClipboardItem !== 'undefined') {
              canvas.toBlob((blob) => {
                try {
                  const item = new ClipboardItem({ 'image/png': blob });
                  navigator.clipboard.write([item]).then(() => {
                    const orig = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    setTimeout(() => { btn.textContent = orig; }, 1500);
                  }).catch(copyBase64);
                } catch (e) {
                  copyBase64();
                }
              }, 'image/png');
            } else {
              copyBase64();
            }
          }
        }
      ],
      onInit: function (h) {
        h.loadScript(AG_PSD_URL);
      },
      onDestroy: cleanup,
      onFile: function _onFile(file, content, h) {
        cleanup();
        h.showLoading('Parsing Photoshop file...');

        const render = () => {
          if (typeof agPsd === 'undefined') {
            h.showError('Library Load Failed', 'Could not load ag-psd library. Please check your connection.');
            return;
          }

          try {
            const psd = agPsd.readPsd(content);
            const canvas = agPsd.drawPsd(psd);
            
            const formatSize = (bytes) => {
              if (bytes === 0) return '0 B';
              const k = 1024;
              const sizes = ['B', 'KB', 'MB', 'GB'];
              const i = Math.floor(Math.log(bytes) / Math.log(k));
              return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            };

            const getColorMode = (mode) => {
              const modes = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };
              return modes[mode] || 'Unknown (' + mode + ')';
            };

            const countLayers = (layers) => {
              if (!layers) return 0;
              let count = layers.length;
              layers.forEach(l => {
                if (l.children) count += countLayers(l.children);
              });
              return count;
            };

            const esc = (str) => {
              if (!str) return '';
              return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            };

            const renderLayerRow = (layer, depth = 0) => {
              const isGroup = !!layer.children;
              const opacity = layer.opacity !== undefined ? Math.round(layer.opacity * 100) : 100;
              const isHidden = layer.hidden;
              
              let html = `
                <div class="layer-item group/layer mb-1 transition-all" data-name="${esc(layer.name || '').toLowerCase()}">
                  <div class="flex items-center gap-2 p-2 rounded-lg hover:bg-brand-50 transition-colors ${isHidden ? 'opacity-40' : ''}" style="margin-left: ${depth * 12}px">
                    <span class="text-sm opacity-60">${isGroup ? '📁' : '📄'}</span>
                    <div class="flex flex-col min-w-0 flex-1">
                      <span class="text-xs font-medium text-surface-700 truncate">${esc(layer.name || 'Untitled Layer')}</span>
                      <span class="text-[10px] text-surface-400">${opacity}% Opacity ${layer.blendMode ? '• ' + layer.blendMode : ''}</span>
                    </div>
                    ${isHidden ? '<span class="text-[10px] bg-surface-100 px-1.5 py-0.5 rounded text-surface-500">Hidden</span>' : ''}
                  </div>
                  ${isGroup ? layer.children.slice().reverse().map(child => renderLayerRow(child, depth + 1)).join('') : ''}
                </div>
              `;
              return html;
            };

            const totalLayers = countLayers(psd.children);

            h.render(`
              <div class="p-4 max-w-7xl mx-auto">
                <!-- File Info Bar -->
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                  <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">Photoshop Document</span>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <!-- Main Canvas Area -->
                  <div class="lg:col-span-8 flex flex-col gap-4">
                    <div class="relative bg-surface-100 rounded-2xl border border-surface-200 overflow-hidden min-h-[400px] flex items-center justify-center p-4 md:p-8" id="psd-viewport">
                      <div class="absolute inset-0 opacity-10" style="background-image: conic-gradient(#000 0.25turn, #fff 0.25turn 0.5turn, #000 0.5turn 0.75turn, #fff 0.75turn); background-size: 20px 20px;"></div>
                      <div id="canvas-container" class="relative z-10 shadow-2xl rounded-sm overflow-hidden"></div>
                    </div>
                  </div>

                  <!-- Sidebar -->
                  <div class="lg:col-span-4 space-y-6">
                    <!-- Metadata Card -->
                    <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-surface-500">Document Info</h3>
                      </div>
                      <div class="p-5 space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                          <div>
                            <p class="text-[10px] uppercase font-bold text-surface-400 mb-1">Dimensions</p>
                            <p class="text-sm font-semibold text-surface-900">${psd.width} × ${psd.height}</p>
                          </div>
                          <div>
                            <p class="text-[10px] uppercase font-bold text-surface-400 mb-1">Color Mode</p>
                            <p class="text-sm font-semibold text-surface-900">${getColorMode(psd.colorMode)}</p>
                          </div>
                          <div>
                            <p class="text-[10px] uppercase font-bold text-surface-400 mb-1">Bit Depth</p>
                            <p class="text-sm font-semibold text-surface-900">${psd.bitDepth || 8}-bit</p>
                          </div>
                          <div>
                            <p class="text-[10px] uppercase font-bold text-surface-400 mb-1">Total Layers</p>
                            <p class="text-sm font-semibold text-surface-900">${totalLayers}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Layers Panel -->
                    <div class="bg-white rounded-2xl border border-surface-200 shadow-sm flex flex-col overflow-hidden max-h-[600px]">
                      <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                        <h3 class="text-xs font-bold uppercase tracking-wider text-surface-500">Layers</h3>
                        <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${totalLayers}</span>
                      </div>
                      
                      <!-- Layer Search -->
                      <div class="px-4 py-3 border-b border-surface-100">
                        <input type="text" id="layer-search" placeholder="Filter layers..." 
                          class="w-full px-3 py-2 text-sm bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                      </div>

                      <div class="flex-1 overflow-y-auto p-3 custom-scrollbar" id="layers-list">
                        ${psd.children ? psd.children.slice().reverse().map(l => renderLayerRow(l)).join('') : '<p class="text-center text-sm text-surface-400 py-8">No layers found</p>'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <style>
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
                
                #psd-viewport canvas {
                  max-width: 100%;
                  height: auto !important;
                  display: block;
                }
              </style>
            `);

            const container = document.getElementById('canvas-container');
            if (container) {
              container.appendChild(canvas);
            }

            // Layer search logic
            const searchInput = document.getElementById('layer-search');
            if (searchInput) {
              searchInput.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.layer-item');
                items.forEach(item => {
                  const name = item.getAttribute('data-name');
                  if (name.includes(term)) {
                    item.style.display = 'block';
                  } else {
                    item.style.display = 'none';
                  }
                });
              });
            }

          } catch (err) {
            console.error('PSD Render Error:', err);
            h.showError('Could not open PSD file', 'The file may be corrupted, encrypted, or uses an unsupported Photoshop feature. Error: ' + err.message);
          }
        };

        if (typeof agPsd === 'undefined') {
          h.loadScript(AG_PSD_URL).then(render).catch(err => {
            h.showError('Script Load Error', 'Failed to load the PSD parsing library.');
          });
        } else {
          render();
        }
      }
    });
  };
})();
