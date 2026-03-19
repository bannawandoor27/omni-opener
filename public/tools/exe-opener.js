(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.exe,.dll',
      binary: true,
      onFile: function (file, content, h) {
        try {
          const view = new DataView(content);
          if (view.getUint16(0, true) !== 0x5a4d) throw new Error('Not an MZ file');
          const peOff = view.getUint32(0x3c, true);
          if (view.getUint32(peOff, true) !== 0x00004550) throw new Error('Not a PE file');

          const numSections = view.getUint16(peOff + 6, true);
          h.render(`
            <div class="p-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              <div class="bg-white p-4 border rounded shadow-sm text-sm">
                <div>Sections: ${numSections}</div>
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('EXE Error', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
