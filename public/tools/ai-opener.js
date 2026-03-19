(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.5;

    function renderPage(num, helpers) {
      if (!pdfDoc) return;
      pageRendering = true;
      pageNum = num;
      
      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.getElementById('ai-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = { canvasContext: ctx, viewport: viewport };
        const renderTask = page.render(renderContext);
        renderTask.promise.then(function() {
          pageRendering = false;
          if (pageNumPending !== null) {
            renderPage(pageNumPending, helpers);
            pageNumPending = null;
          }
          updateControls();
        });
      });
    }

    function updateControls() {
      const prev = document.getElementById('prev');
      const next = document.getElementById('next');
      const cur = document.getElementById('page_num');
      if (prev) prev.disabled = pageNum <= 1;
      if (next) next.disabled = pageNum >= pdfDoc.numPages;
      if (cur) cur.textContent = pageNum;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ai',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', function() {
          if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
        });
      },
      onFile: function(file, content, helpers) {
        if (typeof pdfjsLib === 'undefined') {
          helpers.showLoading('Loading engine...');
          helpers.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', () => {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            this.onFile(file, content, helpers);
          });
          return;
        }

        helpers.showLoading('Parsing AI file...');
        pdfjsLib.getDocument({ data: content }).promise.then(pdf => {
          pdfDoc = pdf;
          helpers.render(`
            <div class="p-4 bg-surface-50 border-b flex justify-between items-center mb-4">
              <span class="font-bold">${esc(file.name)}</span>
              <div class="flex items-center gap-2">
                <button id="prev" class="px-2 py-1 bg-white border rounded text-xs">Prev</button>
                <span class="text-xs">Page <span id="page_num">1</span> / ${pdf.numPages}</span>
                <button id="next" class="px-2 py-1 bg-white border rounded text-xs">Next</button>
              </div>
            </div>
            <div class="flex justify-center p-4 bg-surface-100 rounded-lg overflow-auto">
              <canvas id="ai-canvas" class="shadow-lg bg-white"></canvas>
            </div>
          `);

          document.getElementById('prev').onclick = () => { if (pageNum > 1) { pageNum--; renderPage(pageNum, helpers); } };
          document.getElementById('next').onclick = () => { if (pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum, helpers); } };
          renderPage(1, helpers);
        }).catch(err => {
          helpers.showError('AI Format Error', 'This AI file might not have PDF compatibility enabled. Only PDF-compatible AI files can be previewed.');
        });
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
