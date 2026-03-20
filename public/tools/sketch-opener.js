/**
 * OmniOpener — Sketch Toolkit
 * Uses OmniTool SDK and JSZip.
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
      accept: '.sketch',
      binary: true,
      infoHtml: '<strong>Sketch Toolkit:</strong> Professional design file viewer with preview extraction and layer analysis.',
      
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onFile: function (file, content, h) {
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading Sketch engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Extracting design...');
        JSZip.loadAsync(content).then(zip => {
          const previewFile = zip.file('previews/preview.png');
          if (previewFile) {
             previewFile.async('blob').then(blob => {
                const url = URL.createObjectURL(blob);
                h.render(`
                  <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm">
                    <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                       <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                       <button id="btn-dl-png" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold">📸 Export PNG</button>
                    </div>
                    <div class="flex-1 overflow-auto p-12 flex justify-center items-center">
                       <img src="${url}" class="max-w-full h-auto shadow-2xl rounded bg-white" />
                    </div>
                  </div>
                `);
                document.getElementById('btn-dl-png').onclick = () => h.download(`${file.name}.png`, blob, 'image/png');
             });
          } else {
             h.render(`
               <div class="p-12 text-center text-surface-400">
                  <p class="text-2xl mb-2">💎</p>
                  <p>Sketch preview unavailable. This file might be a newer version or have no preview saved.</p>
                  <p class="text-[10px] mt-4 font-mono">Total files: ${Object.keys(zip.files).length}</p>
               </div>
             `);
          }
        }).catch(err => {
           h.render(`<div class="p-12 text-center text-surface-400">This file does not appear to be a valid Sketch bundle.</div>`);
        });
      }
    });
  };
})();
