(function () {
  'use strict';

  // --- Constants & Closure Variables ---
  const DISPLAY_LIMIT = 500;
  const CSV_LIMIT = 5000;

  // --- Utility Functions ---
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

  // --- Main Tool Entry ---
  window.initTool = function (toolConfig, mountEl) {
    let arrowLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.feather,.arrow',
      dropLabel: 'Drop a .feather or .arrow file here',
      binary: true,
      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/apache-arrow@15.0.2/dist/arrow.dom.min.js', () => {
          arrowLoaded = true;
        });
      },
      onFile: async function _onFile(file, content, helpers) {
        helpers.showLoading('Loading Apache Arrow...');
        
        // B1: Ensure CDN script is loaded
        const ensureArrow = async (attempts = 0) => {
          if (window.arrow) return true;
          if (attempts > 50) throw new Error('Apache Arrow library timed out.');
          await new Promise(r => setTimeout(r, 100));
          return ensureArrow(attempts + 1);
        };

        try {
          await ensureArrow();
          helpers.showLoading('Parsing Feather data...');
          
          // Small delay for UI update
          await new Promise(r => setTimeout(r, 50));

          // B2: Binary usage
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
            displayLimit: DISPLAY_LIMIT
          });

          renderApp(helpers, mountEl);
        } catch (e) {
          console.error(e);
          helpers.showError('Could not open feather file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
        }
      },
      onDestroy: function () {
        // Clean up any references if necessary
      },
      actions: [
        {
          label: '📋 Copy as CSV',
          id: 'copy-csv',
          onClick: function (helpers, btn) {
            const state = helpers.getState();
            if (!state.table) return;
            try {
              helpers.showLoading('Preparing CSV...');
              // Copy limited rows for performance
              const csv = tableToCSV(state.table, CSV_LIMIT);
              helpers.copyToClipboard(csv, btn);
              helpers.hideLoading();
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
              // B3: Async timeout to allow loading indicator to show
              setTimeout(() => {
                try {
                  const csv = tableToCSV(state.table);
                  const dlName = (state.fileName || 'data.feather').replace(/\.(feather|arrow)$/i, '') + '.csv';
                  helpers.download(dlName, csv, 'text/csv');
                  helpers.hideLoading();
                } catch (err) {
                  helpers.showError('Generation failed', err.message);
                  helpers.hideLoading();
                }
              }, 50);
            } catch (e) {
              helpers.showError('Download failed', e.message);
            }
          }
        }
      ],
      infoHtml: '<strong>Apache Arrow:</strong> High-performance columnar data format. Parsed entirely in your browser.'
    });
  };

  function renderApp(helpers, mountEl) {
    const state = helpers.getState();
    const table = state.table;
    const fields = table.schema.fields;
    const numRowsTotal = table.numRows;
    const numCols = fields.length;

    // Apply filtering and sorting logic
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
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    const filteredCount = rowIndices.length;
    const displayedIndices = rowIndices.slice(0, state.displayLimit);

    let html = `
      <div class="p-4 md:p-6 max-w-full mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${numRowsTotal.toLocaleString()} rows × ${numCols.toLocaleString()} columns</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.feather file</span>
        </div>

        <!-- U10: Section Header -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-3">
            <h3 class="font-semibold text-surface-800 text-lg">Data Explorer</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">
              ${filteredCount.toLocaleString()} ${filteredCount === numRowsTotal ? 'total items' : 'matches'}
            </span>
          </div>
          
          <div class="relative w-full md:w-80">
            <input 
              type="text" 
              id="feather-filter"
              placeholder="Search in all columns..." 
              value="${escapeHtml(state.filterQuery)}"
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm"
            />
            <svg class="w-4 h-4 absolute left-3.5 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <!-- U7: Beautiful Table Wrapper -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm ring-1 ring-black/5">
          <table class="min-w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr class="bg-surface-50">
                <th class="sticky top-0 z-20 bg-surface-50 px-4 py-3 text-left font-mono text-[10px] text-surface-400 border-b border-surface-200 w-12">#</th>
                ${fields.map(f => {
                  const isSorted = state.sortCol === f.name;
                  const sortIcon = isSorted ? (state.sortDir === 1 ? '▲' : '▼') : '';
                  return `
                    <th 
                      data-col="${escapeHtml(f.name)}"
                      class="feather-header sticky top-0 z-20 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors whitespace-nowrap group"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex flex-col">
                          <span class="flex items-center gap-1">
                            ${escapeHtml(f.name)}
                            ${isSorted ? `<span class="text-brand-600 font-bold">${sortIcon}</span>` : ''}
                          </span>
                          <span class="text-[10px] text-surface-400 font-normal uppercase tracking-wider mt-0.5">${escapeHtml(f.type.toString().split('<')[0])}</span>
                        </div>
                        <svg class="w-3 h-3 text-surface-300 ${isSorted ? 'opacity-100 text-brand-400' : 'opacity-0 group-hover:opacity-100'} transition-opacity" fill="currentColor" viewBox="0 0 20 20">
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
          <td colspan="${numCols + 1}" class="px-4 py-16 text-center">
            <div class="flex flex-col items-center justify-center text-surface-400">
              <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-base font-medium">${state.filterQuery ? 'No matching rows found' : 'This file is empty'}</p>
              <p class="text-sm mt-1">${state.filterQuery ? 'Try adjusting your search terms.' : 'No data rows were detected in this feather file.'}</p>
            </div>
          </td>
        </tr>
      `;
    } else {
      displayedIndices.forEach((rowIndex) => {
        const row = table.get(rowIndex);
        html += `<tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">`;
        html += `<td class="px-4 py-2 font-mono text-[10px] text-surface-300 border-r border-surface-50 bg-white/50 group-hover:bg-transparent">${rowIndex + 1}</td>`;
        
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
            <td class="px-4 py-2 ${cellClass} whitespace-nowrap overflow-hidden text-ellipsis max-w-[320px]" title="${escapeHtml(displayVal)}">
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
          <div class="mt-6 p-4 bg-surface-50 rounded-xl border border-dashed border-surface-300 text-center text-surface-500 text-sm">
            Showing first <span class="font-bold text-surface-700">${state.displayLimit.toLocaleString()}</span> matching rows. 
            <button id="feather-load-more" class="ml-2 text-brand-600 font-semibold hover:underline">Load more rows</button>
            or download as CSV for the full dataset.
          </div>
        ` : ''}
      </div>
    `;

    helpers.render(html);

    // B9: Use addEventListener instead of inline onclick/globals
    const filterInput = mountEl.querySelector('#feather-filter');
    if (filterInput) {
      let filterTimeout;
      filterInput.focus();
      // Restore cursor position for better UX on re-render
      filterInput.setSelectionRange(state.filterQuery.length, state.filterQuery.length);
      
      filterInput.addEventListener('input', (e) => {
        clearTimeout(filterTimeout);
        const query = e.target.value;
        filterTimeout = setTimeout(() => {
          helpers.setState({ filterQuery: query });
          renderApp(helpers, mountEl);
        }, 250);
      });
    }

    mountEl.querySelectorAll('.feather-header').forEach(header => {
      header.addEventListener('click', () => {
        const colName = header.getAttribute('data-col');
        const currentState = helpers.getState();
        const newDir = (currentState.sortCol === colName) ? currentState.sortDir * -1 : 1;
        helpers.setState({ sortCol: colName, sortDir: newDir });
        renderApp(helpers, mountEl);
      });
    });

    const loadMoreBtn = mountEl.querySelector('#feather-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => {
        const currentState = helpers.getState();
        helpers.setState({ displayLimit: currentState.displayLimit + 1000 });
        renderApp(helpers, mountEl);
      });
    }
  }

})();
