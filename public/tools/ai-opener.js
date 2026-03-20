/**
 * OmniOpener — Adobe Illustrator (AI) Toolkit
 * Uses OmniTool SDK and PDF.js (AI files with PDF compatibility).
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
    let pdfDoc = null;
    let pageNum = 1;
    let scale = 1.5;

    function renderPage(num, h) {
      if (!pdfDoc) return;
      h.showLoading('Rendering artwork...');
      pdfDoc.getPage(num).then(page => {
        const viewport = page.getViewport({ scale });
        const canvas = document.getElementById('ai-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
           h.hideLoading();
           document.getElementById('page-info').textContent = `${num} / ${pdfDoc.numPages}`;
        });
      });
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ai',
      binary: true,
      infoHtml: '<strong>AI Toolkit:</strong> Professional Illustrator viewer. Note: Only PDF-compatible AI files can be previewed.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', () => {
           pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        });
      },

      onFile: function (file, content, h) {
        if (typeof pdfjsLib === 'undefined') {
          h.showLoading('Loading AI engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing Illustrator file...');
        pdfjsLib.getDocument({ data: content }).promise.then(pdf => {
          pdfDoc = pdf;
          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm">
              <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                 <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                 <div class="flex items-center gap-4">
                    <div class="flex items-center bg-surface-50 rounded p-1 border border-surface-200">
                       <button id="prev-pg" class="p-1 hover:bg-white rounded">◀</button>
                       <span id="page-info" class="text-[10px] font-bold px-3 font-mono">1 / ?</span>
                       <button id="next-pg" class="p-1 hover:bg-white rounded">▶</button>
                    </div>
                    <button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold">📥 Download</button>
                 </div>
              </div>
              <div class="flex-1 overflow-auto p-8 flex justify-center items-start">
                 <canvas id="ai-canvas" class="shadow-2xl bg-white"></canvas>
              </div>
            </div>
          `);

          document.getElementById('prev-pg').onclick = () => { if(pageNum > 1) { pageNum--; renderPage(pageNum, h); } };
          document.getElementById('next-pg').onclick = () => { if(pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum, h); } };
          document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
          
          renderPage(1, h);
        }).catch(err => {
           h.render(`
             <div class="p-12 text-center text-surface-400">
                <p class="text-2xl mb-2">🎨</p>
                <p>This AI file cannot be previewed. It may not have PDF compatibility enabled.</p>
                <p class="text-xs mt-2 italic">Try saving with "Create PDF Compatible File" checked in Illustrator.</p>
             </div>
           `);
        });
      }
    });
  };
})();
