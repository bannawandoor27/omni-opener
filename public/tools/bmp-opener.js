(function () {
  'use strict';

  /**
   * OmniOpener — BMP Opener Tool
   * A production-grade local BMP viewer with zoom, rotation, and conversion capabilities.
   */

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    let previewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.bmp',
      binary: true,
      infoHtml: '<strong>BMP Viewer:</strong> Inspect BMP images locally. Includes high-fidelity zoom, 90° rotation, and instant PNG conversion.',

      onFile: function _onFileFn(file, content, h) {
        // B5: Memory leaks - revoke previous URL
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }

        // U6: Loading state
        h.showLoading('Rendering BMP image...');

        // B2: Ensure binary content is handled as a Blob
        const blob = new Blob([content], { type: 'image/bmp' });
        previewUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = function () {
          const width = img.width;
          const height = img.height;
          const megapixels = ((width * height) / 1000000).toFixed(2);
          
          let state = {
            scale: 1,
            rotation: 0
          };

          const render = () => {
            h.render(`
              <div class="flex flex-col h-full font-sans text-surface-900">
                <!-- U1. File info bar -->
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                  <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatBytes(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">.bmp image</span>
                  <span class="text-surface-300 ml-auto hidden sm:inline">|</span>
                  <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium hidden sm:inline">${width} × ${height}</span>
                </div>

                <!-- Preview Area -->
                <div class="relative flex-1 min-h-[500px] bg-surface-100 rounded-2xl border border-surface-200 overflow-hidden flex flex-col">
                  <!-- Toolbar -->
                  <div class="absolute top-4 right-4 z-10 flex gap-2">
                    <div class="flex bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-surface-200">
                      <button id="btn-zoom-out" class="p-2 hover:bg-surface-100 rounded-md transition-colors text-surface-600" title="Zoom Out">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                      </button>
                      <button id="btn-zoom-in" class="p-2 hover:bg-surface-100 rounded-md transition-colors text-surface-600" title="Zoom In">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                      </button>
                    </div>
                    
                    <div class="flex bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-sm border border-surface-200">
                      <button id="btn-rotate" class="p-2 hover:bg-surface-100 rounded-md transition-colors text-surface-600" title="Rotate 90°">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      </button>
                    </div>

                    <button id="btn-reset" class="px-3 py-2 bg-white/90 backdrop-blur-sm hover:bg-surface-100 rounded-lg shadow-sm border border-surface-200 text-sm font-medium text-surface-700 transition-colors">
                      Reset
                    </button>
                  </div>

                  <!-- Image Container with Checkerboard -->
                  <div class="flex-1 overflow-auto flex items-center justify-center p-8 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')]">
                    <img id="bmp-preview" src="${previewUrl}" class="max-w-full h-auto shadow-2xl transition-transform duration-200 ease-out origin-center" style="transform: scale(${state.scale}) rotate(${state.rotation}deg)" />
                  </div>

                  <!-- Action Bar & Metadata -->
                  <div class="px-4 py-3 bg-white border-t border-surface-200 flex flex-wrap items-center justify-between gap-4">
                    <div class="flex gap-6 text-xs font-medium text-surface-500">
                      <div class="flex flex-col">
                        <span class="text-[10px] uppercase tracking-wider text-surface-400 mb-0.5">Dimensions</span>
                        <span class="text-surface-700">${width} × ${height} px</span>
                      </div>
                      <div class="flex flex-col">
                        <span class="text-[10px] uppercase tracking-wider text-surface-400 mb-0.5">Resolution</span>
                        <span class="text-surface-700">${megapixels} MP</span>
                      </div>
                      <div class="flex flex-col">
                        <span class="text-[10px] uppercase tracking-wider text-surface-400 mb-0.5">File Size</span>
                        <span class="text-surface-700">${formatBytes(file.size)}</span>
                      </div>
                    </div>
                    <div class="flex gap-2">
                       <button id="btn-download-png" class="px-4 py-2 text-sm font-semibold text-surface-700 bg-surface-50 hover:bg-surface-100 rounded-lg transition-all border border-surface-200 hover:border-surface-300">Save as PNG</button>
                       <button id="btn-download" class="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-all">Download BMP</button>
                    </div>
                  </div>
                </div>
              </div>
            `);

            const updateTransform = () => {
              const el = document.getElementById('bmp-preview');
              if (el) el.style.transform = `scale(${state.scale}) rotate(${state.rotation}deg)`;
            };

            // U4: Action button logic
            document.getElementById('btn-zoom-in').onclick = () => { state.scale *= 1.4; updateTransform(); };
            document.getElementById('btn-zoom-out').onclick = () => { state.scale /= 1.4; updateTransform(); };
            document.getElementById('btn-rotate').onclick = () => { state.rotation = (state.rotation + 90) % 360; updateTransform(); };
            document.getElementById('btn-reset').onclick = () => { state.scale = 1; state.rotation = 0; updateTransform(); };
            
            document.getElementById('btn-download').onclick = () => {
              h.download(file.name, content, 'image/bmp');
            };

            document.getElementById('btn-download-png').onclick = () => {
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              // B10: Use toBlob instead of toDataURL for downloads
              canvas.toBlob((pngBlob) => {
                const pngName = file.name.replace(/\.bmp$/i, '') + '.png';
                h.download(pngName, pngBlob, 'image/png');
              }, 'image/png');
            };
          };

          render();
        };

        img.onerror = function () {
          // U3: Friendly error message
          h.showError('Could not render BMP image', 'The file might be corrupted, or it uses a specific BMP compression method (like RLE8 or bitfields) not fully supported by your browser. Try converting it to a standard format if possible.');
        };

        img.src = previewUrl;
      },

      onDestroy: function () {
        // B5: Memory leaks - cleanup on tool destruction
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }
      }
    });
  };
})();
