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
      infoHtml: '<strong>PPTX Toolkit:</strong> Professional presentation viewer with Slide Mode, Slide Sorter, and text extraction.',
      
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
          label: '🖼️ Slide Sorter',
          id: 'btn-sorter',
          onClick: function (h) {
             document.getElementById('view-normal').classList.add('hidden');
             document.getElementById('view-sorter').classList.remove('hidden');
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (typeof jQuery === 'undefined' || typeof JSZip === 'undefined' || !jQuery.fn.pptx2html) {
          h.showLoading('Loading presentation engines...');
          setTimeout(() => _onFileFn(file, content, h), 1000);
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
               <div class="flex items-center gap-4">
                  <button id="btn-fullscreen" class="p-1.5 hover:bg-surface-100 rounded text-[10px] font-bold uppercase text-surface-600">📺 Fullscreen</button>
                  <div id="slide-nav" class="hidden flex items-center gap-4 border-l border-surface-200 pl-4">
                     <button id="prev-slide" class="p-1 hover:bg-surface-100 rounded">◀</button>
                     <span id="slide-info" class="text-xs font-bold text-surface-600 font-mono">1 / ?</span>
                     <button id="next-slide" class="p-1 hover:bg-surface-100 rounded">▶</button>
                  </div>
               </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-hidden relative">
               <!-- Normal View -->
               <div id="view-normal" class="absolute inset-0 overflow-auto bg-surface-100 p-8 flex justify-center items-start">
                  <div id="pptx-render-target" class="w-full bg-white shadow-2xl rounded"></div>
               </div>

               <!-- Sorter View -->
               <div id="view-sorter" class="absolute inset-0 hidden overflow-auto bg-surface-50 p-8">
                  <div class="flex justify-between items-center mb-8">
                     <h2 class="text-lg font-bold text-surface-900">Slide Sorter</h2>
                     <button id="btn-close-sorter" class="px-3 py-1.5 bg-white border border-surface-200 rounded-lg text-xs font-bold">Back to View</button>
                  </div>
                  <div id="sorter-grid" class="grid grid-cols-2 md:grid-cols-4 gap-6"></div>
               </div>
            </div>
          </div>
          <style>
            #pptx-render-target .slide { margin: 0 auto 2rem auto !important; position: relative !important; border: 1px solid #e2e8f0 !important; transition: transform 0.3s; }
            .slide-mode-active #pptx-render-target .slide { display: none; margin: 0 !important; transform: scale(1.1); }
            .slide-mode-active #pptx-render-target .slide.active-slide { display: block !important; }
            #sorter-grid .sorter-item { cursor: pointer; border: 2px solid transparent; border-radius: 0.5rem; overflow: hidden; transition: all 0.2s; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            #sorter-grid .sorter-item:hover { border-color: #4f46e5; transform: translateY(-2px); }
            #sorter-grid .sorter-item.active { border-color: #4f46e5; box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1); }
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

            const slides = document.querySelectorAll('#pptx-render-target .slide');
            if (slides.length > 0) {
               let currentSlide = 0;
               slides[0].classList.add('active-slide');
               const nav = document.getElementById('slide-nav');
               const info = document.getElementById('slide-info');
               nav.classList.remove('hidden');
               info.textContent = `1 / ${slides.length}`;

               const updateNav = (idx) => {
                  currentSlide = idx;
                  slides.forEach(s => s.classList.remove('active-slide'));
                  slides[currentSlide].classList.add('active-slide');
                  info.textContent = `${currentSlide + 1} / ${slides.length}`;
                  document.getElementById('view-normal').scrollTop = 0;
               };

               document.getElementById('prev-slide').onclick = () => { if(currentSlide > 0) updateNav(currentSlide - 1); };
               document.getElementById('next-slide').onclick = () => { if(currentSlide < slides.length - 1) updateNav(currentSlide + 1); };

               // Fullscreen Mode
               document.getElementById('btn-fullscreen').onclick = () => {
                  const el = document.getElementById('view-normal');
                  if (el.requestFullscreen) el.requestFullscreen();
                  el.classList.add('slide-mode-active');
               };

               // Sorter Logic
               const sorterGrid = document.getElementById('sorter-grid');
               slides.forEach((s, i) => {
                  const item = document.createElement('div');
                  item.className = 'sorter-item';
                  item.innerHTML = `<div class="aspect-video bg-white flex items-center justify-center text-[8px] overflow-hidden opacity-80 p-2">${s.innerHTML}</div><p class="p-2 text-center text-[10px] font-bold text-surface-400 bg-white border-t border-surface-50">${i+1}</p>`;
                  item.onclick = () => {
                     updateNav(i);
                     document.getElementById('view-sorter').classList.add('hidden');
                     document.getElementById('view-normal').classList.remove('hidden');
                  };
                  sorterGrid.appendChild(item);
               });

               document.getElementById('btn-close-sorter').onclick = () => {
                  document.getElementById('view-sorter').classList.add('hidden');
                  document.getElementById('view-normal').classList.remove('hidden');
               };

               // Keyboard Support
               window.onkeydown = (e) => {
                  if (e.key === 'ArrowRight' || e.key === ' ') { if(currentSlide < slides.length - 1) updateNav(currentSlide + 1); }
                  if (e.key === 'ArrowLeft') { if(currentSlide > 0) updateNav(currentSlide - 1); }
                  if (e.key === 'Escape') document.getElementById('view-normal').classList.remove('slide-mode-active');
               };
            }
          }
        });
      }
    });
  };
})();

