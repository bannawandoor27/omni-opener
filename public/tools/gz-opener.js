/**
 * OmniOpener — GZIP Toolkit
 * Uses OmniTool SDK and pako.
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
      accept: '.gz',
      binary: true,
      infoHtml: '<strong>GZIP Toolkit:</strong> Professional decompression tool with real-time size analysis and data extraction.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onFile: function (file, content, h) {
        if (typeof pako === 'undefined') {
          h.showLoading('Loading decompressor...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Decompressing...');
        try {
          const uint8 = new Uint8Array(content);
          const decompressed = pako.ungzip(uint8);
          const originalName = file.name.replace(/\.gz$/i, '');

          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex justify-between items-center">
                 <div>
                    <h3 class="text-lg font-bold text-surface-900">${escapeHtml(file.name)}</h3>
                    <span class="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">GZIP Archive</span>
                 </div>
                 <button id="btn-dl" class="px-3 py-1.5 bg-brand-600 text-white rounded-lg font-bold text-xs shadow-sm">📥 Extract All</button>
              </div>
              <div class="flex-1 overflow-auto p-12 bg-surface-50/30 flex flex-col items-center justify-center space-y-6">
                 <div class="w-20 h-20 rounded-full bg-white border border-surface-200 shadow-sm flex items-center justify-center text-3xl">📦</div>
                 <div class="text-center">
                    <div class="text-sm font-bold text-surface-900 mb-1">Archive Contents</div>
                    <div class="text-xs text-surface-500">${escapeHtml(originalName)}</div>
                 </div>
                 <div class="grid grid-cols-2 gap-8 text-center bg-white p-6 rounded-2xl border border-surface-100 shadow-sm w-full max-w-sm">
                    <div>
                       <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Compressed</div>
                       <div class="text-sm font-mono font-bold text-surface-700">${(file.size/1024).toFixed(1)} KB</div>
                    </div>
                    <div>
                       <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Unpacked</div>
                       <div class="text-sm font-mono font-bold text-brand-600">${(decompressed.length/1024).toFixed(1)} KB</div>
                    </div>
                 </div>
              </div>
            </div>
          `);

          document.getElementById('btn-dl').onclick = () => h.download(originalName, decompressed);

        } catch (err) {
           h.render(`
             <div class="p-12 text-center text-surface-400 font-sans">
                <p class="text-2xl mb-2">📦</p>
                <p>Unable to decompress this GZIP file. It may be corrupted or an invalid format.</p>
             </div>
           `);
        }
      }
    });
  };
})();
