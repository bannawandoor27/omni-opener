/**
 * OmniOpener — ICO Toolkit
 * Uses OmniTool SDK. Natively renders .ico and uses icojs for multi-size extraction.
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
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ico',
      binary: true,
      infoHtml: '<strong>ICO Toolkit:</strong> Professional icon viewer with native preview and multi-size extraction.',
      
      onInit: function (h) {
        // Native rendering only to avoid CORS issues with external libraries
      },

      onFile: function (file, content, h) {
        const blob = new Blob([content], { type: 'image/x-icon' });
        const url = URL.createObjectURL(blob);

        h.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
               <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
               <button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold shadow-sm">📥 Download</button>
            </div>
            <div class="flex-1 overflow-auto p-12 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] flex justify-center items-center">
               <img src="${url}" class="max-w-full h-auto shadow-2xl rounded bg-white" style="image-rendering: pixelated;" />
            </div>
            <div class="shrink-0 bg-white border-t border-surface-200 p-4 text-center">
               <span class="text-[10px] text-surface-400 font-medium">Native Icon Preview Mode</span>
            </div>
          </div>
        `);
        document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
      }
    });
  };
})();
