(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    const SCALE = 1.5;

    function renderPage(num, helpers) {
      if (!pdfDoc) return;
      pageRendering = true;
      pageNum = num;
      
      helpers.showLoading('Rendering page ' + num + '...');

      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: SCALE });
        
        const renderHtml = `
          <div class="flex flex-col items-center p-4 bg-surface-100">
            <div id="pdf-controls" class="flex items-center space-x-4 mb-4">
              <button id="prev-page" class="px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:bg-surface-300">Prev</button>
              <span>Page: <span id="page-num">${num}</span> / <span id="page-count">${pdfDoc.numPages}</span></span>
              <button id="next-page" class="px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:bg-surface-300">Next</button>
            </div>
            <div class="overflow-auto max-w-full">
              <canvas id="pdf-canvas" class="shadow-lg"></canvas>
            </div>
          </div>
        `;
        helpers.render(renderHtml);
        
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        const renderTask = page.render(renderContext);
        renderTask.promise.then(function() {
          pageRendering = false;
          if (pageNumPending !== null) {
            renderPage(pageNumPending, helpers);
            pageNumPending = null;
          }
          updateNavButtons();
        });
        
        document.getElementById('prev-page').addEventListener('click', () => onPrevPage(helpers));
        document.getElementById('next-page').addEventListener('click', () => onNextPage(helpers));

      }).catch(err => {
        helpers.showError('Render Issue', err.message);
      });
    }

    function queueRenderPage(num, helpers) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num, helpers);
      }
    }

    function onPrevPage(helpers) {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum, helpers);
    }

    function onNextPage(helpers) {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum, helpers);
    }
    
    function updateNavButtons() {
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if(prevBtn) prevBtn.disabled = (pageNum <= 1);
        if(nextBtn) nextBtn.disabled = (pdfDoc && pageNum >= pdfDoc.numPages);
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pdf',
      binary: true, 
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', function() {
          if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
        });
      },

      onFile: function (file, content, helpers) {
        if (typeof pdfjsLib === 'undefined') {
          helpers.showLoading('Loading PDF engine...');
          helpers.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', () => {
             if (typeof pdfjsLib !== 'undefined') {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
                this.onFile(file, content, helpers);
             }
          });
          return;
        }
        
        const loadingTask = pdfjsLib.getDocument({ data: content });
        helpers.showLoading('Loading PDF...');

        loadingTask.promise.then(function(pdf) {
          pdfDoc = pdf;
          renderPage(1, helpers);
        }, function (reason) {
          helpers.showError('Issue loading PDF', reason.message);
        });
      },
      onDestroy: function() {
        pdfDoc = null;
        pageNum = 1;
        pageRendering = false;
        pageNumPending = null;
      }
    });
  };
})();
