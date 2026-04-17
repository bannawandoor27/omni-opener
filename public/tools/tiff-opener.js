/**
 * OmniOpener — TIFF Toolkit
 * Uses OmniTool SDK and UTIF.js.
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
      accept: '.tif,.tiff',
      binary: true,
      infoHtml: '<strong>TIFF Toolkit:</strong> Professional multi-page image viewer with metadata extraction.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js');
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof UTIF === 'undefined') {
          h.showLoading('Loading TIFF engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        h.showLoading('Decoding image layers...');
        try {
          const ifds = UTIF.decode(content);
          const renderPage = (idx) => {
             const ifd = ifds[idx];
             UTIF.decodeImage(content, ifd);
             const rgba = UTIF.toRGBA8(ifd);
             const canvas = document.createElement('canvas');
             canvas.width = ifd.width;
             canvas.height = ifd.height;
             const ctx = canvas.getContext('2d');
             const imgData = ctx.createImageData(ifd.width, ifd.height);
             imgData.data.set(rgba);
             ctx.putImageData(imgData, 0, 0);

             h.render(`
               <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                 <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                       <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                       <span class="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-bold">Layer ${idx + 1} / ${ifds.length}</span>
                    </div>
                    <div class="flex items-center gap-2">
                       <div class="flex items-center bg-white border border-surface-200 rounded p-0.5">
                          <button id="prev-lyr" class="p-1 hover:bg-surface-50 rounded">◀</button>
                          <button id="next-lyr" class="p-1 hover:bg-surface-50 rounded">▶</button>
                       </div>
                       <button id="btn-dl-png" class="px-2 py-1 bg-brand-600 text-white rounded text-[10px] font-bold">📸 Export</button>
                    </div>
                 </div>
                 <div class="flex-1 overflow-auto p-12 bg-surface-100 flex justify-center items-center">
                    <div id="canvas-target" class="shadow-2xl rounded"></div>
                 </div>
               </div>
             `);
             document.getElementById('canvas-target').appendChild(canvas);
             document.getElementById('prev-lyr').onclick = () => { if(idx > 0) renderPage(idx - 1); };
             document.getElementById('next-lyr').onclick = () => { if(idx < ifds.length - 1) renderPage(idx + 1); };
             document.getElementById('btn-dl-png').onclick = () => h.download(`${file.name}.png`, canvas.toDataURL(), 'image/png', true);
          };

          renderPage(0);

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to parse this TIFF image.</div>`);
        }
      }
    });
  };
})();
