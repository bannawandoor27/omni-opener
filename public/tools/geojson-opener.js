/**
 * OmniOpener — GeoJSON Viewer Tool
 * Uses OmniTool SDK and highlight.js. Renders .geojson files with syntax highlighting.
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
      accept: '.geojson',
      dropLabel: 'Drop a .geojson file here',
      binary: false,
      infoHtml: '<strong>GeoJSON Viewer:</strong> Displays .geojson files with syntax highlighting.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', function() {
            isHighlightJsReady = true;
        });
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js');
      },

      onFile: function (file, content, helpers) {
        if (!isHighlightJsReady) {
          helpers.showError('Dependency not loaded', 'The highlight.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Highlighting GeoJSON...');

        try {
          // First, try to parse as JSON to validate
          const parsed = JSON.parse(content);
          const pretty = JSON.stringify(parsed, null, 2);

          const highlightedCode = hljs.highlight(pretty, {language: 'json'}).value;
          const renderHtml = `
            <div class="p-4 bg-surface-100 rounded-lg shadow-inner overflow-auto h-full">
              <pre class="flex-grow bg-surface-200 p-3 rounded-md text-sm text-surface-900 overflow-auto"><code class="language-json">${highlightedCode}</code></pre>
            </div>
          `;
          helpers.render(renderHtml);
        } catch (e) {
          helpers.showError('Error parsing .geojson file', 'The file does not appear to be valid JSON.');
        }
      }
    });
  };
})();
