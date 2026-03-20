/**
 * OmniOpener — Parquet Toolkit
 * Uses OmniTool SDK and hyparquet.
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
      accept: '.parquet',
      binary: true,
      infoHtml: '<strong>Parquet Toolkit:</strong> Professional Parquet viewer with schema inspection, table view, and data analysis.',
      
      onInit: async function(h) {
          try {
            const pqMod = await import('https://esm.sh/hyparquet@0.3.1');
            window.parquet = pqMod;
          } catch (e) {
            h.render(`<div class="p-12 text-center text-surface-400">Unable to load the Parquet processing engine.</div>`);
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

      onFile: async function (file, content, h) {
        if (typeof parquet === 'undefined') {
          h.showLoading('Loading Parquet engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing Parquet...');
        try {
          parquet.readParquet({
            file: content,
            onComplete: (records) => {
              h.setState('records', records);
              renderApp(records);
            }
          });

          const renderApp = (data) => {
            const fields = data.length > 0 ? Object.keys(data[0]) : [];
            
            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                  <div class="flex px-2">
                    <button id="tab-table" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Data Table</button>
                    <button id="tab-json" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Raw JSON</button>
                  </div>
                  <span class="px-4 text-[10px] font-mono text-surface-400">${data.length.toLocaleString()} rows</span>
                </div>

                <div id="pq-viewport" class="flex-1 overflow-auto bg-white">
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
                  <pre id="view-json" class="hidden p-6 text-[12px] font-mono text-surface-600 bg-white h-full">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
                </div>
              </div>
            `);

            const tabTable = document.getElementById('tab-table');
            const tabJson = document.getElementById('tab-json');
            const viewTable = document.getElementById('view-table');
            const viewJson = document.getElementById('view-json');

            tabTable.onclick = () => {
               tabTable.classList.replace('border-transparent', 'border-brand-500');
               tabTable.classList.replace('text-surface-400', 'text-brand-600');
               tabJson.classList.replace('border-brand-500', 'border-transparent');
               tabJson.classList.replace('text-brand-600', 'text-surface-400');
               viewTable.classList.remove('hidden');
               viewJson.classList.add('hidden');
            };

            tabJson.onclick = () => {
               tabJson.classList.replace('border-transparent', 'border-brand-500');
               tabJson.classList.replace('text-surface-400', 'text-brand-600');
               tabTable.classList.replace('border-brand-500', 'border-transparent');
               tabTable.classList.replace('text-brand-600', 'text-surface-400');
               viewJson.classList.remove('hidden');
               viewTable.classList.add('hidden');
            };
          };

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Parsing this Parquet file failed. It may be an incompatible format.</div>`);
        }
      }
    });
  };
})();
