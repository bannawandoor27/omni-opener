/**
 * OmniOpener — SVG Viewer Tool
 * Uses OmniTool SDK. Renders .svg files as images and shows the source code.
 */
(function () {
  'use strict';

  let rawSvgContent = '';

  // Helper function to escape HTML characters for safe rendering in <pre>
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.svg',
      dropLabel: 'Drop an .svg file here',
      binary: false,
      infoHtml: '<strong>SVG Viewer:</strong> Renders a preview of your SVG file and displays its source code.',
      
      actions: [
        {
          label: '📋 Copy Source', 
          id: 'copy-source', 
          onClick: function (helpers, btn) {
            if (rawSvgContent) {
              helpers.copyToClipboard(rawSvgContent, btn);
            }
          } 
        },
        {
          label: '📥 Download SVG', 
          id: 'dl-svg', 
          onClick: function (helpers) {
            if (rawSvgContent) {
              const originalFilename = helpers.getFile().name;
              helpers.download(originalFilename, rawSvgContent, 'image/svg+xml');
            }
          }
        },
      ],

      onFile: function (file, content, helpers) {
        helpers.showLoading('Rendering SVG...');
        rawSvgContent = content;
        
        try {
          // Basic validation: Check if it looks like an SVG
          if (!content.trim().startsWith('<svg')) {
            helpers.showError('Invalid File', 'This does not appear to be a valid SVG file.');
            return;
          }
          
          const renderHtml = `
            <div class="flex flex-col h-full">
              <div class="flex-shrink-0 p-4 border-b border-surface-200">
                <h3 class="text-lg font-semibold text-brand-800">SVG Preview</h3>
                <div class="mt-2 p-4 bg-white rounded shadow-inner flex justify-center items-center">
                  ${content}
                </div>
              </div>
              <div class="flex-grow p-4 bg-surface-50 overflow-auto">
                <h3 class="text-md font-semibold text-surface-700">SVG Source Code</h3>
                <pre class="mt-2 p-3 bg-surface-100 text-surface-800 rounded-lg shadow-inner whitespace-pre-wrap font-mono text-xs">${escapeHtml(content)}</pre>
              </div>
            </div>
          `;
          
          helpers.render(renderHtml);

        } catch (err) {
          helpers.showError('Failed to render SVG', err.message);
          rawSvgContent = '';
        }
      }
    });
  };

})();
