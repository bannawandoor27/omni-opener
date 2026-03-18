(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.rtf',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://unpkg.com/rtf.js@3.0.0/dist/RTFJS.bundle.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof RTFJS === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://unpkg.com/rtf.js@3.0.0/dist/RTFJS.bundle.min.js', () => this.onFile(file, content, h));
          return;
        }

        h.showLoading('Converting...');
        try {
          const doc = new RTFJS.Document(content);
          doc.render().then(elements => {
            const div = document.createElement('div');
            div.className = 'p-4 bg-white rounded shadow-inner overflow-auto max-h-[70vh] prose max-w-none';
            elements.forEach(el => div.appendChild(el));
            h.render(div);
          }).catch(err => h.showError('Render Error', err.message));
        } catch (err) {
          h.showError('Parse Error', err.message);
        }
      }
    });
  };
})();
