/**
 * OmniOpener — ICO Production Perfect Tool
 * Multi-layer icon viewer and extractor.
 */
(function () {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let previewUrl = null;
    let layerUrls = [];

    function cleanup() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
      layerUrls.forEach(url => URL.revokeObjectURL(url));
      layerUrls = [];
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ico',
      binary: true,
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/icojs@0.19.4/dist/icojs.min.js',
          'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
        ]);
      },

      onFile: async function _onFileFn(file, content, h) {
        cleanup();

        // B1, B4, B8: Dependency check with safe self-reference
        if (typeof ICO === 'undefined' || typeof JSZip === 'undefined') {
          h.showLoading('Initializing graphics engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Extracting icon layers...');

        try {
          // B5: Create native preview (Composite)
          const mainBlob = new Blob([content], { type: 'image/x-icon' });
          previewUrl = URL.createObjectURL(mainBlob);

          // B3: Async parsing
          const images = await ICO.parse(content, 'image/png');
          
          if (!images || images.length === 0) {
            h.showError('No layers found', 'The ICO file appears to be empty or uses an unsupported encoding.');
            return;
          }

          // Format Excellence: Sort by resolution descending
          images.sort((a, b) => (b.width * b.height) - (a.width * a.height));

          // U1: File info bar
          const fileInfoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
              <span class="font-semibold text-surface-800">${esc(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.ico file</span>
            </div>
          `;

          // U10: Section header
          const gridHeader = `
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-surface-800">Extracted PNG Layers</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${images.length} variants</span>
            </div>
          `;

          let gridHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">`;
          
          images.forEach((img, idx) => {
            // B2, B5: Handle binary buffer and track URLs for cleanup
            const imgBlob = new Blob([img.buffer], { type: 'image/png' });
            const url = URL.createObjectURL(imgBlob);
            layerUrls.push(url);

            const isSmall = img.width < 48;
            const rendering = isSmall ? 'pixelated' : 'auto';

            // U9: Content card with transparency checkerboard
            gridHtml += `
              <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group flex flex-col">
                <div class="aspect-square mb-4 bg-surface-50 rounded-lg flex items-center justify-center overflow-hidden border border-surface-100 relative group-hover:bg-brand-50/20 transition-colors" 
                     style="background-image: linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%); background-size: 12px 12px; background-position: 0 0, 0 6px, 6px -6px, -6px 0px;">
                  <img src="${url}" class="max-w-[85%] max-h-[85%] object-contain transition-transform group-hover:scale-110 drop-shadow-sm" style="image-rendering: ${rendering};" />
                </div>
                <div class="flex items-center justify-between mt-auto">
                  <div>
                    <p class="text-sm font-bold text-surface-900">${img.width} × ${img.height}</p>
                    <p class="text-[10px] text-surface-400 font-bold uppercase tracking-wider">${img.bpp || 32} bit</p>
                  </div>
                  <button class="btn-dl-layer p-2.5 bg-surface-50 hover:bg-brand-600 hover:text-white text-surface-500 rounded-xl transition-all" data-idx="${idx}" title="Download PNG">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  </button>
                </div>
              </div>
            `;
          });
          gridHtml += `</div>`;

          h.render(`
            <div class="max-w-6xl mx-auto p-4 md:p-8">
              ${fileInfoBar}

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
                <div class="lg:col-span-5">
                  <h3 class="font-semibold text-surface-800 mb-4">Native Preview</h3>
                  <div class="rounded-3xl border border-surface-200 bg-surface-50 p-12 flex flex-col items-center justify-center min-h-[320px] shadow-inner relative overflow-hidden group">
                    <div class="absolute inset-0 opacity-30 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:32px_32px]"></div>
                    <div class="relative z-10 bg-white p-8 rounded-2xl shadow-2xl border border-white/50 backdrop-blur-md transition-all group-hover:scale-105 group-hover:rotate-1">
                      <img src="${previewUrl}" class="max-w-full h-auto" style="width: 128px; image-rendering: pixelated;" />
                    </div>
                    <div class="mt-6 flex flex-col items-center z-10">
                       <span class="text-[10px] text-brand-600 font-black uppercase tracking-[0.2em]">Live Composite</span>
                       <span class="text-xs text-surface-400 font-medium mt-1">Rendered by Browser Engine</span>
                    </div>
                  </div>
                </div>

                <div class="lg:col-span-7 flex flex-col justify-center">
                  <div class="p-8 rounded-3xl border border-brand-100 bg-gradient-to-br from-brand-50/50 to-white shadow-sm">
                    <h4 class="text-2xl font-black text-surface-900 mb-3 tracking-tight">Extract & Convert</h4>
                    <p class="text-base text-surface-600 leading-relaxed mb-8">
                      This <strong>.ico</strong> container holds <strong>${images.length}</strong> unique image resolutions. 
                      Extract them all as high-quality PNGs or save the original file.
                    </p>
                    <div class="flex flex-col sm:flex-row gap-4">
                      <button id="main-dl-zip" class="flex-1 px-8 py-4 bg-brand-600 text-white rounded-2xl text-base font-bold shadow-xl shadow-brand-200 hover:bg-brand-700 hover:-translate-y-1 active:translate-y-0 transition-all flex items-center justify-center gap-3">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                        <span>Export All (ZIP)</span>
                      </button>
                      <button id="main-dl-ico" class="px-8 py-4 bg-white border border-surface-200 text-surface-700 rounded-2xl text-base font-bold hover:bg-surface-50 hover:border-surface-300 transition-all flex items-center justify-center gap-3">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        <span>Original</span>
                      </button>
                    </div>
                    <p class="mt-6 text-xs text-surface-400 italic">
                      No data is uploaded. Conversion happens entirely on your device.
                    </p>
                  </div>
                </div>
              </div>

              ${gridHeader}
              ${gridHtml}

              <div class="mt-16 pt-8 border-t border-surface-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <span class="text-xs font-bold text-surface-300 uppercase tracking-widest">Stack</span>
                  <div class="flex gap-2">
                    <span class="px-2 py-1 bg-surface-100 text-surface-500 rounded text-[10px] font-bold">ICOJS 0.19</span>
                    <span class="px-2 py-1 bg-surface-100 text-surface-500 rounded text-[10px] font-bold">JSZIP 3.10</span>
                  </div>
                </div>
                <p class="text-[11px] text-surface-400 font-medium">
                  Part of the OmniOpener Visual Toolkit
                </p>
              </div>
            </div>
          `);

          // U4: Action button handlers
          document.getElementById('main-dl-ico').onclick = function() {
            h.download(file.name, content, 'image/x-icon');
          };

          const zipBtn = document.getElementById('main-dl-zip');
          zipBtn.onclick = async function() {
            const originalInner = zipBtn.innerHTML;
            zipBtn.innerHTML = `
              <svg class="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              <span>Creating ZIP...</span>
            `;
            zipBtn.disabled = true;

            try {
              const zip = new JSZip();
              const baseName = file.name.replace(/\.[^/.]+$/, "");
              const folder = zip.folder(baseName);
              
              images.forEach((img, i) => {
                const layerName = `${baseName}_${img.width}x${img.height}_${i}.png`;
                folder.file(layerName, img.buffer);
              });

              const zipBlob = await zip.generateAsync({ type: 'blob' });
              h.download(`${baseName}_layers.zip`, zipBlob);
            } catch (err) {
              h.showError('ZIP Export Failed', 'Could not bundle layers: ' + err.message);
            } finally {
              zipBtn.innerHTML = originalInner;
              zipBtn.disabled = false;
            }
          };

          document.querySelectorAll('.btn-dl-layer').forEach(btn => {
            btn.onclick = function(e) {
              const idx = e.currentTarget.getAttribute('data-idx');
              const img = images[idx];
              const baseName = file.name.replace(/\.[^/.]+$/, "");
              h.download(`${baseName}_${img.width}x${img.height}.png`, img.buffer, 'image/png');
            };
          });

        } catch (err) {
          console.error('[ICO Tool Error]', err);
          h.showError('Parsing Failed', 'The ICO file could not be decoded. It might be corrupt or an incompatible format.');
        }
      },

      onDestroy: function() {
        cleanup();
      }
    });
  };
})();
