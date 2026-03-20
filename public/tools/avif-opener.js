/**
 * OmniOpener — Modern Image Toolkit
 * Uses OmniTool SDK. Supports WebP, AVIF, BMP with zoom and metadata.
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
      accept: '.webp,.avif,.bmp',
      binary: true,
      infoHtml: '<strong>Image Toolkit:</strong> Professional image viewer with real-time zooming, rotation, and metadata display.',
      
      onFile: function (file, content, h) {
        const blob = new Blob([content], { type: file.type || 'image/webp' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
           h.render(`
             <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm font-sans">
               <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                     <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                     <span class="text-[10px] font-bold text-surface-400 uppercase bg-surface-50 px-2 py-0.5 rounded border border-surface-100">${img.width} × ${img.height}</span>
                  </div>
                  <div class="flex gap-2">
                     <button id="btn-zoom-in" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors">➕</button>
                     <button id="btn-zoom-out" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors">➖</button>
                     <button id="btn-rotate" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors">🔄</button>
                     <button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold shadow-sm hover:bg-brand-700">📥 Download</button>
                  </div>
               </div>
               <div class="flex-1 overflow-auto p-12 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] flex justify-center items-center">
                  <img id="img-preview" src="${url}" class="max-w-full h-auto shadow-2xl rounded bg-white transition-all duration-300 ease-out" style="transform: scale(1) rotate(0deg)" />
               </div>
             </div>
           `);

           let scale = 1;
           let rotation = 0;
           document.getElementById('btn-zoom-in').onclick = () => { scale += 0.2; update(); };
           document.getElementById('btn-zoom-out').onclick = () => { if(scale > 0.2) scale -= 0.2; update(); };
           document.getElementById('btn-rotate').onclick = () => { rotation += 90; update(); };
           document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
           
           const update = () => { document.getElementById('img-preview').style.transform = `scale(${scale}) rotate(${rotation}deg)`; };
        };
        img.src = url;
      }
    });
  };
})();
