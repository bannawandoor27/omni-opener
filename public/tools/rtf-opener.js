/**
 * OmniOpener — RTF Toolkit
 * Uses OmniTool SDK and RTF.js.
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
      infoHtml: '<strong>RTF Toolkit:</strong> Professional Rich Text viewer with HTML rendering and plain text extraction.',
      
      onInit: function (h) {
        h.loadScript('https://unpkg.com/rtf.js@3.0.0/dist/RTFJS.bundle.min.js');
      },

      actions: [
        {
          label: '📋 Copy Plain Text',
          id: 'copy-text',
          onClick: function (h, btn) {
            const text = h.getRenderEl().innerText;
            if (text) h.copyToClipboard(text, btn);
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof RTFJS === 'undefined') {
          h.showLoading('Loading RTF engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        // Basic validation for RTF header
        const header = new Uint8Array(content.slice(0, 5));
        const headerStr = String.fromCharCode(...header);
        if (headerStr !== '{\\rtf') {
           h.render(`
             <div class="p-12 text-center text-surface-400">
               <p class="text-2xl mb-2">📄</p>
               <p>This file does not appear to be a valid RTF document.</p>
               <pre class="mt-4 p-4 bg-surface-50 rounded text-xs text-left overflow-auto max-h-48">${escapeHtml(new TextDecoder().decode(content.slice(0, 1000)))}</pre>
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
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                   <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                   <span class="text-[10px] font-mono text-surface-400">${(file.size/1024).toFixed(1)} KB</span>
                </div>
                <div id="rtf-content" class="flex-1 overflow-auto p-8 bg-white prose max-w-none shadow-inner"></div>
              </div>
            `);
            const target = document.getElementById('rtf-content');
            elements.forEach(el => target.appendChild(el));
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
