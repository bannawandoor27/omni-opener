(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.crt,.pem,.key,.cer,.der',
      dropLabel: 'Drop a .crt or .pem file here',
      binary: false,
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your certificates never leave your device.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const file = helpers.getFile();
            helpers.download(file ? file.name : 'export.txt', helpers.getContent());
          }
        }
      ],

      onFile: function (file, content, helpers) {
        const highlighted = hljs.highlightAuto(content.slice(0, 50000)).value;
        helpers.render(`
          <pre class="hljs p-4 h-[75vh] overflow-auto rounded-xl shadow-xl"><code>${highlighted}</code></pre>
        `);
      }
    });
  };
})();