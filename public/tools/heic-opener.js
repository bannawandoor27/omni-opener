(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.heic,.heif',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof heic2any === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', () => this.onFile(file, content, h));
          return;
        }

        h.showLoading('Converting...');
        const blob = new Blob([content]);
        heic2any({ blob, toType: 'image/jpeg' }).then(result => {
          const resultBlob = Array.isArray(result) ? result[0] : result;
          const url = URL.createObjectURL(resultBlob);
          h.render(`<div class="p-4"><div class="font-bold mb-4">${esc(file.name)}</div><img src="${url}" class="max-w-full h-auto shadow-lg rounded-lg" /></div>`);
        }).catch(err => h.showError('HEIC Issue', String(err)));
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
