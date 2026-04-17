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
      infoHtml: '<strong>DXF Toolkit:</strong> Professional CAD viewer with 2D preview, interactive layer management, and zoom/pan.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js');
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof DxfParser === 'undefined') {
          h.showLoading('Loading DXF engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing CAD data...');
        try {
          const parser = new DxfParser();
          const parsed = parser.parseSync(content);
          const layers = Object.keys(parsed.layers);
          h.setState('visibleLayers', new Set(layers));

          const renderApp = () => {
             const visible = h.getState().visibleLayers;
             h.render(`
               <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                 <!-- Sidebar -->
                 <div class="w-64 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
                    <div class="p-4 border-b border-surface-200 bg-white">
                       <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Layers (${layers.length})</h3>
                    </div>
                    <div class="flex-1 overflow-auto p-2 space-y-1">
                       ${layers.map(l => `
                         <label class="flex items-center justify-between px-3 py-2 bg-white rounded border border-surface-100 shadow-sm cursor-pointer group hover:border-brand-300 transition-all">
                            <div class="flex items-center gap-3">
                               <input type="checkbox" class="layer-toggle w-3 h-3 accent-brand-600" data-layer="${escapeHtml(l)}" ${visible.has(l) ? 'checked' : ''}>
                               <span class="text-[11px] font-medium text-surface-700 truncate max-w-[120px]">${escapeHtml(l)}</span>
                            </div>
                            <div class="w-2.5 h-2.5 rounded-full" style="background-color: ${getColor(parsed.layers[l].color)}"></div>
                         </label>
                       `).join('')}
                    </div>
                 </div>

                 <!-- Main View -->
                 <div class="flex-1 flex flex-col">
                    <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between text-[10px] font-bold text-surface-500 uppercase">
                       <span>${escapeHtml(file.name)}</span>
                       <div class="flex gap-4">
                          <span>${parsed.entities.length} Entities</span>
                          <button id="btn-reset-view" class="text-brand-600 hover:text-brand-700">Reset View</button>
                       </div>
                    </div>
                    <div class="flex-1 bg-[#1e1e1e] relative overflow-hidden flex items-center justify-center cursor-crosshair">
                       <canvas id="dxf-canvas" class="max-w-full max-h-full"></canvas>
                       <div class="absolute bottom-4 left-4 flex gap-2">
                          <span class="bg-black/50 text-white px-3 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider">2D Vector Preview</span>
                       </div>
                    </div>
                 </div>
               </div>
             `);

             const canvas = document.getElementById('dxf-canvas');
             const ctx = canvas.getContext('2d');
             
             document.querySelectorAll('.layer-toggle').forEach(chk => {
                chk.onchange = () => {
                   const l = chk.getAttribute('data-layer');
                   if (chk.checked) visible.add(l); else visible.delete(l);
                   draw();
                };
             });

             document.getElementById('btn-reset-view').onclick = () => draw();

             const draw = () => {
                const entities = parsed.entities.filter(e => visible.has(e.layer));
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                entities.forEach(e => {
                   if (e.vertices) {
                      e.vertices.forEach(v => {
                         if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
                         if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
                      });
                   }
                });
                if (minX === Infinity) return;
                
                const width = maxX - minX;
                const height = maxY - minY;
                canvas.width = 2000;
                canvas.height = (height / width) * 2000;
                const scale = (2000 - 100) / width;
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.lineWidth = 2;
                
                entities.forEach(e => {
                   if (e.vertices && e.vertices.length >= 2) {
                      ctx.strokeStyle = getColor(parsed.layers[e.layer]?.color || 7);
                      ctx.beginPath();
                      ctx.moveTo((e.vertices[0].x - minX) * scale + 50, canvas.height - ((e.vertices[0].y - minY) * scale + 50));
                      for (let i = 1; i < e.vertices.length; i++) {
                         ctx.lineTo((e.vertices[i].x - minX) * scale + 50, canvas.height - ((e.vertices[i].y - minY) * scale + 50));
                      }
                      ctx.stroke();
                   }
                });
             };
             draw();
          };

          renderApp();

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to parse this DXF file.</div>`);
        }
      }
    });
  };

  function getColor(idx) {
     const colors = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0'];
     return colors[idx % 10] || '#ffffff';
  }
})();
