/**
 * OmniOpener — PDF Viewer Toolkit
 * Uses OmniTool SDK and PDF.js. Supports zoom, rotate, thumbnails, and text extraction.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.5;
    let rotation = 0;

    function renderPage(num, helpers) {
      if (!pdfDoc) return;
      pageRendering = true;
      pageNum = num;
      
      helpers.showLoading('Rendering page ' + num + '...');

      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: scale, rotation: rotation });
        
        const renderHtml = `
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm">
            <!-- Toolbar -->
            <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex flex-wrap items-center justify-between gap-4">
              <div class="flex items-center gap-4">
                <button id="toggle-sidebar" class="p-1.5 hover:bg-surface-50 rounded-md text-surface-600 transition-all" title="Toggle Sidebar">📋</button>
                <div class="flex items-center bg-surface-50 rounded-lg p-1 border border-surface-200">
                  <button id="prev-page" class="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all">上</button>
                  <span class="px-3 text-xs font-bold text-surface-600 font-mono"><span id="page-num">${num}</span> / ${pdfDoc.numPages}</span>
                  <button id="next-page" class="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all">下</button>
                </div>
                
                <div class="h-6 w-px bg-surface-200"></div>

                <div class="flex items-center gap-1">
                  <button id="zoom-out" class="p-1.5 hover:bg-surface-50 rounded-md text-surface-600 transition-all">➖</button>
                  <span class="text-[10px] font-bold text-surface-400 w-12 text-center uppercase">${Math.round(scale * 100)}%</span>
                  <button id="zoom-in" class="p-1.5 hover:bg-surface-50 rounded-md text-surface-600 transition-all">➕</button>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button id="extract-text" class="px-3 py-1.5 text-xs font-bold text-surface-600 hover:bg-surface-50 rounded-lg transition-all border border-transparent hover:border-surface-200">📄 Extract Text</button>
                <button id="rotate-page" class="px-3 py-1.5 text-xs font-bold text-surface-600 hover:bg-surface-50 rounded-lg transition-all border border-transparent hover:border-surface-200">🔄 Rotate</button>
                <button id="download-pdf" class="px-3 py-1.5 text-xs font-bold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-all shadow-sm">📥 Download</button>
              </div>
            </div>

            <!-- Main Content -->
            <div class="flex-1 flex overflow-hidden">
              <!-- Sidebar (Thumbnails) -->
              <div id="pdf-sidebar" class="w-48 shrink-0 bg-white border-r border-surface-200 overflow-y-auto p-4 hidden flex flex-col gap-4">
                <h3 class="text-[10px] font-bold uppercase text-surface-400 tracking-wider mb-2">Pages</h3>
                <div id="thumbnail-container" class="flex flex-col gap-4"></div>
              </div>

              <!-- Viewport -->
              <div id="pdf-container" class="flex-1 overflow-auto p-8 flex justify-center items-start relative bg-surface-200/50">
                <div id="pdf-wrapper" class="relative shadow-2xl bg-white transition-all duration-300">
                  <canvas id="pdf-canvas"></canvas>
                  <div id="text-layer" class="textLayer absolute inset-0 opacity-20 hover:opacity-100 transition-opacity"></div>
                </div>
              </div>
            </div>
          </div>
        `;
        helpers.render(renderHtml);
        
        const canvas = document.getElementById('pdf-canvas');
        const wrapper = document.getElementById('pdf-wrapper');
        const textLayerDiv = document.getElementById('text-layer');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        wrapper.style.width = viewport.width + 'px';
        wrapper.style.height = viewport.height + 'px';

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
          
          // Render Text Layer
          return page.getTextContent();
        }).then(textContent => {
          if (!textContent) return;
          textLayerDiv.innerHTML = '';
          pdfjsLib.renderTextLayer({
            textContent: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
          });
        });
        
        document.getElementById('prev-page').onclick = () => onPrevPage(helpers);
        document.getElementById('next-page').onclick = () => onNextPage(helpers);
        document.getElementById('zoom-in').onclick = () => { scale += 0.25; renderPage(pageNum, helpers); };
        document.getElementById('zoom-out').onclick = () => { if (scale > 0.5) { scale -= 0.25; renderPage(pageNum, helpers); } };
        document.getElementById('rotate-page').onclick = () => { rotation = (rotation + 90) % 360; renderPage(pageNum, helpers); };
        document.getElementById('download-pdf').onclick = () => helpers.download(helpers.getFile().name, helpers.getContent());
        
        const sidebar = document.getElementById('pdf-sidebar');
        document.getElementById('toggle-sidebar').onclick = () => {
          sidebar.classList.toggle('hidden');
          if (!sidebar.classList.contains('hidden')) renderThumbnails(helpers);
        };

        document.getElementById('extract-text').onclick = () => extractAllText(helpers);
        
        updateNavButtons();

      }).catch(err => {
        helpers.showError('Render Error', err.message);
      });
    }

    async function renderThumbnails(helpers) {
      const container = document.getElementById('thumbnail-container');
      if (container.children.length > 0) return;

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = `cursor-pointer border-2 rounded-lg overflow-hidden hover:border-brand-500 transition-all ${pageNum === i ? 'border-brand-500' : 'border-surface-200'}`;
        thumbWrapper.innerHTML = `<img src="${canvas.toDataURL()}" class="w-full">`;
        thumbWrapper.onclick = () => renderPage(i, helpers);
        
        const label = document.createElement('p');
        label.className = 'text-[10px] text-center font-bold text-surface-400 mt-1';
        label.textContent = i;
        
        const group = document.createElement('div');
        group.appendChild(thumbWrapper);
        group.appendChild(label);
        container.appendChild(group);
      }
    }

    async function extractAllText(helpers) {
      helpers.showLoading('Extracting text...');
      let fullText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }
      helpers.download(helpers.getFile().name.replace(/\.pdf$/i, '.txt'), fullText, 'text/plain');
    }

    function onPrevPage(helpers) {
      if (pageNum <= 1) return;
      pageNum--;
      renderPage(pageNum, helpers);
    }

    function onNextPage(helpers) {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      renderPage(pageNum, helpers);
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
        helpers.loadCSS('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/web/pdf_viewer.css');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', function() {
          if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
        });
      },

      onFile: function (file, content, helpers) {
        if (typeof pdfjsLib === 'undefined') {
          helpers.showLoading('Loading PDF engine...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }
        
        const loadingTask = pdfjsLib.getDocument({ data: content });
        helpers.showLoading('Loading PDF...');

        loadingTask.promise.then(function(pdf) {
          pdfDoc = pdf;
          if (pdf.numPages === 0) {
            helpers.render(`
              <div class="flex flex-col items-center justify-center h-64 text-surface-400">
                <span class="text-4xl mb-2">📄</span>
                <p class="font-medium text-surface-600">This PDF has no pages.</p>
              </div>
            `);
            return;
          }
          renderPage(1, helpers);
        }, function (reason) {
          helpers.showError('Error loading PDF', reason.message);
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

