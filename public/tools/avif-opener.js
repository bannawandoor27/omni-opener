/**
 * OmniOpener — AVIF Opener Tool
 * Uses OmniTool SDK. Displays AVIF images with zoom, rotate, and metadata.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  window.initTool = function (toolConfig, mountEl) {
    let previewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.avif',
      binary: true,
      infoHtml: '<strong>AVIF Opener:</strong> View AVIF images with zoom and rotation controls. All processing is 100% local.',

      onFile: function (file, content, h) {
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }

        const mimeType = 'image/avif';
        const blob = new Blob([content], { type: mimeType });
        previewUrl = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = function() {
          const width = img.width;
          const height = img.height;
          let scale = 1;
          let rotation = 0;

          h.render(
            '<div class="flex flex-col border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm font-sans" style="min-height:520px;">' +
              '<div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between gap-4">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                  '<span class="text-xs font-bold text-surface-900 truncate">' + escapeHtml(file.name) + '</span>' +
                  '<span class="text-[10px] font-bold text-surface-400 uppercase bg-surface-50 px-2 py-0.5 rounded border border-surface-100 shrink-0">' + width + ' × ' + height + '</span>' +
                  '<span class="text-[10px] text-surface-400 shrink-0">' + formatBytes(file.size) + '</span>' +
                '</div>' +
                '<div class="flex gap-1 shrink-0">' +
                  '<button id="btn-zoom-in" class="p-1.5 hover:bg-surface-100 rounded text-surface-600 transition-colors" title="Zoom in">➕</button>' +
                  '<button id="btn-zoom-out" class="p-1.5 hover:bg-surface-100 rounded text-surface-600 transition-colors" title="Zoom out">➖</button>' +
                  '<button id="btn-reset" class="p-1.5 hover:bg-surface-100 rounded text-surface-600 transition-colors" title="Reset">⊙</button>' +
                  '<button id="btn-rotate" class="p-1.5 hover:bg-surface-100 rounded text-surface-600 transition-colors" title="Rotate 90°">🔄</button>' +
                  '<button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold shadow-sm hover:bg-brand-700 ml-1">📥 Download</button>' +
                '</div>' +
              '</div>' +
              '<div class="flex-1 overflow-auto p-8 flex justify-center items-center" style="min-height:400px;background-image:url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=\')">' +
                '<img id="img-preview" src="' + previewUrl + '" class="max-w-full h-auto shadow-2xl rounded transition-all duration-200 ease-out" style="transform:scale(1) rotate(0deg)" />' +
              '</div>' +
              '<div class="shrink-0 bg-white border-t border-surface-100 px-4 py-2 flex gap-6 text-xs text-surface-400">' +
                '<span><strong>Dimensions:</strong> ' + width + ' × ' + height + ' px</span>' +
                '<span><strong>Megapixels:</strong> ' + (width * height / 1000000).toFixed(2) + ' MP</span>' +
              '</div>' +
            '</div>'
          );

          function update() {
            var el = document.getElementById('img-preview');
            if (el) el.style.transform = 'scale(' + scale + ') rotate(' + rotation + 'deg)';
          }

          document.getElementById('btn-zoom-in').onclick = function() { scale = Math.min(scale + 0.25, 10); update(); };
          document.getElementById('btn-zoom-out').onclick = function() { scale = Math.max(scale - 0.25, 0.1); update(); };
          document.getElementById('btn-reset').onclick = function() { scale = 1; rotation = 0; update(); };
          document.getElementById('btn-rotate').onclick = function() { rotation = (rotation + 90) % 360; update(); };
          document.getElementById('btn-dl').onclick = function() { h.download(file.name, content, mimeType); };
        };
        img.onerror = function() {
          h.showError('Failed to load image', 'The file may be corrupted or your browser does not support AVIF. Try Chrome 85+ or Firefox 93+.');
        };
        img.src = previewUrl;
      },

      onDestroy: function() {
        if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
      }
    });
  };
})();
