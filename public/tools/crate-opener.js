(function () {
  'use strict';

  let Archive = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.crate',
      binary: true,
      onFile: async function (file, content, h) {
        h.showLoading('Initializing engine...');
        try {
          if (!Archive) {
            const module = await import('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/main.js');
            Archive = module.Archive;
            Archive.init({ workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js' });
          }
          h.showLoading('Reading Crate...');
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();
          h.render(`<div class="p-4"><h3>${esc(file.name)}</h3><ul>${entries.map(e => `<li>${esc(e.path)}</li>`).join('')}</ul></div>`);
        } catch (err) {
          h.showError('Crate Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
