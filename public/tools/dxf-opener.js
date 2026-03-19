(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof DxfParser === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const parser = new DxfParser();
          const parsed = parser.parseSync(content);
          h.render(`<div class="p-4"><div class="font-bold mb-2">${esc(file.name)}</div><div class="bg-white p-4 border rounded shadow-sm text-sm">Parsed ${parsed.entities.length} entities.</div></div>`);
        } catch (err) {
          h.showError('DXF Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
