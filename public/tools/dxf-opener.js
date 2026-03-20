/**
 * OmniOpener — DXF Toolkit
 * Uses OmniTool SDK and dxf-parser.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      infoHtml: '<strong>DXF Toolkit:</strong> Professional CAD viewer with 2D preview, layer management, and entity inspection.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js');
      },

      onFile: function (file, content, h) {
        if (typeof DxfParser === 'undefined') {
          h.showLoading('Loading DXF engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing CAD data...');
        try {
          const parser = new DxfParser();
          const parsed = parser.parseSync(content);
          
          const layers = Object.keys(parsed.layers);
          
          h.render(`
            <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
              <!-- Sidebar -->
              <div class="w-64 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
                 <div class="p-4 border-b border-surface-200 bg-white">
                    <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Layers (${layers.length})</h3>
                 </div>
                 <div class="flex-1 overflow-auto p-2 space-y-1">
                    ${layers.map(l => `
                      <div class="flex items-center justify-between px-3 py-2 bg-white rounded border border-surface-100 shadow-sm">
                         <span class="text-[11px] font-medium text-surface-700 truncate">${escapeHtml(l)}</span>
                         <div class="w-3 h-3 rounded-full" style="background-color: ${getColor(parsed.layers[l].color)}"></div>
                      </div>
                    `).join('')}
                 </div>
              </div>

              <!-- Main View -->
              <div class="flex-1 flex flex-col">
                 <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between text-[10px] font-bold text-surface-500 uppercase">
                    <span>${escapeHtml(file.name)}</span>
                    <span>${parsed.entities.length} Entities</span>
                 </div>
                 <div class="flex-1 bg-[#1e1e1e] relative overflow-hidden flex items-center justify-center">
                    <canvas id="dxf-canvas" class="max-w-full max-h-full"></canvas>
                    <div class="absolute bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-[10px]">2D Preview Mode</div>
                 </div>
              </div>
            </div>
          `);

          renderCanvas(parsed.entities);

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to parse this DXF file.</div>`);
        }
      }
    });
  };

  function getColor(idx) {
     const colors = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff'];
     return colors[idx % 8] || '#ffffff';
  }

  function renderCanvas(entities) {
     const canvas = document.getElementById('dxf-canvas');
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     
     // Find bounds
     let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
     entities.forEach(e => {
        if (e.vertices) {
           e.vertices.forEach(v => {
              if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
              if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
           });
        }
     });

     if (minX === Infinity) { minX = -100; minY = -100; maxX = 100; maxY = 100; }
     
     const width = maxX - minX;
     const height = maxY - minY;
     const padding = 20;
     
     canvas.width = 1000;
     canvas.height = (height / width) * 1000;
     
     const scale = (1000 - padding * 2) / width;
     
     ctx.strokeStyle = '#00ff00';
     ctx.lineWidth = 1;
     
     entities.forEach(e => {
        if (e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
           const v = e.vertices;
           if (!v || v.length < 2) return;
           ctx.beginPath();
           ctx.moveTo((v[0].x - minX) * scale + padding, canvas.height - ((v[0].y - minY) * scale + padding));
           for (let i = 1; i < v.length; i++) {
              ctx.lineTo((v[i].x - minX) * scale + padding, canvas.height - ((v[i].y - minY) * scale + padding));
           }
           ctx.stroke();
        }
     });
  }
})();
