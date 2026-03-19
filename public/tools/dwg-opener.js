(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.dwg',
      binary: true,
      onFile: function (file, content, h) {
        h.render(`
          <div class="p-4">
            <div class="font-bold mb-4">${esc(file.name)}</div>
            <div class="bg-white p-4 border rounded shadow-sm text-sm">
              DWG viewing requires a specialized engine. Please convert to DXF for better compatibility.
            </div>
          </div>
        `);
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
