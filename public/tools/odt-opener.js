(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.odt',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => this.onFile(file, content, h));
          return;
        }

        JSZip.loadAsync(content).then(zip => {
          const contentXml = zip.file('content.xml');
          if (contentXml) {
            contentXml.async('string').then(xml => {
              h.render(`<div class="p-4"><div class="font-bold mb-4">${esc(file.name)}</div><div class="bg-white p-4 border rounded shadow-sm text-sm overflow-auto max-h-[70vh]">${esc(xml.substring(0, 10000))}...</div></div>`);
            });
          } else {
            h.showError('ODT Error', 'content.xml not found');
          }
        }).catch(err => h.showError('ODT Error', err.message));
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
