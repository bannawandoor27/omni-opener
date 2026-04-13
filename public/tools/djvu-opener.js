(function () {
  'use strict';

  /**
   * OmniOpener — DjVu Viewer Tool
   * Uses OmniTool SDK and DjVu.js. Provides a full browser-based DjVu viewing experience.
   */
  window.initTool = function (toolConfig, mountEl) {
    let viewer = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.djvu,.djv',
      binary: true,
      dropLabel: 'Drop a DjVu file here',
      infoHtml: '<strong>Privacy:</strong> DjVu files are processed entirely in your browser using djvu.js. No data is sent to any server.',

      actions: [
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        },
        {
          label: '🖼️ Export Page (PNG)',
          id: 'export-png',
          onClick: function (h) {
            const container = document.getElementById('djvu-render-container');
            if (container) {
              // DjVu.js Viewer renders the page into a canvas
              const canvas = container.querySelector('canvas');
              if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                const pageNum = (viewer && typeof viewer.pageNumber !== 'undefined') ? viewer.pageNumber : 'page';
                h.download(`djvu-page-${pageNum}.png`, dataUrl, 'image/png');
              } else {
                alert('Please wait for the page to finish rendering.');
              }
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://djvu.js.org/djvu_viewer.css');
        h.loadScripts([
          'https://djvu.js.org/djvu.js',
          'https://djvu.js.org/djvu_viewer.js'
        ]);
      },

      onFile: function (file, content, h) {
        if (typeof DjVu === 'undefined' || typeof DjVu.Viewer === 'undefined') {
          h.showLoading('Initializing DjVu engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        // Prepare the render area
        h.render('<div id="djvu-render-container" class="w-full h-[75vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-100 shadow-inner"></div>');
        const container = document.getElementById('djvu-render-container');

        try {
          // Initialize the viewer
          viewer = new DjVu.Viewer();
          viewer.render(container);

          // Load the document from the ArrayBuffer
          // DjVu.js Viewer handles its own internal loading state/spinner
          viewer.loadDocument(content).catch(err => {
            h.showError('Failed to Load DjVu', err.message || 'The file might be corrupted or in an unsupported DjVu format.');
          });
        } catch (err) {
          h.showError('Viewer Error', err.message);
        }
      },

      onDestroy: function () {
        viewer = null;
      }
    });
  };
})();
