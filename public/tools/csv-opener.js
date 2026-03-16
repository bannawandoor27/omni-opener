/**
 * OmniOpener — CSV Opener Tool
 * Uses OmniTool SDK and PapaParse. Renders .csv and .tsv files as an interactive table.
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
      infoHtml: '<strong>CSV Viewer:</strong> Professional-grade CSV viewer with sorting and filtering. All processing is local.',
      
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
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data) {
              const json = JSON.stringify(data, null, 2);
              helpers.download(helpers.getFile().name.replace(/\.(csv|tsv|txt)$/i, '.json'), json, 'application/json');
            }
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
      },

      onFile: function (file, content, helpers) {
        if (typeof Papa === 'undefined') {
          helpers.showLoading('Loading CSV engine...');
          setTimeout(() => helpers.onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing CSV...');
        
        Papa.parse(content, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: function(results) {
            renderTable(results, file, helpers);
          },
          error: function(err) {
            helpers.showError('Failed to parse CSV', err.message);
          }
        });
      }
    });
  };

  function renderTable(results, file, helpers) {
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
      <div class="flex flex-col h-[75vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
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
              <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
              <span>${fields.length} columns</span>
            </div>
          </div>

          <!-- Search -->
          <div class="px-3 pb-3 pt-1">
            <div class="relative group">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
              <input type="text" id="csv-search" 
                placeholder="Filter rows..." 
                class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
              >
            </div>
          </div>
        </div>

        <!-- Table Area -->
        <div id="csv-viewport" class="flex-1 overflow-auto bg-white">
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
          
          <!-- Empty State for Search -->
          <div id="csv-search-empty" class="hidden h-64 flex flex-col items-center justify-center text-surface-400">
            <span class="text-3xl mb-3">🔍</span>
            <p class="font-medium text-surface-600">No rows match your filter</p>
          </div>
        </div>
      </div>
    `;

    helpers.render(renderHtml);

    // Sorting State
    let sortField = null;
    let sortDir = 1; // 1 = asc, -1 = desc

    const searchInput = document.getElementById('csv-search');
    const tbody = document.getElementById('csv-body');
    const emptyState = document.getElementById('csv-search-empty');
    const headers = document.querySelectorAll('.csv-header');

    function renderRows(rows, cols) {
      // Limit visible rows for performance
      const limit = 1000;
      const toShow = rows.slice(0, limit);
      
      return toShow.map((row, i) => `
        <tr class="hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-0">
          <td class="px-4 py-2 text-surface-300 font-mono text-[10px] text-center bg-surface-50/50 sticky left-0 z-10">${i + 1}</td>
          ${cols.map(f => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs border-r border-surface-50 last:border-0">${escapeHtml(String(row[f] ?? ''))}</td>`).join('')}
        </tr>
      `).join('') + (rows.length > limit ? `<tr><td colspan="${cols.length + 1}" class="p-4 text-center text-surface-400 bg-surface-50 italic">Showing first ${limit} rows. Refine search or download for full file.</td></tr>` : '');
    }

    function updateTable() {
      const term = searchInput.value.toLowerCase();
      let filtered = data;

      if (term) {
        filtered = data.filter(row => {
          return fields.some(f => String(row[f]).toLowerCase().includes(term));
        });
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

      if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyState.classList.remove('hidden');
      } else {
        emptyState.classList.add('hidden');
        tbody.innerHTML = renderRows(filtered, fields);
      }
    }

    searchInput.addEventListener('input', updateTable);

    headers.forEach(h => {
      h.addEventListener('click', () => {
        const field = h.getAttribute('data-field');
        if (sortField === field) {
          sortDir *= -1;
        } else {
          sortField = field;
          sortDir = 1;
        }

        // Update UI
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
  }
})();
