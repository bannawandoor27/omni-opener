/**
 * OmniOpener — ODT Toolkit
 * Uses OmniTool SDK and JSZip.
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
      accept: '.odt',
      binary: true,
      infoHtml: '<strong>ODT Toolkit:</strong> Clean text extraction and document analysis for OpenDocument files.',
      
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy-text',
          onClick: function (h, btn) {
            const text = h.getState().plainText;
            if (text) h.copyToClipboard(text, btn);
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading ODT engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Reading document...');
        JSZip.loadAsync(content).then(zip => {
          const contentXml = zip.file('content.xml');
          if (!contentXml) {
             h.render(`<div class="p-12 text-center text-surface-400">Invalid ODT: content.xml not found.</div>`);
             return;
          }

          contentXml.async('string').then(xml => {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xml, "text/xml");
            const paragraphs = xmlDoc.getElementsByTagName('text:p');
            let plainText = "";
            let htmlContent = "";

            for (let i = 0; i < paragraphs.length; i++) {
               const pText = paragraphs[i].textContent;
               plainText += pText + "\n";
               htmlContent += `<p class="mb-4">${escapeHtml(pText)}</p>`;
            }

            const wordCount = plainText.trim().split(/\s+/).length;
            h.setState('plainText', plainText);

            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                   <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                   <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">${wordCount.toLocaleString()} Words</span>
                </div>
                <div class="flex-1 overflow-auto p-12 bg-white prose prose-sm max-w-none shadow-inner">
                   ${htmlContent || '<p class="text-surface-400 italic">No text content found</p>'}
                </div>
              </div>
            `);
          });
        }).catch(err => {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to open this ODT document.</div>`);
        });
      }
    });
  };
})();
