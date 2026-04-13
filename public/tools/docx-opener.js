/**
 * OmniOpener — Word (DOCX) Toolkit
 * Uses OmniTool SDK, Mammoth.js, and Turndown for Markdown conversion.
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
      accept: '.docx',
      binary: true,
      infoHtml: '<strong>DOCX Toolkit:</strong> Professional-grade Word document viewer with search, reading time, and Markdown export.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
        h.loadScript('https://unpkg.com/turndown/dist/turndown.js');
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy-text',
          onClick: function (h, btn) {
            const text = h.getState().plainText;
            if (text) h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📝 Export Markdown',
          id: 'export-md',
          onClick: function (h) {
             const area = document.getElementById('docx-render-area');
             if (!area) return;
             const html = area.innerHTML;
             const turndownService = new TurndownService();
             const markdown = turndownService.turndown(html);
             h.download(h.getFile().name.replace(/\.docx$/i, '.md'), markdown, 'text/markdown');
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (typeof mammoth === 'undefined' || typeof TurndownService === 'undefined') {
          h.showLoading('Loading Word engines...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        h.showLoading('Converting document...');
        
        mammoth.convertToHtml({ arrayBuffer: content })
          .then(result => {
             mammoth.extractRawText({ arrayBuffer: content }).then(textResult => {
                const text = textResult.value;
                const wordCount = text.trim().split(/\s+/).length;
                const charCount = text.length;
                const readingTime = Math.ceil(wordCount / 200);
                h.setState('plainText', text);

                h.render(`
                  <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                    <!-- Header -->
                    <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                      <div class="flex items-center gap-3">
                         <span class="text-xl">📄</span>
                         <div class="space-y-0.5">
                           <h3 class="text-sm font-bold text-surface-900 truncate max-w-xs">${escapeHtml(file.name)}</h3>
                           <div class="flex items-center gap-2 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                             <span>${wordCount.toLocaleString()} Words</span>
                             <span>•</span>
                             <span>${readingTime} Min Read</span>
                           </div>
                         </div>
                      </div>
                      
                      <div class="flex items-center gap-3">
                        <div class="relative">
                          <input type="text" id="docx-search" placeholder="Find in document..." class="pl-8 pr-4 py-1.5 text-xs bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-48 shadow-sm">
                          <span class="absolute left-2.5 top-2 text-xs opacity-40">🔍</span>
                        </div>
                      </div>
                    </div>

                    <!-- Main Content -->
                    <div class="flex-1 flex overflow-hidden">
                       <!-- Sidebar (ToC) -->
                       <div id="docx-toc" class="w-64 shrink-0 bg-white border-r border-surface-100 overflow-y-auto p-6 hidden">
                          <h3 class="text-[10px] font-bold uppercase text-surface-400 tracking-wider mb-4">Table of Contents</h3>
                          <div id="toc-list" class="space-y-3"></div>
                       </div>

                       <!-- Render Area -->
                       <div id="docx-scroll-container" class="flex-1 overflow-auto bg-surface-100 p-8 flex justify-center scroll-smooth">
                         <div id="docx-render-area" class="bg-white shadow-xl rounded-sm p-12 md:p-16 max-w-[800px] w-full min-h-full prose prose-sm prose-slate">
                           ${result.value || '<p class="text-surface-400 italic">Empty document</p>'}
                         </div>
                       </div>
                    </div>
                  </div>
                `);

                const renderArea = document.getElementById('docx-render-area');
                const headings = renderArea.querySelectorAll('h1, h2, h3');
                const tocContainer = document.getElementById('docx-toc');
                const tocList = document.getElementById('toc-list');
                
                if (headings.length > 0) {
                   tocContainer.classList.remove('hidden');
                   headings.forEach((heading, i) => {
                      const id = `heading-${i}`;
                      heading.id = id;
                      const link = document.createElement('a');
                      link.href = `#${id}`;
                      link.className = `block text-xs font-medium text-surface-600 hover:text-brand-600 transition-colors ${heading.tagName === 'H1' ? 'pl-0' : heading.tagName === 'H2' ? 'pl-2' : 'pl-4'}`;
                      link.textContent = heading.textContent;
                      link.onclick = (e) => {
                         e.preventDefault();
                         heading.scrollIntoView({ behavior: 'smooth' });
                      };
                      tocList.appendChild(link);
                   });
                }

                // Search Implementation
                const searchInput = document.getElementById('docx-search');
                let originalHtml = renderArea.innerHTML;

                searchInput.addEventListener('input', () => {
                  const query = searchInput.value.trim();
                  if (!query || query.length < 2) {
                    renderArea.innerHTML = originalHtml;
                    return;
                  }

                  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                  
                  // Simple text-based replacement for highlighting
                  // Note: This is a bit naive as it can break HTML tags if query matches tag names
                  // But for DOCX content it's usually okay.
                  const walker = document.createTreeWalker(renderArea, NodeFilter.SHOW_TEXT, null, false);
                  const nodes = [];
                  let node;
                  while(node = walker.nextNode()) nodes.push(node);

                  nodes.forEach(textNode => {
                    const parent = textNode.parentNode;
                    if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;
                    
                    const text = textNode.nodeValue;
                    if (regex.test(text)) {
                      const span = document.createElement('span');
                      span.innerHTML = text.replace(regex, '<mark class="bg-yellow-200 text-black rounded-sm px-0.5">$1</mark>');
                      parent.replaceChild(span, textNode);
                    }
                  });
                });
             });
          })
          .catch(err => {
            h.showError('Conversion Error', err.message);
          });
      }
    });
  };
})();
