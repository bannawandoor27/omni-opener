/**
 * OmniOpener — XLSX Toolkit
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
      accept: '.xlsx,.xls,.ods',
      dropLabel: 'Drop a spreadsheet here',
      binary: true,
      infoHtml: '<strong>XLSX Toolkit:</strong> Professional spreadsheet viewer with multi-sheet tabs, row filtering, and in-browser charting.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      actions: [
        {
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (helpers) {
            const workbook = helpers.getState().workbook;
            if (workbook) {
              const result = {};
              workbook.SheetNames.forEach(name => {
                result[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name]);
              });
              helpers.download(helpers.getFile().name.replace(/\.[^.]+$/i, '.json'), JSON.stringify(result, null, 2), 'application/json');
            }
          }
        },
        {
          label: '📝 Export Markdown',
          id: 'export-md',
          onClick: function (helpers) {
             const workbook = helpers.getState().workbook;
             const sheetName = helpers.getState().activeSheet;
             if (workbook && sheetName) {
                const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
                if (data.length === 0) return;
                let md = "| " + data[0].join(" | ") + " |\n";
                md += "| " + data[0].map(() => "---").join(" | ") + " |\n";
                data.slice(1).forEach(row => {
                   md += "| " + row.map(cell => String(cell || "")).join(" | ") + " |\n";
                });
                helpers.download(`${helpers.getFile().name.replace(/\.[^.]+$/i, '')}-${sheetName}.md`, md, 'text/markdown');
             }
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        if (typeof XLSX === 'undefined' || typeof Chart === 'undefined') {
          helpers.showLoading('Loading spreadsheet engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing spreadsheet...');

        try {
          const workbook = XLSX.read(content, { type: 'array' });
          helpers.setState('workbook', workbook);
          
          const firstSheet = workbook.SheetNames[0];
          helpers.setState('activeSheet', firstSheet);

          const renderApp = (sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const fields = data.length > 0 ? data[0] : [];
            const rows = data.slice(1);

            helpers.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <!-- Header -->
                <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                  <div class="px-4 py-2 flex items-center justify-between text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                    <div class="flex items-center gap-2">
                       <span class="text-lg">📊</span>
                       <span class="text-surface-900">${escapeHtml(file.name)}</span>
                    </div>
                    <span>${workbook.SheetNames.length} Sheets</span>
                  </div>

                  <!-- Sheets Tabs -->
                  <div class="flex px-2 bg-white border-t border-surface-100 overflow-x-auto no-scrollbar">
                    ${workbook.SheetNames.map(name => `
                      <button data-sheet="${escapeHtml(name)}" class="sheet-tab px-4 py-2 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${name === sheetName ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400 hover:text-surface-600'}">${escapeHtml(name)}</button>
                    `).join('')}
                  </div>

                  <!-- Mode Tabs -->
                  <div class="flex px-2 bg-surface-50 border-t border-surface-100">
                     <button id="tab-table" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600 transition-colors">Table</button>
                     <button id="tab-charts" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Charts</button>
                  </div>
                </div>

                <!-- Content Area -->
                <div class="flex-1 overflow-hidden relative">
                   <!-- Table View -->
                   <div id="view-table" class="absolute inset-0 flex flex-col bg-white">
                      <div class="shrink-0 px-3 py-2 border-b border-surface-100 bg-surface-50/30">
                        <div class="relative">
                           <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                           <input type="text" id="xlsx-search" placeholder="Filter rows in ${escapeHtml(sheetName)}..." class="w-full pl-9 pr-4 py-1.5 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 bg-white">
                        </div>
                      </div>
                      <div class="flex-1 overflow-auto">
                        <table class="w-full text-xs text-left border-collapse min-w-max">
                          <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                            <tr>
                              <th class="px-4 py-2 border-b border-surface-200 text-surface-400 w-10 text-center">#</th>
                              ${fields.map(f => `<th class="px-4 py-2 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider">${escapeHtml(f || '')}</th>`).join('')}
                            </tr>
                          </thead>
                          <tbody id="xlsx-body">
                            ${renderRows(rows, fields.length)}
                          </tbody>
                        </table>
                      </div>
                   </div>

                   <!-- Charts View -->
                   <div id="view-charts" class="absolute inset-0 hidden flex flex-col p-6 bg-surface-50 overflow-auto">
                      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                         <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                            <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">X-Axis (Labels)</label>
                            <select id="chart-x" class="w-full text-xs border border-surface-200 rounded p-1.5">
                               ${fields.map((f, i) => `<option value="${i}">${escapeHtml(f || 'Col ' + (i+1))}</option>`).join('')}
                            </select>
                         </div>
                         <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                            <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Y-Axis (Values)</label>
                            <select id="chart-y" class="w-full text-xs border border-surface-200 rounded p-1.5">
                               ${fields.map((f, i) => `<option value="${i}">${escapeHtml(f || 'Col ' + (i+1))}</option>`).join('')}
                            </select>
                         </div>
                         <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                            <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Chart Type</label>
                            <select id="chart-type" class="w-full text-xs border border-surface-200 rounded p-1.5">
                               <option value="bar">Bar</option>
                               <option value="line">Line</option>
                               <option value="pie">Pie</option>
                            </select>
                         </div>
                      </div>
                      <div class="flex-1 bg-white rounded-2xl border border-surface-200 p-6 min-h-[400px] relative shadow-sm">
                         <canvas id="xlsx-chart-canvas"></canvas>
                      </div>
                   </div>
                </div>
              </div>
            `);

            // Event Listeners
            const searchInput = document.getElementById('xlsx-search');
            const tbody = document.getElementById('xlsx-body');
            const tabs = document.querySelectorAll('.sheet-tab');

            function renderRows(dataRows, colCount) {
               const limit = 500;
               const toShow = dataRows.slice(0, limit);
               return toShow.map((row, i) => `
                 <tr class="hover:bg-surface-50 border-b border-surface-50 transition-colors">
                   <td class="px-4 py-2 text-surface-300 font-mono text-center bg-surface-50/30 sticky left-0">${i + 1}</td>
                   ${Array.from({ length: colCount }).map((_, j) => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(row[j] ?? '')}</td>`).join('')}
                 </tr>
               `).join('') + (dataRows.length > limit ? `<tr><td colspan="${colCount + 1}" class="p-4 text-center text-surface-400 italic">Showing first ${limit} rows.</td></tr>` : '');
            }

            if (searchInput) {
               searchInput.addEventListener('input', () => {
                  const term = searchInput.value.toLowerCase();
                  const filtered = rows.filter(row => row.some(cell => String(cell).toLowerCase().includes(term)));
                  tbody.innerHTML = renderRows(filtered, fields.length);
               });
            }

            tabs.forEach(tab => {
               tab.onclick = () => {
                  const name = tab.getAttribute('data-sheet');
                  helpers.setState('activeSheet', name);
                  renderApp(name);
               };
            });

            // Mode Tabs Logic
            const tabTable = document.getElementById('tab-table');
            const tabCharts = document.getElementById('tab-charts');
            const viewTable = document.getElementById('view-table');
            const viewCharts = document.getElementById('view-charts');

            tabTable.onclick = () => {
               tabTable.className = 'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600 transition-colors';
               tabCharts.className = 'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors';
               viewTable.classList.remove('hidden');
               viewCharts.classList.add('hidden');
            };

            tabCharts.onclick = () => {
               tabCharts.className = 'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600 transition-colors';
               tabTable.className = 'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors';
               viewCharts.classList.remove('hidden');
               viewTable.classList.add('hidden');
               updateChart();
            };

            let myChart = null;
            function updateChart() {
               const canvas = document.getElementById('xlsx-chart-canvas');
               if (!canvas) return;
               if (myChart) myChart.destroy();
               const ctx = canvas.getContext('2d');
               const xIdx = parseInt(document.getElementById('chart-x').value);
               const yIdx = parseInt(document.getElementById('chart-y').value);
               const type = document.getElementById('chart-type').value;

               const sampled = rows.slice(0, 50);
               const labels = sampled.map(r => String(r[xIdx] || ''));
               const values = sampled.map(r => parseFloat(r[yIdx]) || 0);

               myChart = new Chart(ctx, {
                  type: type,
                  data: {
                     labels: labels,
                     datasets: [{
                        label: fields[yIdx] || 'Value',
                        data: values,
                        backgroundColor: type === 'pie' ? sampled.map((_, i) => `hsl(${(i * 360) / 10}, 70%, 60%)`) : '#4f46e5',
                        borderColor: '#4f46e5',
                        borderWidth: 1
                     }]
                  },
                  options: {
                     responsive: true,
                     maintainAspectRatio: false,
                     plugins: { legend: { display: type === 'pie' } }
                  }
               });
            }

            ['chart-x', 'chart-y', 'chart-type'].forEach(id => {
               document.getElementById(id).onchange = updateChart;
            });
          };

          renderApp(firstSheet);

        } catch (err) {
          helpers.showError('XLSX Parse Error', err.message);
        }
      }
    });
  };
})();

