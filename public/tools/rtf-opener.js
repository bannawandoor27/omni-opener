/**
 * OmniOpener — RTF Toolkit
 * Uses OmniTool SDK, RTF.js, and Turndown.
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
      accept: '.rtf',
      binary: true,
      infoHtml: '<strong>RTF Toolkit:</strong> Professional Rich Text viewer with HTML rendering, Markdown export, and document stats.',
      
      onInit: function (h) {
        h.loadScript('https://unpkg.com/rtf.js@3.0.0/dist/RTFJS.bundle.min.js');
        h.loadScript('https://unpkg.com/turndown/dist/turndown.js');
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy-text',
          onClick: function (h, btn) {
            const text = h.getRenderEl().innerText;
            if (text) h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📝 Export Markdown',
          id: 'export-md',
          onClick: function (h) {
             const html = document.getElementById('rtf-content').innerHTML;
             const turndownService = new TurndownService();
             const markdown = turndownService.turndown(html);
             h.download(h.getFile().name.replace(/\.rtf$/i, '.md'), markdown, 'text/markdown');
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof RTFJS === 'undefined' || typeof TurndownService === 'undefined') {
          h.showLoading('Loading RTF engines...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        const header = new Uint8Array(content.slice(0, 5));
        const headerStr = String.fromCharCode(...header);
        if (headerStr !== '{\\rtf') {
           h.render(`
             <div class="p-12 text-center text-surface-400">
               <p class="text-2xl mb-2">📄</p>
               <p>This file does not appear to be a valid RTF document.</p>
             </div>
           `);
           return;
        }

        h.showLoading('Rendering RTF...');
        try {
          const doc = new RTFJS.Document(content);
          doc.render().then(elements => {
            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center justify-between">
                   <div class="flex items-center gap-3">
                      <span class="text-lg">📄</span>
                      <span class="text-sm font-bold text-surface-900 truncate max-w-xs">${escapeHtml(file.name)}</span>
                   </div>
                   <div id="rtf-stats" class="flex items-center gap-4 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                      <span>0 Words</span>
                      <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
                      <span>0 Chars</span>
                   </div>
                </div>
                <div id="rtf-content" class="flex-1 overflow-auto p-12 bg-white prose max-w-none shadow-inner selection:bg-brand-100"></div>
              </div>
            `);
            const target = document.getElementById('rtf-content');
            elements.forEach(el => target.appendChild(el));
            
            // Update Stats
            const text = target.innerText || "";
            const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
            const charCount = text.length;
            document.getElementById('rtf-stats').innerHTML = `
               <span>${wordCount.toLocaleString()} Words</span>
               <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
               <span>${charCount.toLocaleString()} Chars</span>
            `;
          }).catch(err => {
             h.render(`<div class="p-8 text-center text-surface-400">Unable to render this RTF.</div>`);
          });
        } catch (err) {
           h.render(`<div class="p-8 text-center text-surface-400">Unable to parse this RTF.</div>`);
        }
      }
    });
  };
})();

