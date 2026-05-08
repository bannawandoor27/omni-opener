/**
 * OmniOpener — HEIC/HEIF Production Toolkit
 * Browser-side high-efficiency image processing with zero server uploads.
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

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let currentPreviewUrl = null;
    let currentBlob = null;
    let isLibLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.heic,.heif',
      binary: true,
      infoHtml: '<strong>HEIC Toolkit:</strong> Privacy-first browser-side HEIF viewer and converter.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', function() {
          isLibLoaded = true;
        });
      },

      onFile: function _onFile(file, content, h) {
        if (!isLibLoaded || typeof heic2any === 'undefined') {
          h.showLoading('Initializing HEIC engine...');
          setTimeout(function() { _onFile(file, content, h); }, 300);
          return;
        }

        // Cleanup
        if (currentPreviewUrl) {
          URL.revokeObjectURL(currentPreviewUrl);
          currentPreviewUrl = null;
        }

        h.showLoading('Converting high-efficiency image...');

        const inputBlob = new Blob([content]);
        
        // Convert to JPG by default for preview
        heic2any({
          blob: inputBlob,
          toType: 'image/jpeg',
          quality: 0.9
        })
        .then(function(result) {
          const resBlob = Array.isArray(result) ? result[0] : result;
          currentBlob = resBlob;
          currentPreviewUrl = URL.createObjectURL(resBlob);
          
          h.render(
            '<div class="max-w-5xl mx-auto">' +
              // U1. File Info Bar
              '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">' +
                '<span class="font-semibold text-surface-800">' + escapeHtml(file.name) + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span>' + formatSize(file.size) + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span class="text-surface-500 uppercase">heic image</span>' +
              '</div>' +

              // Action Bar
              '<div class="flex flex-wrap items-center justify-between gap-4 mb-4">' +
                '<div class="flex items-center gap-2">' +
                  '<button id="btn-zoom-out" class="p-2 hover:bg-surface-100 rounded-lg border border-surface-200 transition-colors" title="Zoom Out">' +
                    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>' +
                  '</button>' +
                  '<span id="zoom-level" class="text-sm font-medium w-12 text-center text-surface-600">100%</span>' +
                  '<button id="btn-zoom-in" class="p-2 hover:bg-surface-100 rounded-lg border border-surface-200 transition-colors" title="Zoom In">' +
                    '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                  '</button>' +
                  '<button id="btn-reset" class="ml-2 px-3 py-2 text-sm font-medium text-surface-600 hover:text-brand-600 transition-colors">Reset</button>' +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                  '<button id="dl-jpg" class="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all">' +
                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>' +
                    'Save as JPG' +
                  '</button>' +
                  '<button id="dl-png" class="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 hover:border-brand-300 hover:text-brand-600 text-surface-700 rounded-xl text-sm font-semibold shadow-sm transition-all">' +
                    'Save as PNG' +
                  '</button>' +
                '</div>' +
              '</div>' +

              // Preview Area
              '<div class="rounded-2xl border border-surface-200 bg-surface-50 overflow-hidden shadow-inner flex items-center justify-center p-8 min-h-[400px] relative">' +
                '<div id="img-container" class="transition-transform duration-200 ease-out cursor-zoom-in" style="transform-origin: center center;">' +
                  '<img id="main-preview" src="' + currentPreviewUrl + '" class="max-w-full h-auto shadow-2xl rounded-lg bg-white" />' +
                '</div>' +
              '</div>' +
              
              // Metadata / Info
              '<div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">' +
                '<div class="p-4 rounded-xl border border-surface-200 bg-white">' +
                  '<h3 class="text-sm font-bold text-surface-800 mb-2">Image Properties</h3>' +
                  '<div class="space-y-2 text-sm">' +
                    '<div class="flex justify-between"><span class="text-surface-500">Dimensions</span><span id="img-dims" class="text-surface-800 font-mono">Loading...</span></div>' +
                    '<div class="flex justify-between"><span class="text-surface-500">MIME Type</span><span class="text-surface-800 font-mono">image/heic</span></div>' +
                  '</div>' +
                '</div>' +
                '<div class="p-4 rounded-xl border border-surface-200 bg-white">' +
                  '<h3 class="text-sm font-bold text-surface-800 mb-2">Technical Note</h3>' +
                  '<p class="text-xs text-surface-500 leading-relaxed">HEIC is a high-efficiency format. This viewer converts it to a standard format in your browser memory for display. Your data never leaves your computer.</p>' +
                '</div>' +
              '</div>' +
            '</div>'
          );

          // Logic
          const img = document.getElementById('main-preview');
          const container = document.getElementById('img-container');
          const zoomLevelEl = document.getElementById('zoom-level');
          const dimsEl = document.getElementById('img-dims');
          let scale = 1;

          img.onload = function() {
            dimsEl.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px';
          };

          const updateZoom = function() {
            container.style.transform = 'scale(' + scale + ')';
            zoomLevelEl.textContent = Math.round(scale * 100) + '%';
            if (scale > 1) {
              container.classList.remove('cursor-zoom-in');
              container.classList.add('cursor-zoom-out');
            } else {
              container.classList.remove('cursor-zoom-out');
              container.classList.add('cursor-zoom-in');
            }
          };

          document.getElementById('btn-zoom-in').onclick = function() {
            scale = Math.min(scale + 0.25, 5);
            updateZoom();
          };

          document.getElementById('btn-zoom-out').onclick = function() {
            scale = Math.max(scale - 0.25, 0.25);
            updateZoom();
          };

          document.getElementById('btn-reset').onclick = function() {
            scale = 1;
            updateZoom();
          };

          container.onclick = function() {
            if (scale === 1) scale = 2;
            else scale = 1;
            updateZoom();
          };

          document.getElementById('dl-jpg').onclick = function() {
            h.download(file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', currentBlob, 'image/jpeg');
          };

          document.getElementById('dl-png').onclick = function() {
            h.showLoading('Converting to PNG...');
            heic2any({
              blob: inputBlob,
              toType: 'image/png'
            }).then(function(pngResult) {
              const pngBlob = Array.isArray(pngResult) ? pngResult[0] : pngResult;
              h.download(file.name.replace(/\.(heic|heif)$/i, '') + '.png', pngBlob, 'image/png');
              h.showLoading(false);
            }).catch(function() {
              h.showError('PNG Conversion Failed', 'Could not convert to PNG. The JPG version is still available.');
            });
          };

        })
        .catch(function(err) {
          console.error(err);
          h.showError('Failed to decode HEIC', 'This file might be corrupted or use an unsupported HEVC profile. Try a different HEIC file.');
        });
      },

      onDestroy: function() {
        if (currentPreviewUrl) {
          URL.revokeObjectURL(currentPreviewUrl);
          currentPreviewUrl = null;
        }
      }
    });
  };
})();
