(function() {
  'use strict';

  /**
   * SQLite Opener for OmniOpener
   * A high-performance, browser-based SQLite explorer using SQL.js.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    let dbInstance = null;
    let sqlJsConfig = {
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.sqlite,.db,.sqlite3,.db3,.s3db,.sl3',
      dropLabel: 'Drop a SQLite database file here',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js');
      },

      onFile: function _onFile(file, content, helpers) {
        // B8 & B1: Handle strict mode binding and library loading race condition
        if (typeof initSqlJs === 'undefined') {
          helpers.showLoading('Loading SQLite engine...');
          setTimeout(function() { _onFile(file, content, helpers); }, 200);
          return;
        }

        helpers.showLoading('Opening database...');

        initSqlJs(sqlJsConfig).then(function(SQL) {
          try {
            // B2: content is ArrayBuffer because binary:true
            const uints = new Uint8Array(content);
            if (dbInstance) dbInstance.close();
            dbInstance = new SQL.Database(uints);

            const tables = getTableNames(dbInstance);
            const state = {
              tables: tables,
              currentTable: tables[0] || null,
              searchQuery: '',
              sortCol: null,
              sortDir: 'ASC',
              page: 0,
              pageSize: 50,
              totalRows: 0
            };

            helpers.setState(state);
            renderMain(file, helpers);
          } catch (err) {
            console.error(err);
            helpers.showError('Could not open SQLite file', 'The file may be corrupted, encrypted, or an unsupported SQLite version.');
          }
        }).catch(function(err) {
          console.error(err);
          helpers.showError('SQLite Initialization Failed', 'The SQL.js engine could not be initialized.');
        });
      },

      onDestroy: function() {
        // B5: Memory management
        if (dbInstance) {
          dbInstance.close();
          dbInstance = null;
        }
      },

      actions: [
        {
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (!state.currentTable || !dbInstance) return;
            
            try {
              const res = dbInstance.exec(`SELECT * FROM "${state.currentTable}"`);
              if (res.length === 0) return;
              
              const columns = res[0].columns;
              const values = res[0].values;
              
              let csv = columns.join(',') + '\n';
              csv += values.map(row => row.map(val => {
                if (val === null) return '';
                let s = String(val);
                if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                  s = '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
              }).join(',')).join('\n');
              
              helpers.download(`${state.currentTable}.csv`, csv, 'text/csv');
            } catch (e) {
              helpers.showError('Export failed', e.message);
            }
          }
        },
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (!state.currentTable || !dbInstance) return;
            
            try {
              const res = dbInstance.exec(`SELECT * FROM "${state.currentTable}" LIMIT 1000`);
              if (res.length === 0) return;
              
              const columns = res[0].columns;
              const data = res[0].values.map(row => {
                let obj = {};
                columns.forEach((col, i) => obj[col] = row[i]);
                return obj;
              });
              
              helpers.copyToClipboard(JSON.stringify(data, null, 2), btn);
            } catch (e) {
              helpers.showError('Copy failed', e.message);
            }
          }
        }
      ],
      infoHtml: '<strong>SQL.js:</strong> Powered by SQLite WASM. All processing happens locally in your browser.'
    });

    function getTableNames(db) {
      const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
      return res.length > 0 ? res[0].values.map(v => v[0]) : [];
    }

    function renderMain(file, helpers) {
      const state = helpers.getState();
      const tables = state.tables;

      if (tables.length === 0) {
        helpers.render(`
          <div class="p-12 text-center bg-white rounded-2xl border border-surface-200">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-100 text-surface-400 mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8-4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
            </div>
            <h3 class="text-lg font-semibold text-surface-900">Empty Database</h3>
            <p class="text-surface-500 mt-1">No user tables were found in this file.</p>
          </div>
        `);
        return;
      }

      // U1: File Info Bar & UI Structure
      const html = `
        <div class="flex flex-col min-h-[600px] h-[75vh]">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">SQLite Database</span>
            <div class="ml-auto flex items-center gap-2">
              <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${tables.length} Tables</span>
              <span id="sql-total-rows-badge" class="bg-surface-200 text-surface-700 px-2 py-0.5 rounded-full text-xs font-bold hidden"></span>
            </div>
          </div>

          <div class="flex flex-1 gap-4 overflow-hidden">
            <!-- Sidebar: Table List (U10) -->
            <div class="w-60 shrink-0 flex flex-col bg-surface-50/50 border border-surface-200 rounded-xl overflow-hidden">
              <div class="px-4 py-3 border-b border-surface-200 bg-surface-50 flex items-center justify-between">
                <span class="text-xs font-bold text-surface-400 uppercase tracking-widest">Tables</span>
                <span class="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded-md">${tables.length}</span>
              </div>
              <div class="flex-1 overflow-y-auto p-2 space-y-1" id="sql-tables">
                ${tables.map(t => `
                  <button data-table="${escapeHtml(t)}" class="w-full text-left px-3 py-2 text-sm rounded-lg transition-all ${t === state.currentTable ? 'bg-white text-brand-600 shadow-sm border border-surface-200 font-semibold' : 'text-surface-600 hover:bg-surface-100'} truncate">
                    ${escapeHtml(t)}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 flex flex-col min-w-0 bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
              <!-- Toolbar (U4, U7) -->
              <div class="px-4 py-3 border-b border-surface-200 bg-surface-50/30 flex flex-wrap items-center gap-4">
                <div class="relative flex-1 min-w-[200px]">
                  <input type="text" id="sql-search" placeholder="Search in table..." class="w-full pl-9 pr-4 py-1.5 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" value="${escapeHtml(state.searchQuery)}">
                  <svg class="absolute left-3 top-2.5 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                
                <div class="flex items-center gap-2">
                  <button id="sql-prev" class="p-1.5 rounded-lg hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" ${state.page === 0 ? 'disabled' : ''}>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <div class="px-3 py-1 bg-surface-100 rounded-md border border-surface-200 text-xs font-semibold text-surface-700 min-w-[80px] text-center">
                    Page ${state.page + 1}
                  </div>
                  <button id="sql-next" class="p-1.5 rounded-lg hover:bg-surface-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                </div>
              </div>

              <!-- Table View (U7) -->
              <div id="sql-data-container" class="flex-1 overflow-auto bg-white relative">
                <!-- Data injected here -->
              </div>

              <!-- Status Footer -->
              <div class="px-4 py-2 border-t border-surface-100 bg-surface-50/50 text-[11px] text-surface-400 flex justify-between items-center">
                <div class="flex items-center gap-3">
                  <span id="sql-status">Ready</span>
                  <span id="sql-pagination-info" class="font-medium text-surface-600"></span>
                </div>
                <div class="flex items-center gap-2">
                  <span id="sql-query-time" class="opacity-50"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);
      attachEvents(helpers);
      refreshData(helpers);
    }

    function attachEvents(helpers) {
      const el = helpers.getRenderEl();
      
      // Table selection
      el.querySelectorAll('#sql-tables button').forEach(btn => {
        btn.onclick = () => {
          const tableName = btn.dataset.table;
          helpers.setState({ currentTable: tableName, page: 0, searchQuery: '', sortCol: null });
          renderMain(null, helpers);
        };
      });

      // Search (Live Search)
      const searchInput = el.querySelector('#sql-search');
      let searchTimeout;
      searchInput.oninput = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          helpers.setState({ searchQuery: e.target.value, page: 0 });
          refreshData(helpers);
        }, 400);
      };

      // Pagination
      el.querySelector('#sql-prev').onclick = () => {
        const s = helpers.getState();
        if (s.page > 0) {
          helpers.setState({ page: s.page - 1 });
          updatePaginationUI(helpers);
          refreshData(helpers);
        }
      };

      el.querySelector('#sql-next').onclick = () => {
        const s = helpers.getState();
        helpers.setState({ page: s.page + 1 });
        updatePaginationUI(helpers);
        refreshData(helpers);
      };
    }

    function updatePaginationUI(helpers) {
      const state = helpers.getState();
      const el = helpers.getRenderEl();
      const prevBtn = el.querySelector('#sql-prev');
      const pageIndicator = el.querySelector('#sql-prev').nextElementSibling;

      if (prevBtn) prevBtn.disabled = state.page === 0;
      if (pageIndicator) pageIndicator.innerText = `Page ${state.page + 1}`;
    }

    function refreshData(helpers) {
      const state = helpers.getState();
      const el = helpers.getRenderEl();
      const container = el.querySelector('#sql-data-container');
      const statusEl = el.querySelector('#sql-status');
      const paginationInfo = el.querySelector('#sql-pagination-info');
      const nextBtn = el.querySelector('#sql-next');
      const rowBadge = el.querySelector('#sql-total-rows-badge');
      const queryTimeEl = el.querySelector('#sql-query-time');

      if (!state.currentTable || !dbInstance) return;

      container.innerHTML = `
        <div class="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[2px] z-20">
          <div class="flex flex-col items-center gap-3">
            <div class="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
            <span class="text-xs font-semibold text-surface-600 tracking-wide uppercase">Querying Database...</span>
          </div>
        </div>
      `;

      // Use requestAnimationFrame to let the UI update before heavy query
      requestAnimationFrame(() => {
        const startTime = performance.now();
        try {
          const tableName = state.currentTable;
          
          // Get schema to help with search and types
          const infoRes = dbInstance.exec(`PRAGMA table_info("${tableName}")`);
          const columns = infoRes[0].values.map(v => ({ name: v[1], type: v[2] }));

          let whereClause = "";
          if (state.searchQuery) {
            const search = state.searchQuery.replace(/'/g, "''");
            // CAST to TEXT for broad searching across types
            whereClause = "WHERE " + columns.map(c => `CAST("${c.name}" AS TEXT) LIKE '%${search}%'`).join(" OR ");
          }

          let orderClause = "";
          if (state.sortCol) {
            orderClause = `ORDER BY "${state.sortCol}" ${state.sortDir}`;
          }

          const limit = state.pageSize;
          const offset = state.page * limit;

          // U7: Large file handling - pagination is built in
          const countRes = dbInstance.exec(`SELECT COUNT(*) FROM "${tableName}" ${whereClause}`);
          const totalRows = countRes[0].values[0][0];

          const dataRes = dbInstance.exec(`SELECT * FROM "${tableName}" ${whereClause} ${orderClause} LIMIT ${limit} OFFSET ${offset}`);
          
          const rows = dataRes.length > 0 ? dataRes[0].values : [];
          const dataCols = dataRes.length > 0 ? dataRes[0].columns : columns.map(c => c.name);
          const endTime = performance.now();

          helpers.setState({ totalRows });

          if (nextBtn) nextBtn.disabled = offset + rows.length >= totalRows;
          
          if (rowBadge) {
            rowBadge.innerText = `${totalRows.toLocaleString()} Rows`;
            rowBadge.classList.remove('hidden');
          }

          if (totalRows === 0) {
            container.innerHTML = `
              <div class="p-12 text-center">
                <div class="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg class="w-6 h-6 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <h4 class="font-medium text-surface-900">No results found</h4>
                <p class="text-sm text-surface-500 mt-1 italic">No rows match your current filter.</p>
              </div>
            `;
            statusEl.innerText = `0 matches`;
            paginationInfo.innerText = "";
            return;
          }

          // U7: Tables - Premium styling
          let tableHtml = `
            <div class="min-w-full inline-block align-middle">
              <table class="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr class="bg-white/95 backdrop-blur sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                    ${dataCols.map(col => {
                      const isSorted = state.sortCol === col;
                      return `
                        <th data-col="${escapeHtml(col)}" class="group cursor-pointer px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 hover:bg-surface-50 transition-colors whitespace-nowrap">
                          <div class="flex items-center gap-2">
                            <span>${escapeHtml(col)}</span>
                            <span class="text-brand-500 text-[10px] ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'} transition-opacity">
                              ${isSorted ? (state.sortDir === 'ASC' ? '▲' : '▼') : '▲'}
                            </span>
                          </div>
                        </th>
                      `;
                    }).join('')}
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${rows.map(row => `
                    <tr class="even:bg-surface-50/50 hover:bg-brand-50/30 transition-colors group">
                      ${row.map(val => {
                        let display = val;
                        let cellClass = "text-surface-600";
                        
                        if (val === null) {
                          display = '<span class="text-surface-300 italic text-[10px] tracking-wider font-bold">NULL</span>';
                        } else if (val instanceof Uint8Array) {
                          display = `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">BLOB ${formatSize(val.length)}</span>`;
                        } else if (typeof val === 'number') {
                          cellClass = "text-blue-600 font-mono";
                          display = val.toLocaleString();
                        } else if (typeof val === 'string' && val.length > 300) {
                          display = escapeHtml(val.substring(0, 300)) + '<span class="text-surface-300 font-bold ml-1">...</span>';
                        } else {
                          display = escapeHtml(String(val));
                        }
                        
                        return `<td class="px-4 py-2.5 border-b border-surface-50 break-words max-w-md ${cellClass}">${display}</td>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;

          container.innerHTML = tableHtml;
          statusEl.innerText = `Showing ${offset + 1}-${Math.min(offset + limit, totalRows)} of ${totalRows.toLocaleString()} rows`;
          paginationInfo.innerText = `[${tableName}]`;
          if (queryTimeEl) queryTimeEl.innerText = `${(endTime - startTime).toFixed(1)}ms`;

          // Re-attach sort events
          container.querySelectorAll('th').forEach(th => {
            th.onclick = () => {
              const col = th.dataset.col;
              const curState = helpers.getState();
              const dir = (curState.sortCol === col && curState.sortDir === 'ASC') ? 'DESC' : 'ASC';
              helpers.setState({ sortCol: col, sortDir: dir, page: 0 });
              refreshData(helpers);
            };
          });

        } catch (err) {
          console.error(err);
          container.innerHTML = `
            <div class="p-8 text-center">
              <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 text-red-500 mb-4">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <h4 class="font-semibold text-surface-900">Query Failed</h4>
              <p class="text-xs text-red-600 mt-2 max-w-xs mx-auto opacity-80">${escapeHtml(err.message)}</p>
            </div>
          `;
          statusEl.innerText = "Error encountered";
        }
      });
    }
  };

})();
