/**
 * OmniOpener — ODS Toolkit
 * Uses OmniTool SDK and SheetJS.
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
      accept: '.ods',
      binary: true,
      infoHtml: '<strong>ODS Toolkit:</strong> Professional OpenDocument spreadsheet viewer with tabs and row filtering.',
      
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js');
      },

      actions: [
        {
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const wb = h.getState().workbook;
            if (wb) {
              const res = {};
              wb.SheetNames.forEach(n => res[n] = XLSX.utils.sheet_to_json(wb.Sheets[n]));
              h.download(h.getFile().name.replace(/\.ods$/i, '.json'), JSON.stringify(res, null, 2));
            }
          }
        }
      ],

      onFile: function _onFile(file, content, h) {
        if (typeof XLSX === 'undefined') {
          h.showLoading('Loading ODS engine...');
          setTimeout(() => _onFile(file, content, h), 500);
          return;
        }

        try {
          const workbook = XLSX.read(content, { type: 'array' });
          h.setState('workbook', workbook);
          const renderApp = (sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const fields = data.length > 0 ? data[0] : [];
            const rows = data.slice(1);

            h.render(`
              <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                  <div class="px-4 py-2 flex items-center justify-between text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                    <span>📊 ${escapeHtml(file.name)}</span>
                    <span>${workbook.SheetNames.length} Sheets</span>
                  </div>
                  <div class="flex px-2 bg-white border-t border-surface-100 overflow-x-auto no-scrollbar">
                    ${workbook.SheetNames.map(name => `
                      <button data-sheet="${escapeHtml(name)}" class="sheet-tab px-4 py-2 text-xs font-bold whitespace-nowrap border-b-2 ${name === sheetName ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">${escapeHtml(name)}</button>
                    `).join('')}
                  </div>
                  <div class="px-3 py-2 border-t border-surface-100 bg-surface-50/30">
                    <input type="text" id="ods-search" placeholder="Filter rows..." class="w-full px-3 py-1.5 text-xs border border-surface-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 bg-white">
                  </div>
                </div>
                <div class="flex-1 overflow-auto">
                  <table class="w-full text-xs text-left border-collapse min-w-max">
                    <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
                      <tr>
                        ${fields.map(f => `<th class="px-4 py-2 border-b border-surface-200 text-surface-700 font-bold uppercase">${escapeHtml(f || '')}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody id="ods-body">
                      ${renderRows(rows, fields.length)}
                    </tbody>
                  </table>
                </div>
              </div>
            `);

            const searchInput = document.getElementById('ods-search');
            const tbody = document.getElementById('ods-body');
            function renderRows(dataRows, colCount) {
               return dataRows.slice(0, 500).map(row => `
                 <tr class="hover:bg-surface-50 border-b border-surface-50">
                   ${Array.from({ length: colCount }).map((_, j) => `<td class="px-4 py-2 text-surface-600 truncate max-w-xs">${escapeHtml(row[j] ?? '')}</td>`).join('')}
                 </tr>
               `).join('');
            }
            searchInput.oninput = () => {
               const term = searchInput.value.toLowerCase();
               const filtered = rows.filter(row => row.some(c => String(c).toLowerCase().includes(term)));
               tbody.innerHTML = renderRows(filtered, fields.length);
            };
            document.querySelectorAll('.sheet-tab').forEach(t => {
               t.onclick = () => renderApp(t.getAttribute('data-sheet'));
            });
          };
          renderApp(workbook.SheetNames[0]);
        } catch (err) {
          h.showError('ODS Parse Error', err.message);
        }
      }
    });
  };
})();
