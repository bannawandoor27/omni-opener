/**
 * OmniOpener — PDF Viewer Toolkit
 * Uses OmniTool SDK and PDF.js. Supports zoom, rotate, thumbnails, search, and text extraction.
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
    let searchTerm = '';
    let searchResults = [];

    function renderPage(num, helpers) {
      if (!pdfDoc) return;
      if (pageRendering) {
        pageNumPending = num;
        return;
      }
      pageRendering = true;
      pageNum = num;
      
      helpers.showLoading('Rendering page ' + num + '...');

      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: scale, rotation: rotation });
        
        const renderHtml = `
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-sm font-sans">
            <!-- Toolbar -->
            <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <button id="toggle-sidebar" class="p-2 hover:bg-surface-50 rounded-lg text-surface-600 transition-all border border-surface-100" title="Toggle Sidebar">📋</button>
                <div class="flex items-center bg-surface-50 rounded-lg p-1 border border-surface-200">
                  <button id="prev-page" class="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all">上</button>
                  <span class="px-3 text-[11px] font-bold text-surface-600 font-mono"><span id="page-num">${num}</span> / ${pdfDoc.numPages}</span>
                  <button id="next-page" class="p-1.5 hover:bg-white hover:shadow-sm rounded-md disabled:opacity-30 transition-all">下</button>
                </div>
                
                <div class="h-6 w-px bg-surface-200 mx-1"></div>

                <div class="flex items-center gap-1">
                  <button id="zoom-out" class="p-1.5 hover:bg-surface-50 rounded-md text-surface-600 transition-all">➖</button>
                  <span class="text-[10px] font-bold text-surface-500 w-10 text-center uppercase tracking-tighter">${Math.round(scale * 100)}%</span>
                  <button id="zoom-in" class="p-1.5 hover:bg-surface-50 rounded-md text-surface-600 transition-all">➕</button>
                </div>

                <div class="h-6 w-px bg-surface-200 mx-1"></div>

                <div class="relative">
                  <input type="text" id="pdf-search-input" placeholder="Find text..." class="pl-8 pr-4 py-1.5 text-xs bg-surface-50 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-40" value="${searchTerm}">
                  <span class="absolute left-2.5 top-2 text-xs opacity-40">🔍</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button id="copy-text" class="px-3 py-1.5 text-[11px] font-bold text-surface-600 hover:bg-surface-50 rounded-lg transition-all border border-surface-200">📋 Copy Text</button>
                <button id="extract-text" class="px-3 py-1.5 text-[11px] font-bold text-surface-600 hover:bg-surface-50 rounded-lg transition-all border border-surface-200">📥 Extract All</button>
                <button id="rotate-page" class="p-2 hover:bg-surface-50 rounded-lg text-surface-600 transition-all border border-surface-200" title="Rotate">🔄</button>
                <button id="download-pdf" class="px-4 py-1.5 text-[11px] font-bold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-all shadow-md">Download</button>
              </div>
            </div>

            <!-- Main Content -->
            <div class="flex-1 flex overflow-hidden">
              <!-- Sidebar -->
              <div id="pdf-sidebar" class="w-56 shrink-0 bg-white border-r border-surface-200 overflow-y-auto p-4 hidden flex flex-col gap-4">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-[10px] font-bold uppercase text-surface-400 tracking-wider">Navigation</h3>
                  <div class="flex gap-2">
                    <button id="sidebar-thumb-view" class="text-[10px] font-bold text-brand-600 underline">Pages</button>
                    <button id="sidebar-search-view" class="text-[10px] font-bold text-surface-400 hover:text-brand-600">Results</button>
                  </div>
                </div>
                <div id="sidebar-content" class="flex flex-col gap-4">
                  <div id="thumbnail-container" class="grid grid-cols-1 gap-4"></div>
                  <div id="search-results-container" class="hidden space-y-2"></div>
                </div>
              </div>

              <!-- Viewport -->
              <div id="pdf-container" class="flex-1 overflow-auto p-8 flex justify-center items-start relative bg-surface-200/40">
                <div id="pdf-wrapper" class="relative shadow-2xl bg-white transition-all duration-300">
                  <canvas id="pdf-canvas"></canvas>
                  <div id="text-layer" class="textLayer absolute inset-0 pointer-events-none opacity-20"></div>
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
        const dpr = window.devicePixelRatio || 1;
        canvas.height = viewport.height * dpr;
        canvas.width = viewport.width * dpr;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        ctx.scale(dpr, dpr);

        wrapper.style.width = viewport.width + 'px';
        wrapper.style.height = viewport.height + 'px';

        const renderTask = page.render({ canvasContext: ctx, viewport: viewport });
        renderTask.promise.then(function() {
          pageRendering = false;
          if (pageNumPending !== null) {
            renderPage(pageNumPending, helpers);
            pageNumPending = null;
          }
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
          highlightSearchInPage(helpers);
        });
        
        // Toolbar Events
        document.getElementById('prev-page').onclick = () => onPrevPage(helpers);
        document.getElementById('next-page').onclick = () => onNextPage(helpers);
        document.getElementById('zoom-in').onclick = () => { scale += 0.25; renderPage(pageNum, helpers); };
        document.getElementById('zoom-out').onclick = () => { if (scale > 0.5) { scale -= 0.25; renderPage(pageNum, helpers); } };
        document.getElementById('rotate-page').onclick = () => { rotation = (rotation + 90) % 360; renderPage(pageNum, helpers); };
        document.getElementById('download-pdf').onclick = () => helpers.download(helpers.getFile().name, helpers.getContent());
        document.getElementById('copy-text').onclick = (btn) => copyPageText(page, helpers, btn.target);
        document.getElementById('extract-text').onclick = () => extractAllText(helpers);
        
        const searchInput = document.getElementById('pdf-search-input');
        searchInput.onkeydown = (e) => { if (e.key === 'Enter') performSearch(searchInput.value, helpers); };

        const sidebar = document.getElementById('pdf-sidebar');
        document.getElementById('toggle-sidebar').onclick = () => {
          sidebar.classList.toggle('hidden');
          if (!sidebar.classList.contains('hidden')) renderThumbnails(helpers);
        };

        document.getElementById('sidebar-thumb-view').onclick = () => showSidebarView('thumbs');
        document.getElementById('sidebar-search-view').onclick = () => showSidebarView('search');

        updateNavButtons();
      }).catch(err => {
        helpers.showError('Render Error', err.message);
      });
    }

    function showSidebarView(view) {
      const thumbCont = document.getElementById('thumbnail-container');
      const searchCont = document.getElementById('search-results-container');
      const thumbBtn = document.getElementById('sidebar-thumb-view');
      const searchBtn = document.getElementById('sidebar-search-view');
      if (view === 'thumbs') {
        thumbCont.classList.remove('hidden');
        searchCont.classList.add('hidden');
        thumbBtn.classList.add('text-brand-600', 'underline');
        searchBtn.classList.remove('text-brand-600', 'underline');
      } else {
        thumbCont.classList.add('hidden');
        searchCont.classList.remove('hidden');
        searchBtn.classList.add('text-brand-600', 'underline');
        thumbBtn.classList.remove('text-brand-600', 'underline');
      }
    }

    async function performSearch(query, helpers) {
      if (!query) return;
      searchTerm = query;
      searchResults = [];
      const container = document.getElementById('search-results-container');
      container.innerHTML = '<div class="text-[10px] text-surface-400 italic">Searching...</div>';
      showSidebarView('search');
      document.getElementById('pdf-sidebar').classList.remove('hidden');

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        if (text.toLowerCase().includes(query.toLowerCase())) {
          searchResults.push({ pageNum: i, text: text });
          const resultEl = document.createElement('div');
          resultEl.className = 'p-2 bg-surface-50 border border-surface-100 rounded-lg cursor-pointer hover:bg-brand-50 hover:border-brand-200 transition-all';
          const start = Math.max(0, text.toLowerCase().indexOf(query.toLowerCase()) - 30);
          const snippet = text.slice(start, start + 80);
          resultEl.innerHTML = `
            <p class="text-[10px] font-bold text-brand-600 mb-1">Page ${i}</p>
            <p class="text-[10px] text-surface-600 line-clamp-2 italic">"...${snippet}..."</p>
          `;
          resultEl.onclick = () => renderPage(i, helpers);
          container.appendChild(resultEl);
        }
      }
      if (searchResults.length === 0) {
        container.innerHTML = '<div class="text-[10px] text-surface-400 italic">No matches found.</div>';
      } else {
        container.querySelector('div').remove(); // remove 'Searching...'
        highlightSearchInPage(helpers);
      }
    }

    function highlightSearchInPage(helpers) {
      if (!searchTerm) return;
      const textLayer = document.getElementById('text-layer');
      if (!textLayer) return;
      const spans = textLayer.querySelectorAll('span');
      spans.forEach(span => {
        const text = span.textContent;
        if (text.toLowerCase().includes(searchTerm.toLowerCase())) {
          span.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
          span.style.borderRadius = '2px';
        }
      });
    }

    async function copyPageText(page, helpers, btn) {
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      helpers.copyToClipboard(text, btn);
    }

    async function renderThumbnails(helpers) {
      const container = document.getElementById('thumbnail-container');
      if (container.children.length > 0) return;

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 0.15 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        
        const thumbWrapper = document.createElement('div');
        thumbWrapper.className = `cursor-pointer border-2 rounded-lg overflow-hidden transition-all p-1 ${pageNum === i ? 'border-brand-500 bg-brand-50' : 'border-surface-100 bg-white hover:border-brand-300'}`;
        thumbWrapper.innerHTML = `<img src="${canvas.toDataURL()}" class="w-full shadow-sm rounded">`;
        thumbWrapper.onclick = () => renderPage(i, helpers);
        
        const label = document.createElement('p');
        label.className = `text-[9px] text-center font-bold mt-1 ${pageNum === i ? 'text-brand-600' : 'text-surface-400'}`;
        label.textContent = `PAGE ${i}`;
        
        const group = document.createElement('div');
        group.appendChild(thumbWrapper);
        group.appendChild(label);
        container.appendChild(group);
      }
    }

    async function extractAllText(helpers) {
      helpers.showLoading('Extracting all text...');
      let fullText = '';
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += `--- PAGE ${i} ---\n${pageText}\n\n`;
      }
      helpers.download(helpers.getFile().name.replace(/\.pdf$/i, '.txt'), fullText, 'text/plain');
    }

    function onPrevPage(helpers) {
      if (pageNum <= 1) return;
      renderPage(pageNum - 1, helpers);
    }

    function onNextPage(helpers) {
      if (pageNum >= pdfDoc.numPages) return;
      renderPage(pageNum + 1, helpers);
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
          helpers.showLoading('Initializing engine...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }
        const loadingTask = pdfjsLib.getDocument({ data: content });
        helpers.showLoading('Loading PDF document...');
        loadingTask.promise.then(function(pdf) {
          pdfDoc = pdf;
          renderPage(1, helpers);
        }, function (reason) {
          helpers.showError('Load Error', reason.message);
        });
      }
    });
  };
})();
