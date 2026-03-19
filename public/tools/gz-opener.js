(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.gz',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof pako === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const uint8 = new Uint8Array(content);
          const decompressed = pako.ungzip(uint8);
          h.render(`
            <div class="p-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              <div class="bg-white p-4 border rounded shadow-sm text-sm">
                Decompressed size: ${decompressed.length} bytes.
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('GZ Error', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
