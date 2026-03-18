(function() {
  'use strict';
  let Archive = null;
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.appimage',
      binary: true,
      onFile: async function(file, content, helpers) {
        helpers.showLoading('Initializing engine...');
        try {
          if (!Archive) {
            const module = await import('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/main.js');
            Archive = module.Archive;
            Archive.init({ workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js' });
          }
          helpers.showLoading('Reading AppImage...');
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();
          helpers.render('<div class="p-4"><h3>' + file.name + '</h3><ul>' + entries.map(e => '<li>' + e.path + '</li>').join('') + '</ul></div>');
        } catch (err) { helpers.showError('Error', err.message); }
      }
    });
  };
})();
