/**
 * OmniOpener — HEIC/HEIF Toolkit
 * Uses OmniTool SDK and heic2any.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let previewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.heic,.heif',
      binary: true,
      infoHtml: '<strong>HEIC Toolkit:</strong> Professional HEIF viewer with browser-side JPEG/PNG conversion.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
      },

      onFile: function onFileImpl(file, content, h) {
        if (typeof heic2any === 'undefined') {
          h.showLoading('Loading conversion engine...');
          setTimeout(function() { onFileImpl(file, content, h); }, 500);
          return;
        }

        // Cleanup previous preview URL
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }

        h.showLoading('Converting high-efficiency image...');
        const blob = new Blob([content]);

        heic2any({ blob: blob, toType: 'image/jpeg', quality: 0.9 })
          .then(function(result) {
            const resBlob = Array.isArray(result) ? result[0] : result;
            previewUrl = URL.createObjectURL(resBlob);

            h.render(
              '<div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm font-sans">' +
                '<div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between">' +
                  '<span class="text-xs font-bold text-surface-900 truncate">' + escapeHtml(file.name) + '</span>' +
                  '<div class="flex gap-2">' +
                    '<button id="btn-zoom-in" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors">➕</button>' +
                    '<button id="btn-zoom-out" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors">➖</button>' +
                    '<button id="btn-reset" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors">⊙</button>' +
                    '<button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold shadow-sm">📥 Save as JPG</button>' +
                  '</div>' +
                '</div>' +
                '<div class="flex-1 overflow-auto p-12 flex justify-center items-center">' +
                  '<img id="heic-preview" src="' + previewUrl + '" class="max-w-full h-auto shadow-2xl rounded-lg bg-white transition-transform duration-200" style="transform: scale(1)" />' +
                '</div>' +
              '</div>'
            );

            let scale = 1;

            function update() {
              const el = document.getElementById('heic-preview');
              if (el) el.style.transform = 'scale(' + scale + ')';
            }

            document.getElementById('btn-zoom-in').onclick = function() { scale = Math.min(scale + 0.2, 10); update(); };
            document.getElementById('btn-zoom-out').onclick = function() { if (scale > 0.4) scale -= 0.2; update(); };
            document.getElementById('btn-reset').onclick = function() { scale = 1; update(); };
            document.getElementById('btn-dl').onclick = function() {
              h.download(file.name.replace(/\.(heic|heif)$/i, '.jpg'), resBlob, 'image/jpeg');
            };
          })
          .catch(function(err) {
            h.showError('Unable to convert HEIC image', 'The file may be empty, corrupted, or use an unsupported encoding.');
          });
      },

      onDestroy: function() {
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      }
    });
  };
})();
