(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ico',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://unpkg.com/icojs@0.20.1/dist/icojs.js');
      },
      onFile: function(file, content, helpers) {
        if (typeof ICO === 'undefined') {
          helpers.showLoading('Loading engine...');
          helpers.loadScript('https://unpkg.com/icojs@0.20.1/dist/icojs.js', () => this.onFile(file, content, helpers));
          return;
        }

        helpers.showLoading('Parsing ICO...');
        ICO.parse(content).then(images => {
          helpers.render('<div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-4" id="ico-mount"></div>');
          images.forEach(img => {
            const blob = new Blob([img.buffer], { type: 'image/png' });
            const url = URL.createObjectURL(blob);
            const div = document.createElement('div');
            div.className = 'p-2 border rounded text-center bg-white';
            div.innerHTML = `<img src="${url}" class="mx-auto mb-2" /><div>${img.width}x${img.height}</div>`;
            document.getElementById('ico-mount').appendChild(div);
          });
        }).catch(err => helpers.showError('Error', err.message));
      }
    });
  };
})();
