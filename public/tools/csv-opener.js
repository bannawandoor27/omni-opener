/**
 * OmniOpener — CSV Opener Tool
 * Uses OmniTool SDK, PapaParse, Chart.js, and jsPDF.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
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
      infoHtml: '<strong>CSV Toolkit:</strong> Professional-grade CSV viewer with sorting, filtering, charting, and advanced statistics.',
      
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
        }
      ],

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
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
            helpers.setState({
              parsedData: results.data,
              fields: results.meta.fields || [],
              fileName: file.name,
              fileSize: formatBytes(file.size),
              view: 'table',
              sortField: null,
              sortDir: 1,
              searchTerm: ''
            });
            renderApp(helpers);
          },
          error: function(err) {
            helpers.showError('Failed to parse CSV', err.message);
          }
        });
      }
    });
  };

  function renderApp(helpers) {
    const state = helpers.getState();
    const data = state.parsedData;
    const fields = state.fields;

    if (!data || data.length === 0) {
      helpers.render(`<div class="p-12 text-center text-surface-400 italic">No data found in file.</div>`);
      return;
    }

    const renderHtml = `
      <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
        <!-- Header -->
        <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">📊</span>
            <div class="space-y-0.5">
              <h3 class="text-sm font-bold text-surface-900 truncate max-w-md">${escapeHtml(state.fileName)}</h3>
              <p class="text-[10px] text-surface-400 font-bold uppercase tracking-wider">${state.fileSize} • ${data.length.toLocaleString()} Rows</p>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="shrink-0 flex px-4 bg-white border-b border-surface-100 gap-4">
          <button id="tab-table" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'table' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Table</button>
          <button id="tab-stats" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'stats' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Statistics</button>
          <button id="tab-chart" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'chart' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Visualize</button>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-hidden relative">
          <!-- Table View -->
          <div id="view-table" class="absolute inset-0 flex flex-col ${state.view === 'table' ? '' : 'hidden'}">
            <div class="shrink-0 px-4 py-2 border-b border-surface-100 bg-surface-50/30 flex gap-2">
              <div class="relative flex-1 max-w-sm">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs">🔍</span>
                <input type="text" id="csv-search" value="${escapeHtml(state.searchTerm)}" placeholder="Search rows..." class="w-full pl-9 pr-4 py-1.5 text-xs border border-surface-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 bg-white">
              </div>
            </div>
            <div class="flex-1 overflow-auto">
              <table class="w-full text-xs text-left border-collapse min-w-max">
                <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                  <tr>
                    <th class="px-4 py-3 border-b border-surface-200 text-surface-400 w-12 text-center font-mono">#</th>
                    ${fields.map(f => `
                      <th data-field="${escapeHtml(f)}" class="csv-header px-4 py-3 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider cursor-pointer hover:bg-surface-100 transition-colors">
                        <div class="flex items-center gap-2">
                          ${escapeHtml(f)}
                          ${state.sortField === f ? (state.sortDir === 1 ? '🔼' : '🔽') : ''}
                        </div>
                      </th>
                    `).join('')}
                  </tr>
                </thead>
                <tbody id="csv-body">
                  ${renderRows(helpers)}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Stats View -->
          <div id="view-stats" class="absolute inset-0 overflow-auto p-6 bg-surface-50 ${state.view === 'stats' ? '' : 'hidden'}">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              ${fields.map(f => {
                const stats = calculateColumnStats(data.map(r => r[f]));
                if (!stats) return '';
                return `
                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm space-y-4">
                    <h4 class="text-xs font-bold text-brand-600 uppercase tracking-widest border-b border-surface-100 pb-2">${escapeHtml(f)}</h4>
                    <div class="grid grid-cols-2 gap-4">
                      <div><p class="text-[9px] font-bold text-surface-400 uppercase">Mean</p><p class="text-sm font-mono text-surface-900">${stats.mean.toLocaleString()}</p></div>
                      <div><p class="text-[9px] font-bold text-surface-400 uppercase">Median</p><p class="text-sm font-mono text-surface-900">${stats.median.toLocaleString()}</p></div>
                      <div><p class="text-[9px] font-bold text-surface-400 uppercase">Std Dev</p><p class="text-sm font-mono text-surface-900">${stats.stdDev.toLocaleString()}</p></div>
                      <div><p class="text-[9px] font-bold text-surface-400 uppercase">Min / Max</p><p class="text-[11px] font-mono text-surface-900">${stats.min} / ${stats.max}</p></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Chart View -->
          <div id="view-chart" class="absolute inset-0 overflow-auto p-6 bg-surface-50 ${state.view === 'chart' ? '' : 'hidden'}">
            <div class="bg-white p-6 rounded-2xl border border-surface-200 shadow-sm flex flex-col h-full space-y-6">
              <div class="grid grid-cols-3 gap-4 shrink-0">
                <div class="space-y-1">
                  <label class="text-[9px] font-bold text-surface-400 uppercase tracking-wider">X-Axis</label>
                  <select id="chart-x" class="w-full text-xs border border-surface-200 rounded-lg p-2 bg-surface-50">
                    ${fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-[9px] font-bold text-surface-400 uppercase tracking-wider">Y-Axis</label>
                  <select id="chart-y" class="w-full text-xs border border-surface-200 rounded-lg p-2 bg-surface-50">
                    ${fields.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-[9px] font-bold text-surface-400 uppercase tracking-wider">Chart Type</label>
                  <select id="chart-type" class="w-full text-xs border border-surface-200 rounded-lg p-2 bg-surface-50">
                    <option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option>
                  </select>
                </div>
              </div>
              <div class="flex-1 relative min-h-[400px]">
                <canvas id="csv-chart-canvas"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(renderHtml);

    // Tab Listeners
    ['table', 'stats', 'chart'].forEach(v => {
      document.getElementById('tab-' + v).onclick = () => {
        helpers.setState('view', v);
        renderApp(helpers);
        if (v === 'chart') updateChart(helpers);
      };
    });

    // Table Events
    const searchInput = document.getElementById('csv-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        helpers.setState('searchTerm', e.target.value);
        document.getElementById('csv-body').innerHTML = renderRows(helpers);
      };
    }

    document.querySelectorAll('.csv-header').forEach(h => {
      h.onclick = () => {
        const field = h.dataset.field;
        if (state.sortField === field) helpers.setState('sortDir', state.sortDir * -1);
        else helpers.setState({ sortField: field, sortDir: 1 });
        renderApp(helpers);
      };
    });

    if (state.view === 'chart') updateChart(helpers);
  }

  function renderRows(helpers) {
    const state = helpers.getState();
    const fields = state.fields;
    let rows = state.parsedData;

    const term = (state.searchTerm || '').toLowerCase();
    if (term) {
      rows = rows.filter(r => fields.some(f => String(r[f]).toLowerCase().includes(term)));
    }

    if (state.sortField) {
      rows.sort((a, b) => {
        const va = a[state.sortField];
        const vb = b[state.sortField];
        if (va === vb) return 0;
        return (va < vb ? -1 : 1) * state.sortDir;
      });
    }

    const limit = 500;
    return rows.slice(0, limit).map((row, i) => `
      <tr class="hover:bg-surface-50 border-b border-surface-50 transition-colors">
        <td class="px-4 py-2 text-surface-300 font-mono text-center sticky left-0 bg-white shadow-sm z-10">${i + 1}</td>
        ${fields.map(f => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(String(row[f] ?? ''))}</td>`).join('')}
      </tr>
    `).join('') + (rows.length > limit ? `<tr><td colspan="${fields.length + 1}" class="p-4 text-center text-surface-400 italic bg-surface-50/20">Showing first 500 rows.</td></tr>` : '');
  }

  function calculateColumnStats(values) {
    const nums = values.map(v => typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : parseFloat(v)).filter(v => !isNaN(v));
    if (nums.length === 0) return null;
    
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / nums.length;
    
    const sorted = [...nums].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 ? (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2 : sorted[Math.floor(sorted.length/2)];
    
    const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean: parseFloat(mean.toFixed(2)),
      median: parseFloat(median.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      min: Math.min(...nums),
      max: Math.max(...nums),
      sum: sum
    };
  }

  let myChart = null;
  function updateChart(helpers) {
    const canvas = document.getElementById('csv-chart-canvas');
    if (!canvas) return;
    if (myChart) myChart.destroy();
    
    const state = helpers.getState();
    const xKey = document.getElementById('chart-x').value;
    const yKey = document.getElementById('chart-y').value;
    const type = document.getElementById('chart-type').value;
    
    const sampled = state.parsedData.slice(0, 50);
    
    myChart = new Chart(canvas.getContext('2d'), {
      type: type,
      data: {
        labels: sampled.map(d => String(d[xKey])),
        datasets: [{
          label: yKey,
          data: sampled.map(d => parseFloat(d[yKey]) || 0),
          backgroundColor: '#4f46e5',
          borderColor: '#4f46e5'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });

    ['chart-x', 'chart-y', 'chart-type'].forEach(id => {
      document.getElementById(id).onchange = () => updateChart(helpers);
    });
  }
})();
