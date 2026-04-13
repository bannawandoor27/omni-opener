(function () {
  'use strict';

  // --- Helpers ---
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function tableToCSV(table, limit) {
    const fields = table.schema.fields;
    const headers = fields.map(f => f.name);
    const rows = [headers.join(',')];
    const rowCount = limit ? Math.min(table.numRows, limit) : table.numRows;

    for (let i = 0; i < rowCount; i++) {
      const row = table.get(i);
      const values = fields.map(f => {
        let val = row[f.name];
        if (val === null || val === undefined) return '';
        if (val instanceof Uint8Array) return '[Binary]';
        if (typeof val === 'bigint') val = val.toString();
        if (val instanceof Date) val = val.toISOString();
        if (typeof val === 'object') {
          try { val = JSON.stringify(val); } catch (e) { val = '[Object]'; }
        }
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      });
      rows.push(values.join(','));
    }
    return rows.join('\n');
  }

  function waitForArrow(callback, attempts = 0) {
    if (window.arrow) {
      callback();
    } else if (attempts < 50) {
      setTimeout(() => waitForArrow(callback, attempts + 1), 100);
    } else {
      throw new Error('Apache Arrow library failed to load.');
    }
  }

  // --- Main Tool ---
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.feather,.arrow',
      dropLabel: 'Drop a .feather or .arrow file here',
      binary: true,
      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/apache-arrow@15.0.2/dist/arrow.dom.min.js');
      },
      onFile: async function (file, content, helpers) {
        helpers.showLoading('Preparing Apache Arrow...');
        
        try {
          await new Promise((resolve, reject) => {
            try {
              waitForArrow(resolve);
            } catch (e) {
              reject(e);
            }
          });

          helpers.showLoading('Parsing Feather data...');
          
          // Small delay to allow UI to update
          await new Promise(r => setTimeout(r, 50));

          const table = arrow.tableFromUint8Array(new Uint8Array(content));
          
          if (!table || table.numRows === undefined) {
            throw new Error('Parsed table is invalid or empty.');
          }

          helpers.setState({
            table: table,
            fileName: file.name,
            fileSize: file.size,
            sortCol: null,
            sortDir: 1, // 1 for asc, -1 for desc
            filterQuery: '',
            displayLimit: 500
          });

          renderApp(helpers);
        } catch (e) {
          console.error(e);
          helpers.showError('Could not open Feather file', 'The file may be corrupted, or the Apache Arrow library failed to initialize. Details: ' + e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy as CSV',
          id: 'copy-csv',
          onClick: function (helpers, btn) {
            const state = helpers.getState();
            if (!state.table) return;
            try {
              // Copy limited rows for performance
              const csv = tableToCSV(state.table, 1000);
              helpers.copyToClipboard(csv, btn);
            } catch (e) {
              helpers.showError('Copy failed', e.message);
            }
          }
        },
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function (helpers) {
            const state = helpers.getState();
            if (!state.table) return;
            try {
              helpers.showLoading('Generating CSV...');
              setTimeout(() => {
                const csv = tableToCSV(state.table);
                const dlName = (state.fileName || 'data.feather').replace(/\.(feather|arrow)$/i, '') + '.csv';
                helpers.download(dlName, csv, 'text/csv');
                helpers.hideLoading();
              }, 10);
            } catch (e) {
              helpers.showError('Download failed', e.message);
            }
          }
        }
      ],
      infoHtml: '<strong>Apache Arrow:</strong> High-performance columnar data format. Parsed entirely in your browser.'
    });
  };

  function renderApp(helpers) {
    const state = helpers.getState();
    const table = state.table;
    const fields = table.schema.fields;
    const numRowsTotal = table.numRows;
    const numCols = fields.length;

    // Apply filtering and sorting logic locally for the display view
    let rowIndices = Array.from({ length: numRowsTotal }, (_, i) => i);

    if (state.filterQuery) {
      const query = state.filterQuery.toLowerCase();
      rowIndices = rowIndices.filter(idx => {
        const row = table.get(idx);
        return fields.some(f => {
          const val = String(row[f.name] ?? '').toLowerCase();
          return val.includes(query);
        });
      });
    }

    if (state.sortCol !== null) {
      const colName = state.sortCol;
      const dir = state.sortDir;
      rowIndices.sort((a, b) => {
        const valA = table.get(a)[colName];
        const valB = table.get(b)[colName];
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    const filteredCount = rowIndices.length;
    const displayedIndices = rowIndices.slice(0, state.displayLimit);

    let html = `
      <div class="p-6 max-w-[1600px] mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${numRowsTotal.toLocaleString()} rows × ${numCols.toLocaleString()} columns</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.feather file</span>
        </div>

        <!-- U10: Section Header with Search -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-3">
            <h3 class="font-semibold text-surface-800 text-lg">Data Viewer</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              ${filteredCount.toLocaleString()} ${filteredCount === numRowsTotal ? 'total' : 'matches'}
            </span>
          </div>
          
          <div class="relative max-w-xs w-full">
            <input 
              type="text" 
              placeholder="Filter rows..." 
              value="${escapeHtml(state.filterQuery)}"
              class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              oninput="window.omniUpdateFilter(this.value)"
            />
            <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <!-- U7: Beautiful Table -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
          <table class="min-w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th class="sticky top-0 z-20 bg-surface-50 px-4 py-3 text-left font-mono text-[10px] text-surface-400 border-b border-surface-200 w-12">#</th>
                ${fields.map(f => {
                  const isSorted = state.sortCol === f.name;
                  const sortIcon = isSorted ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
                  return `
                    <th 
                      class="sticky top-0 z-20 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors whitespace-nowrap group"
                      onclick="window.omniSort('${escapeHtml(f.name)}')"
                    >
                      <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                          <span class="flex items-center">
                            ${escapeHtml(f.name)}
                            <span class="text-brand-500 font-bold ml-1">${sortIcon}</span>
                          </span>
                          <span class="text-[10px] text-surface-400 font-normal uppercase tracking-wider mt-0.5">${escapeHtml(f.type.toString().split('<')[0])}</span>
                        </div>
                        <svg class="w-3 h-3 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M5 12l5 5 5-5H5z" />
                        </svg>
                      </div>
                    </th>
                  `;
                }).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
    `;

    if (displayedIndices.length === 0) {
      html += `
        <tr>
          <td colspan="${numCols + 1}" class="px-4 py-12 text-center text-surface-400 italic bg-white">
            ${state.filterQuery ? 'No rows match your filter.' : 'This file contains no data rows.'}
          </td>
        </tr>
      `;
    } else {
      displayedIndices.forEach((rowIndex, i) => {
        const row = table.get(rowIndex);
        html += `<tr class="even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors group">`;
        html += `<td class="px-4 py-2 font-mono text-[10px] text-surface-300 border-r border-surface-50 bg-white group-hover:bg-transparent">${rowIndex + 1}</td>`;
        
        fields.forEach(f => {
          let val = row[f.name];
          let displayVal = '';
          let cellClass = 'text-surface-700';

          if (val === null || val === undefined) {
            displayVal = 'null';
            cellClass = 'text-surface-300 italic';
          } else if (val instanceof Uint8Array) {
            displayVal = `[Binary ${val.length}B]`;
            cellClass = 'text-brand-600 font-mono text-[11px]';
          } else if (typeof val === 'bigint') {
            displayVal = val.toString();
          } else if (val instanceof Date) {
            displayVal = val.toISOString().replace('T', ' ').split('.')[0];
          } else if (typeof val === 'object') {
            try { displayVal = JSON.stringify(val); } catch (e) { displayVal = '[Object]'; }
            cellClass = 'text-surface-500 font-mono text-[11px]';
          } else {
            displayVal = String(val);
          }

          html += `
            <td class="px-4 py-2 ${cellClass} whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]" title="${escapeHtml(displayVal)}">
              ${escapeHtml(displayVal)}
            </td>
          `;
        });
        html += `</tr>`;
      });
    }

    html += `
            </tbody>
          </table>
        </div>

        ${filteredCount > state.displayLimit ? `
          <div class="mt-4 p-4 bg-surface-50 rounded-xl border border-surface-200 text-center text-surface-500 text-sm">
            Showing first <b>${state.displayLimit.toLocaleString()}</b> matching rows of ${filteredCount.toLocaleString()}. 
            Filter your search or download the full CSV to see all data.
          </div>
        ` : ''}
      </div>
    `;

    helpers.render(html);

    // Global listeners for sorting and filtering
    window.omniSort = function(colName) {
      const currentState = helpers.getState();
      const newDir = (currentState.sortCol === colName) ? currentState.sortDir * -1 : 1;
      helpers.setState({ sortCol: colName, sortDir: newDir });
      renderApp(helpers);
    };

    let filterTimeout;
    window.omniUpdateFilter = function(query) {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        helpers.setState({ filterQuery: query });
        renderApp(helpers);
      }, 200);
    };
  }

})();
