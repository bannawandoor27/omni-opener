/**
 * OmniOpener — DWG Viewer & Converter
 * Uses @mlightcad/libredwg-web (LibreDWG WASM) to parse DWG files entirely in the browser.
 * Renders vector geometry as SVG and supports export to DXF/JSON.
 */
(function () {
  'use strict';

  let currentDatabase = null;
  let currentSvg = '';
  let layerSearchQuery = '';

  const aciColors = {
    1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#000000',
    8: '#808080', 9: '#c0c0c0', 250: '#333333', 251: '#555555', 252: '#777777', 253: '#999999', 254: '#bbbbbb', 255: '#ffffff'
  };

  function getHexColor(index, fallback = '#888888') {
    return aciColors[index] || fallback;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dwg',
      dropLabel: 'Drop a .dwg file here',
      binary: true,
      onInit: function (helpers) {
        // Load LibreDWG WASM wrapper
        helpers.loadScript('https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.1.7/dist/index.js');
      },
      onFile: async function (file, content, helpers) {
        if (typeof LibreDwg === 'undefined') {
          helpers.showLoading('Initializing DWG engine...');
          await new Promise(resolve => {
            const check = setInterval(() => {
              if (typeof LibreDwg !== 'undefined') {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
        }

        helpers.showLoading('Parsing DWG binary...');
        await new Promise(r => setTimeout(r, 10));

        try {
          const libredwg = await LibreDwg.create();
          const dwg = libredwg.dwg_read_data(new Uint8Array(content), 0); // 0 = DWG
          const db = libredwg.convert(dwg);
          currentDatabase = db;
          
          // Free WASM memory
          libredwg.dwg_free(dwg);

          renderTool(db, file, helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Failed to parse DWG', 'The file may be in an unsupported version or corrupted.');
        }
      },
      actions: [
        {
          label: '📋 Copy SVG',
          id: 'copy-svg',
          onClick: (helpers, btn) => {
            if (currentSvg) helpers.copyToClipboard(currentSvg, btn);
          }
        },
        {
          label: '📥 Download SVG',
          id: 'dl-svg',
          onClick: (helpers) => {
            if (currentSvg) {
              const name = helpers.getFile().name.replace(/\.dwg$/i, '') + '.svg';
              helpers.download(name, currentSvg, 'image/svg+xml');
            }
          }
        },
        {
          label: '📥 Export JSON',
          id: 'dl-json',
          onClick: (helpers) => {
            if (currentDatabase) {
              const name = helpers.getFile().name.replace(/\.dwg$/i, '') + '.json';
              helpers.download(name, JSON.stringify(currentDatabase, null, 2), 'application/json');
            }
          }
        }
      ],
      infoHtml: '<strong>DWG Viewer:</strong> Private, browser-based CAD viewing. Uses LibreDWG WASM for 100% client-side processing. Your files never leave your device.'
    });
  };

  function renderTool(db, file, helpers) {
    const entities = db.entities || [];
    if (entities.length === 0) {
      helpers.render(`
        <div class="flex flex-col items-center justify-center p-20 text-center">
          <div class="w-20 h-20 bg-surface-100 text-surface-400 rounded-full flex items-center justify-center mb-4 text-3xl">📐</div>
          <h3 class="text-xl font-semibold text-surface-900 mb-2">Empty Drawing</h3>
          <p class="text-surface-500 max-w-sm">This DWG file contains no renderable entities in the database model.</p>
        </div>
      `);
      return;
    }

    const bounds = getBounds(entities);
    const layersMap = {};
    (db.layers || []).forEach(l => { layersMap[l.name] = l; });
    
    const svg = generateSvg(entities, bounds, layersMap);
    currentSvg = svg;

    const layers = (db.layers || []).sort((a, b) => a.name.localeCompare(b.name));

    const html = `
      <div class="p-6 max-w-[1600px] mx-auto">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">AutoCAD DWG</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${entities.length.toLocaleString()} entities</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div class="lg:col-span-3 space-y-6">
            <div class="relative bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm group" style="height: 700px;">
              <div class="absolute top-4 left-4 z-20 flex items-center gap-2">
                <div class="px-3 py-1.5 bg-black/70 backdrop-blur-md text-white text-[10px] rounded-lg uppercase tracking-widest font-black flex items-center gap-2 shadow-xl border border-white/10">
                  <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  Interactive Preview
                </div>
              </div>

              <div class="absolute top-4 right-4 z-20 flex flex-col gap-2">
                 <button id="zoom-in" title="Zoom In" class="w-10 h-10 bg-white/95 backdrop-blur border border-surface-200 rounded-xl shadow-sm flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-all text-lg">＋</button>
                 <button id="zoom-out" title="Zoom Out" class="w-10 h-10 bg-white/95 backdrop-blur border border-surface-200 rounded-xl shadow-sm flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-all text-lg">－</button>
                 <button id="reset-view" title="Reset View" class="w-10 h-10 bg-white/95 backdrop-blur border border-surface-200 rounded-xl shadow-sm flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-all text-lg">🎯</button>
              </div>
              
              <div id="dwg-viewport" class="w-full h-full overflow-hidden flex items-center justify-center cursor-move bg-[#fdfdfd]">
                <div id="dwg-canvas-wrapper" class="transition-transform duration-300 ease-out origin-center flex items-center justify-center" style="width: 90%; height: 90%;">
                  <div id="dwg-svg-content" class="w-full h-full drop-shadow-2xl">
                    ${svg}
                  </div>
                </div>
              </div>
              
              <div class="absolute bottom-4 left-4 z-20 text-[10px] text-surface-400 font-mono bg-white/80 px-2 py-1 rounded border border-surface-100">
                Bounds: ${bounds.width.toFixed(2)} x ${bounds.height.toFixed(2)}
              </div>
            </div>
          </div>

          <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Layers</div>
                <div class="text-xl font-bold text-surface-900">${layers.length}</div>
              </div>
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Entities</div>
                <div class="text-xl font-bold text-surface-900">${entities.length}</div>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Layers</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${layers.length}</span>
                </div>
                <div class="relative">
                  <input type="text" id="layer-search" placeholder="Search layers..." 
                    class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
                  <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
                </div>
              </div>
              
              <div class="overflow-x-auto">
                <div class="max-h-[480px] overflow-y-auto custom-scrollbar">
                  <table class="min-w-full text-sm">
                    <thead class="sticky top-0 bg-white/95 backdrop-blur z-10">
                      <tr>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                        <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Color</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100" id="layers-body">
                      ${layers.map(l => `
                        <tr class="layer-row even:bg-surface-50 hover:bg-brand-50 transition-colors" data-name="${escapeHtml(l.name.toLowerCase())}">
                          <td class="px-4 py-2.5 text-surface-700 truncate max-w-[150px]" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</td>
                          <td class="px-4 py-2.5 text-right">
                            <div class="inline-block w-4 h-4 rounded shadow-inner" style="background: ${getHexColor(l.color_index)}"></div>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
    setupInteraction();

    // Layer Search
    const searchInput = document.getElementById('layer-search');
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.layer-row').forEach(row => {
        row.style.display = row.dataset.name.includes(q) ? '' : 'none';
      });
    };
  }

  function setupInteraction() {
    const wrapper = document.getElementById('dwg-canvas-wrapper');
    const viewport = document.getElementById('dwg-viewport');
    if (!wrapper || !viewport) return;

    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX, startY;

    function update() {
      wrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    document.getElementById('zoom-in').onclick = () => { scale *= 1.4; update(); };
    document.getElementById('zoom-out').onclick = () => { scale /= 1.4; update(); };
    document.getElementById('reset-view').onclick = () => { scale = 1; translateX = 0; translateY = 0; update(); };

    viewport.onmousedown = (e) => {
      isDragging = true;
      startX = e.clientX - translateX;
      startY = e.clientY - translateY;
      viewport.style.cursor = 'grabbing';
      e.preventDefault();
    };

    window.onmousemove = (e) => {
      if (!isDragging) return;
      translateX = e.clientX - startX;
      translateY = e.clientY - startY;
      update();
    };

    window.onmouseup = () => {
      isDragging = false;
      viewport.style.cursor = 'move';
    };

    viewport.onwheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.85 : 1.15;
      scale = Math.min(Math.max(0.01, scale * delta), 100);
      update();
    };
  }

  function getBounds(entities) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function update(x, y) {
      if (typeof x !== 'number' || isNaN(x)) return;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    entities.forEach(e => {
      try {
        if (e.type === 'LINE') {
          update(e.start.x, e.start.y);
          update(e.end.x, e.end.y);
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          if (e.points) e.points.forEach(p => update(p.x, p.y));
        } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
          update(e.center.x - e.radius, e.center.y - e.radius);
          update(e.center.x + e.radius, e.center.y + e.radius);
        } else if (e.insertion_pt) {
          update(e.insertion_pt.x, e.insertion_pt.y);
        }
      } catch (_err) {}
    });

    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function generateSvg(entities, bounds, layersMap) {
    const pad = Math.max(bounds.width, bounds.height) * 0.05 || 1;
    const vb = `${bounds.minX - pad} ${-(bounds.maxY + pad)} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="width:100%; height:100%;">`;
    svg += `<style>path, line, polyline, circle { vector-effect: non-scaling-stroke; stroke-width: 1px; fill: none; stroke-linejoin: round; stroke-linecap: round; }</style>`;
    
    entities.forEach(e => {
      try {
        const layer = layersMap[e.layer];
        const color = getHexColor(e.color_index !== undefined ? e.color_index : (layer ? layer.color_index : 7));
        
        if (e.type === 'LINE') {
          svg += `<line x1="${e.start.x}" y1="${-e.start.y}" x2="${e.end.x}" y2="${-e.end.y}" stroke="${color}" />`;
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          if (!e.points || e.points.length < 2) return;
          const pts = e.points.map(p => `${p.x},${-p.y}`).join(' ');
          svg += `<polyline points="${pts}" stroke="${color}" />`;
        } else if (e.type === 'CIRCLE') {
          svg += `<circle cx="${e.center.x}" cy="${-e.center.y}" r="${e.radius}" stroke="${color}" />`;
        } else if (e.type === 'ARC') {
          svg += `<path d="${describeArc(e)}" stroke="${color}" />`;
        }
      } catch (_err) {}
    });
    
    svg += `</svg>`;
    return svg;
  }

  function describeArc(e) {
    const r = e.radius;
    const cx = e.center.x;
    const cy = e.center.y;
    const startAngle = e.start_angle;
    const endAngle = e.end_angle;

    const sx = cx + r * Math.cos(startAngle);
    const sy = cy + r * Math.sin(startAngle);
    const ex = cx + r * Math.cos(endAngle);
    const ey = cy + r * Math.sin(endAngle);

    let diff = endAngle - startAngle;
    if (diff < 0) diff += 2 * Math.PI;
    const largeArc = diff > Math.PI ? 1 : 0;
    return `M ${sx} ${-sy} A ${r} ${r} 0 ${largeArc} 0 ${ex} ${-ey}`;
  }

})();
