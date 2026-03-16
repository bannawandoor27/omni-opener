/**
 * OmniOpener — TXT Viewer Tool
 * Uses OmniTool SDK. Renders .txt files.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.txt',
      dropLabel: 'Drop a .txt file here',
      binary: false,
      infoHtml: '<strong>Text Viewer:</strong> Displays the content of text files.',
      
      onFile: function (file, content, helpers) {
        helpers.showLoading('Rendering text...');

        const renderHtml = `
          <div class="p-4 bg-surface-50 text-surface-800 rounded-lg shadow-inner h-full">
            <pre class="whitespace-pre-wrap font-mono text-sm">${escapeHtml(content)}</pre>
          </div>
        `;
        helpers.render(renderHtml);
      }
    });
  };
})();
