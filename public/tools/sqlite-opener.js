(function() {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.sqlite,.db,.sqlite3,.db3,.s3db,.sl3',
      dropLabel: 'Drop a SQLite database file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js');
      },
      onFile: function onFile(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is over 20MB. Processing large SQLite databases in the browser may be slow. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Initializing SQLite engine...');

        if (typeof initSqlJs === 'undefined') {
          setTimeout(() => onFile(file, content, helpers), 500);
          return;
        }

        initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        }).then(SQL => {
          helpers.showLoading('Parsing database...');
          try {
            const db = new SQL.Database(new Uint8Array(content));
            helpers.setState({ db, SQL });
            renderDb(db, file, helpers);
          } catch (e) {
            helpers.showError('Could not parse SQLite file', e.message);
          }
        }).catch(err => {
          helpers.showError('Failed to initialize SQL.js', err.message);
        });
      },
      actions: [
        {
          label: '📥 Export Table as JSON',
          id: 'export-json',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (!state.currentTableData) return;
            const json = JSON.stringify(state.currentTableData, null, 2);
            helpers.download(`${state.currentTableName || 'table'}.json`, json, 'application/json');
          }
        },
        {
          label: '📋 Copy Table as CSV',
          id: 'copy-csv',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (!state.currentTableData || !state.currentTableColumns) return;
            const header = state.currentTableColumns.join(',');
            const rows = state.currentTableData.map(row => 
              state.currentTableColumns.map(col => {
                let val = row[col];
                if (val === null) return '';
                val = String(val);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                  val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
              }).join(',')
            ).join('\n');
            helpers.copyToClipboard(header + '\n' + rows, btn);
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your database is parsed entirely in your browser using SQL.js (WASM).'
    });
  };

  function renderDb(db, file, helpers) {
    // Get all tables
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tables = res.length > 0 ? res[0].values.map(v => v[0]) : [];

    if (tables.length === 0) {
      helpers.render(`
        <div class="p-8 text-center text-surface-500">
          <p class="text-lg font-medium">No tables found in this database.</p>
        </div>
      `);
      return;
    }

    const html = `
      <div class="flex flex-col h-[70vh] bg-white">
        <!-- File Info Bar -->
        <div class="flex items-center gap-3 p-3 bg-surface-50 border-b border-surface-200 text-sm text-surface-600">
          <span class="font-medium text-brand-600">🗄️ SQLite</span>
          <span class="font-medium truncate max-w-xs">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${tables.length} tables</span>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <!-- Sidebar -->
          <div class="w-64 border-r border-surface-200 bg-surface-50/30 overflow-y-auto shrink-0">
            <div class="p-3 text-[10px] font-bold text-surface-400 uppercase tracking-wider">Tables</div>
            <nav id="sql-table-list" class="px-2 pb-4 space-y-1">
              ${tables.map(t => `
                <button data-table="${escapeHtml(t)}" class="w-full text-left px-3 py-2 text-sm rounded-lg transition-colors hover:bg-surface-100 text-surface-600 font-medium truncate">
                  ${escapeHtml(t)}
                </button>
              `).join('')}
            </nav>
          </div>

          <!-- Content -->
          <div id="sql-content" class="flex-1 flex flex-col min-w-0 bg-white">
            <div id="sql-table-view" class="flex-1 flex flex-col overflow-hidden">
              <div class="p-8 text-center text-surface-400">
                <p>Select a table to view data</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    const tableButtons = helpers.getRenderEl().querySelectorAll('#sql-table-list button');
    tableButtons.forEach(btn => {
      btn.onclick = () => {
        tableButtons.forEach(b => b.classList.remove('bg-brand-50', 'text-brand-700', 'shadow-sm'));
        btn.classList.add('bg-brand-50', 'text-brand-700', 'shadow-sm');
        loadTable(db, btn.dataset.table, helpers);
      };
    });

    // Auto-load first table
    if (tables.length > 0) tableButtons[0].click();
  }

  function loadTable(db, tableName, helpers) {
    const contentView = helpers.getRenderEl().querySelector('#sql-table-view');
    contentView.innerHTML = `
      <div class="flex items-center justify-center h-64 text-surface-400">
        <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        <span>Loading ${escapeHtml(tableName)}...</span>
      </div>
    `;

    // Wrap in setTimeout to let UI update
    setTimeout(() => {
      try {
        // Get schema
        const schemaRes = db.exec(`PRAGMA table_info("${tableName}")`);
        const columns = schemaRes[0].values.map(v => v[1]);
        
        // Get row count
        const countRes = db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
        const totalRows = countRes[0].values[0][0];

        // Get sample data
        const limit = 500;
        const dataRes = db.exec(`SELECT * FROM "${tableName}" LIMIT ${limit}`);
        
        const rows = dataRes.length > 0 ? dataRes[0].values.map(row => {
          const obj = {};
          columns.forEach((col, i) => obj[col] = row[i]);
          return obj;
        }) : [];

        helpers.setState({
          currentTableName: tableName,
          currentTableColumns: columns,
          currentTableData: rows
        });

        contentView.innerHTML = `
          <div class="flex flex-col h-full">
            <div class="px-4 py-3 border-b border-surface-100 flex items-center justify-between shrink-0">
              <h3 class="font-semibold text-surface-800">${escapeHtml(tableName)}</h3>
              <div class="text-xs text-surface-400 font-medium">
                ${totalRows.toLocaleString()} rows ${totalRows > limit ? `(showing first ${limit})` : ''}
              </div>
            </div>
            
            <div class="flex-1 overflow-auto">
              <table class="w-full text-sm text-left border-collapse min-w-max">
                <thead class="sticky top-0 z-10 bg-surface-50 shadow-sm">
                  <tr>
                    ${columns.map(c => `
                      <th class="px-4 py-3 border-b border-surface-200 text-xs font-bold text-surface-700 uppercase tracking-wider">
                        ${escapeHtml(c)}
                      </th>
                    `).join('')}
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${rows.map(row => `
                    <tr class="hover:bg-surface-50 transition-colors">
                      ${columns.map(col => {
                        const val = row[col];
                        let display = val;
                        let cellClass = "text-surface-600";
                        
                        if (val === null) {
                          display = "NULL";
                          cellClass = "text-surface-300 italic";
                        } else if (val instanceof Uint8Array) {
                          display = `BLOB (${formatSize(val.length)})`;
                          cellClass = "text-brand-500 font-mono text-[10px]";
                        } else if (typeof val === 'number') {
                          cellClass = "text-blue-600 font-mono";
                        }
                        
                        return `<td class="px-4 py-2 truncate max-w-xs ${cellClass}">${escapeHtml(String(display))}</td>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                  ${rows.length === 0 ? '<tr><td colspan="100%" class="p-8 text-center text-surface-400">Table is empty</td></tr>' : ''}
                </tbody>
              </table>
            </div>
          </div>
        `;
      } catch (err) {
        contentView.innerHTML = `
          <div class="p-8 text-center">
            <p class="text-red-500 font-medium">Error loading table</p>
            <p class="text-sm text-surface-400 mt-1">${escapeHtml(err.message)}</p>
          </div>
        `;
      }
    }, 10);
  }
})();
