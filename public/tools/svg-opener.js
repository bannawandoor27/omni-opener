/**
 * OmniOpener — SVG Toolkit
 * Uses OmniTool SDK and jsPDF.
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
      accept: '.svg',
      dropLabel: 'Drop an .svg file here',
      binary: false,
      infoHtml: '<strong>SVG Toolkit:</strong> Professional SVG utility with color swapping, framework code generation, and multi-format export.',

      actions: [
        {
          label: '📋 Copy Minified',
          id: 'copy-mini',
          onClick: function (helpers, btn) {
            const content = helpers.getContent();
            if (content) {
              const mini = content.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
              helpers.copyToClipboard(mini, btn);
            }
          }
        },
        {
          label: '🌓 Invert Colors',
          id: 'invert-colors',
          onClick: function (helpers) {
            const content = helpers.getContent();
            if (!content) return;
            const inverted = content.replace(/#([0-9a-fA-F]{3,6})/g, function(match, hex) {
              if (hex.length === 3) hex = hex.split('').map(function(c) { return c + c; }).join('');
              const r = 255 - parseInt(hex.substring(0, 2), 16);
              const g = 255 - parseInt(hex.substring(2, 4), 16);
              const b = 255 - parseInt(hex.substring(4, 6), 16);
              return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
            });
            helpers.setState('content', inverted);
            renderSvg(helpers.getFile(), inverted, helpers);
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      },

      onFile: function(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(function() { renderSvg(file, content, helpers); }, 500);
          return;
        }
        renderSvg(file, content, helpers);
      }
    });
  };

  function renderSvg(file, content, helpers) {
    if (typeof hljs === 'undefined') {
      helpers.showLoading('Loading highlighter...');
      setTimeout(function() { renderSvg(file, content, helpers); }, 500);
      return;
    }

    helpers.showLoading('Rendering SVG...');

    try {
      const highlighted = hljs.highlight(content, { language: 'xml' }).value;
      const colorMatches = content.match(/#[0-9a-fA-F]{3,6}/g) || [];
      const uniqueColors = [...new Set(colorMatches)];

      const renderHtml = `
        <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <!-- Controls -->
          <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <label class="text-[10px] font-bold uppercase text-surface-400">Zoom</label>
                <input type="range" id="svg-zoom" min="0.1" max="5" step="0.1" value="1" class="w-20 accent-brand-500">
                <span id="zoom-val" class="text-[10px] font-mono w-8">100%</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase text-surface-400">BG:</span>
                <div class="flex bg-white border border-surface-200 rounded-lg p-0.5">
                   <button id="bg-check" class="w-6 h-6 rounded bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] border border-brand-500"></button>
                   <button id="bg-white" class="w-6 h-6 rounded bg-white border border-transparent"></button>
                   <button id="bg-dark" class="w-6 h-6 rounded bg-surface-900 border border-transparent"></button>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase text-surface-400">Colors:</span>
                <div id="color-palette" class="flex gap-1">
                  ${uniqueColors.slice(0, 5).map(c => `
                    <button class="svg-color-swatch w-4 h-4 rounded-full border border-surface-300 shadow-sm transition-transform hover:scale-125"
                      style="background-color: ${c}" title="${c}" data-color="${c}"></button>
                  `).join('')}
                </div>
              </div>
              <div class="flex gap-1">
                 <select id="export-format" class="text-[10px] font-bold border border-surface-200 rounded px-2 py-1 outline-none">
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                    <option value="pdf">PDF</option>
                 </select>
                 <button id="btn-export" class="px-2 py-1 text-[10px] font-bold bg-brand-600 text-white rounded shadow-sm hover:bg-brand-700">Export</button>
              </div>
            </div>
          </div>

          <!-- Viewport -->
          <div id="svg-viewport" class="flex-1 overflow-auto bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] flex items-center justify-center p-8 relative">
            <div id="svg-container" class="transition-all duration-200 ease-out origin-center">
              ${content}
            </div>
          </div>

          <!-- Bottom Panels -->
          <div class="shrink-0 h-64 border-t border-surface-200 bg-white overflow-hidden flex flex-col">
            <div class="flex border-b border-surface-200 bg-surface-50">
               <button id="tab-source" class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600">Source</button>
               <button id="tab-framework" class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400">Framework Code</button>
            </div>
            <div class="flex-1 overflow-hidden relative">
               <pre id="view-source" class="absolute inset-0 overflow-auto p-4 font-mono text-[11px] leading-tight hljs language-xml">${highlighted}</pre>
               <div id="view-framework" class="absolute inset-0 overflow-auto p-4 bg-surface-50 hidden">
                  <div class="flex gap-2 mb-4">
                     <button id="gen-react" class="px-3 py-1 bg-white border border-surface-200 rounded text-[10px] font-bold">React</button>
                     <button id="gen-vue" class="px-3 py-1 bg-white border border-surface-200 rounded text-[10px] font-bold">Vue</button>
                  </div>
                  <pre id="framework-output" class="text-[10px] font-mono text-surface-700 whitespace-pre"></pre>
               </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(renderHtml);

      const container = document.getElementById('svg-container');
      const viewport = document.getElementById('svg-viewport');
      const zoomInput = document.getElementById('svg-zoom');
      const zoomVal = document.getElementById('zoom-val');

      // Color swatch click — replace color in SVG
      document.querySelectorAll('.svg-color-swatch').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const oldColor = btn.getAttribute('data-color');
          const newColor = prompt('Replace ' + oldColor + ' with (hex):', oldColor);
          if (newColor && newColor !== oldColor) {
            const newContent = helpers.getContent().split(oldColor).join(newColor);
            helpers.setState('content', newContent);
            renderSvg(file, newContent, helpers);
          }
        });
      });

      function updateTransform() {
        container.style.transform = 'scale(' + zoomInput.value + ')';
        zoomVal.textContent = Math.round(zoomInput.value * 100) + '%';
      }
      zoomInput.addEventListener('input', updateTransform);

      // BG Toggles
      document.getElementById('bg-check').onclick = function() {
         viewport.className = "flex-1 overflow-auto bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=')] flex items-center justify-center p-8 relative";
      };
      document.getElementById('bg-white').onclick = function() { viewport.className = 'flex-1 overflow-auto bg-white flex items-center justify-center p-8 relative'; };
      document.getElementById('bg-dark').onclick = function() { viewport.className = 'flex-1 overflow-auto bg-surface-900 flex items-center justify-center p-8 relative'; };

      // Tabs
      const tabSource = document.getElementById('tab-source');
      const tabFrame = document.getElementById('tab-framework');
      const viewSource = document.getElementById('view-source');
      const viewFrame = document.getElementById('view-framework');

      tabSource.onclick = function() {
         tabSource.className = 'px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600';
         tabFrame.className = 'px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400';
         viewSource.classList.remove('hidden');
         viewFrame.classList.add('hidden');
      };

      tabFrame.onclick = function() {
         tabFrame.className = 'px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600';
         tabSource.className = 'px-4 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400';
         viewFrame.classList.remove('hidden');
         viewSource.classList.add('hidden');
         generateCode('react');
      };

      function generateCode(type) {
         const svg = helpers.getContent();
         const output = document.getElementById('framework-output');
         if (type === 'react') {
            const jsx = svg.replace(/class=/g, 'className=').replace(/fill-rule=/g, 'fillRule=');
            output.textContent = 'const MyIcon = (props) => (\n  ' + jsx.split('\n').join('\n  ') + '\n);';
         } else {
            output.textContent = '<template>\n  ' + svg.split('\n').join('\n  ') + '\n</template>';
         }
      }

      document.getElementById('gen-react').onclick = function() { generateCode('react'); };
      document.getElementById('gen-vue').onclick = function() { generateCode('vue'); };

      document.getElementById('btn-export').onclick = function() {
         const format = document.getElementById('export-format').value;
         if (format === 'pdf') exportPdf(helpers);
         else exportImage(helpers, format);
      };

    } catch (err) {
      helpers.showError('Failed to render SVG', err.message);
    }
  }

  function exportPdf(helpers) {
    if (!window.jspdf) { alert('PDF export library not loaded yet. Please wait a moment and try again.'); return; }
    const svgEl = document.querySelector('#svg-container svg');
    if (!svgEl) return;
    const { jsPDF } = window.jspdf;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const pdf = new jsPDF();
    pdf.text('SVG Export from OmniOpener', 10, 10);
    pdf.text(svgData.substring(0, 1000), 10, 20);
    pdf.save(helpers.getFile().name.replace(/\.svg$/i, '.pdf'));
  }

  function exportImage(helpers, format) {
    const svgEl = document.querySelector('#svg-container svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const bbox = svgEl.getBoundingClientRect();
    const width = svgEl.width.baseVal.value || bbox.width || 800;
    const height = svgEl.height.baseVal.value || bbox.height || 600;
    canvas.width = width * 2;
    canvas.height = height * 2;
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = function() {
      if (format === 'jpeg') {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const mimeType = 'image/' + format;
      canvas.toBlob(function(blob) {
        if (blob) {
          helpers.download(helpers.getFile().name.replace(/\.svg$/i, '.' + format), blob, mimeType);
        }
      }, mimeType);
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      alert('Failed to export SVG as image.');
    };
    img.src = url;
  }
})();
