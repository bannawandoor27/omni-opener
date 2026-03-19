/**
 * OmniOpener — GraphQL Viewer Tool
 * Uses OmniTool SDK and highlight.js. Renders .graphql files with syntax highlighting.
 */
(function () {
  'use strict';

  let isHighlightJsReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.graphql,.gql',
      dropLabel: 'Drop a .graphql file here',
      binary: false,
      infoHtml: '<strong>GraphQL Viewer:</strong> Displays .graphql files with syntax highlighting.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', function() {
            isHighlightJsReady = true;
        });
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/graphql.min.js');
      },

      onFile: function (file, content, helpers) {
        if (!isHighlightJsReady || typeof hljs === "undefined") {
          helpers.showError('Dependency not loaded', 'The highlight.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Highlighting GraphQL...');

        try {
          const highlightedCode = hljs.highlight(content, {language: 'graphql'}).value;
          const renderHtml = `
            <div class="p-4 bg-surface-100 rounded-lg shadow-inner overflow-auto h-full">
              <pre class="flex-grow bg-surface-200 p-3 rounded-md text-sm text-surface-900 overflow-auto"><code class="language-graphql">${highlightedCode}</code></pre>
            </div>
          `;
          helpers.render(renderHtml);
        } catch (e) {
          helpers.showError('Error highlighting .graphql file', e.message);
        }
      }
    });
  };
})();
