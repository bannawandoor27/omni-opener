/**
 * OmniOpener — ICO Toolkit
 * Professional icon viewer with native preview and multi-size extraction.
 */
(function () {
  'use strict';

  // Helper: Format file size
  function formatBytes(bytes, decimals = 1) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Helper: Escape HTML
  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let previewUrl = null;
    let extractedUrls = [];

    function cleanup() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
      extractedUrls.forEach(url => URL.revokeObjectURL(url));
      extractedUrls = [];
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ico',
      binary: true,
      infoHtml: '<strong>ICO Toolkit:</strong> Preview multi-resolution .ico files and extract them as high-quality PNGs. Everything happens locally in your browser.',

      onInit: function(h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/icojs@0.19.4/dist/icojs.min.js',
          'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
        ]);
      },

      onFile: async function _onFile(file, content, h) {
        // B5: Revoke previous URLs
        cleanup();

        // B1/B4: Check for dependencies
        if (typeof ICO === 'undefined' || typeof JSZip === 'undefined') {
          h.showLoading('Initializing ICO engine...');
          setTimeout(() => _onFile(file, content, h), 300);
          return;
        }

        h.showLoading('Parsing icon layers...');

        try {
          // Native preview
          const blob = new Blob([content], { type: 'image/x-icon' });
          previewUrl = URL.createObjectURL(blob);

          // Extract layers using icojs
          const images = await ICO.parse(content, 'image/png');
          
          if (!images || images.length === 0) {
            h.showError('Empty ICO', 'This icon file contains no image layers.');
            return;
          }

          const fileInfoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${esc(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatBytes(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.ico file</span>
              <span class="text-surface-300">|</span>
              <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase">${images.length} Layers</span>
            </div>
          `;

          const actionsBar = `
            <div class="flex items-center justify-between mb-4 px-1">
              <h3 class="font-semibold text-surface-800">Image Layers</h3>
              <div class="flex gap-2">
                <button id="btn-dl-all" class="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-brand-700 transition-all flex items-center gap-1">
                  <span>📦</span> Extract All (ZIP)
                </button>
                <button id="btn-dl-orig" class="px-3 py-1.5 border border-surface-200 bg-white text-surface-700 rounded-lg text-xs font-bold hover:bg-surface-50 transition-all flex items-center gap-1">
                  <span>📥</span> Original .ico
                </button>
              </div>
            </div>
          `;

          let layersHtml = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          `;

          images.forEach((img, idx) => {
            const imgBlob = new Blob([img.buffer], { type: 'image/png' });
            const imgUrl = URL.createObjectURL(imgBlob);
            extractedUrls.push(imgUrl);

            layersHtml += `
              <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                <div class="aspect-square mb-3 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] rounded-lg flex items-center justify-center overflow-hidden border border-surface-100">
                  <img src="${imgUrl}" class="max-w-[80%] max-h-[80%] object-contain transition-transform group-hover:scale-110" style="image-rendering: ${img.width < 64 ? 'pixelated' : 'auto'};" />
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-bold text-surface-800">${img.width} × ${img.height}</p>
                    <p class="text-[10px] text-surface-400 uppercase font-medium">Layer ${idx + 1}</p>
                  </div>
                  <button class="btn-dl-png p-2 hover:bg-brand-50 text-brand-600 rounded-lg transition-colors" data-idx="${idx}" title="Download PNG">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  </button>
                </div>
              </div>
            `;
          });

          layersHtml += `</div>`;

          h.render(`
            <div class="p-4 sm:p-6 max-w-6xl mx-auto font-sans">
              ${fileInfoBar}
              
              <div class="mb-8">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Native Preview</h3>
                </div>
                <div class="rounded-2xl border border-surface-200 bg-surface-50 p-8 flex flex-col items-center justify-center min-h-[300px] shadow-inner relative overflow-hidden">
                   <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:20px_20px]"></div>
                   <div class="z-10 bg-white p-6 rounded-2xl shadow-2xl border border-white/50 backdrop-blur-sm">
                     <img src="${previewUrl}" class="max-w-full h-auto" style="width: 128px; image-rendering: pixelated;" />
                   </div>
                   <p class="mt-4 text-xs text-surface-400 font-medium z-10">Composite ICO Preview</p>
                </div>
              </div>

              ${actionsBar}
              ${layersHtml}
            </div>
          `);

          // Event Listeners
          document.getElementById('btn-dl-orig').onclick = () => h.download(file.name, content, 'image/x-icon');
          
          document.getElementById('btn-dl-all').onclick = async (btn) => {
            const originalText = btn.currentTarget.innerHTML;
            btn.currentTarget.innerHTML = '<span>⏳</span> Processing...';
            btn.currentTarget.disabled = true;

            try {
              const zip = new JSZip();
              const folderName = file.name.replace(/\.[^/.]+$/, "");
              const folder = zip.folder(folderName);
              
              images.forEach((img, idx) => {
                const filename = `${folderName}_${img.width}x${img.height}_${idx}.png`;
                folder.file(filename, img.buffer);
              });

              const zipContent = await zip.generateAsync({ type: 'blob' });
              h.download(`${folderName}_extracted.zip`, zipContent);
            } catch (err) {
              h.showError('ZIP Creation Failed', err.message);
            } finally {
              btn.currentTarget.innerHTML = originalText;
              btn.currentTarget.disabled = false;
            }
          };

          document.querySelectorAll('.btn-dl-png').forEach(btn => {
            btn.onclick = (e) => {
              const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
              const img = images[idx];
              const name = file.name.replace(/\.[^/.]+$/, "") + `_${img.width}x${img.height}.png`;
              h.download(name, img.buffer, 'image/png');
            };
          });

        } catch (err) {
          h.showError('Could not open ICO file', 'The file may be corrupted or in an unsupported format. Error: ' + err.message);
        }
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
