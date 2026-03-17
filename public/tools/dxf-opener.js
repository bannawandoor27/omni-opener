(function() {
  'use strict';

  let currentParsed = null;
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

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      dropLabel: 'Drop a .dxf file here',
      binary: false,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js');
      },
      onFile: async function(file, content, helpers) {
        if (typeof DxfParser === 'undefined') {
          helpers.showLoading('Initializing DXF engine...');
          await new Promise(resolve => {
            const check = setInterval(() => {
              if (typeof DxfParser !== 'undefined') {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
        }

        if (file.size > 15 * 1024 * 1024) {
          helpers.render(`
            <div class="p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <h3 class="text-xl font-bold text-surface-900 mb-2">Large DXF File</h3>
              <p class="text-surface-600 max-w-md mx-auto mb-8">This file is ${formatSize(file.size)}. Processing complex CAD geometry in the browser may be slow.</p>
              <button id="proceed-btn" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-semibold shadow-lg hover:bg-brand-700 transition-all hover:scale-105 active:scale-95">Parse Anyway</button>
            </div>
          `);
          document.getElementById('proceed-btn').onclick = () => processDxf(file, content, helpers);
          return;
        }

        processDxf(file, content, helpers);
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
              const name = helpers.getFile().name.replace(/\.dxf$/i, '') + '.svg';
              helpers.download(name, currentSvg, 'image/svg+xml');
            }
          }
        },
        {
          label: '📥 Export JSON',
          id: 'dl-json',
          onClick: (helpers) => {
            if (currentParsed) {
              const name = helpers.getFile().name.replace(/\.dxf$/i, '') + '.json';
              helpers.download(name, JSON.stringify(currentParsed, null, 2), 'application/json');
            }
          }
        }
      ],
      infoHtml: '<strong>DXF Viewer:</strong> High-performance vector rendering for AutoCAD files. 100% client-side. Your files never leave your device.'
    });
  };

  async function processDxf(file, content, helpers) {
    helpers.showLoading('Parsing DXF structure...');
    
    // Tiny delay to ensure loading state shows
    await new Promise(r => setTimeout(r, 10));

    try {
      const parser = new DxfParser();
      const parsed = parser.parseSync(content);
      currentParsed = parsed;
      
      helpers.showLoading('Generating vector preview...');
      renderTool(parsed, file, helpers);
    } catch (err) {
      console.error(err);
      helpers.showError('Could not open dxf file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
    }
  }

  function renderTool(parsed, file, helpers) {
    const entities = parsed.entities || [];
    if (entities.length === 0) {
      helpers.render(`
        <div class="flex flex-col items-center justify-center p-20 text-center">
          <div class="w-20 h-20 bg-surface-100 text-surface-400 rounded-full flex items-center justify-center mb-4 text-3xl">📐</div>
          <h3 class="text-xl font-semibold text-surface-900 mb-2">Empty Drawing</h3>
          <p class="text-surface-500 max-w-sm">This DXF file contains no renderable entities (lines, arcs, circles, etc.).</p>
        </div>
      `);
      return;
    }

    const bounds = getBounds(entities);
    const svg = generateSvg(entities, bounds, parsed.layers || {});
    currentSvg = svg;

    const layers = Object.values(parsed.layers || {}).sort((a, b) => a.name.localeCompare(b.name));

    const html = `
      <div class="p-6 max-w-[1600px] mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.dxf file</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${entities.length.toLocaleString()} entities</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <!-- Main Viewer -->
          <div class="lg:col-span-3 space-y-6">
            <div class="relative bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm group" style="height: 700px;">
              <div class="absolute top-4 left-4 z-20 flex items-center gap-2">
                <div class="px-3 py-1.5 bg-black/70 backdrop-blur-md text-white text-[10px] rounded-lg uppercase tracking-widest font-black flex items-center gap-2 shadow-xl border border-white/10">
                  <span class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                  Interactive Preview
                </div>
              </div>

              <!-- Zoom Controls -->
              <div class="absolute top-4 right-4 z-20 flex flex-col gap-2">
                 <button id="zoom-in" title="Zoom In" class="w-10 h-10 bg-white/95 backdrop-blur border border-surface-200 rounded-xl shadow-sm flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-all text-lg">＋</button>
                 <button id="zoom-out" title="Zoom Out" class="w-10 h-10 bg-white/95 backdrop-blur border border-surface-200 rounded-xl shadow-sm flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-all text-lg">－</button>
                 <button id="reset-view" title="Reset View" class="w-10 h-10 bg-white/95 backdrop-blur border border-surface-200 rounded-xl shadow-sm flex items-center justify-center hover:bg-brand-50 hover:text-brand-600 transition-all text-lg">🎯</button>
              </div>
              
              <div id="dxf-viewport" class="w-full h-full overflow-hidden flex items-center justify-center cursor-move bg-[#fdfdfd]">
                <div id="dxf-canvas-wrapper" class="transition-transform duration-300 ease-out origin-center flex items-center justify-center" style="width: 90%; height: 90%;">
                  <div id="dxf-svg-content" class="w-full h-full drop-shadow-2xl">
                    ${svg}
                  </div>
                </div>
              </div>
              
              <div class="absolute bottom-4 left-4 z-20 text-[10px] text-surface-400 font-mono bg-white/80 px-2 py-1 rounded border border-surface-100">
                Bounds: ${bounds.width.toFixed(2)} x ${bounds.height.toFixed(2)}
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Stats -->
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Layers</div>
                <div class="text-xl font-bold text-surface-900">${layers.length}</div>
              </div>
              <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Blocks</div>
                <div class="text-xl font-bold text-surface-900">${Object.keys(parsed.blocks || {}).length}</div>
              </div>
            </div>

            <!-- Layer List with Search -->
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Layers</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${layers.length} items</span>
                </div>
                <div class="relative">
                  <input type="text" id="layer-search" placeholder="Search layers..." 
                    class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                    value="${escapeHtml(layerSearchQuery)}">
                  <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
                </div>
              </div>
              
              <div class="overflow-x-auto">
                <div class="max-h-[480px] overflow-y-auto custom-scrollbar">
                  <table class="min-w-full text-sm" id="layers-table">
                    <thead class="sticky top-0 bg-white/95 backdrop-blur z-10">
                      <tr>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Layer Name</th>
                        <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Color</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${layers.map(l => `
                        <tr class="layer-row even:bg-surface-50 hover:bg-brand-50 transition-colors" data-name="${escapeHtml(l.name.toLowerCase())}">
                          <td class="px-4 py-2.5 text-surface-700 truncate max-w-[150px]" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</td>
                          <td class="px-4 py-2.5 text-right">
                            <div class="inline-block w-4 h-4 rounded shadow-inner" style="background: ${getHexColor(l.colorIndex)}"></div>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <div id="no-layers-msg" class="hidden p-8 text-center text-surface-400 italic text-sm">
                    No matching layers found
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
    setupInteraction();
    setupLayerSearch();
  }

  function setupLayerSearch() {
    const input = document.getElementById('layer-search');
    const rows = document.querySelectorAll('.layer-row');
    const noMsg = document.getElementById('no-layers-msg');
    
    input.oninput = (e) => {
      const q = e.target.value.toLowerCase();
      layerSearchQuery = q;
      let visibleCount = 0;
      
      rows.forEach(row => {
        const match = row.getAttribute('data-name').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
      
      noMsg.classList.toggle('hidden', visibleCount > 0);
    };
  }

  function setupInteraction() {
    const wrapper = document.getElementById('dxf-canvas-wrapper');
    const viewport = document.getElementById('dxf-viewport');
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
      const oldScale = scale;
      scale = Math.min(Math.max(0.01, scale * delta), 100);
      update();
    };
  }

  function getBounds(entities) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function update(x, y) {
      if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) return;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    entities.forEach(e => {
      try {
        if (e.type === 'LINE') {
          update(e.vertices[0].x, e.vertices[0].y);
          update(e.vertices[1].x, e.vertices[1].y);
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          if (e.vertices) e.vertices.forEach(v => update(v.x, v.y));
        } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
          update(e.center.x - e.radius, e.center.y - e.radius);
          update(e.center.x + e.radius, e.center.y + e.radius);
        } else if (e.type === 'ELLIPSE') {
          const r = Math.sqrt(Math.pow(e.majorAxisEndPoint.x, 2) + Math.pow(e.majorAxisEndPoint.y, 2));
          update(e.center.x - r, e.center.y - r);
          update(e.center.x + r, e.center.y + r);
        } else if (e.position) {
          update(e.position.x, e.position.y);
        }
      } catch (_err) {}
    });

    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function generateSvg(entities, bounds, layers) {
    const pad = Math.max(bounds.width, bounds.height) * 0.05 || 1;
    const vb = `${bounds.minX - pad} ${-(bounds.maxY + pad)} ${bounds.width + pad * 2} ${bounds.height + pad * 2}`;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="width:100%; height:100%;">`;
    svg += `<style>path, line, polyline, circle { vector-effect: non-scaling-stroke; stroke-width: 1px; fill: none; stroke-linejoin: round; stroke-linecap: round; transition: stroke 0.2s; }</style>`;
    
    entities.forEach(e => {
      try {
        const layer = layers[e.layer];
        const color = getHexColor(e.colorIndex !== undefined && e.colorIndex !== 256 ? e.colorIndex : (layer ? layer.colorIndex : 7));
        
        if (e.type === 'LINE') {
          svg += `<line x1="${e.vertices[0].x}" y1="${-e.vertices[0].y}" x2="${e.vertices[1].x}" y2="${-e.vertices[1].y}" stroke="${color}" />`;
        } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          if (!e.vertices || e.vertices.length < 2) return;
          const pts = e.vertices.map(v => `${v.x},${-v.y}`).join(' ');
          svg += `<polyline points="${pts}" stroke="${color}" />`;
        } else if (e.type === 'CIRCLE') {
          svg += `<circle cx="${e.center.x}" cy="${-e.center.y}" r="${e.radius}" stroke="${color}" />`;
        } else if (e.type === 'ARC') {
          svg += `<path d="${describeArc(e)}" stroke="${color}" />`;
        } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
          const rawText = (e.text || e.value || '');
          const cleanText = rawText.replace(/\\P/g, ' ').replace(/\{[^}]*\}/g, '').replace(/\\[A-Z].*?;/g, '');
          if (cleanText) {
            svg += `<text x="${e.position.x}" y="${e.position.y}" fill="${color}" font-family="sans-serif" font-size="${e.textHeight || 1}px" transform="scale(1,-1) translate(0, ${2* -e.position.y})">${escapeHtml(cleanText)}</text>`;
          }
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
    const startAngle = e.startAngle;
    const endAngle = e.endAngle;

    const sx = cx + r * Math.cos(startAngle * Math.PI / 180);
    const sy = cy + r * Math.sin(startAngle * Math.PI / 180);
    const ex = cx + r * Math.cos(endAngle * Math.PI / 180);
    const ey = cy + r * Math.sin(endAngle * Math.PI / 180);

    let diff = endAngle - startAngle;
    if (diff < 0) diff += 360;
    const largeArc = diff > 180 ? 1 : 0;
    return `M ${sx} ${-sy} A ${r} ${r} 0 ${largeArc} 0 ${ex} ${-ey}`;
  }

})();
