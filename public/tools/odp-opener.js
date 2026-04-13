/**
 * OmniOpener — ODP (OpenDocument Presentation) Viewer
 * Uses OmniTool SDK and JSZip.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatSize(b) {
    if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
    if (b > 1e3) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.odp',
      dropLabel: 'Drop a .odp presentation here',
      binary: true,
      infoHtml: '<strong>Privacy:</strong> This ODP viewer works 100% client-side. Your presentation data is processed locally and never leaves your device.',

      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: function _onFileFn(file, content, helpers) {
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Initialising parser...');
          setTimeout(() => _onFileFn(file, content, helpers), 500);
          return;
        }

        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Processing may be slow. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Reading presentation archive...');

        JSZip.loadAsync(content).then(function (zip) {
          const contentFile = zip.file("content.xml");
          if (!contentFile) throw new Error("Could not find content.xml in the ODP archive. This may not be a valid OpenDocument Presentation.");
          
          helpers.showLoading('Extracting slide content...');
          return contentFile.async("text");
        }).then(function (xmlText) {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");
          
          // ODP uses drawing namespace for pages (slides)
          // We use getElementsByTagNameNS with "*" for prefix robustness
          const slides = xmlDoc.getElementsByTagNameNS("*", "page");
          
          if (slides.length === 0) {
            helpers.render(`
              <div class="p-16 text-center">
                <div class="text-5xl mb-6 grayscale opacity-50">📊</div>
                <p class="text-surface-500 font-medium text-lg">No slides were found in this presentation.</p>
                <p class="text-surface-400 text-sm mt-2">The file might be empty or uses an unsupported version of ODP.</p>
              </div>
            `);
            return;
          }

          let html = `
            <div class="p-4 sm:p-8 bg-surface-50/50">
              <!-- File Info Bar -->
              <div class="flex items-center gap-4 p-4 bg-white border border-surface-200 rounded-2xl shadow-sm mb-10 max-w-4xl mx-auto">
                <div class="w-14 h-14 flex items-center justify-center bg-brand-50 text-brand-600 rounded-xl text-3xl shadow-inner">📊</div>
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="font-bold text-surface-900 truncate text-lg sm:text-xl">${escapeHtml(file.name)}</span>
                  <div class="flex items-center gap-2 text-sm text-surface-500">
                    <span class="bg-surface-100 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-surface-600">ODP</span>
                    <span>${formatSize(file.size)}</span>
                    <span class="text-surface-300">•</span>
                    <span class="font-semibold text-brand-600">${slides.length} Slides</span>
                  </div>
                </div>
              </div>
              
              <!-- Slide List -->
              <div class="space-y-12 max-w-4xl mx-auto pb-12">
          `;

          for (let i = 0; i < slides.length; i++) {
            const slide = slides[i];
            const slideName = slide.getAttributeNS("*", "name") || `Slide ${i + 1}`;
            
            // Extract text elements: text:p, text:h, etc.
            const elements = slide.getElementsByTagNameNS("*", "*");
            let slideContentHtml = "";
            let textFound = false;

            for (let j = 0; j < elements.length; j++) {
              const el = elements[j];
              // We target paragraph (p) and heading (h) tags from the text namespace
              if (el.localName === 'p' || el.localName === 'h') {
                const textContent = el.textContent.trim();
                if (textContent) {
                  textFound = true;
                  const isHeader = el.localName === 'h';
                  const tag = isHeader ? 'h3' : 'p';
                  const baseClass = isHeader 
                    ? 'text-xl font-bold text-surface-900 mt-6 mb-3 first:mt-0' 
                    : 'text-surface-700 mb-4 leading-relaxed';
                  
                  // Simple list detection: check if parent or grandparent is a list-item
                  const isListItem = (el.parentNode && el.parentNode.localName === 'list-item') || 
                                     (el.parentNode && el.parentNode.parentNode && el.parentNode.parentNode.localName === 'list-item');
                  
                  const prefix = isListItem 
                    ? '<span class="inline-flex items-center justify-center w-5 h-5 mr-2 text-brand-500">●</span>' 
                    : '';
                  
                  slideContentHtml += `<${tag} class="${baseClass}">${prefix}${escapeHtml(textContent)}</${tag}>`;
                }
              }
            }

            html += `
              <div class="group relative animate-in fade-in slide-in-from-bottom-4 duration-500" style="animation-delay: ${i * 50}ms">
                <!-- Slide Marker -->
                <div class="absolute -left-4 sm:-left-6 top-0 bottom-0 w-1.5 bg-surface-200 group-hover:bg-brand-500 transition-colors rounded-full hidden sm:block"></div>
                
                <div class="bg-white border border-surface-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
                  <!-- Slide Header -->
                  <div class="bg-surface-50/50 px-6 py-4 border-b border-surface-100 flex justify-between items-center">
                    <div class="flex items-center gap-3">
                      <span class="flex items-center justify-center w-8 h-8 bg-brand-100 text-brand-700 rounded-lg text-xs font-black shadow-sm">${i + 1}</span>
                      <span class="text-xs font-bold uppercase tracking-widest text-surface-500">${escapeHtml(slideName)}</span>
                    </div>
                    <div class="hidden sm:block">
                      <div class="h-1 w-20 bg-surface-200 rounded-full overflow-hidden">
                        <div class="h-full bg-brand-400" style="width: ${((i+1)/slides.length)*100}%"></div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Slide Content Area (mimicking a presentation slide) -->
                  <div class="p-8 sm:p-12 lg:p-16 min-h-[240px] bg-white relative">
                    <!-- Decorative background elements to make it look "pro" -->
                    <div class="absolute top-0 right-0 w-32 h-32 bg-brand-50/30 rounded-bl-full -mr-16 -mt-16 pointer-events-none"></div>
                    <div class="absolute bottom-0 left-0 w-24 h-24 bg-surface-50 rounded-tr-full -ml-12 -mb-12 pointer-events-none"></div>
                    
                    <div class="relative prose prose-brand max-w-none">
                      ${slideContentHtml || `
                        <div class="flex flex-col items-center justify-center h-40 text-surface-300 italic">
                          <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                          <span class="text-sm font-medium">Visual or Non-Text Content</span>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              </div>
            `;
          }

          html += `
              </div>
            </div>
          `;

          helpers.render(html);
        }).catch(function (err) {
          console.error('[ODP Parser]', err);
          helpers.showError('Could not parse ODP file', err.message);
        });
      },

      actions: [
        {
          label: '📋 Copy All Text',
          id: 'copy-text',
          onClick: function (helpers, btn) {
            const slides = helpers.getRenderEl().querySelectorAll('.prose');
            let fullText = "";
            let slideCount = 0;
            
            slides.forEach((s, i) => {
              const content = s.innerText.trim();
              if (content && !content.includes('Visual or Non-Text Content')) {
                slideCount++;
                fullText += `--- Slide ${i + 1} ---\n${content}\n\n`;
              }
            });
            
            if (!fullText) {
              alert('No readable text content found to copy.');
              return;
            }
            
            helpers.copyToClipboard(fullText, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl-orig',
          onClick: function (helpers) {
            helpers.download();
          }
        }
      ]
    });
  };
})();
