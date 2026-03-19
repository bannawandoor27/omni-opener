(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ods',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof XLSX === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const wb = XLSX.read(content, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(ws);
          h.render(`<div class="p-4"><div class="font-bold mb-4">${esc(file.name)} - ${esc(sheetName)}</div><div class="bg-white p-4 border rounded shadow-sm overflow-auto max-h-[70vh]">${html}</div></div>`);
        } catch (err) {
          h.showError('ODS Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
