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

  function formatSize(b) {
    if (!b || b < 0) return '0 B';
    if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
    if (b > 1e3) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xlsx,.xls,.ods',
      dropLabel: 'Drop a spreadsheet here',
      binary: true,
      infoHtml: '<strong>XLSX Toolkit:</strong> Professional spreadsheet viewer with multi-sheet tabs, column sorting, and statistics.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      onFile: function _onFile(file, content, helpers) {
        if (typeof XLSX === 'undefined' || typeof Chart === 'undefined') {
          helpers.showLoading('Loading spreadsheet engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing spreadsheet...');

        try {
          const workbook = XLSX.read(content, { type: 'array' });
          const firstSheet = workbook.SheetNames[0];
          
          helpers.setState({
            workbook: workbook,
            activeSheet: firstSheet,
            sortCol: null,
            sortDir: 1,
            searchTerm: '',
            fileName: file.name,
            fileSize: file.size
          });

          renderApp(helpers);
        } catch (err) {
          helpers.showError('XLSX Parse Error', err.message);
        }
      },

      actions: [
        {
          label: '📥 Export JSON',
          onClick: function (helpers) {
            const workbook = helpers.getState().workbook;
            if (!workbook) return;
            const result = {};
            workbook.SheetNames.forEach(name => {
              result[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name]);
            });
            helpers.download(helpers.getState().fileName.replace(/\.[^.]+$/i, '.json'), JSON.stringify(result, null, 2), 'application/json');
          }
        }
      ]
    });

    function renderApp(helpers) {
      const state = helpers.getState();
      const workbook = state.workbook;
      const sheetName = state.activeSheet;
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const fields = data.length > 0 ? data[0] : [];
      let rows = data.slice(1);

      // Filtering
      const term = (state.searchTerm || '').toLowerCase();
      if (term) {
        rows = rows.filter(row => row.some(cell => String(cell || '').toLowerCase().includes(term)));
      }

      // Sorting
      if (state.sortCol !== null) {
        rows.sort((a, b) => {
          const valA = a[state.sortCol];
          const valB = b[state.sortCol];
          if (valA === valB) return 0;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;
          return (valA < valB ? -1 : 1) * state.sortDir;
        });
      }

      helpers.render(`
        <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
          <!-- Header -->
          <div class="shrink-0 bg-surface-50 border-b border-surface-200">
            <div class="px-4 py-3 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-xl">📊</span>
                <div class="space-y-0.5">
                  <h3 class="text-sm font-bold text-surface-900">${escapeHtml(state.fileName)}</h3>
                  <p class="text-[10px] text-surface-400 font-bold uppercase tracking-wider">${workbook.SheetNames.length} Sheets • ${formatSize(state.fileSize)}</p>
                </div>
              </div>
            </div>

            <!-- Sheets Tabs -->
            <div class="flex px-4 bg-white border-t border-surface-100 overflow-x-auto no-scrollbar gap-1">
              ${workbook.SheetNames.map(name => `
                <button data-sheet="${escapeHtml(name)}" class="sheet-tab px-4 py-2 text-[11px] font-bold whitespace-nowrap transition-all border-b-2 ${name === sheetName ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400 hover:text-surface-600'}">${escapeHtml(name)}</button>
              `).join('')}
            </div>

            <!-- View Tabs -->
            <div class="flex px-4 bg-surface-50 border-t border-surface-100 gap-4">
               <button id="view-tab-table" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'charts' || state.view === 'stats' ? 'border-transparent text-surface-400' : 'border-brand-500 text-brand-600'}">Table</button>
               <button id="view-tab-stats" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'stats' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Statistics</button>
               <button id="view-tab-charts" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'charts' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Charts</button>
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-hidden relative">
            <!-- Table View -->
            <div id="view-table" class="absolute inset-0 flex flex-col bg-white ${state.view && state.view !== 'table' ? 'hidden' : ''}">
              <div class="shrink-0 px-4 py-3 border-b border-surface-100 bg-surface-50/30 flex gap-4 items-center">
                <div class="relative flex-1 max-w-md">
                   <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs">🔍</span>
                   <input type="text" id="xlsx-search" placeholder="Search rows..." value="${escapeHtml(state.searchTerm)}" class="w-full pl-9 pr-4 py-2 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 bg-white shadow-sm">
                </div>
                <div class="text-[10px] font-bold text-surface-400 uppercase">${rows.length.toLocaleString()} rows found</div>
              </div>
              <div class="flex-1 overflow-auto">
                <table class="w-full text-xs text-left border-collapse min-w-max">
                  <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                    <tr>
                      <th class="px-4 py-3 border-b border-surface-200 text-surface-400 w-12 text-center font-mono">#</th>
                      ${fields.map((f, i) => `
                        <th class="px-4 py-3 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider cursor-pointer hover:bg-surface-100 transition-colors sort-header" data-col="${i}">
                          <div class="flex items-center gap-2">
                            ${escapeHtml(f || '')}
                            ${state.sortCol === i ? (state.sortDir === 1 ? '🔼' : '🔽') : ''}
                          </div>
                        </th>
                      `).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.slice(0, 500).map((row, i) => `
                      <tr class="hover:bg-surface-50 border-b border-surface-50 transition-colors">
                        <td class="px-4 py-2 text-surface-300 font-mono text-center bg-surface-50/10 sticky left-0">${i + 1}</td>
                        ${fields.map((_, j) => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(row[j] ?? '')}</td>`).join('')}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                ${rows.length > 500 ? `<div class="p-8 text-center text-surface-400 italic bg-surface-50/20">Showing first 500 rows. Use search to find specific data.</div>` : ''}
              </div>
            </div>

            <!-- Stats View -->
            <div id="view-stats" class="absolute inset-0 overflow-auto p-6 bg-surface-50 ${state.view === 'stats' ? '' : 'hidden'}">
               <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  ${fields.map((f, i) => {
                    const stats = calculateStats(rows.map(r => r[i]));
                    if (!stats) return '';
                    return `
                      <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm space-y-4">
                        <h4 class="text-xs font-bold text-brand-600 uppercase tracking-widest border-b border-surface-100 pb-2">${escapeHtml(f || 'Column ' + (i+1))}</h4>
                        <div class="grid grid-cols-2 gap-4">
                          <div><p class="text-[9px] font-bold text-surface-400 uppercase">Sum</p><p class="text-sm font-mono text-surface-900">${stats.sum.toLocaleString()}</p></div>
                          <div><p class="text-[9px] font-bold text-surface-400 uppercase">Average</p><p class="text-sm font-mono text-surface-900">${stats.avg.toLocaleString()}</p></div>
                          <div><p class="text-[9px] font-bold text-surface-400 uppercase">Min</p><p class="text-sm font-mono text-surface-900">${stats.min.toLocaleString()}</p></div>
                          <div><p class="text-[9px] font-bold text-surface-400 uppercase">Max</p><p class="text-sm font-mono text-surface-900">${stats.max.toLocaleString()}</p></div>
                        </div>
                      </div>
                    `;
                  }).join('')}
               </div>
            </div>

            <!-- Charts View -->
            <div id="view-charts" class="absolute inset-0 overflow-auto p-6 bg-surface-50 ${state.view === 'charts' ? '' : 'hidden'}">
               <div class="bg-white p-6 rounded-2xl border border-surface-200 shadow-sm flex flex-col h-full space-y-6">
                  <div class="grid grid-cols-3 gap-4 shrink-0">
                    <div class="space-y-1">
                      <label class="text-[9px] font-bold text-surface-400 uppercase">X-Axis</label>
                      <select id="chart-x" class="w-full text-xs border border-surface-200 rounded-lg p-2 bg-surface-50">
                        ${fields.map((f, i) => `<option value="${i}">${escapeHtml(f || 'Col ' + (i+1))}</option>`).join('')}
                      </select>
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] font-bold text-surface-400 uppercase">Y-Axis</label>
                      <select id="chart-y" class="w-full text-xs border border-surface-200 rounded-lg p-2 bg-surface-50">
                        ${fields.map((f, i) => `<option value="${i}">${escapeHtml(f || 'Col ' + (i+1))}</option>`).join('')}
                      </select>
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] font-bold text-surface-400 uppercase">Type</label>
                      <select id="chart-type" class="w-full text-xs border border-surface-200 rounded-lg p-2 bg-surface-50">
                        <option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option>
                      </select>
                    </div>
                  </div>
                  <div class="flex-1 relative min-h-[400px]">
                    <canvas id="xlsx-chart-canvas"></canvas>
                  </div>
               </div>
            </div>
          </div>
        </div>
      `);

      // Event Listeners
      document.getElementById('xlsx-search').oninput = (e) => {
        helpers.setState('searchTerm', e.target.value);
        renderApp(helpers);
        document.getElementById('xlsx-search').focus();
      };

      helpers.getRenderEl().querySelectorAll('.sheet-tab').forEach(tab => {
        tab.onclick = () => {
          helpers.setState({ activeSheet: tab.dataset.sheet, sortCol: null });
          renderApp(helpers);
        };
      });

      helpers.getRenderEl().querySelectorAll('.sort-header').forEach(header => {
        header.onclick = () => {
          const col = parseInt(header.dataset.col);
          if (state.sortCol === col) {
            helpers.setState('sortDir', state.sortDir * -1);
          } else {
            helpers.setState({ sortCol: col, sortDir: 1 });
          }
          renderApp(helpers);
        };
      });

      document.getElementById('view-tab-table').onclick = () => { helpers.setState('view', 'table'); renderApp(helpers); };
      document.getElementById('view-tab-stats').onclick = () => { helpers.setState('view', 'stats'); renderApp(helpers); };
      document.getElementById('view-tab-charts').onclick = () => { helpers.setState('view', 'charts'); renderApp(helpers); updateChart(rows, fields); };

      if (state.view === 'charts') updateChart(rows, fields);
    }

    let myChart = null;
    function updateChart(rows, fields) {
      const canvas = document.getElementById('xlsx-chart-canvas');
      if (!canvas) return;
      if (myChart) myChart.destroy();
      const xIdx = parseInt(document.getElementById('chart-x').value);
      const yIdx = parseInt(document.getElementById('chart-y').value);
      const type = document.getElementById('chart-type').value;

      const sampled = rows.slice(0, 50);
      const labels = sampled.map(r => String(r[xIdx] || ''));
      const values = sampled.map(r => parseFloat(r[yIdx]) || 0);

      myChart = new Chart(canvas.getContext('2d'), {
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
        options: { responsive: true, maintainAspectRatio: false }
      });

      ['chart-x', 'chart-y', 'chart-type'].forEach(id => {
        document.getElementById(id).onchange = () => updateChart(rows, fields);
      });
    }

    function calculateStats(values) {
      const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
      if (nums.length === 0) return null;
      const sum = nums.reduce((a, b) => a + b, 0);
      return {
        sum: sum,
        avg: sum / nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums)
      };
    }
  };
})();
