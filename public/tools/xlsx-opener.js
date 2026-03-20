/**
 * OmniOpener — XLSX Toolkit
 * Uses OmniTool SDK and SheetJS. Renders .xlsx files with tabs, filtering, and exports.
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
      infoHtml: '<strong>XLSX Toolkit:</strong> Professional spreadsheet viewer with multi-sheet tabs, row filtering, and data export.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js');
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
          label: '📥 Export CSV (Active)',
          id: 'export-csv',
          onClick: function (helpers) {
            const workbook = helpers.getState().workbook;
            const sheetName = helpers.getState().activeSheet;
            if (workbook && sheetName) {
              const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
              helpers.download(`${helpers.getFile().name.replace(/\.[^.]+$/i, '')}-${sheetName}.csv`, csv, 'text/csv');
            }
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        if (typeof XLSX === 'undefined') {
          helpers.showLoading('Loading Sheet engine...');
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

                  <!-- Search Bar -->
                  <div class="px-3 py-2 border-t border-surface-100 bg-surface-50/30">
                    <div class="relative">
                       <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                       <input type="text" id="xlsx-search" placeholder="Filter rows in ${escapeHtml(sheetName)}..." class="w-full pl-9 pr-4 py-1.5 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 bg-white">
                    </div>
                  </div>
                </div>

                <!-- Table Area -->
                <div class="flex-1 overflow-auto bg-white">
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

            searchInput.addEventListener('input', () => {
               const term = searchInput.value.toLowerCase();
               const filtered = rows.filter(row => row.some(cell => String(cell).toLowerCase().includes(term)));
               tbody.innerHTML = renderRows(filtered, fields.length);
            });

            tabs.forEach(tab => {
               tab.onclick = () => {
                  const name = tab.getAttribute('data-sheet');
                  helpers.setState('activeSheet', name);
                  renderApp(name);
               };
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
