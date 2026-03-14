/**
 * OmniOpener — JSON Viewer/Converter Tool
 * Uses OmniTool SDK. Renders and allows conversion of .json files.
 */
(function () {
  'use strict';

  let parsedJson = null; // To store the parsed JSON data

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.json',
      dropLabel: 'Drop a .json file here',
      binary: false,
      infoHtml: '<strong>Privacy First:</strong> Your files are processed entirely in your browser. No data is ever sent to a server.',
      
      actions: [
        {
          label: '📋 Copy JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            if (parsedJson) {
              const jsonStr = JSON.stringify(parsedJson, null, 2);
              helpers.copyToClipboard(jsonStr, btn);
            }
          } 
        },
        {
          label: '📥 Download Formatted', 
          id: 'dl-formatted', 
          onClick: function (helpers) {
            if (parsedJson) {
              const jsonStr = JSON.stringify(parsedJson, null, 2);
              const originalFilename = helpers.getFile().name;
              const newFilename = originalFilename.replace(/\.json$/i, '.formatted.json');
              helpers.download(newFilename, jsonStr, 'application/json');
            }
          }
        },
        {
          label: '📥 Download Minified', 
          id: 'dl-minified', 
          onClick: function (helpers) {
            if (parsedJson) {
              const jsonStr = JSON.stringify(parsedJson);
              const originalFilename = helpers.getFile().name;
              const newFilename = originalFilename.replace(/\.json$/i, '.minified.json');
              helpers.download(newFilename, jsonStr, 'application/json');
            }
          }
        },
      ],

      onInit: function(helpers) {
        // No external CDN dependencies for JSON processing
      },

      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing JSON...');
        
        try {
          parsedJson = JSON.parse(content);
          const prettyJson = JSON.stringify(parsedJson, null, 2);
          
          // Render the pretty-printed JSON inside a pre tag
          const renderHtml = `
            <div class="overflow-auto max-h-full p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner">
              <pre class="whitespace-pre-wrap font-mono text-xs">${escapeHtml(prettyJson)}</pre>
            </div>
          `;
          helpers.render(renderHtml);

        } catch (err) {
          helpers.showError('Failed to parse JSON', 'The file is not a valid JSON. ' + err.message);
          parsedJson = null;
        }
      }
    });
  };

  // Helper function to escape HTML characters for safe rendering
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

})();
