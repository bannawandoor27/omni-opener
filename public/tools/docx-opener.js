/**
 * OmniOpener — Word (DOCX) Toolkit
 * Uses OmniTool SDK and Mammoth.js.
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
      infoHtml: '<strong>DOCX Toolkit:</strong> Professional-grade Word document viewer with word counts and PDF export.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
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
          label: '🖨️ Print to PDF',
          id: 'print-pdf',
          onClick: function (h) {
             const content = document.getElementById('docx-render-area').innerHTML;
             const win = window.open('', '_blank');
             win.document.write(`
               <html>
                 <head>
                   <title>${h.getFile().name}</title>
                   <style>
                     body { font-family: sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
                     img { max-width: 100%; height: auto; }
                   </style>
                 </head>
                 <body>${content}</body>
               </html>
             `);
             win.document.close();
             win.print();
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof mammoth === 'undefined') {
          h.showLoading('Loading Word engine...');
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

                    <!-- Render Area -->
                    <div class="flex-1 overflow-auto bg-surface-100 p-8 flex justify-center">
                      <div id="docx-render-area" class="bg-white shadow-xl rounded-sm p-12 max-w-[800px] w-full min-h-full prose prose-sm prose-slate">
                        ${result.value || '<p class="text-surface-400 italic">Empty document</p>'}
                      </div>
                    </div>
                  </div>
                `);
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
