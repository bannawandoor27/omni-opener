(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.msi,.msp',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof XLSX === 'undefined' || !XLSX.CFB) {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const cfb = XLSX.CFB.read(content, { type: 'array' });
          h.render(`
            <div class="p-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              <div class="bg-white p-4 border rounded shadow-sm text-sm">
                Found ${cfb.FullPaths.length} streams.
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('MSI Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
