(function() {
  'use strict';

  /**
   * SQLite Opener for OmniOpener
   * A premium, browser-based SQLite explorer using SQL.js.
   */

  const SQL_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  const SQL_JS_SCRIPT = SQL_JS_CDN + 'sql-wasm.js';

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
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    let db = null;
    let SQL = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.sqlite,.db,.sqlite3,.db3,.s3db,.sl3',
      dropLabel: 'Drop a SQLite database file here',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScript(SQL_JS_SCRIPT);
      },

      onFile: function _onFileFn(file, content, helpers) {
        // B1, B4, B8: Handle race conditions and strict mode self-reference
        if (typeof initSqlJs === 'undefined') {
          helpers.showLoading('Initializing SQL engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 100);
          return;
        }

        helpers.showLoading('Reading database content...');

        initSqlJs({
          locateFile: function(filename) { return SQL_JS_CDN + filename; }
        }).then(function(sql) {
          SQL = sql;
          try {
            // B2: Binary handling (content is ArrayBuffer)
            const uints = new Uint8Array(content);
            if (db) db.close();
            db = new SQL.Database(uints);

            const tables = [];
            const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
            if (res.length > 0) {
              res[0].values.forEach(function(v) {
                const name = v[0];
                const countRes = db.exec(`SELECT COUNT(*) FROM "${name}"`);
                tables.push({
                  name: name,
                  rows: countRes[0].values[0][0]
                });
              });
            }

            const initialState = {
              tables: tables,
              activeTable: tables.length > 0 ? tables[0].name : null,
              search: '',
              sort: { col: null, dir: 'ASC' },
              page: 1,
              pageSize: 50,
              view: 'data' // 'data' or 'schema'
            };

            helpers.setState(initialState);
            renderUI(file, helpers);
          } catch (err) {
            console.error(err);
            helpers.showError('Could not open sqlite file', 'The file may be corrupted, encrypted, or in an unsupported variant. Try re-uploading.');
          }
        }).catch(function(err) {
          console.error(err);
          helpers.showError('Engine Load Error', 'Failed to initialize the SQL.js WASM engine.');
        });
      },

      onDestroy: function() {
        // B5: Memory leaks cleanup
        if (db) {
          db.close();
          db = null;
        }
        SQL = null;
      },

      actions: [
        {
          label: 'Export CSV',
          id: 'export-csv',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (!db || !state.activeTable) return;
            
            helpers.showLoading(`Exporting ${state.activeTable}...`);
            setTimeout(function() {
              try {
                const res = db.exec(`SELECT * FROM "${state.activeTable}"`);
                if (!res || res.length === 0) {
                  helpers.showError('Empty Table', 'No data available to export.');
                  helpers.hideLoading();
                  return;
                }
                
                const cols = res[0].columns;
                const rows = res[0].values;
                
                let csv = cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
                csv += rows.map(r => r.map(v => {
                  if (v === null) return '';
                  let s = String(v);
                  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    s = '"' + s.replace(/"/g, '""') + '"';
                  }
                  return s;
                }).join(',')).join('\n');
                
                // B10: helpers.download expects Blob
                const blob = new Blob([csv], { type: 'text/csv' });
                helpers.download(`${state.activeTable}.csv`, blob, 'text/csv');
                helpers.hideLoading();
              } catch (e) {
                helpers.showError('Export Failed', e.message);
                helpers.hideLoading();
              }
            }, 50);
          }
        },
        {
          label: 'Export JSON',
          id: 'export-json',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (!db || !state.activeTable) return;
            
            helpers.showLoading(`Generating JSON...`);
            setTimeout(function() {
              try {
                const res = db.exec(`SELECT * FROM "${state.activeTable}"`);
                if (!res || res.length === 0) {
                  helpers.showError('Empty Table', 'No data available to export.');
                  helpers.hideLoading();
                  return;
                }
                
                const cols = res[0].columns;
                const data = res[0].values.map(r => {
                  let obj = {};
                  cols.forEach((c, i) => obj[c] = r[i]);
                  return obj;
                });
                
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                helpers.download(`${state.activeTable}.json`, blob, 'application/json');
                helpers.hideLoading();
              } catch (e) {
                helpers.showError('Export Failed', e.message);
                helpers.hideLoading();
              }
            }, 50);
          }
        }
      ],
      infoHtml: '<strong>Local Explorer:</strong> All processing is done in your browser via WASM. Your data never leaves your device.'
    });

    function renderUI(file, helpers) {
      const state = helpers.getState();
      const tables = state.tables;

      // U5: Empty State
      if (tables.length === 0) {
        helpers.render(`
          <div class="flex flex-col items-center justify-center p-20 text-center bg-white rounded-3xl border border-surface-200">
            <div class="w-20 h-20 bg-surface-50 rounded-full flex items-center justify-center mb-6 text-surface-300">
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8-4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
            </div>
            <h2 class="text-xl font-bold text-surface-900">Empty Database</h2>
            <p class="text-surface-500 mt-2">This SQLite file contains no user tables.</p>
          </div>
        `);
        return;
      }

      const activeTableObj = tables.find(t => t.name === state.activeTable) || tables[0];

      // U1: File info bar
      let html = `
        <div class="flex flex-col h-[750px] max-h-[85vh]">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.sqlite file</span>
            <span class="ml-auto bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border border-brand-100">SQL.js WASM</span>
          </div>

          <div class="flex flex-1 gap-6 overflow-hidden">
            <!-- Table List Sidebar -->
            <div class="w-64 shrink-0 flex flex-col bg-surface-50 rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
              <div class="px-4 py-3 border-b border-surface-200 flex items-center justify-between bg-white/50">
                <h3 class="font-semibold text-surface-800">Tables</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${tables.length}</span>
              </div>
              <div class="flex-1 overflow-y-auto p-2 space-y-1" id="sqlite-table-nav">
                ${tables.map(t => `
                  <button data-table-name="${escapeHtml(t.name)}" class="w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${t.name === state.activeTable ? 'bg-brand-600 text-white shadow-md font-bold' : 'text-surface-600 hover:bg-white hover:border-surface-200 border border-transparent shadow-sm hover:shadow'}">
                    <span class="truncate pr-2">${escapeHtml(t.name)}</span>
                    <span class="text-[10px] ${t.name === state.activeTable ? 'text-brand-100' : 'text-surface-400'} font-mono">${t.rows.toLocaleString()}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Content Area -->
            <div class="flex-1 flex flex-col bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
              <!-- Controls Header -->
              <div class="px-5 py-4 border-b border-surface-200 flex flex-wrap items-center justify-between gap-4 bg-surface-50/20">
                <div class="flex items-center gap-4">
                  <h2 class="text-lg font-bold text-surface-900">${escapeHtml(state.activeTable)}</h2>
                  <div class="flex p-1 bg-surface-100 rounded-lg border border-surface-200">
                    <button id="btn-view-data" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${state.view === 'data' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">Data</button>
                    <button id="btn-view-schema" class="px-3 py-1 text-xs font-bold rounded-md transition-all ${state.view === 'schema' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">Schema</button>
                  </div>
                </div>

                ${state.view === 'data' ? `
                <div class="flex items-center gap-3">
                  <div class="relative">
                    <input type="text" id="sqlite-search" placeholder="Search in table..." class="pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 outline-none w-64 transition-all" value="${escapeHtml(state.search)}">
                    <svg class="absolute left-3 top-2.5 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round"/></svg>
                  </div>
                  <div class="flex items-center gap-1 bg-white border border-surface-200 p-1 rounded-xl shadow-sm">
                    <button id="sqlite-prev" class="p-1.5 rounded-lg hover:bg-surface-50 disabled:opacity-25 transition-all" ${state.page === 1 ? 'disabled' : ''}>
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <span class="text-xs font-bold text-surface-700 px-2 min-w-[80px] text-center">Page ${state.page}</span>
                    <button id="sqlite-next" class="p-1.5 rounded-lg hover:bg-surface-50 disabled:opacity-25 transition-all">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </div>
                </div>
                ` : ''}
              </div>

              <!-- Main Viewport -->
              <div id="sqlite-viewport" class="flex-1 overflow-auto bg-white relative">
                <!-- Content injected here -->
              </div>

              <!-- Footer Stats -->
              <div class="px-5 py-2.5 border-t border-surface-100 bg-surface-50/50 flex justify-between items-center text-[11px] font-medium">
                <div class="flex items-center gap-4">
                  <span id="sqlite-status" class="text-surface-500 italic">Reading table...</span>
                  <span id="sqlite-perf" class="text-surface-300"></span>
                </div>
                <div class="text-surface-400">
                  Max ${state.pageSize} rows per view
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);
      attachEvents(helpers);
      refreshViewport(helpers);
    }

    function attachEvents(helpers) {
      const el = helpers.getRenderEl();
      
      // Sidebar Navigation
      el.querySelectorAll('#sqlite-table-nav button').forEach(function(btn) {
        btn.onclick = function() {
          helpers.setState({ activeTable: btn.dataset.tableName, page: 1, search: '', sort: { col: null, dir: 'ASC' }, view: 'data' });
          renderUI(null, helpers);
        };
      });

      // View Switching
      const btnData = el.querySelector('#btn-view-data');
      if (btnData) btnData.onclick = function() { helpers.setState({ view: 'data' }); renderUI(null, helpers); };
      
      const btnSchema = el.querySelector('#btn-view-schema');
      if (btnSchema) btnSchema.onclick = function() { helpers.setState({ view: 'schema' }); renderUI(null, helpers); };

      // Search Box
      const searchInput = el.querySelector('#sqlite-search');
      if (searchInput) {
        let timer;
        searchInput.oninput = function(e) {
          clearTimeout(timer);
          timer = setTimeout(function() {
            helpers.setState({ search: e.target.value, page: 1 });
            refreshViewport(helpers);
          }, 400);
        };
      }

      // Pagination
      const prev = el.querySelector('#sqlite-prev');
      const next = el.querySelector('#sqlite-next');
      if (prev) prev.onclick = function() {
        const p = helpers.getState().page;
        if (p > 1) { helpers.setState({ page: p - 1 }); refreshViewport(helpers); }
      };
      if (next) next.onclick = function() {
        const p = helpers.getState().page;
        helpers.setState({ page: p + 1 });
        refreshViewport(helpers);
      };
    }

    function refreshViewport(helpers) {
      const state = helpers.getState();
      if (state.view === 'schema') {
        renderSchema(helpers);
      } else {
        renderData(helpers);
      }
    }

    function renderSchema(helpers) {
      const state = helpers.getState();
      const viewport = helpers.getRenderEl().querySelector('#sqlite-viewport');
      const statusEl = helpers.getRenderEl().querySelector('#sqlite-status');

      try {
        const res = db.exec(`PRAGMA table_info("${state.activeTable}")`);
        if (!res || res.length === 0) return;
        
        const rows = res[0].values;
        statusEl.innerText = `Structure of table "${state.activeTable}"`;

        // U7: Tables styling
        let html = `
          <div class="p-6">
            <div class="overflow-x-auto rounded-xl border border-surface-200">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-bold text-surface-700">#</th>
                    <th class="px-4 py-3 text-left font-bold text-surface-700">Name</th>
                    <th class="px-4 py-3 text-left font-bold text-surface-700">Type</th>
                    <th class="px-4 py-3 text-left font-bold text-surface-700">Nullable</th>
                    <th class="px-4 py-3 text-left font-bold text-surface-700">Primary Key</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${rows.map(r => `
                    <tr class="hover:bg-brand-50 transition-colors">
                      <td class="px-4 py-2 text-surface-400 font-mono">${r[0]}</td>
                      <td class="px-4 py-2 text-surface-900 font-semibold">${escapeHtml(r[1])}</td>
                      <td class="px-4 py-2"><span class="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-xs font-mono font-bold">${escapeHtml(r[2])}</span></td>
                      <td class="px-4 py-2 text-surface-500">${r[3] ? 'No' : 'Yes'}</td>
                      <td class="px-4 py-2">${r[5] ? '<span class="text-amber-600 font-bold">Primary</span>' : '<span class="text-surface-300">No</span>'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
        viewport.innerHTML = html;
      } catch (e) {
        viewport.innerHTML = `<div class="p-10 text-red-500 font-medium">${escapeHtml(e.message)}</div>`;
      }
    }

    function renderData(helpers) {
      const state = helpers.getState();
      const viewport = helpers.getRenderEl().querySelector('#sqlite-viewport');
      const statusEl = helpers.getRenderEl().querySelector('#sqlite-status');
      const perfEl = helpers.getRenderEl().querySelector('#sqlite-perf');
      const nextBtn = helpers.getRenderEl().querySelector('#sqlite-next');
      const prevBtn = helpers.getRenderEl().querySelector('#sqlite-prev');

      viewport.innerHTML = `
        <div class="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-20">
          <div class="flex flex-col items-center gap-3">
            <div class="w-10 h-10 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin"></div>
            <span class="text-xs font-bold text-surface-400 uppercase tracking-widest">Executing Query...</span>
          </div>
        </div>
      `;

      // Use requestAnimationFrame to let loader show before heavy query
      requestAnimationFrame(function() {
        const start = performance.now();
        try {
          // Identify columns for search
          const infoRes = db.exec(`PRAGMA table_info("${state.activeTable}")`);
          const columns = infoRes[0].values.map(v => v[1]);
          
          let where = "";
          if (state.search) {
            const s = String(state.search).replace(/'/g, "''");
            where = "WHERE " + columns.map(c => `CAST("${c}" AS TEXT) LIKE '%${s}%'`).join(" OR ");
          }

          let order = "";
          if (state.sort.col) {
            order = `ORDER BY "${state.sort.col}" ${state.sort.dir}`;
          }

          const offset = (state.page - 1) * state.pageSize;
          const query = `SELECT * FROM "${state.activeTable}" ${where} ${order} LIMIT ${state.pageSize} OFFSET ${offset}`;
          const res = db.exec(query);
          
          const countRes = db.exec(`SELECT COUNT(*) FROM "${state.activeTable}" ${where}`);
          const totalMatches = countRes[0].values[0][0];

          const end = performance.now();
          if (perfEl) perfEl.innerText = `${(end - start).toFixed(1)}ms`;
          if (statusEl) statusEl.innerText = `Showing ${totalMatches === 0 ? 0 : offset + 1}-${Math.min(offset + state.pageSize, totalMatches)} of ${totalMatches.toLocaleString()} results`;

          if (nextBtn) nextBtn.disabled = (offset + state.pageSize) >= totalMatches;

          if (totalMatches === 0) {
            viewport.innerHTML = `
              <div class="p-20 text-center">
                <div class="w-16 h-16 bg-surface-50 rounded-full flex items-center justify-center mx-auto mb-4 text-surface-300">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <h3 class="font-bold text-surface-900">No matching records</h3>
                <p class="text-sm text-surface-500 mt-1">Try a different search term or select another table.</p>
              </div>
            `;
            return;
          }

          const cols = res[0].columns;
          const rows = res[0].values;

          // U7: Table layout
          let tableHtml = `
            <div class="overflow-x-auto h-full">
              <table class="min-w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr class="sticky top-0 z-10">
                    ${cols.map(c => {
                      const isSorted = state.sort.col === c;
                      return `
                        <th data-col-name="${escapeHtml(c)}" class="group cursor-pointer bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 hover:bg-surface-50 transition-colors">
                          <div class="flex items-center gap-2">
                            <span class="truncate">${escapeHtml(c)}</span>
                            <span class="text-brand-500 text-[10px] ${isSorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'} transition-opacity">
                              ${isSorted ? (state.sort.dir === 'ASC' ? '▲' : '▼') : '▲'}
                            </span>
                          </div>
                        </th>
                      `;
                    }).join('')}
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${rows.map(r => `
                    <tr class="even:bg-surface-50/50 hover:bg-brand-50/40 transition-colors group">
                      ${r.map(v => {
                        let content = '';
                        let cellClass = 'text-surface-700';
                        
                        if (v === null) {
                          content = '<span class="text-surface-300 italic text-[10px] font-bold">NULL</span>';
                        } else if (v instanceof Uint8Array) {
                          content = `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200 uppercase">BLOB (${formatSize(v.length)})</span>`;
                        } else if (typeof v === 'number') {
                          cellClass = 'text-blue-700 font-mono text-right';
                          content = v.toLocaleString();
                        } else {
                          content = escapeHtml(String(v));
                          // B7: Truncate large cell content
                          if (content.length > 300) {
                            content = content.substring(0, 300) + '<span class="text-surface-300 font-bold">...</span>';
                          }
                        }
                        
                        return `<td class="px-4 py-2 border-b border-surface-50 max-w-md overflow-hidden text-ellipsis whitespace-nowrap ${cellClass}">${content}</td>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;

          viewport.innerHTML = tableHtml;

          // Attach column sort events
          viewport.querySelectorAll('th').forEach(function(th) {
            th.onclick = function() {
              const col = th.dataset.colName;
              const dir = (state.sort.col === col && state.sort.dir === 'ASC') ? 'DESC' : 'ASC';
              helpers.setState({ sort: { col, dir }, page: 1 });
              refreshViewport(helpers);
            };
          });

        } catch (e) {
          console.error(e);
          viewport.innerHTML = `<div class="p-10 text-red-500 font-medium">Query Execution Error: ${escapeHtml(e.message)}</div>`;
        }
      });
    }
  };

})();
