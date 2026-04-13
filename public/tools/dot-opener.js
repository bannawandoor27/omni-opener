/**
 * OmniOpener — DOT / Graphviz Viewer Tool
 * Uses OmniTool SDK. Renders .dot / .gv diagrams using @hpcc-js/wasm.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dot,.gv',
      dropLabel: 'Drop a DOT or GV file here',
      infoHtml: '<strong>How it works:</strong> This tool uses Graphviz (WebAssembly) to render diagrams directly in your browser. All processing is 100% private and local.',

      actions: [
        {
          label: '📋 Copy Source',
          id: 'copy-source',
          onClick: function (h, btn) {
            const content = h.getContent();
            if (typeof content === 'string') {
              h.copyToClipboard(content, btn);
            }
          }
        },
        {
          label: '📥 Download SVG',
          id: 'download-svg',
          onClick: function (h) {
            const svg = h.getRenderEl().querySelector('svg');
            if (svg) {
              h.download('graph.svg', svg.outerHTML, 'image/svg+xml');
            }
          }
        },
        {
          label: '🖼️ Export PNG',
          id: 'export-png',
          onClick: function (h, btn) {
            const svg = h.getRenderEl().querySelector('svg');
            if (svg) {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const svgData = new XMLSerializer().serializeToString(svg);
              const img = new Image();
              const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(svgBlob);
              img.onload = function () {
                canvas.width = img.width * 2;
                canvas.height = img.height * 2;
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const pngUrl = canvas.toDataURL('image/png');
                h.download('graph.png', pngUrl, 'image/png');
                URL.revokeObjectURL(url);
              };
              img.src = url;
            }
          }
        }
      ],

      onInit: function (h) {
        // Load Graphviz WASM dependency
        if (typeof window['@hpcc-js/wasm'] === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@2.20.0/dist/graphviz.umd.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Rendering graph…');
        
        // Wait for dependency to be available
        function tryRender() {
          if (typeof window['@hpcc-js/wasm'] !== 'undefined') {
            renderGraph(content, h);
          } else {
            setTimeout(tryRender, 100);
          }
        }
        tryRender();
      }
    });
  };

  /**
   * Render the DOT string using @hpcc-js/wasm
   */
  function renderGraph(dotStr, h) {
    const hpccWasm = window['@hpcc-js/wasm'];
    hpccWasm.Graphviz.load().then(function (graphviz) {
      try {
        const svg = graphviz.dot(dotStr);
        h.render('<div class="p-8 flex items-center justify-center overflow-auto">' + svg + '</div>');
        
        // Make the SVG responsive
        const svgEl = h.getRenderEl().querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      } catch (err) {
        h.showError('Rendering Error', err.message);
      }
    }).catch(function (err) {
      h.showError('Graphviz Error', err.message);
    });
  }

})();
