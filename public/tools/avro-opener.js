/**
 * OmniOpener — Avro Viewer Tool
 * Uses OmniTool SDK, avsc, js-yaml, fast-xml-parser, and PapaParse.
 * Renders .avro files with cross-format export.
 */
(function () {
  'use strict';

  let isAvscReady = false;
  let records = [];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avro',
      dropLabel: 'Drop an .avro file here',
      binary: true,
      infoHtml: '<strong>Avro Viewer:</strong> Displays .avro files with cross-format export (JSON, YAML, XML, CSV).',
      
      onInit: async function(helpers) {
          try {
            const [avscMod, yamlMod, xmlMod, csvMod] = await Promise.all([
              import('https://esm.sh/avsc@5.7.9'),
              import('https://esm.sh/js-yaml@4.1.0'),
              import('https://esm.sh/fast-xml-parser@4.3.2'),
              import('https://esm.sh/papaparse@5.4.1')
            ]);
            window.avsc = avscMod.default || avscMod;
            window.jsyaml = yamlMod.default || yamlMod;
            window.XMLParser = xmlMod.XMLParser;
            window.XMLBuilder = xmlMod.XMLBuilder;
            window.Papa = csvMod.default || csvMod;
            isAvscReady = true;
          } catch (e) {
            helpers.showError('Dependency Load Issue', 'Failed to initialize required libraries: ' + e.message);
          }
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(JSON.stringify(records, null, 2), btn);
          }
        },
        {
          label: '📄 Export YAML',
          id: 'export-yaml',
          onClick: function (helpers) {
            const yaml = window.jsyaml.dump(records);
            helpers.download(helpers.getFile().name.replace('.avro', '.yaml'), yaml);
          }
        },
        {
          label: '📦 Export XML',
          id: 'export-xml',
          onClick: function (helpers) {
            const builder = new window.XMLBuilder({ format: true, arrayMap: { records: 'record' } });
            const xml = builder.build({ records });
            helpers.download(helpers.getFile().name.replace('.avro', '.xml'), xml);
          }
        },
        {
          label: '📊 Export CSV',
          id: 'export-csv',
          onClick: function (helpers) {
            const csv = window.Papa.unparse(records);
            helpers.download(helpers.getFile().name.replace('.avro', '.csv'), csv);
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (!isAvscReady) {
          helpers.showError('Dependency not loaded', 'The libraries are still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing Avro file...');
        records = [];
        
        try {
          const decoder = window.avsc.createBlobReader(new Blob([content]));
          decoder.on('data', (record) => records.push(record));
          decoder.on('end', () => {
              const prettyJson = JSON.stringify(records, null, 2);
              const renderHtml = `
                <div class="flex flex-col h-[70vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex justify-between items-center text-xs text-surface-500 font-medium">
                    <div class="flex items-center gap-2 truncate">
                      <span class="text-lg">📦</span>
                      <span class="truncate">${escapeHtml(file.name)}</span>
                    </div>
                    <div class="shrink-0">
                      <span>${records.length.toLocaleString()} records</span>
                    </div>
                  </div>
                  <div class="flex-1 overflow-auto bg-[#282c34] p-4">
                    <pre class="font-mono text-[13px] leading-relaxed text-surface-100 whitespace-pre"><code class="hljs language-json">${escapeHtml(prettyJson)}</code></pre>
                  </div>
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
