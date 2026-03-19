(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentPsContent = '';

    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.eps',
      binary: true,
      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },
      onFile: function (file, arrayBuffer, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', () => this.onFile(file, arrayBuffer, helpers));
          return;
        }

        try {
          const data = new Uint8Array(arrayBuffer);
          let psContent = '';
          if (data[0] === 0xC5 && data[1] === 0xD0 && data[2] === 0xD3 && data[3] === 0xC6) {
             const psStart = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
             const psLength = data[8] | (data[9] << 8) | (data[10] << 16) | (data[11] << 24);
             psContent = new TextDecoder('ascii').decode(data.slice(psStart, psStart + psLength));
          } else {
             psContent = new TextDecoder('utf-8').decode(data);
          }
          currentPsContent = psContent;
          
          const highlighted = hljs.highlightAuto(psContent.substring(0, 100000)).value;
          helpers.render(`
            <div class="p-4 bg-surface-50 border-b flex justify-between items-center">
              <span class="font-bold">${esc(file.name)}</span>
            </div>
            <pre class="hljs p-4 overflow-auto max-h-[70vh] rounded-b-lg"><code>${highlighted}</code></pre>
          `);
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
