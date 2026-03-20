(function() {
  'use strict';

  const PSD_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/psd.js/3.2.0/psd.min.js';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.psd',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript(PSD_LIB_URL);
      },
      onFile: function(file, content, helpers) {
        if (typeof window.PSD === 'undefined') {
          helpers.showLoading('Loading PSD engine...');
          helpers.loadScript(PSD_LIB_URL, () => this.onFile(file, content, helpers));
          return;
        }

        try {
          const psd = new window.PSD(new Uint8Array(content));
          psd.parse();
          
          const canvas = psd.image.toCanvas();
          canvas.className = 'max-w-full h-auto shadow-lg rounded-lg';
          
          helpers.render(`
            <div class="p-4 bg-surface-50 border-b flex justify-between items-center mb-4">
              <span class="font-bold">${esc(file.name)}</span>
              <span class="text-sm text-surface-500">${psd.header.width}x${psd.header.height}</span>
            </div>
            <div id="psd-mount" class="flex justify-center p-4 bg-surface-100 rounded-lg overflow-auto"></div>
          `);
          
          document.getElementById('psd-mount').appendChild(canvas);
        } catch (err) {
          helpers.showError('Error', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
