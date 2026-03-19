(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.tif,.tiff',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof UTIF === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const ifds = UTIF.decode(content);
          UTIF.decodeImage(content, ifds[0]);
          const rgba = UTIF.toRGBA8(ifds[0]);
          const width = parseInt(ifds[0].width);
          const height = parseInt(ifds[0].height);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.className = 'max-w-full h-auto shadow-lg rounded-lg';
          const ctx = canvas.getContext('2d');
          const imgData = ctx.createImageData(width, height);
          imgData.data.set(rgba);
          ctx.putImageData(imgData, 0, 0);

          h.render('<div class="p-4 flex flex-col items-center gap-4" id="tiff-mount"></div>');
          document.getElementById('tiff-mount').appendChild(canvas);
        } catch (err) {
          h.showError('TIFF Error', err.message);
        }
      }
    });
  };
})();
