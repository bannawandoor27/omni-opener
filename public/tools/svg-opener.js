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
      infoHtml: '<strong>SVG Viewer:</strong> Professional SVG toolkit with zoom, rotate, filters, and export options.',
      
      actions: [
        {
          label: '📋 Copy Source', 
          id: 'copy-source', 
          onClick: function (helpers, btn) {
            const content = helpers.getContent();
            if (content) {
              helpers.copyToClipboard(content, btn);
            }
          } 
        },
        {
          label: '📥 Download SVG', 
          id: 'dl-svg', 
          onClick: function (helpers) {
            const content = helpers.getContent();
            if (content) {
              helpers.download(helpers.getFile().name, content, 'image/svg+xml');
            }
          }
        },
        {
          label: '🖼️ Export PNG',
          id: 'export-png',
          onClick: function (helpers) {
            exportImage(helpers, 'png');
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      onFile: function _onFile(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Rendering SVG...');
        
        try {
          const highlighted = hljs.highlight(content, { language: 'xml' }).value;
          
          const renderHtml = `
            <div class="flex flex-col h-[80vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <!-- Controls -->
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2">
                    <label class="text-[10px] font-bold uppercase text-surface-400">Zoom</label>
                    <input type="range" id="svg-zoom" min="0.1" max="5" step="0.1" value="1" class="w-24 accent-brand-500">
                    <span id="zoom-val" class="text-[10px] font-mono w-8">100%</span>
                  </div>
                  <div class="flex items-center gap-2 border-l border-surface-200 pl-4">
                    <label class="text-[10px] font-bold uppercase text-surface-400">Rotate</label>
                    <input type="range" id="svg-rotate" min="0" max="360" step="90" value="0" class="w-24 accent-brand-500">
                    <span id="rotate-val" class="text-[10px] font-mono w-8">0°</span>
                  </div>
                  <div class="flex items-center gap-2 border-l border-surface-200 pl-4">
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="svg-grayscale" class="sr-only peer">
                      <div class="w-7 h-4 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-500"></div>
                      <span class="ml-2 text-[10px] font-bold uppercase text-surface-400">Grayscale</span>
                    </label>
                  </div>
                </div>
              </div>

              <!-- Viewport -->
              <div class="flex-1 overflow-auto bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] flex items-center justify-center p-8">
                <div id="svg-container" class="transition-transform duration-200 ease-out origin-center">
                  ${content}
                </div>
              </div>

              <!-- Source -->
              <div class="shrink-0 h-48 border-t border-surface-200 bg-surface-50 overflow-hidden flex flex-col">
                <div class="px-4 py-1.5 border-b border-surface-200 flex items-center justify-between">
                  <span class="text-[10px] font-bold uppercase text-surface-400">Source Code</span>
                </div>
                <pre class="flex-1 overflow-auto p-4 font-mono text-[11px] leading-tight hljs language-xml">${highlighted}</pre>
              </div>
            </div>
          `;
          
          helpers.render(renderHtml);

          const container = document.getElementById('svg-container');
          const zoomInput = document.getElementById('svg-zoom');
          const rotateInput = document.getElementById('svg-rotate');
          const grayscaleInput = document.getElementById('svg-grayscale');
          const zoomVal = document.getElementById('zoom-val');
          const rotateVal = document.getElementById('rotate-val');

          function updateTransform() {
            const zoom = zoomInput.value;
            const rotate = rotateInput.value;
            const grayscale = grayscaleInput.checked ? 'grayscale(100%)' : 'none';
            
            container.style.transform = `scale(${zoom}) rotate(${rotate}deg)`;
            container.style.filter = grayscale;
            zoomVal.textContent = Math.round(zoom * 100) + '%';
            rotateVal.textContent = rotate + '°';
          }

          zoomInput.addEventListener('input', updateTransform);
          rotateInput.addEventListener('input', updateTransform);
          grayscaleInput.addEventListener('change', updateTransform);

        } catch (err) {
          helpers.showError('Failed to render SVG', err.message);
        }
      }
    });
  };

  function exportImage(helpers, format) {
    const svgEl = document.querySelector('#svg-container svg');
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    // Get dimensions
    const bbox = svgEl.getBoundingClientRect();
    const width = svgEl.width.baseVal.value || bbox.width || 800;
    const height = svgEl.height.baseVal.value || bbox.height || 600;
    
    canvas.width = width * 2; // Supersample
    canvas.height = height * 2;
    
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = function() {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      
      const dataUrl = canvas.toDataURL(`image/${format}`);
      helpers.download(helpers.getFile().name.replace(/\.svg$/i, `.${format}`), dataUrl, `image/${format}`, true);
    };
    img.src = url;
  }


})();
