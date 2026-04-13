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
      infoHtml: '<strong>Parquet Toolkit:</strong> Professional Parquet viewer with schema inspection, data statistics, and CSV export.',
      
      onInit: async function(h) {
          try {
            const pqMod = await import('https://esm.sh/hyparquet@0.3.1');
            window.parquet = pqMod;
            h.loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
          } catch (e) {
            h.render(`<div class="p-12 text-center text-surface-400">Unable to load the Parquet processing engine.</div>`);
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
               h.download(h.getFile().name.replace(/\.parquet$/i, '.csv'), csv, 'text/csv');
            }
          }
        }
      ],

      onFile: async function (file, content, h) {
        if (typeof parquet === 'undefined') {
          h.showLoading('Loading Parquet engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
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
            
            // Basic Statistics
            const stats = {};
            fields.forEach(f => {
               const values = data.map(r => r[f]).filter(v => typeof v === 'number');
               if (values.length > 0) {
                  stats[f] = {
                     min: Math.min(...values),
                     max: Math.max(...values),
                     avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)
                  };
               }
            });

            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                  <div class="flex px-2">
                    <button id="tab-table" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Data Table</button>
                    <button id="tab-stats" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Statistics</button>
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
                            ${fields.map(f => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(typeof row[f] === 'object' ? JSON.stringify(row[f]) : row[f])}</td>`).join('')}
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                  <div id="view-stats" class="hidden p-8 bg-surface-50 h-full">
                     <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                        ${Object.keys(stats).length === 0 ? '<p class="text-surface-400 italic">No numeric columns found for statistics.</p>' : Object.entries(stats).map(([f, s]) => `
                           <div class="bg-white border border-surface-200 rounded-xl p-4 shadow-sm">
                              <h4 class="text-[10px] font-bold text-brand-600 uppercase mb-3">${escapeHtml(f)}</h4>
                              <div class="grid grid-cols-3 gap-2 text-center">
                                 <div><p class="text-[9px] text-surface-400 uppercase">Min</p><p class="text-xs font-bold">${s.min}</p></div>
                                 <div><p class="text-[9px] text-surface-400 uppercase">Max</p><p class="text-xs font-bold">${s.max}</p></div>
                                 <div><p class="text-[9px] text-surface-400 uppercase">Avg</p><p class="text-xs font-bold">${s.avg}</p></div>
                              </div>
                           </div>
                        `).join('')}
                     </div>
                  </div>
                  <pre id="view-json" class="hidden p-6 text-[12px] font-mono text-surface-600 bg-white h-full">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
                </div>
              </div>
            `);

            const tabs = { table: document.getElementById('tab-table'), stats: document.getElementById('tab-stats'), json: document.getElementById('tab-json') };
            const views = { table: document.getElementById('view-table'), stats: document.getElementById('view-stats'), json: document.getElementById('view-json') };

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
           h.render(`<div class="p-12 text-center text-surface-400">Parsing this Parquet file failed. It may be an incompatible format.</div>`);
        }
      }
    });
  };
})();

