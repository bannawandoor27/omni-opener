/**
 * OmniOpener — Avro Toolkit
 * Uses OmniTool SDK and avsc.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avro',
      binary: true,
      infoHtml: '<strong>Avro Toolkit:</strong> Advanced Avro viewer with schema inspection, table view, and JSON export.',
      
      onInit: async function(h) {
          try {
            const avscMod = await import('https://esm.sh/avsc@5.7.9');
            window.avsc = avscMod.default || avscMod;
          } catch (e) {
            h.render(`<div class="p-12 text-center text-surface-400">Unable to load the Avro processing engine.</div>`);
          }
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const data = h.getState().records;
            if (data) h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof avsc === 'undefined') {
          h.showLoading('Loading Avro engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing Avro...');
        const records = [];
        try {
          const decoder = avsc.createBlobReader(new Blob([content]));
          let schema = null;
          
          decoder.on('metadata', (type) => { schema = type; });
          decoder.on('data', (record) => records.push(record));
          decoder.on('end', () => {
              h.setState('records', records);
              h.setState('schema', schema);
              renderApp(records, schema);
          });
          decoder.on('error', (err) => {
             h.render(`<div class="p-12 text-center text-surface-400">This file does not appear to be a valid Avro container.</div>`);
          });

          const renderApp = (data, schemaObj) => {
            const fields = schemaObj ? schemaObj.fields.map(f => f.name) : (data.length > 0 ? Object.keys(data[0]) : []);
            
            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                  <div class="flex px-2">
                    <button id="tab-table" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Data Table</button>
                    <button id="tab-schema" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Schema</button>
                    <button id="tab-json" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Raw JSON</button>
                  </div>
                  <span class="px-4 text-[10px] font-mono text-surface-400">${data.length.toLocaleString()} records</span>
                </div>

                <div id="avro-viewport" class="flex-1 overflow-auto bg-white">
                  <div id="view-table" class="w-full">
                    <table class="w-full text-xs text-left border-collapse min-w-max">
                      <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                        <tr>
                          ${fields.map(f => `<th class="px-4 py-2 border-b border-surface-200 text-surface-700 font-bold uppercase">${escapeHtml(f)}</th>`).join('')}
                        </tr>
                      </thead>
                      <tbody>
                        ${data.slice(0, 500).map(row => `
                          <tr class="hover:bg-surface-50 border-b border-surface-50 transition-colors">
                            ${fields.map(f => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(JSON.stringify(row[f]))}</td>`).join('')}
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                  <pre id="view-schema" class="hidden p-6 text-[12px] font-mono text-blue-600 bg-surface-50 h-full">${escapeHtml(JSON.stringify(schemaObj, null, 2))}</pre>
                  <pre id="view-json" class="hidden p-6 text-[12px] font-mono text-surface-600 bg-white h-full">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
                </div>
              </div>
            `);

            const tabs = { table: document.getElementById('tab-table'), schema: document.getElementById('tab-schema'), json: document.getElementById('tab-json') };
            const views = { table: document.getElementById('view-table'), schema: document.getElementById('view-schema'), json: document.getElementById('view-json') };

            Object.keys(tabs).forEach(k => {
               tabs[k].onclick = () => {
                  Object.values(tabs).forEach(t => t.classList.replace('border-brand-500', 'border-transparent'));
                  Object.values(tabs).forEach(t => t.classList.replace('text-brand-600', 'text-surface-400'));
                  tabs[k].classList.replace('border-transparent', 'border-brand-500');
                  tabs[k].classList.replace('text-surface-400', 'text-brand-600');
                  Object.values(views).forEach(v => v.classList.add('hidden'));
                  views[k].classList.remove('hidden');
               };
            });
          };

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Processing this Avro file failed. It may be corrupted.</div>`);
        }
      }
    });
  };
})();
