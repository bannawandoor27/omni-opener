/**
 * OmniOpener — ODS Toolkit
 * Uses OmniTool SDK, SheetJS, and Chart.js.
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
      accept: '.ods',
      binary: true,
      infoHtml: '<strong>ODS Toolkit:</strong> Professional OpenDocument spreadsheet viewer with tabs, charting, and Markdown export.',
      
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js');
        h.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      actions: [
        {
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const wb = h.getState().workbook;
            if (wb) {
              const res = {};
              wb.SheetNames.forEach(n => res[n] = XLSX.utils.sheet_to_json(wb.Sheets[n]));
              h.download(h.getFile().name.replace(/\.ods$/i, '.json'), JSON.stringify(res, null, 2));
            }
          }
        },
        {
          label: '📝 Export Markdown',
          id: 'export-md',
          onClick: function (h) {
             const wb = h.getState().workbook;
             const active = h.getState().activeSheet;
             if (wb && active) {
                const data = XLSX.utils.sheet_to_json(wb.Sheets[active], { header: 1 });
                if (data.length === 0) return;
                let md = "| " + data[0].join(" | ") + " |\n";
                md += "| " + data[0].map(() => "---").join(" | ") + " |\n";
                data.slice(1).forEach(r => { md += "| " + r.map(c => String(c || "")).join(" | ") + " |\n"; });
                h.download(`${h.getFile().name.replace(/\.ods$/i, '')}-${active}.md`, md, 'text/markdown');
             }
          }
        }
      ],

      onFile: function _onFile(file, content, h) {
        if (typeof XLSX === 'undefined' || typeof Chart === 'undefined') {
          h.showLoading('Loading engines...');
          setTimeout(() => _onFile(file, content, h), 500);
          return;
        }

        try {
          const workbook = XLSX.read(content, { type: 'array' });
          h.setState('workbook', workbook);
          
          const renderApp = (sheetName) => {
            h.setState('activeSheet', sheetName);
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const fields = data.length > 0 ? data[0] : [];
            const rows = data.slice(1);

            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                  <div class="px-4 py-2 flex items-center justify-between text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                    <span>📊 ${escapeHtml(file.name)}</span>
                    <div class="flex gap-2">
                       <button id="tab-table" class="px-2 py-0.5 rounded bg-brand-500 text-white">Table</button>
                       <button id="tab-charts" class="px-2 py-0.5 rounded bg-surface-200 text-surface-600">Charts</button>
                    </div>
                  </div>
                  <div class="flex px-2 bg-white border-t border-surface-100 overflow-x-auto no-scrollbar">
                    ${workbook.SheetNames.map(name => `
                      <button data-sheet="${escapeHtml(name)}" class="sheet-tab px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 ${name === sheetName ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">${escapeHtml(name)}</button>
                    `).join('')}
                  </div>
                </div>

                <div class="flex-1 overflow-hidden relative">
                   <div id="view-table" class="absolute inset-0 flex flex-col">
                      <div class="px-3 py-2 border-b border-surface-100 bg-surface-50/30">
                        <input type="text" id="ods-search" placeholder="Filter rows..." class="w-full px-3 py-1.5 text-xs border border-surface-200 rounded-lg outline-none bg-white">
                      </div>
                      <div class="flex-1 overflow-auto">
                        <table class="w-full text-xs text-left border-collapse min-w-max">
                          <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                            <tr>
                              ${fields.map(f => `<th class="px-4 py-2 border-b border-surface-200 text-surface-700 font-bold uppercase">${escapeHtml(f || '')}</th>`).join('')}
                            </tr>
                          </thead>
                          <tbody id="ods-body">${renderRows(rows, fields.length)}</tbody>
                        </table>
                      </div>
                   </div>
                   <div id="view-charts" class="absolute inset-0 hidden p-8 bg-surface-50 overflow-auto">
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                         <div class="bg-white p-4 rounded-xl border border-surface-200"><label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Labels (X)</label><select id="chart-x" class="w-full text-xs border rounded p-1">${fields.map((f, i) => `<option value="${i}">${escapeHtml(f || 'Col '+(i+1))}</option>`).join('')}</select></div>
                         <div class="bg-white p-4 rounded-xl border border-surface-200"><label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Values (Y)</label><select id="chart-y" class="w-full text-xs border rounded p-1">${fields.map((f, i) => `<option value="${i}">${escapeHtml(f || 'Col '+(i+1))}</option>`).join('')}</select></div>
                      </div>
                      <div class="h-[400px] bg-white rounded-2xl border border-surface-200 p-6 relative"><canvas id="ods-chart"></canvas></div>
                   </div>
                </div>
              </div>
            `);

            const searchInput = document.getElementById('ods-search');
            const tbody = document.getElementById('ods-body');
            function renderRows(dataRows, colCount) {
               return dataRows.slice(0, 500).map(row => `
                 <tr class="hover:bg-surface-50 border-b border-surface-50">
                   ${Array.from({ length: colCount }).map((_, j) => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(row[j] ?? '')}</td>`).join('')}
                 </tr>
               `).join('');
            }
            searchInput.oninput = () => {
               const term = searchInput.value.toLowerCase();
               const filtered = rows.filter(row => row.some(c => String(c).toLowerCase().includes(term)));
               tbody.innerHTML = renderRows(filtered, fields.length);
            };
            document.querySelectorAll('.sheet-tab').forEach(t => {
               t.onclick = () => renderApp(t.getAttribute('data-sheet'));
            });

            document.getElementById('tab-table').onclick = () => {
               document.getElementById('view-table').classList.remove('hidden');
               document.getElementById('view-charts').classList.add('hidden');
            };
            document.getElementById('tab-charts').onclick = () => {
               document.getElementById('view-charts').classList.remove('hidden');
               document.getElementById('view-table').classList.add('hidden');
               updateChart();
            };

            let myChart = null;
            function updateChart() {
               const canvas = document.getElementById('ods-chart');
               if (!canvas) return;
               if (myChart) myChart.destroy();
               const xIdx = document.getElementById('chart-x').value;
               const yIdx = document.getElementById('chart-y').value;
               const sampled = rows.slice(0, 50);
               myChart = new Chart(canvas.getContext('2d'), {
                  type: 'bar',
                  data: {
                     labels: sampled.map(r => String(r[xIdx] || '')),
                     datasets: [{ label: fields[yIdx], data: sampled.map(r => parseFloat(r[yIdx]) || 0), backgroundColor: '#4f46e5' }]
                  },
                  options: { responsive: true, maintainAspectRatio: false }
               });
            }
            ['chart-x', 'chart-y'].forEach(id => document.getElementById(id).onchange = updateChart);
          };
          renderApp(workbook.SheetNames[0]);
        } catch (err) { h.showError('ODS Parse Error', err.message); }
      }
    });
  };
})();

