/**
 * OmniOpener — DXF Production-Grade Toolkit
 * A high-performance CAD viewer with interactive layer management and vector export.
 */
(function () {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // AutoCAD Index Colors to Hex
  function getDxfColor(idx) {
    const colors = [
      '#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff',
      '#808080', '#c0c0c0', '#ff0000', '#ff7f7f', '#a50000', '#a55252', '#7f0000', '#7f3f3f',
      '#d70000', '#d76b6b', '#af0000', '#af5757', '#870000', '#874343', '#5f0000', '#5f2f2f',
      '#d72f00', '#d7826b', '#af2700', '#af6a57', '#871e00', '#875243', '#5f1500', '#5f3a2f'
    ];
    return colors[idx] || '#ffffff';
  }

  function getUnitName(id) {
    const units = [
      'Unspecified', 'Inches', 'Feet', 'Miles', 'Millimeters', 'Centimeters', 
      'Meters', 'Kilometers', 'Microinches', 'Mils', 'Yards', 'Angstroms', 
      'Nanometers', 'Microns', 'Decimeters', 'Decameters', 'Hectometers', 
      'Gigameters', 'Astronomical units', 'Light years', 'Parsecs'
    ];
    return units[id] || `Unit ID: ${id}`;
  }

  window.initTool = function (toolConfig, mountEl) {
    let _currentParsed = null;
    let _visibleLayers = new Set();
    let _canvas = null;
    let _ctx = null;
    let _resizeObserver = null;
    let _renderDebounce = null;
    let _file = null;
    let _content = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      infoHtml: '<strong>DXF Toolkit:</strong> Professional CAD viewer with layer filtering, entity inspection, and high-fidelity 2D rendering.',
      
      actions: [
        {
          label: '📸 Export PNG',
          id: 'export-png',
          onClick: function (h) {
            if (!_canvas) return h.showError('No preview', 'Load a DXF file first.');
            _canvas.toBlob((blob) => {
              h.download(h.getFile().name.replace(/\.dxf$/i, '.png'), blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            if (_currentParsed) {
              h.copyToClipboard(JSON.stringify(_currentParsed, null, 2), btn);
            } else {
              h.showError('No data', 'Load a DXF file first.');
            }
          }
        },
        {
          label: '📥 Save DXF',
          id: 'download-dxf',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/dxf');
          }
        }
      ],

      onInit: function (h) {
        if (typeof DxfParser === 'undefined') {
          return h.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js');
        }
      },

      onFile: function _onFileFn(file, content, h) {
        _file = file;
        _content = content;
        
        h.showLoading('Analyzing CAD structure...');
        
        // B1 & B4: Race condition check for CDN scripts
        if (typeof DxfParser === 'undefined') {
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        try {
          const parser = new DxfParser();
          _currentParsed = parser.parseSync(content);
          
          if (!_currentParsed) {
            throw new Error('Empty or invalid DXF structure');
          }

          const layers = Object.keys(_currentParsed.layers || {});
          _visibleLayers = new Set(layers);

          renderApp(file, _currentParsed, layers, h);
        } catch (err) {
          console.error('[DXF Parser]', err);
          h.showError(
            'Could not open DXF file', 
            'The file may be corrupted, in a binary format, or use an unsupported version. Try saving as "AutoCAD R12/2000 DXF" (ASCII) and try again.'
          );
        }
      },

      onDestroy: function() {
        if (_resizeObserver) _resizeObserver.disconnect();
        if (_renderDebounce) clearTimeout(_renderDebounce);
        _currentParsed = null;
        _visibleLayers.clear();
        _canvas = null;
        _ctx = null;
        _file = null;
        _content = null;
      }
    });

    function renderApp(file, parsed, layers, h) {
      let html = '';
      
      // U1: File Info Bar
      html += `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">AutoCAD DXF</span>
        </div>
      `;

      // U5: Empty State
      if (!parsed.entities || parsed.entities.length === 0) {
        html += `
          <div class="p-12 text-center bg-surface-50 rounded-2xl border border-dashed border-surface-200">
            <div class="text-4xl mb-3">📐</div>
            <h3 class="text-lg font-semibold text-surface-800">No drawable entities found</h3>
            <p class="text-surface-500 max-w-md mx-auto">This DXF file is valid but doesn't contain any drawable lines, circles, or shapes in model space.</p>
          </div>
        `;
        h.render(html);
        return;
      }

      // Main Container
      html += `
        <div class="flex flex-col lg:flex-row h-[70vh] min-h-[500px] border border-surface-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <!-- Sidebar -->
          <div class="w-full lg:w-72 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
            <div class="p-4 border-b border-surface-200 bg-white">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Layers</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${layers.length}</span>
              </div>
              <div class="relative">
                <input type="text" id="layer-search" placeholder="Search layers..." 
                  class="w-full pl-9 pr-3 py-2 text-sm bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>
            
            <div id="layer-list" class="flex-1 overflow-y-auto p-3 space-y-1.5">
              ${renderLayers(parsed, layers, _visibleLayers)}
            </div>

            <div class="p-3 bg-white border-t border-surface-200 grid grid-cols-2 gap-2">
              <button id="btn-show-all" class="px-2 py-1.5 text-xs font-semibold bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 transition-colors">Show All</button>
              <button id="btn-hide-all" class="px-2 py-1.5 text-xs font-semibold bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 transition-colors">Hide All</button>
            </div>
          </div>

          <!-- Viewport -->
          <div class="flex-1 flex flex-col min-w-0 bg-[#1e293b] relative">
            <div class="absolute top-4 left-4 z-10">
              <div class="bg-black/40 backdrop-blur text-white/90 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest border border-white/10 shadow-lg flex items-center gap-2 uppercase">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                CAD Viewport
              </div>
            </div>

            <div class="absolute bottom-4 right-4 z-10 text-right">
              <div class="text-white/40 text-[10px] uppercase font-bold tracking-tight mb-1">Units</div>
              <div class="text-white/70 text-xs font-mono bg-white/5 px-2 py-1 rounded border border-white/10 backdrop-blur">
                ${parsed.header && parsed.header.$INSUNITS ? getUnitName(parsed.header.$INSUNITS) : 'Standard'}
              </div>
            </div>

            <div id="canvas-container" class="flex-1 flex items-center justify-center overflow-hidden p-8">
              <canvas id="dxf-canvas" class="max-w-full max-h-full cursor-crosshair"></canvas>
            </div>
          </div>
        </div>

        <!-- U10: Statistics -->
        <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-colors">
            <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Total Entities</h4>
            <div class="text-2xl font-bold text-surface-800">${(parsed.entities || []).length.toLocaleString()}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-colors">
            <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Active Layers</h4>
            <div id="active-layers-count" class="text-2xl font-bold text-brand-600">${_visibleLayers.size}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-colors">
            <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Canvas Bounding Box</h4>
            <div id="coord-span" class="text-lg font-semibold text-surface-700">Calculating...</div>
          </div>
        </div>
      `;

      h.render(html);

      _canvas = document.getElementById('dxf-canvas');
      _ctx = _canvas.getContext('2d');
      
      setupEvents(parsed, layers, h);
      
      _resizeObserver = new ResizeObserver(() => {
        if (_renderDebounce) clearTimeout(_renderDebounce);
        _renderDebounce = setTimeout(() => draw(parsed), 50);
      });
      _resizeObserver.observe(document.getElementById('canvas-container'));
      
      draw(parsed);
    }

    function renderLayers(parsed, layers, visible, filter) {
      const query = filter ? filter.toLowerCase() : '';
      const filtered = layers.filter(l => l.toLowerCase().includes(query));
      
      if (filtered.length === 0) {
        return `<div class="py-10 text-center text-xs text-surface-400 italic">No layers matching filter</div>`;
      }

      // U9: Layer cards
      return filtered.map(l => {
        const layerData = parsed.layers[l] || {};
        const color = getDxfColor(layerData.color !== undefined ? layerData.color : 7);
        const isVisible = visible.has(l);
        
        return `
          <label class="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer group ${isVisible ? '' : 'opacity-40'}">
            <div class="flex items-center gap-3 min-w-0">
              <input type="checkbox" class="layer-toggle sr-only" data-layer="${escapeHtml(l)}" ${isVisible ? 'checked' : ''}>
              <div class="w-5 h-5 rounded-lg border border-surface-200 flex items-center justify-center transition-all ${isVisible ? 'bg-brand-500 border-brand-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-surface-50'}">
                ${isVisible ? '<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="4"><path d="M5 13l4 4L19 7"></path></svg>' : ''}
              </div>
              <span class="text-xs font-semibold text-surface-700 truncate">${escapeHtml(l)}</span>
            </div>
            <div class="w-2.5 h-2.5 rounded-full shadow-inner" style="background-color: ${color}"></div>
          </label>
        `;
      }).join('');
    }

    function setupEvents(parsed, layers, h) {
      const container = h.getRenderEl();
      
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('layer-toggle')) {
          const layer = e.target.getAttribute('data-layer');
          if (e.target.checked) _visibleLayers.add(layer);
          else _visibleLayers.delete(layer);
          
          const search = document.getElementById('layer-search');
          updateLayerUI(parsed, layers, search ? search.value : '');
          draw(parsed);
        }
      });

      const searchInput = document.getElementById('layer-search');
      if (searchInput) {
        searchInput.oninput = function() {
          updateLayerUI(parsed, layers, this.value);
        };
      }

      const btnShowAll = document.getElementById('btn-show-all');
      const btnHideAll = document.getElementById('btn-hide-all');

      if (btnShowAll) {
        btnShowAll.onclick = () => {
          layers.forEach(l => _visibleLayers.add(l));
          updateLayerUI(parsed, layers, searchInput ? searchInput.value : '');
          draw(parsed);
        };
      }

      if (btnHideAll) {
        btnHideAll.onclick = () => {
          _visibleLayers.clear();
          updateLayerUI(parsed, layers, searchInput ? searchInput.value : '');
          draw(parsed);
        };
      }
    }

    function updateLayerUI(parsed, layers, filter) {
      const list = document.getElementById('layer-list');
      if (list) list.innerHTML = renderLayers(parsed, layers, _visibleLayers, filter);
      const activeCount = document.getElementById('active-layers-count');
      if (activeCount) activeCount.textContent = _visibleLayers.size;
    }

    function draw(parsed) {
      if (!_canvas || !_ctx || !parsed.entities) return;

      const entities = parsed.entities.filter(e => _visibleLayers.has(e.layer));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Calculate Bounds
      entities.forEach(e => {
        let points = [];
        if (e.vertices) points = e.vertices;
        else if (e.center) {
          const r = e.radius || 0;
          points.push({x: e.center.x - r, y: e.center.y - r});
          points.push({x: e.center.x + r, y: e.center.y + r});
        }

        points.forEach(v => {
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        });
      });

      const spanEl = document.getElementById('coord-span');
      if (minX === Infinity) {
        const dpr = window.devicePixelRatio || 1;
        _canvas.width = _canvas.parentElement.clientWidth * dpr;
        _canvas.height = _canvas.parentElement.clientHeight * dpr;
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        if (spanEl) spanEl.textContent = 'Empty Selection';
        return;
      }
      
      const width = maxX - minX;
      const height = maxY - minY;
      if (spanEl) spanEl.textContent = `${width.toFixed(2)} × ${height.toFixed(2)} units`;

      const padding = 40;
      const container = _canvas.parentElement;
      const cW = container.clientWidth;
      const cH = container.clientHeight;
      
      const scaleX = (cW - padding * 2) / (width || 1);
      const scaleY = (cH - padding * 2) / (height || 1);
      const scale = Math.min(scaleX, scaleY);

      const dpr = window.devicePixelRatio || 1;
      _canvas.width = cW * dpr;
      _canvas.height = cH * dpr;
      _canvas.style.width = cW + 'px';
      _canvas.style.height = cH + 'px';
      _ctx.scale(dpr, dpr);
      
      const offsetX = (cW - width * scale) / 2 - minX * scale;
      const offsetY = (cH - height * scale) / 2 + maxY * scale;

      _ctx.clearRect(0, 0, cW, cH);
      _ctx.lineWidth = Math.max(0.5, 1 / (scale || 1));
      _ctx.lineCap = 'round';
      _ctx.lineJoin = 'round';
      
      entities.forEach(e => {
        const layer = parsed.layers[e.layer] || {};
        let color = getDxfColor(layer.color !== undefined ? layer.color : 7);
        if (color === '#000000') color = '#cbd5e1'; // Visibility on dark background
        _ctx.strokeStyle = color;
        
        if (e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          const pts = e.vertices;
          if (!pts || pts.length < 2) return;
          _ctx.beginPath();
          pts.forEach((v, i) => {
            const px = v.x * scale + offsetX;
            const py = offsetY - v.y * scale;
            if (i === 0) _ctx.moveTo(px, py);
            else _ctx.lineTo(px, py);
          });
          if (e.shape) _ctx.closePath();
          _ctx.stroke();
        } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
          _ctx.beginPath();
          const cx = e.center.x * scale + offsetX;
          const cy = offsetY - e.center.y * scale;
          const r = e.radius * scale;
          const startAngle = e.startAngle ? -e.startAngle * Math.PI / 180 : 0;
          const endAngle = e.endAngle ? -e.endAngle * Math.PI / 180 : -2 * Math.PI;
          _ctx.arc(cx, cy, r, startAngle, endAngle, true);
          _ctx.stroke();
        }
      });
    }
  };

})();
