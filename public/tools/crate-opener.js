(function () {
  'use strict';
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onFile: function (file, content, h) {
        h.render(`<div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4">
               <h3 class="text-lg font-bold text-surface-900">${file.name}</h3>
               <span class="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">System/Archive File</span>
            </div>
            <div class="flex-1 overflow-auto p-12 bg-surface-50/30 flex flex-col items-center justify-center text-center">
               <div class="w-20 h-20 rounded-full bg-white border border-surface-200 shadow-sm flex items-center justify-center text-3xl mb-6">⚙️</div>
               <p class="text-surface-600 max-w-xs">This is a binary system or archive file. It is ready for secure extraction and analysis.</p>
               <div class="mt-8 p-4 bg-white rounded-xl border border-surface-100 shadow-sm font-mono text-[10px] text-surface-400">
                  Size: ${(file.size/1024).toFixed(1)} KB
               </div>
               <button id="btn-dl" class="mt-8 px-6 py-2 bg-brand-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-brand-700 transition-all">📥 Download File</button>
            </div>
          </div>`);
        document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
        if (content.byteLength < 5) {
           h.render(`<div class="p-12 text-center text-surface-400">This file appears to be empty or corrupted.</div>`);
        }
      }
    });
  };
})();
