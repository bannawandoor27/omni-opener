/**
 * OmniOpener — ODT Viewer Tool
 * Uses OmniTool SDK and odt.js. Renders .odt files as HTML.
 */
(function () {
  'use strict';

  let isOdtJsReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.odt',
      dropLabel: 'Drop an .odt file here',
      binary: true,
      infoHtml: '<strong>ODT Viewer:</strong> Renders a preview of .odt files.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/odt.js/odt.min.js', function() {
          isOdtJsReady = true;
        });
      },

      onFile: function (file, content, helpers) {
        if (!isOdtJsReady) {
          helpers.showError('Dependency not loaded', 'The odt.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Converting .odt to HTML...');

        try {
          const odt = new ODT(content);
          const html = odt.getHTML();
          
          const renderHtml = `
            <div class="p-4 bg-white rounded-lg shadow-inner overflow-auto h-full">
              <div class="prose max-w-none">${html}</div>
            </div>
          `;
          helpers.render(renderHtml);
          
        } catch (err) {
            helpers.showError('Error rendering .odt', err.message);
        }
      }
    });
  };
})();
