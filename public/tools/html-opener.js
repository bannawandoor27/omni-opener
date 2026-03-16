/**
 * OmniOpener — HTML Viewer Tool
 * Uses OmniTool SDK. Renders .html files in a sandboxed iframe.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.html,.htm',
      dropLabel: 'Drop an .html file here',
      binary: false,
      infoHtml: '<strong>HTML Viewer:</strong> Renders HTML files in a sandboxed preview.',
      
      onFile: function (file, content, helpers) {
        helpers.showLoading('Rendering HTML...');

        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.setAttribute('srcdoc', content);
        iframe.setAttribute('class', 'w-full h-full border-0');
        
        const renderContainer = document.createElement('div');
        renderContainer.setAttribute('class', 'w-full h-full');
        renderContainer.appendChild(iframe);
        
        helpers.render(renderContainer);
      }
    });
  };
})();
