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
      
      onInit: async function(helpers) {
          try {
            const mod = await import('https://esm.sh/avsc@5.7.9');
            window.avsc = mod.default || mod;
            isAvscReady = true;
          } catch (e) {
            helpers.showError('Avro engine Load Failed', 'Failed to initialize Avro engine: ' + e.message);
          }
      },

      onFile: function (file, content, helpers) {
        if (!isAvscReady) {
          helpers.showError('Dependency not loaded', 'The avsc library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing Avro file...');
        
        try {
          const records = [];
          // avsc.createDecoder is for node streams, for browser we use Type.forBuffer if it's a single record, 
          // or BlockDecoder if it's a container file.
          // Most .avro files are container files.
          
          const decoder = window.avsc.createBlobReader(new Blob([content]));
          decoder.on('data', (record) => records.push(record));
          decoder.on('end', () => {
              const prettyJson = JSON.stringify(records, null, 2);
              const renderHtml = `
                <div class="p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner">
                  <div class="text-xs font-semibold text-surface-500 mb-2 uppercase">Preview (converted to JSON)</div>
                  <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(prettyJson)}</pre>
                </div>
              `;
              helpers.render(renderHtml);
          });
          decoder.on('error', (err) => {
              helpers.showError('Failed to parse Avro', err.message);
          });

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
