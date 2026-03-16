/**
 * OmniOpener — XLSX Viewer Tool
 * Uses OmniTool SDK and SheetJS. Renders .xlsx files as HTML tables.
 */
(function () {
  'use strict';

  let isSheetJSReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xlsx',
      dropLabel: 'Drop an .xlsx file here',
      binary: true,
      infoHtml: '<strong>XLSX Viewer:</strong> Renders .xlsx spreadsheets. Powered by SheetJS.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js', function() {
          isSheetJSReady = true;
        });
      },

      onFile: function (file, content, helpers) {
        if (!isSheetJSReady) {
          helpers.showError('Dependency not loaded', 'The SheetJS library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing spreadsheet...');

        try {
          const workbook = XLSX.read(content, { type: 'array' });
          let html = '<div class="flex flex-col space-y-4">';

          workbook.SheetNames.forEach((sheetName, index) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonSheet = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            html += `<details ${index === 0 ? 'open' : ''}>`;
            html += `<summary class="font-semibold text-lg cursor-pointer">${escapeHtml(sheetName)}</summary>`;
            html += '<div class="overflow-x-auto mt-2"><table class="w-full text-sm text-left text-surface-500">';
            
            if (jsonSheet.length > 0) {
              // Header
              html += '<thead class="text-xs text-surface-700 uppercase bg-surface-50">';
              html += '<tr>';
              jsonSheet[0].forEach(cell => {
                html += '<th scope="col" class="px-6 py-3">' + escapeHtml(cell) + '</th>';
              });
              html += '</tr></thead>';

              // Body
              html += '<tbody>';
              jsonSheet.slice(1).forEach(row => {
                html += '<tr class="bg-white border-b hover:bg-surface-50">';
                row.forEach(cell => {
                  html += '<td class="px-6 py-4">' + escapeHtml(cell) + '</td>';
                });
                html += '</tr>';
              });
              html += '</tbody>';
            }
            
            html += '</table></div></details>';
          });

          html += '</div>';
          helpers.render(html);

        } catch (err) {
          helpers.showError('Error parsing .xlsx file', err.message);
        }
      }
    });
  };

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

})();
