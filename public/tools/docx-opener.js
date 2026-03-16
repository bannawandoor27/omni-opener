/**
 * OmniOpener — DOCX Viewer Tool
 * Uses OmniTool SDK and Mammoth.js. Renders .docx files as HTML.
 */
(function () {
  'use strict';

  let isMammothReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.docx',
      dropLabel: 'Drop a .docx file here',
      binary: true,
      infoHtml: '<strong>DOCX Viewer:</strong> Renders a preview of .docx files. Powered by Mammoth.js.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.17/mammoth.browser.min.js', function() {
          isMammothReady = true;
        });
      },

      onFile: function (file, content, helpers) {
        if (!isMammothReady) {
          helpers.showError('Dependency not loaded', 'The Mammoth.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Converting .docx to HTML...');

        mammoth.convertToHtml({ arrayBuffer: content })
          .then(function(result){
              const renderHtml = `
                <div class="p-4 bg-white rounded-lg shadow-inner overflow-auto h-full">
                  <div class="prose max-w-none">${result.value}</div>
                </div>
              `;
              helpers.render(renderHtml);
          })
          .catch(function(err){
              helpers.showError('Error rendering .docx', err.message);
          });
      }
    });
  };
})();
