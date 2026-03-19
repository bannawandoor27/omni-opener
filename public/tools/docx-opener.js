(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.docx',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof mammoth === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js', () => this.onFile(file, content, h));
          return;
        }

        h.showLoading('Converting...');
        mammoth.convertToHtml({ arrayBuffer: content })
          .then(result => {
            h.render(`<div class="p-4 bg-white rounded shadow-inner overflow-auto max-h-[70vh]"><div class="prose max-w-none">${result.value}</div></div>`);
          })
          .catch(err => h.showError('Issue', err.message));
      }
    });
  };
})();
