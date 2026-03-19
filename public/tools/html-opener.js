/**
 * OmniOpener — HTML Viewer Tool
 * Uses OmniTool SDK and highlight.js. Renders .html files in a sandboxed iframe or as source.
 */
(function () {
  'use strict';

  let isHighlightJsReady = false;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.html,.htm',
      dropLabel: 'Drop an .html file here',
      binary: false,
      infoHtml: '<strong>HTML Viewer:</strong> Renders HTML files in a sandboxed preview or as syntax-highlighted source.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', function() {
            isHighlightJsReady = true;
        });
      },

      actions: [
        {
          label: '📋 Copy to Clipboard',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const file = helpers.getFile();
            helpers.download(file ? file.name : 'export.html', helpers.getContent());
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (!isHighlightJsReady) {
          helpers.showError('Dependency not loaded', 'The highlight.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Preparing viewer...');

        try {
          const highlightedCode = hljs.highlight(content, {language: 'xml'}).value;
          
          const renderHtml = `
            <div class="flex flex-col h-[70vh]">
              <div class="flex gap-4 mb-4 border-b border-surface-200">
                <button id="view-preview" class="px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600 transition-all">Live Preview</button>
                <button id="view-source" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 transition-all">Source Code</button>
              </div>
              <div id="html-preview-container" class="flex-1 border border-surface-200 rounded-lg overflow-hidden bg-white">
                <iframe id="preview-iframe" sandbox="allow-scripts allow-same-origin" class="w-full h-full border-0"></iframe>
              </div>
              <div id="html-source-container" class="hidden flex-1 overflow-auto bg-[#282c34] p-4 rounded-lg">
                <pre class="font-mono text-[13px] leading-relaxed text-surface-100 whitespace-pre"><code class="hljs language-xml">${highlightedCode}</code></pre>
              </div>
            </div>
          `;
          
          helpers.render(renderHtml);

          const iframe = document.getElementById('preview-iframe');
          iframe.srcdoc = content;

          const btnPreview = document.getElementById('view-preview');
          const btnSource = document.getElementById('view-source');
          const containerPreview = document.getElementById('html-preview-container');
          const containerSource = document.getElementById('html-source-container');

          btnPreview.addEventListener('click', () => {
            btnPreview.classList.add('border-brand-500', 'text-brand-600');
            btnPreview.classList.remove('border-transparent', 'text-surface-500');
            btnSource.classList.remove('border-brand-500', 'text-brand-600');
            btnSource.classList.add('border-transparent', 'text-surface-500');
            containerPreview.classList.remove('hidden');
            containerSource.classList.add('hidden');
          });

          btnSource.addEventListener('click', () => {
            btnSource.classList.add('border-brand-500', 'text-brand-600');
            btnSource.classList.remove('border-transparent', 'text-surface-500');
            btnPreview.classList.remove('border-brand-500', 'text-brand-600');
            btnPreview.classList.add('border-transparent', 'text-surface-500');
            containerSource.classList.remove('hidden');
            containerPreview.classList.add('hidden');
          });

        } catch (e) {
          helpers.showError('Error rendering HTML', e.message);
        }
      }
    });
  };
})();
