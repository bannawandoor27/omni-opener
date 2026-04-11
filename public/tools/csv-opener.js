/**
 * OmniOpener — CSV Opener Tool
 * Uses OmniTool SDK, PapaParse, Chart.js, and jsPDF.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.csv,.tsv,.txt',
      dropLabel: 'Drop a .csv or .tsv file here',
      binary: false,
      infoHtml: '<strong>CSV Toolkit:</strong> Professional-grade CSV viewer with sorting, filtering, charting, and pivot tables.',
      
      actions: [
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data) {
              const csv = Papa.unparse(data);
              helpers.download(helpers.getFile().name, csv, 'text/csv');
            }
          }
        },
        {
          label: '📄 Export PDF',
          id: 'export-pdf',
          onClick: function (helpers) {
             exportToPdf(helpers);
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      },

      onFile: function _onFile(file, content, helpers) {
        if (typeof Papa === 'undefined' || typeof Chart === 'undefined') {
          helpers.showLoading('Loading engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing CSV...');
        
        Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: function(results) {
            renderApp(results, file, helpers);
          },
          error: function(err) {
            helpers.showError('Failed to parse CSV', err.message);
          }
        });
      }
    });
  };

  function exportToPdf(helpers) {
    const { jsPDF } = window.jspdf;
    const element = document.getElementById('csv-content');
    helpers.showLoading('Generating PDF...');
    html2canvas(element).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(helpers.getFile().name.replace(/\.[^/.]+$/, "") + ".pdf");
      helpers.hideLoading();
    });
  }

  function renderApp(results, file, helpers) {
    const data = results.data;
    const fields = results.meta.fields || [];
    helpers.setState('parsedData', data);
    helpers.setState('fields', fields);

    if (data.length === 0) {
      helpers.render(`
        <div class="flex flex-col items-center justify-center h-64 text-surface-400">
          <span class="text-4xl mb-2">📊</span>
          <p class="font-medium">No data found in this file</p>
        </div>
      `);
      return;
    }

    const fileSize = formatBytes(file.size);
    const renderHtml = `
      <div class="flex flex-col h-[80vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <!-- Header -->
        <div class="shrink-0 bg-surface-50 border-b border-surface-200">
          <div class="flex items-center justify-between px-4 py-2 text-xs text-surface-500 font-medium">
            <div class="flex items-center gap-2 truncate mr-4">
              <span class="text-lg">📊</span>
              <span class="truncate">${escapeHtml(file.name)}</span>
            </div>
            <div class="shrink-0 flex items-center gap-3">
              <span>${fileSize}</span>
              <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
              <span>${data.length.toLocaleString()} rows</span>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex px-2 border-b border-surface-200 bg-white">
            <button id="tab-table" class="px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600 transition-colors">Table View</button>
            <button id="tab-chart" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300 transition-colors">Visualize</button>
            <button id="tab-pivot" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300 transition-colors">Pivot Table</button>
          </div>
        </div>

        <!-- Content Area -->
        <div id="csv-content" class="flex-1 overflow-hidden relative bg-white">
          <!-- Table Tab -->
          <div id="view-table" class="absolute inset-0 flex flex-col">
            <!-- Search & Controls -->
            <div class="px-3 py-2 border-b border-surface-100 flex items-center gap-2">
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                <input type="text" id="csv-search" 
                  placeholder="Filter rows..." 
                  class="w-full pl-9 pr-4 py-1.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                >
              </div>
              <div class="relative group">
                <button id="btn-toggle-cols" class="px-3 py-1.5 bg-white border border-surface-200 text-surface-600 text-xs font-bold rounded-lg hover:bg-surface-50 flex items-center gap-2">
                  <span>📑 Columns</span>
                  <span class="text-[10px] opacity-50">▼</span>
                </button>
                <div id="col-dropdown" class="hidden absolute right-0 mt-2 w-48 bg-white border border-surface-200 rounded-xl shadow-xl z-50 p-2 max-h-64 overflow-auto">
                   ${fields.map(f => `
                     <label class="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-50 rounded-lg cursor-pointer transition-colors">
                        <input type="checkbox" checked data-col="${escapeHtml(f)}" class="col-toggle accent-brand-500 w-3.5 h-3.5">
                        <span class="text-xs text-surface-700 truncate">${escapeHtml(f)}</span>
                     </label>
                   `).join('')}
                </div>
              </div>
            </div>
            
            <div class="flex-1 overflow-auto">
              <table class="w-full text-sm text-left border-collapse min-w-max">
                <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                  <tr>
                    <th class="px-4 py-3 border-b border-surface-200 text-xs font-bold text-surface-400 uppercase tracking-wider w-12 text-center">#</th>
                    ${fields.map(f => `
                      <th data-field="${escapeHtml(f)}" class="csv-header px-4 py-3 border-b border-surface-200 text-xs font-bold text-surface-700 uppercase tracking-wider cursor-pointer hover:bg-surface-100 transition-colors">
                        <div class="flex items-center gap-2">
                          ${escapeHtml(f)}
                          <span class="sort-icon opacity-20 text-[10px]">⇅</span>
                        </div>
                      </th>
                    `).join('')}
                  </tr>
                </thead>
                <tbody id="csv-body">
                  ${renderRows(data, fields)}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Chart Tab -->
          <div id="view-chart" class="absolute inset-0 hidden flex flex-col p-6 bg-surface-50 overflow-auto">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Chart Type</label>
                <select id="chart-type" class="w-full text-sm border border-surface-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="bar">Bar Chart</option>
                  <option value="line">Line Chart</option>
                  <option value="pie">Pie Chart</option>
                  <option value="doughnut">Doughnut</option>
                </select>
              </div>
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">X-Axis (Labels)</label>
                <select id="chart-x" class="w-full text-sm border border-surface-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  ${fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
                </select>
              </div>
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Y-Axis (Values)</label>
                <select id="chart-y" class="w-full text-sm border border-surface-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
                  ${fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
                </select>
              </div>
            </div>
            
            <div class="flex-1 min-h-[400px] bg-white rounded-2xl border border-surface-200 shadow-sm p-6 flex flex-col">
              <div class="flex-1 relative">
                <canvas id="csv-chart-canvas"></canvas>
              </div>
            </div>
          </div>

          <!-- Pivot Tab -->
          <div id="view-pivot" class="absolute inset-0 hidden flex flex-col p-6 bg-surface-50 overflow-auto">
             <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                  <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Group By</label>
                  <select id="pivot-group" class="w-full text-sm border border-surface-200 rounded-lg p-2">
                    ${fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
                  </select>
                </div>
                <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                  <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Value (Sum)</label>
                  <select id="pivot-value" class="w-full text-sm border border-surface-200 rounded-lg p-2">
                    ${fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
                  </select>
                </div>
             </div>
             <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <table class="w-full text-sm text-left border-collapse">
                   <thead class="bg-surface-50">
                      <tr>
                         <th id="pivot-header-group" class="px-4 py-3 border-b border-surface-200 text-xs font-bold text-surface-700 uppercase">Group</th>
                         <th id="pivot-header-value" class="px-4 py-3 border-b border-surface-200 text-xs font-bold text-surface-700 uppercase">Sum</th>
                      </tr>
                   </thead>
                   <tbody id="pivot-body"></tbody>
                </table>
             </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(renderHtml);

    // Navigation
    const tabs = {
      'tab-table': 'view-table',
      'tab-chart': 'view-chart',
      'tab-pivot': 'view-pivot'
    };

    Object.keys(tabs).forEach(tabId => {
      document.getElementById(tabId).onclick = () => {
        Object.keys(tabs).forEach(id => {
          document.getElementById(id).className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 hover:border-surface-300 transition-colors';
          document.getElementById(tabs[id]).classList.add('hidden');
        });
        document.getElementById(tabId).className = 'px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600 transition-colors';
        document.getElementById(tabs[tabId]).classList.remove('hidden');
        if (tabId === 'tab-chart') updateChart();
        if (tabId === 'tab-pivot') updatePivot();
      };
    });

    // Table Logic
    let sortField = null;
    let sortDir = 1;
    let visibleCols = new Set(fields);
    const searchInput = document.getElementById('csv-search');
    const tbody = document.getElementById('csv-body');
    const headers = document.querySelectorAll('.csv-header');
    const toggleBtn = document.getElementById('btn-toggle-cols');
    const colDropdown = document.getElementById('col-dropdown');
    const colCheckboxes = document.querySelectorAll('.col-toggle');

    if (toggleBtn) {
       toggleBtn.onclick = (e) => {
          e.stopPropagation();
          colDropdown.classList.toggle('hidden');
       };
       document.addEventListener('click', () => colDropdown.classList.add('hidden'));
       colDropdown.onclick = (e) => e.stopPropagation();
    }

    colCheckboxes.forEach(cb => {
       cb.onchange = () => {
          const field = cb.getAttribute('data-col');
          if (cb.checked) visibleCols.add(field);
          else visibleCols.delete(field);
          updateTableHeader();
          updateTable();
       };
    });

    function updateTableHeader() {
       headers.forEach(h => {
          const field = h.getAttribute('data-field');
          h.classList.toggle('hidden', !visibleCols.has(field));
       });
    }

    function renderRows(rows, cols) {
      const limit = 500;
      const toShow = rows.slice(0, limit);
      const activeCols = cols.filter(f => visibleCols.has(f));
      return toShow.map((row, i) => `
        <tr class="hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-0">
          <td class="px-4 py-2 text-surface-300 font-mono text-[10px] text-center bg-surface-50/50 sticky left-0 z-10">${i + 1}</td>
          ${activeCols.map(f => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs border-r border-surface-50 last:border-0">${escapeHtml(String(row[f] ?? ''))}</td>`).join('')}
        </tr>
      `).join('') + (rows.length > limit ? `<tr><td colspan="${activeCols.length + 1}" class="p-4 text-center text-surface-400 bg-surface-50 italic">Showing first ${limit} rows.</td></tr>` : '');
    }

    function updateTable() {
      if (!tbody) return;
      const term = searchInput ? searchInput.value.toLowerCase() : '';
      let filtered = data;
      if (term) {
        filtered = data.filter(row => fields.some(f => String(row[f]).toLowerCase().includes(term)));
      }
      if (sortField) {
        filtered.sort((a, b) => {
          const valA = a[sortField];
          const valB = b[sortField];
          if (valA < valB) return -1 * sortDir;
          if (valA > valB) return 1 * sortDir;
          return 0;
        });
      }
      tbody.innerHTML = renderRows(filtered, fields);
    }

    if (searchInput) searchInput.addEventListener('input', updateTable);
    headers.forEach(h => {
      h.addEventListener('click', () => {
        const field = h.getAttribute('data-field');
        if (sortField === field) sortDir *= -1;
        else { sortField = field; sortDir = 1; }
        headers.forEach(header => {
          const icon = header.querySelector('.sort-icon');
          if (header === h) {
            icon.textContent = sortDir === 1 ? '↑' : '↓';
            icon.classList.remove('opacity-20');
            icon.classList.add('text-brand-600', 'opacity-100');
          } else {
            icon.textContent = '⇅';
            icon.classList.add('opacity-20');
            icon.classList.remove('text-brand-600', 'opacity-100');
          }
        });
        updateTable();
      });
    });

    // Chart Logic
    let myChart = null;
    function updateChart() {
      const canvas = document.getElementById('csv-chart-canvas');
      if (!canvas) return;
      if (myChart) myChart.destroy();
      const ctx = canvas.getContext('2d');
      const xKey = document.getElementById('chart-x').value;
      const yKey = document.getElementById('chart-y').value;
      const type = document.getElementById('chart-type').value;

      const maxPoints = 50;
      const sampledData = data.slice(0, maxPoints);
      const labels = sampledData.map(d => String(d[xKey]));
      const values = sampledData.map(d => {
        const val = d[yKey];
        return typeof val === 'number' ? val : parseFloat(val) || 0;
      });

      myChart = new Chart(ctx, {
        type: type,
        data: {
          labels: labels,
          datasets: [{
            label: yKey,
            data: values,
            backgroundColor: (type === 'pie' || type === 'doughnut') 
              ? sampledData.map((_, i) => `hsl(${(i * 360) / Math.min(sampledData.length, 12)}, 70%, 60%)`)
              : '#4f46e5',
            borderColor: '#4f46e5',
            borderWidth: type === 'bar' ? 0 : 2,
            fill: type === 'line',
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              display: type === 'pie' || type === 'doughnut',
              position: 'right', 
              labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 } } 
            }
          },
          scales: (type === 'pie' || type === 'doughnut') ? {} : {
            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 } }
          }
        }
      });
    }

    ['chart-type', 'chart-x', 'chart-y'].forEach(id => {
      document.getElementById(id).addEventListener('change', updateChart);
    });

    // Pivot Logic
    function updatePivot() {
      const groupKey = document.getElementById('pivot-group').value;
      const valueKey = document.getElementById('pivot-value').value;
      const pivotBody = document.getElementById('pivot-body');
      
      document.getElementById('pivot-header-group').textContent = groupKey;
      document.getElementById('pivot-header-value').textContent = 'Sum of ' + valueKey;

      const groups = {};
      data.forEach(row => {
        const g = String(row[groupKey]);
        const v = parseFloat(row[valueKey]) || 0;
        groups[g] = (groups[g] || 0) + v;
      });

      pivotBody.innerHTML = Object.entries(groups).map(([g, v]) => `
        <tr class="hover:bg-surface-50 border-b border-surface-100 last:border-0">
          <td class="px-4 py-2 text-surface-700 font-medium">${escapeHtml(g)}</td>
          <td class="px-4 py-2 text-surface-600 font-mono">${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
        </tr>
      `).join('');
    }

    ['pivot-group', 'pivot-value'].forEach(id => {
      document.getElementById(id).addEventListener('change', updatePivot);
    });
  }
})();

