/**
 * OmniOpener — GraphQL Viewer Tool
 * Uses OmniTool SDK and highlight.js. Renders .graphql files with syntax highlighting.
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
      accept: '.graphql,.gql',
      dropLabel: 'Drop a .graphql file here',
      binary: false,
      infoHtml: '<strong>GraphQL Viewer:</strong> Displays .graphql files with syntax highlighting and line numbers.',
      
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
            helpers.download(file ? file.name : 'export.graphql', helpers.getContent());
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (!isHighlightJsReady) {
          helpers.showError('Dependency not loaded', 'The highlight.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Highlighting GraphQL...');

        try {
          const lines = content.split(/\r?\n/);
          const highlightedCode = hljs.highlight(content, {language: 'graphql'}).value;
          
          const renderHtml = `
            <div class="flex flex-col h-[70vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex justify-between items-center text-xs text-surface-500 font-medium">
                <div class="flex items-center gap-2 truncate">
                  <span class="text-lg">🕸️</span>
                  <span class="truncate">${escapeHtml(file.name)}</span>
                </div>
                <div class="shrink-0">
                  <span>${lines.length.toLocaleString()} lines</span>
                </div>
              </div>
              <div class="flex-1 overflow-auto bg-[#282c34] font-mono text-[13px] leading-relaxed relative">
                <div class="flex min-w-full">
                  <div class="shrink-0 text-right pr-4 pl-2 py-4 bg-[#21252b] text-surface-500 select-none border-r border-[#181a1f] sticky left-0 z-10" style="min-width: 3.5rem;">
                    ${lines.map((_, i) => `<div>${i + 1}</div>`).join('')}
                  </div>
                  <pre class="flex-1 p-4 text-surface-100 whitespace-pre"><code class="hljs language-graphql">${highlightedCode}</code></pre>
                </div>
              </div>
            </div>
          `;
          helpers.render(renderHtml);
        } catch (e) {
          helpers.showError('Error highlighting GraphQL file', e.message);
        }
      }
    });
  };
})();
