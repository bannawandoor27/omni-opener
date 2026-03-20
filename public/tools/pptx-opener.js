/**
 * OmniOpener — Presentation (PPTX) Toolkit
 * Uses OmniTool SDK, jQuery, JSZip, and pptx2html.
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
      accept: '.pptx',
      binary: true,
      infoHtml: '<strong>PPTX Toolkit:</strong> Professional presentation viewer with slide navigation and full text extraction.',
      
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js', () => {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/pptx2html@0.3.4/dist/pptx2html.min.js');
          });
        });
      },

      actions: [
        {
          label: '📋 Extract Text',
          id: 'extract-text',
          onClick: function (h, btn) {
             const slides = h.getRenderEl().querySelectorAll('.slide');
             let fullText = "";
             slides.forEach((s, i) => {
                fullText += `--- Slide ${i+1} ---\n${s.innerText.trim()}\n\n`;
             });
             if (fullText) h.copyToClipboard(fullText, btn);
          }
        },
        {
          label: '💻 Toggle Slide Mode',
          id: 'toggle-mode',
          onClick: function (h) {
             const container = document.getElementById('pptx-view-area');
             container.classList.toggle('slide-mode-active');
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof jQuery === 'undefined' || typeof JSZip === 'undefined' || !jQuery.fn.pptx2html) {
          h.showLoading('Loading presentation engines...');
          setTimeout(() => this.onFile(file, content, h), 1000);
          return;
        }

        h.showLoading('Converting presentation...');
        
        h.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <!-- Header -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
               <div class="flex items-center gap-2">
                  <span class="text-lg">📊</span>
                  <span class="text-sm font-bold text-surface-900 truncate max-w-xs">${escapeHtml(file.name)}</span>
               </div>
               <div id="slide-nav" class="hidden flex items-center gap-4">
                  <button id="prev-slide" class="p-1 hover:bg-surface-100 rounded">◀</button>
                  <span id="slide-info" class="text-xs font-bold text-surface-600 font-mono">1 / ?</span>
                  <button id="next-slide" class="p-1 hover:bg-surface-100 rounded">▶</button>
               </div>
            </div>

            <!-- View Area -->
            <div id="pptx-view-area" class="flex-1 overflow-auto bg-surface-100 p-8 flex justify-center items-start">
               <div id="pptx-render-target" class="w-full bg-white shadow-2xl rounded"></div>
            </div>
          </div>
          <style>
            #pptx-render-target .slide { margin: 0 auto 2rem auto !important; position: relative !important; border: 1px solid #e2e8f0 !important; }
            .slide-mode-active #pptx-render-target .slide { display: none; margin: 0 !important; }
            .slide-mode-active #pptx-render-target .slide.active-slide { display: block !important; }
          </style>
        `);

        const $target = $(document.getElementById('pptx-render-target'));
        
        $target.pptx2html({
          pptxFile: file,
          slideMode: false,
          keyBoardShortCut: false,
          callback: (result) => {
            if (!result.success) {
               h.showError('Conversion Failed', result.msg);
               return;
            }
            h.hideLoading();

            // Initialize Slide Mode Navigation
            const slides = document.querySelectorAll('#pptx-render-target .slide');
            if (slides.length > 0) {
               let currentSlide = 0;
               slides[0].classList.add('active-slide');
               const nav = document.getElementById('slide-nav');
               const info = document.getElementById('slide-info');
               nav.classList.remove('hidden');
               info.textContent = `1 / ${slides.length}`;

               const updateNav = () => {
                  slides.forEach(s => s.classList.remove('active-slide'));
                  slides[currentSlide].classList.add('active-slide');
                  info.textContent = `${currentSlide + 1} / ${slides.length}`;
                  document.getElementById('pptx-view-area').scrollTop = 0;
               };

               document.getElementById('prev-slide').onclick = () => { if(currentSlide > 0) { currentSlide--; updateNav(); } };
               document.getElementById('next-slide').onclick = () => { if(currentSlide < slides.length - 1) { currentSlide++; updateNav(); } };
            }
          }
        });
      }
    });
  };
})();
