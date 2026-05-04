/**
 * OmniOpener — Adobe Illustrator (AI) Toolkit
 * Professional AI/PDF previewer using PDF.js.
 * Requires AI files to be saved with "PDF Compatibility" enabled.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  window.initTool = function (toolConfig, mountEl) {
    let pdfDoc = null;
    let pageNum = 1;
    let scale = 1.5;
    let currentRenderTask = null;
    let currentFile = null;
    let currentContent = null;

    const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    function renderPage(num, h) {
      if (!pdfDoc) return;
      
      // Cancel previous render if any
      if (currentRenderTask) {
        currentRenderTask.cancel();
        currentRenderTask = null;
      }

      h.showLoading(`Rendering artwork page ${num}...`);
      
      pdfDoc.getPage(num).then(page => {
        const canvas = document.getElementById('ai-canvas');
        if (!canvas) return;

        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        currentRenderTask = page.render(renderContext);
        
        currentRenderTask.promise.then(() => {
          h.hideLoading();
          currentRenderTask = null;
          updateUI();
        }).catch(err => {
          if (err.name === 'RenderingCancelledException') return;
          h.showError('Render failed', 'Could not render the artwork at this scale.');
          h.hideLoading();
        });
      }).catch(() => {
        h.showError('Page load failed', 'Could not load page ' + num);
        h.hideLoading();
      });
    }

    function updateUI() {
      const pageInfo = document.getElementById('page-info');
      if (pageInfo) pageInfo.textContent = `Page ${pageNum} of ${pdfDoc.numPages}`;
      
      const prevBtn = document.getElementById('prev-pg');
      const nextBtn = document.getElementById('next-pg');
      if (prevBtn) prevBtn.disabled = pageNum <= 1;
      if (nextBtn) nextBtn.disabled = pageNum >= pdfDoc.numPages;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ai',
      binary: true,
      infoHtml: '<strong>AI Viewer:</strong> Displays Adobe Illustrator files with PDF compatibility. Features include multi-page support, zooming, and PNG export.',

      onInit: function (h) {
        h.loadScript(PDFJS_URL, () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
          }
        });
      },

      onDestroy: function() {
        if (currentRenderTask) {
          currentRenderTask.cancel();
        }
        pdfDoc = null;
        currentFile = null;
        currentContent = null;
      },

      onFile: function _onFileFn(file, content, h) {
        currentFile = file;
        currentContent = content;

        if (typeof pdfjsLib === 'undefined') {
          h.showLoading('Initializing AI engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Parsing Adobe Illustrator artwork...');

        pdfjsLib.getDocument({ data: content }).promise.then(pdf => {
          pdfDoc = pdf;
          pageNum = 1;
          
          h.render(`
            <div class="flex flex-col gap-4 max-w-6xl mx-auto">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-100 shadow-sm">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">Adobe Illustrator Artwork</span>
                <span class="text-surface-300 ml-auto">|</span>
                <span class="font-medium text-brand-600">${pdfDoc.numPages} Page${pdfDoc.numPages > 1 ? 's' : ''}</span>
              </div>

              <!-- Action Bar -->
              <div class="flex flex-wrap items-center justify-between gap-4 px-2">
                <div class="flex items-center gap-2 bg-white p-1 rounded-xl border border-surface-200 shadow-sm">
                  <button id="prev-pg" class="p-2 hover:bg-surface-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors" title="Previous Page">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <span id="page-info" class="text-sm font-medium px-2 min-w-[100px] text-center">Page 1 of ${pdfDoc.numPages}</span>
                  <button id="next-pg" class="p-2 hover:bg-surface-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors" title="Next Page">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                  </button>
                </div>

                <div class="flex items-center gap-2">
                  <div class="flex items-center gap-1 bg-white p-1 rounded-xl border border-surface-200 shadow-sm mr-2">
                    <button id="zoom-out" class="p-2 hover:bg-surface-100 rounded-lg transition-colors" title="Zoom Out">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                    </button>
                    <span id="zoom-level" class="text-xs font-mono w-12 text-center font-bold text-surface-600">150%</span>
                    <button id="zoom-in" class="p-2 hover:bg-surface-100 rounded-lg transition-colors" title="Zoom In">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    </button>
                  </div>
                  
                  <button id="btn-export-png" class="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 hover:border-brand-300 hover:text-brand-600 rounded-xl text-sm font-semibold transition-all shadow-sm">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    Export PNG
                  </button>
                  <button id="btn-dl" class="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white hover:bg-brand-700 rounded-xl text-sm font-semibold transition-all shadow-md">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    Download AI
                  </button>
                </div>
              </div>

              <!-- Main Canvas Area -->
              <div class="relative bg-surface-200 rounded-2xl border-4 border-white shadow-inner overflow-auto min-h-[60vh] flex justify-center items-start p-8 transition-all">
                <canvas id="ai-canvas" class="bg-white shadow-2xl rounded-sm max-w-full"></canvas>
              </div>
            </div>
          `);

          // Event Listeners
          const setupListeners = () => {
            const el = (id) => document.getElementById(id);
            
            el('prev-pg').onclick = () => {
              if (pageNum > 1) {
                pageNum--;
                renderPage(pageNum, h);
              }
            };

            el('next-pg').onclick = () => {
              if (pageNum < pdfDoc.numPages) {
                pageNum++;
                renderPage(pageNum, h);
              }
            };

            el('zoom-in').onclick = () => {
              scale = Math.min(scale + 0.25, 4);
              el('zoom-level').textContent = Math.round(scale * 100) + '%';
              renderPage(pageNum, h);
            };

            el('zoom-out').onclick = () => {
              scale = Math.max(scale - 0.25, 0.5);
              el('zoom-level').textContent = Math.round(scale * 100) + '%';
              renderPage(pageNum, h);
            };

            el('btn-dl').onclick = () => h.download(file.name, content);

            el('btn-export-png').onclick = () => {
              const canvas = el('ai-canvas');
              if (!canvas) return;
              h.showLoading('Preparing PNG export...');
              canvas.toBlob(blob => {
                const pngName = file.name.replace(/\.ai$/i, '') + `-page${pageNum}.png`;
                h.download(pngName, blob, 'image/png');
                h.hideLoading();
              }, 'image/png');
            };
          };

          setupListeners();
          renderPage(1, h);

        }).catch(err => {
          console.error('PDF.js Error:', err);
          h.showError(
            'Incompatible AI File', 
            'This file does not contain a PDF compatibility layer. Adobe Illustrator files must be saved with "Create PDF Compatible File" enabled to be previewed in the browser.'
          );
          
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-center bg-white rounded-3xl border border-surface-200 shadow-sm">
              <div class="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
                <svg class="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <h3 class="text-xl font-bold text-surface-900 mb-2">Preview Unavailable</h3>
              <p class="text-surface-600 max-w-md mb-8">
                The file <span class="font-mono text-brand-600">${escapeHtml(file.name)}</span> was saved without PDF compatibility.
                You can still download the original file.
              </p>
              <div class="flex gap-3">
                <button onclick="window.location.reload()" class="px-6 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 font-semibold rounded-xl transition-all">
                  Try Another File
                </button>
                <button id="btn-dl-fallback" class="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-all shadow-md">
                  Download AI File
                </button>
              </div>
              <div class="mt-12 text-left bg-surface-50 p-4 rounded-xl border border-surface-100">
                <p class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">How to fix this in Illustrator:</p>
                <ol class="text-xs text-surface-500 list-decimal ml-4 space-y-1">
                  <li>Open the file in Adobe Illustrator.</li>
                  <li>Go to <strong>File > Save As</strong>.</li>
                  <li>In the Options dialog, ensure <strong>"Create PDF Compatible File"</strong> is checked.</li>
                  <li>Save and try uploading here again.</li>
                </ol>
              </div>
            </div>
          `);
          
          const dlFallback = document.getElementById('btn-dl-fallback');
          if (dlFallback) dlFallback.onclick = () => h.download(file.name, content);
        });
      }
    });
  };
})();
