(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.key,.pub',
      binary: false,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof forge === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const pems = forge.pem.decode(content);
          if (pems.length === 0) {
            h.render('<div class="p-8 text-center text-surface-500">No PEM blocks found.</div>');
            return;
          }

          h.render(`
            <div class="p-4 space-y-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              ${pems.map(p => `
                <div class="p-4 border rounded shadow-sm bg-white font-mono text-xs overflow-auto">
                  <div class="font-bold mb-2 uppercase text-brand-600">${esc(p.type)}</div>
                  <div class="whitespace-pre-wrap break-all">${esc(content.substring(content.indexOf('-----BEGIN'), content.indexOf('-----END') + 64))}</div>
                </div>
              `).join('')}
            </div>
          `);
        } catch (err) {
          h.showError('PEM Error', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
