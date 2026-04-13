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
      infoHtml: '<strong>ODT Toolkit:</strong> Professional OpenDocument viewer with metadata extraction and formatted text preview.',
      
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

      onFile: function _onFileFn(file, content, h) {
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading ODT engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        h.showLoading('Reading document...');
        JSZip.loadAsync(content).then(async (zip) => {
          const contentXml = await zip.file('content.xml')?.async('string');
          const metaXml = await zip.file('meta.xml')?.async('string');
          
          if (!contentXml) {
             h.render(`<div class="p-12 text-center text-surface-400">Invalid ODT: content.xml not found.</div>`);
             return;
          }

          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(contentXml, "text/xml");
          const paragraphs = xmlDoc.getElementsByTagName('text:p');
          let plainText = "";
          let htmlContent = "";

          for (let i = 0; i < paragraphs.length; i++) {
             const p = paragraphs[i];
             plainText += p.textContent + "\n";
             
             // Basic Style Parsing (Bold/Italic)
             let pInner = "";
             p.childNodes.forEach(node => {
                if (node.nodeName === 'text:span') {
                   const style = node.getAttribute('text:style-name');
                   if (style?.includes('Bold')) pInner += `<strong>${escapeHtml(node.textContent)}</strong>`;
                   else if (style?.includes('Italic')) pInner += `<em>${escapeHtml(node.textContent)}</em>`;
                   else pInner += escapeHtml(node.textContent);
                } else {
                   pInner += escapeHtml(node.textContent);
                }
             });
             htmlContent += `<p class="mb-4">${pInner}</p>`;
          }

          // Parse Metadata
          const meta = {};
          if (metaXml) {
             const mDoc = parser.parseFromString(metaXml, "text/xml");
             meta.creator = mDoc.getElementsByTagName('dc:creator')[0]?.textContent || 'Unknown';
             meta.date = mDoc.getElementsByTagName('dc:date')[0]?.textContent || 'N/A';
             meta.generator = mDoc.getElementsByTagName('meta:generator')[0]?.textContent || 'N/A';
          }

          const wordCount = plainText.trim().split(/\s+/).length;
          h.setState('plainText', plainText);

          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                 <div class="flex px-1 bg-white border border-surface-200 rounded-lg">
                    <button id="tab-doc" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Document</button>
                    <button id="tab-meta" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Metadata</button>
                 </div>
                 <div class="flex items-center gap-4 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                    <span>${wordCount.toLocaleString()} Words</span>
                 </div>
              </div>

              <div class="flex-1 overflow-hidden relative">
                 <div id="view-doc" class="absolute inset-0 overflow-auto p-12 bg-white prose prose-sm max-w-none shadow-inner">
                    ${htmlContent || '<p class="text-surface-400 italic">No text content found</p>'}
                 </div>
                 <div id="view-meta" class="absolute inset-0 hidden overflow-auto p-8 bg-surface-50">
                    <div class="max-w-md mx-auto bg-white border border-surface-200 rounded-2xl p-6 shadow-sm">
                       <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-6">File Metadata</h3>
                       <div class="space-y-4">
                          <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-xs text-surface-500">Creator</span><span class="text-xs font-bold text-surface-900">${escapeHtml(meta.creator)}</span></div>
                          <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-xs text-surface-500">Last Modified</span><span class="text-xs font-bold text-surface-900">${escapeHtml(meta.date)}</span></div>
                          <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-xs text-surface-500">Generator</span><span class="text-xs font-bold text-surface-900">${escapeHtml(meta.generator)}</span></div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          `);

          const tabDoc = document.getElementById('tab-doc');
          const tabMeta = document.getElementById('tab-meta');
          const viewDoc = document.getElementById('view-doc');
          const viewMeta = document.getElementById('view-meta');

          tabDoc.onclick = () => {
             tabDoc.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             tabMeta.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
             viewDoc.classList.remove('hidden');
             viewMeta.classList.add('hidden');
          };

          tabMeta.onclick = () => {
             tabMeta.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             tabDoc.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
             viewMeta.classList.remove('hidden');
             viewDoc.classList.add('hidden');
          };

        }).catch(err => {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to open this ODT document.</div>`);
        });
      }
    });
  };
})();

