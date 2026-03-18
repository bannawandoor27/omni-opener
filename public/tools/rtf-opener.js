/**
 * OmniOpener — RTF Viewer Tool
 * Uses OmniTool SDK and rtf.js. Renders .rtf files as HTML.
 */
(function () {
  'use strict';

  let isRtfJsReady = false;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.rtf',
      dropLabel: 'Drop an .rtf file here',
      binary: false,
      infoHtml: '<strong>RTF Viewer:</strong> Renders a preview of .rtf files.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://unpkg.com/rtf.js@3.0.0/dist/RTFJS.bundle.min.js', function() {
          isRtfJsReady = true;
          RTFJS.logging = false;
          RTFJS.rendering = false;
        });
      },

      onFile: function (file, content, helpers) {
        if (!isRtfJsReady) {
          helpers.showError('Dependency not loaded', 'The rtf.js library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Converting .rtf to HTML...');

        try {
          const doc = new RTFJS.Document(str2ab(content));
          
          doc.render().then(function(htmlElements) {
            const container = document.createElement('div');
            container.className = 'prose max-w-none';
            htmlElements.forEach(el => container.appendChild(el));
            helpers.render(container);
          }).catch(err => {
            helpers.showError('Error rendering .rtf', err.message);
          });
          
        } catch(e) {
            helpers.showError('Error parsing .rtf', e.message);
        }
      }
    });
    
    function str2ab(str) {
      var buf = new ArrayBuffer(str.length);
      var bufView = new Uint8Array(buf);
      for (var i=0, strLen=str.length; i<strLen; i++) {
        bufView[i] = str.charCodeAt(i);
      }
      return buf;
    }
  };
})();
