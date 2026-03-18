(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.egg',
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
          const files = Object.keys(zip.files);
          h.render(`
            <div class="p-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              <div class="bg-white p-4 border rounded shadow-sm text-sm">
                Found ${files.length} files.
              </div>
            </div>
          `);
        }).catch(err => h.showError('Egg Error', err.message));
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
