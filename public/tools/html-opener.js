/**
 * OmniOpener — HTML Toolkit
 * Uses OmniTool SDK and highlight.js. Renders .html files with device preview and meta extraction.
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
      accept: '.html,.htm',
      dropLabel: 'Drop an HTML file here',
      binary: false,
      infoHtml: '<strong>HTML Toolkit:</strong> Professional HTML previewer with responsive device testing and metadata inspection.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy HTML',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '🚀 Open in New Tab',
          id: 'open-tab',
          onClick: function (helpers) {
            const blob = new Blob([helpers.getContent()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }

        // Extract Meta Info (very basic)
        const doc = new DOMParser().parseFromString(content, 'text/html');
        const title = doc.title || 'No Title';
        const scripts = doc.querySelectorAll('script').length;
        const styles = doc.querySelectorAll('link[rel="stylesheet"], style').length;
        const images = doc.querySelectorAll('img').length;

        const highlightedCode = hljs.highlight(content.slice(0, 50000), {language: 'xml'}).value;
        
        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <!-- Header -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
               <div class="flex items-center gap-4">
                  <div class="flex px-1 bg-white border border-surface-200 rounded-lg">
                    <button id="tab-preview" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Preview</button>
                    <button id="tab-source" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Source</button>
                  </div>
                  <div id="device-controls" class="flex gap-1">
                    <button data-size="100%" class="dev-btn p-1 hover:bg-white rounded border border-transparent hover:border-surface-200" title="Desktop">🖥️</button>
                    <button data-size="768px" class="dev-btn p-1 hover:bg-white rounded border border-transparent hover:border-surface-200" title="Tablet">平板</button>
                    <button data-size="375px" class="dev-btn p-1 hover:bg-white rounded border border-transparent hover:border-surface-200" title="Mobile">📱</button>
                  </div>
               </div>
               <div class="flex items-center gap-4 text-[10px] font-bold text-surface-400 uppercase">
                  <span>${scripts} Scripts</span>
                  <span>${styles} Styles</span>
                  <span>${images} Images</span>
               </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-hidden relative bg-surface-100 flex justify-center">
               <div id="view-preview" class="w-full h-full transition-all duration-300 bg-white shadow-inner">
                  <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin" class="w-full h-full border-0"></iframe>
               </div>
               <div id="view-source" class="hidden w-full h-full bg-[#282c34] overflow-auto p-6 font-mono text-[12px] leading-relaxed">
                  <pre class="text-surface-100"><code>${highlightedCode}</code></pre>
               </div>
            </div>

            <!-- Meta Footer -->
            <div class="shrink-0 bg-white border-t border-surface-200 px-4 py-2 text-[10px] flex items-center justify-between">
               <div class="flex items-center gap-2">
                  <span class="text-surface-400 font-bold uppercase">Title:</span>
                  <span class="text-surface-900 font-medium">${escapeHtml(title)}</span>
               </div>
               <span class="font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</span>
            </div>
          </div>
        `);

        const iframe = document.getElementById('preview-iframe');
        iframe.srcdoc = content;

        const tabPreview = document.getElementById('tab-preview');
        const tabSource = document.getElementById('tab-source');
        const viewPreview = document.getElementById('view-preview');
        const viewSource = document.getElementById('view-source');

        tabPreview.onclick = () => {
           tabPreview.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
           tabSource.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
           viewPreview.classList.remove('hidden');
           viewSource.classList.add('hidden');
           document.getElementById('device-controls').classList.remove('opacity-30', 'pointer-events-none');
        };

        tabSource.onclick = () => {
           tabSource.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
           tabPreview.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
           viewSource.classList.remove('hidden');
           viewPreview.classList.add('hidden');
           document.getElementById('device-controls').classList.add('opacity-30', 'pointer-events-none');
        };

        document.querySelectorAll('.dev-btn').forEach(btn => {
           btn.onclick = () => {
              viewPreview.style.width = btn.getAttribute('data-size');
           };
        });
      }
    });
  };
})();
