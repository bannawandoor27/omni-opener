/**
 * OmniOpener — Avro Viewer Tool
 * Uses OmniTool SDK and avsc. Renders .avro files as JSON.
 */
(function () {
  'use strict';

  let isAvscReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avro',
      dropLabel: 'Drop an .avro file here',
      binary: true,
      infoHtml: '<strong>Avro Viewer:</strong> Displays the content of .avro files as JSON.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/avsc@5.7.3/etc/browser/avsc.min.js', function() {
          isAvscReady = true;
        });
      },

      onFile: function (file, content, helpers) {
        if (!isAvscReady) {
          helpers.showError('Dependency not loaded', 'The avsc library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing Avro file...');
        
        try {
          const records = [];
          const decoder = avro.createDecoder(new Uint8Array(content));
          while (decoder.offset < content.byteLength) {
            records.push(decoder.decode());
          }
          
          const prettyJson = JSON.stringify(records, null, 2);
          
          const renderHtml = `
            <div class="p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner">
              <div class="text-xs font-semibold text-surface-500 mb-2 uppercase">Preview (converted to JSON)</div>
              <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(prettyJson)}</pre>
            </div>
          `;
          helpers.render(renderHtml);

        } catch (err) {
          helpers.showError('Failed to parse Avro', 'The file may not be valid Avro. ' + err.message);
        }
      }
    });
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
