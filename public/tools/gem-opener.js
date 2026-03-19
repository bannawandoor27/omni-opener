(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.gem',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js');
        });
      },
      onFile: function (file, content, h) {
        if (typeof pako === 'undefined' || typeof jsyaml === 'undefined') {
          h.showLoading('Loading engine...');
          setTimeout(() => this.onFile(file, content, h), 1000);
          return;
        }

        h.render(`<div class="p-4"><div class="font-bold mb-4">${esc(file.name)}</div><div class="bg-white p-4 border rounded shadow-sm text-sm">Gem structure analysis not yet fully robust in this minimal view.</div></div>`);
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
