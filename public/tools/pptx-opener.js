(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pptx',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js', () => {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/pptx2html@0.3.4/dist/pptx2html.min.js');
          });
        });
      },
      onFile: function (file, content, h) {
        if (typeof jQuery === 'undefined' || typeof JSZip === 'undefined' || !jQuery.fn.pptx2html) {
          h.showLoading('Loading engine...');
          setTimeout(() => this.onFile(file, content, h), 1000);
          return;
        }

        h.showLoading('Converting...');
        const div = document.createElement('div');
        div.className = 'p-4 bg-white min-h-[400px]';
        h.render(div);

        $(div).pptx2html({
          pptxFile: file,
          slideMode: false,
          keyBoardShortCut: false,
          callback: (result) => {
            if (!result.success) h.showError('Error', result.msg);
            else h.hideLoading();
          }
        });
      }
    });
  };
})();
