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
      infoHtml: '<strong>DOCX Toolkit:</strong> Professional-grade Word document viewer with Table of Contents, Markdown export, and word counts.',
      
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
             const html = document.getElementById('docx-render-area').innerHTML;
             const turndownService = new TurndownService();
             const markdown = turndownService.turndown(html);
             h.download(h.getFile().name.replace(/\.docx$/i, '.md'), markdown, 'text/markdown');
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof mammoth === 'undefined' || typeof TurndownService === 'undefined') {
          h.showLoading('Loading Word engines...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Converting document...');
        
        mammoth.convertToHtml({ arrayBuffer: content })
          .then(result => {
             mammoth.extractRawText({ arrayBuffer: content }).then(textResult => {
                const text = textResult.value;
                const wordCount = text.trim().split(/\s+/).length;
                const charCount = text.length;
                h.setState('plainText', text);

                h.render(`
                  <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <!-- Header -->
                    <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center justify-between">
                      <div class="flex items-center gap-3">
                         <span class="text-lg">📄</span>
                         <span class="text-sm font-bold text-surface-900 truncate max-w-xs">${escapeHtml(file.name)}</span>
                      </div>
                      <div class="flex items-center gap-4 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                        <span>${wordCount.toLocaleString()} Words</span>
                        <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
                        <span>${charCount.toLocaleString()} Chars</span>
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
                       <div class="flex-1 overflow-auto bg-surface-100 p-8 flex justify-center scroll-smooth">
                         <div id="docx-render-area" class="bg-white shadow-xl rounded-sm p-12 max-w-[800px] w-full min-h-full prose prose-sm prose-slate">
                           ${result.value || '<p class="text-surface-400 italic">Empty document</p>'}
                         </div>
                       </div>
                    </div>
                  </div>
                `);

                // Generate ToC
                const renderArea = document.getElementById('docx-render-area');
                const headings = renderArea.querySelectorAll('h1, h2, h3');
                const tocContainer = document.getElementById('docx-toc');
                const tocList = document.getElementById('toc-list');
                
                if (headings.length > 0) {
                   tocContainer.classList.remove('hidden');
                   headings.forEach((h, i) => {
                      const id = `heading-${i}`;
                      h.id = id;
                      const link = document.createElement('a');
                      link.href = `#${id}`;
                      link.className = `block text-xs font-medium text-surface-600 hover:text-brand-600 transition-colors ${h.tagName === 'H1' ? 'pl-0' : h.tagName === 'H2' ? 'pl-2' : 'pl-4'}`;
                      link.textContent = h.textContent;
                      link.onclick = (e) => {
                         e.preventDefault();
                         h.scrollIntoView({ behavior: 'smooth' });
                      };
                      tocList.appendChild(link);
                   });
                }
             });
          })
          .catch(err => {
            h.render(`<div class="p-12 text-center text-surface-400">
              <p class="text-2xl mb-2">📄</p>
              <p>Unable to open this document. It might be empty or invalid.</p>
            </div>`);
          });
      }
    });
  };
})();

