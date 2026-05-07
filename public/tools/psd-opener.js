(function () {
  'use strict';

  const AG_PSD_URL = 'https://cdn.jsdelivr.net/npm/ag-psd@2.1.25/dist/bundle.js';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.psd',
      binary: true,
      actions: [
        {
          label: '📥 Download PNG',
          id: 'dl-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              h.download(h.getFile().name.replace(/\.psd$/i, '') + '.png', canvas.toDataURL('image/png'), 'image/png');
            }
          }
        },
        {
          label: '📋 Copy Image',
          id: 'copy-img',
          onClick: function (h, btn) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              canvas.toBlob(blob => {
                try {
                  const item = new ClipboardItem({ 'image/png': blob });
                  navigator.clipboard.write([item]).then(() => {
                    const orig = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    setTimeout(() => { btn.textContent = orig; }, 1500);
                  });
                } catch (err) {
                  h.copyToClipboard(canvas.toDataURL('image/png'), btn);
                }
              });
            }
          }
        }
      ],
      onInit: function (h) {
        h.loadScript(AG_PSD_URL);
      },
      onFile: function (file, content, h) {
        h.showLoading('Parsing PSD file...');
        
        const render = () => {
          try {
            const psd = agPsd.readPsd(content);
            const canvas = agPsd.drawPsd(psd);
            
            canvas.className = 'max-w-full h-auto shadow-2xl rounded-lg mx-auto bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3MIPnx4DgzgFGGmP7u9mMJiSU9A8MAnG76fEBo9G88mB6AAAxV8YED79R9YAAAAASUVORK5CYII=")]';
            
            h.render(`
              <div class="p-4 md:p-8">
                <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  <div class="lg:col-span-3 flex items-center justify-center p-8 bg-surface-100 rounded-2xl overflow-auto min-h-[500px]" id="psd-container">
                  </div>
                  <div class="space-y-6">
                    <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-surface-400 mb-4">Metadata</h3>
                      <div class="space-y-3">
                        <div class="flex justify-between items-center">
                          <span class="text-sm text-surface-500 font-medium">Dimensions</span>
                          <span class="text-sm font-bold text-surface-900">${psd.width} × ${psd.height}</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-sm text-surface-500 font-medium">Channels</span>
                          <span class="text-sm font-bold text-surface-900">${psd.channels || 3}</span>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-sm text-surface-500 font-medium">Color Mode</span>
                          <span class="text-sm font-bold text-surface-900">${getColorMode(psd.colorMode)}</span>
                        </div>
                      </div>
                    </div>

                    <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                      <h3 class="text-xs font-bold uppercase tracking-wider text-surface-400 mb-4">Layers</h3>
                      <div class="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        ${renderLayerTree(psd.children)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `);
            
            document.getElementById('psd-container').appendChild(canvas);
          } catch (err) {
            console.error(err);
            h.showError('Could not render PSD', 'The file might be using unsupported features or be encrypted. ' + err.message);
          }
        };

        if (typeof agPsd === 'undefined') {
          h.loadScript(AG_PSD_URL).then(render);
        } else {
          render();
        }
      }
    });
  };

  function renderLayerTree(layers) {
    if (!layers || layers.length === 0) return '<p class="text-xs text-surface-400 italic">No layers found</p>';
    
    return layers.map(layer => {
      const isGroup = !!layer.children;
      const opacity = layer.opacity !== undefined ? Math.round(layer.opacity * 100) : 100;
      return `
        <div class="mb-2">
          <div class="flex items-center gap-2 text-sm ${layer.hidden ? 'opacity-40' : ''}">
            <span class="text-xs">${isGroup ? '📁' : '📄'}</span>
            <div class="flex flex-col min-w-0">
              <span class="truncate font-medium text-surface-700">${esc(layer.name || 'Untitled')}</span>
              <span class="text-[10px] text-surface-400">${opacity}% opacity</span>
            </div>
          </div>
          ${isGroup ? `<div class="ml-4 mt-1 border-l border-surface-100 pl-3">${renderLayerTree(layer.children)}</div>` : ''}
        </div>
      `;
    }).reverse().join(''); // Reverse because PSD layers are bottom-to-top in data
  }

  function getColorMode(mode) {
    const modes = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };
    return modes[mode] || 'Unknown (' + mode + ')';
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
