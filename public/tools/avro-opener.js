/**
 * OmniOpener — Avro Toolkit
 * Uses OmniTool SDK, avsc, and PapaParse.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function flattenObject(ob) {
    const toReturn = {};
    for (const i in ob) {
      if (!ob.hasOwnProperty(i)) continue;
      if ((typeof ob[i]) == 'object' && ob[i] !== null && !Array.isArray(ob[i])) {
        const flatObject = flattenObject(ob[i]);
        for (const x in flatObject) {
          if (!flatObject.hasOwnProperty(x)) continue;
          toReturn[i + '.' + x] = flatObject[x];
        }
      } else {
        toReturn[i] = ob[i];
      }
    }
    return toReturn;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avro',
      binary: true,
      infoHtml: '<strong>Avro Toolkit:</strong> Advanced Avro viewer with nested field flattening, schema inspection, and CSV export.',
      
      onInit: async function(h) {
          try {
            const avscMod = await import('https://esm.sh/avsc@5.7.9');
            window.avsc = avscMod.default || avscMod;
            h.loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
          } catch (e) {
            h.render(`<div class="p-12 text-center text-surface-400">Unable to load the Avro processing engine.</div>`);
          }
      },

      actions: [
        {
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const data = h.getState().records;
            if (data && typeof Papa !== 'undefined') {
               const csv = Papa.unparse(data);
               h.download(h.getFile().name.replace(/\.avro$/i, '.csv'), csv, 'text/csv');
            }
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

          const renderApp = (data, schemaObj) => {
            const isFlattened = h.getState().isFlattened || false;
            const displayData = isFlattened ? data.map(r => flattenObject(r)) : data;
            const fields = displayData.length > 0 ? Object.keys(displayData[0]) : [];
            
            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                  <div class="flex px-2">
                    <button id="tab-table" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Data Table</button>
                    <button id="tab-schema" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Schema</button>
                  </div>
                  <div class="flex items-center gap-4">
                     <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="check-flatten" ${isFlattened ? 'checked' : ''} class="w-3 h-3 accent-brand-600">
                        <span class="text-[10px] font-bold text-surface-500 uppercase">Flatten</span>
                     </label>
                     <span class="px-4 text-[10px] font-mono text-surface-400">${data.length.toLocaleString()} records</span>
                  </div>
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
                        ${displayData.slice(0, 500).map(row => `
                          <tr class="hover:bg-surface-50 border-b border-surface-50 transition-colors">
                            ${fields.map(f => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(typeof row[f] === 'object' ? JSON.stringify(row[f]) : row[f])}</td>`).join('')}
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                  <pre id="view-schema" class="hidden p-6 text-[12px] font-mono text-blue-600 bg-surface-50 h-full">${escapeHtml(JSON.stringify(schemaObj, null, 2))}</pre>
                </div>
              </div>
            `);

            const tabs = { table: document.getElementById('tab-table'), schema: document.getElementById('tab-schema') };
            const views = { table: document.getElementById('view-table'), schema: document.getElementById('view-schema') };

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

            document.getElementById('check-flatten').onchange = (e) => {
               h.setState('isFlattened', e.target.checked);
               renderApp(data, schemaObj);
            };
          };

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Processing this Avro file failed. It may be corrupted.</div>`);
        }
      }
    });
  };
})();

