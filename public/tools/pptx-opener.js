/**
 * OmniOpener — PPTX Viewer Tool
 * Uses OmniTool SDK and pptx2html. Renders .pptx files as HTML.
 */
(function () {
  'use strict';

  let isPptx2HtmlReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pptx',
      dropLabel: 'Drop a .pptx file here',
      binary: true,
      infoHtml: '<strong>PPTX Viewer:</strong> Renders a preview of .pptx files. Powered by pptx2html.',
      
      onInit: function(helpers) {
        // Main library
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pptx2html@0.1.3/dist/pptx2html.min.js', function() {
          isPptx2HtmlReady = true;
        });
        // Dependencies for pptx2html
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js');

      },

      onFile: function (file, content, helpers) {
        if (!isPptx2HtmlReady || typeof jQuery === 'undefined' || typeof JSZip === 'undefined') {
          helpers.showError('Dependency not loaded', 'The pptx2html library or its dependencies are still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Converting .pptx to HTML...');
        
        const renderContainer = document.createElement('div');
        helpers.render(renderContainer);


        $(renderContainer).pptx2html({
          pptxFile: file,
          fileInput: null,
          slideMode: false,
          keyBoardShortCut: false,
          mediaProcess: false, /* Disable media processing for security */
          callback: function(result) {
            if (result.success) {
              helpers.hideLoading();
            } else {
              helpers.showError('Error rendering .pptx', result.msg);
            }
          }
        });
      }
    });
  };
})();
