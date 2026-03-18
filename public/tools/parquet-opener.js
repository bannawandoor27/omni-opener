/**
 * OmniOpener — Parquet Viewer Tool
 * Uses OmniTool SDK and parquet-wasm. Renders .parquet files as JSON.
 */
(function () {
  'use strict';

  let isParquetWasmReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.parquet',
      dropLabel: 'Drop a .parquet file here',
      binary: true,
      infoHtml: '<strong>Parquet Viewer:</strong> Displays the content of .parquet files as JSON.',
      
      onInit: async function(helpers) {
          try {
            const mod = await import('https://cdn.jsdelivr.net/npm/parquet-wasm@0.4.0/esm/arrow1.js');
            await mod.default(); // Initialize WASM
            window.parquet_wasm = mod;
            isParquetWasmReady = true;
          } catch (e) {
            helpers.showError('WASM Load Failed', 'Failed to initialize Parquet engine: ' + e.message);
          }
      },

      onFile: async function (file, content, helpers) {
        if (!isParquetWasmReady) {
          helpers.showError('Dependency not loaded', 'The parquet-wasm library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing Parquet file...');
        
        try {
          const arr = new Uint8Array(content);
          const table = window.parquet_wasm.readParquet(arr);
          const json = table.toArray().map(row => row.toJSON());
          
          const prettyJson = JSON.stringify(json, null, 2);
          
          const renderHtml = `
            <div class="p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner">
              <div class="text-xs font-semibold text-surface-500 mb-2 uppercase">Preview (converted to JSON)</div>
              <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(prettyJson)}</pre>
            </div>
          `;
          helpers.render(renderHtml);

        } catch (err) {
          helpers.showError('Failed to parse Parquet', 'The file may not be valid Parquet. ' + err.message);
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
