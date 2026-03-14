/**
 * OmniOpener — YAML Viewer/Converter Tool
 * Uses OmniTool SDK. Renders .yaml/.yml files as JSON and allows conversion.
 */
(function () {
  'use strict';

  let parsedData = null; // To store the parsed YAML data (as a JS object)
  let isYamlReady = false;

  // Helper function to escape HTML characters for safe rendering
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.yaml,.yml',
      dropLabel: 'Drop a .yaml or .yml file',
      binary: false,
      infoHtml: '<strong>Privacy First:</strong> Your YAML files are processed entirely in your browser. No data is ever sent to a server.',
      
      actions: [
        {
          label: '📋 Copy as JSON',
          id: 'copy-json',
          onClick: function (helpers, btn) {
            if (parsedData) {
              const jsonStr = JSON.stringify(parsedData, null, 2);
              helpers.copyToClipboard(jsonStr, btn);
            }
          }
        },
        {
          label: '📥 Download as JSON',
          id: 'dl-json',
          onClick: function (helpers) {
            if (parsedData) {
              const jsonStr = JSON.stringify(parsedData, null, 2);
              const originalFilename = helpers.getFile().name;
              const newFilename = originalFilename.replace(/\.ya?ml$/i, '.json');
              helpers.download(newFilename, jsonStr, 'application/json');
            }
          }
        },
        {
          label: '📥 Download as YAML',
          id: 'dl-yaml',
          onClick: function (helpers) {
            const yamlContent = helpers.getContent();
            if (yamlContent) {
              const originalFilename = helpers.getFile().name;
              helpers.download(originalFilename, yamlContent, 'application/x-yaml');
            }
          }
        }
      ],

      onInit: function(helpers) {
        // Load js-yaml library from a CDN
        helpers.loadScript('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js', function() {
          isYamlReady = true;
        });
      },

      onFile: function (file, content, helpers) {
        if (!isYamlReady) {
          helpers.showError('Dependency not loaded', 'The js-yaml library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing YAML...');
        
        try {
          // Use jsyaml.load() to parse the YAML string
          parsedData = jsyaml.load(content);
          
          // Convert the parsed object to a pretty JSON string for display
          const prettyJson = JSON.stringify(parsedData, null, 2);
          
          const renderHtml = `
            <div class="p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner">
              <div class="text-xs font-semibold text-surface-500 mb-2 uppercase">Preview (converted to JSON)</div>
              <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(prettyJson)}</pre>
            </div>
          `;
          helpers.render(renderHtml);

        } catch (err) {
          helpers.showError('Failed to parse YAML', 'The file may not be valid YAML. ' + err.message);
          parsedData = null;
        }
      }
    });
  };

})();
