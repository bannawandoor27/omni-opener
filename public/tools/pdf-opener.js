/**
 * OmniOpener — PDF Viewer Tool
 * Uses OmniTool SDK and PDF.js from Mozilla. Renders .pdf files.
 */
(function () {
  'use strict';

  let pdfDoc = null;
  let pageNum = 1;
  let pageRendering = false;
  let pageNumPending = null;
  const SCALE = 1.5;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pdf',
      dropLabel: 'Drop a .pdf file here',
      binary: true, 
      infoHtml: '<strong>PDF Viewer:</strong> Renders PDF files in your browser. Powered by Mozilla PDF.js.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js', function() {
          // PDF.js worker is needed
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
        });
      },

      onFile: function (file, content, helpers) {
        if (typeof pdfjsLib === 'undefined') {
          helpers.showError('Library not loaded', 'PDF.js is still loading. Please try again in a moment.');
          return;
        }
        
        const loadingTask = pdfjsLib.getDocument({ data: content });
        helpers.showLoading('Loading PDF...');

        loadingTask.promise.then(function(pdf) {
          pdfDoc = pdf;
          helpers.hideLoading();
          // Initial page render
          renderPage(1, helpers);
        }, function (reason) {
          helpers.showError('Error loading PDF', reason.message);
        });
      }
    });
  };

  function renderPage(num, helpers) {
    pageRendering = true;
    
    helpers.showLoading('Rendering page ' + num + '...');

    pdfDoc.getPage(num).then(function(page) {
      const viewport = page.getViewport({ scale: SCALE });
      
      const renderHtml = `
        <div class="flex flex-col items-center p-4 bg-surface-100">
          <div id="pdf-controls" class="flex items-center space-x-4 mb-4">
            <button id="prev-page" class="px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:bg-surface-300">&lt; Prev</button>
            <span>Page: <span id="page-num">${num}</span> / <span id="page-count">${pdfDoc.numPages}</span></span>
            <button id="next-page" class="px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:bg-surface-300">Next &gt;</button>
          </div>
          <canvas id="pdf-canvas" class="shadow-lg"></canvas>
        </div>
      `;
      helpers.render(renderHtml);
      
      const canvas = document.getElementById('pdf-canvas');
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
        helpers.hideLoading();
        updateNavButtons(helpers);
      });
      
      document.getElementById('prev-page').addEventListener('click', () => onPrevPage(helpers));
      document.getElementById('next-page').addEventListener('click', () => onNextPage(helpers));

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
  
  function updateNavButtons(helpers) {
      const prevBtn = document.getElementById('prev-page');
      const nextBtn = document.getElementById('next-page');
      if(prevBtn) prevBtn.disabled = pageNum <= 1;
      if(nextBtn) nextBtn.disabled = pageNum >= pdfDoc.numPages;
  }

})();
