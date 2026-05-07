/**
 * OmniOpener — DXF Production-Grade Toolkit
 * A high-performance CAD viewer with interactive layer management and vector export.
 */
(function () {
  'use strict';

  // Helper: Format bytes to human readable string
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Helper: Escape HTML to prevent XSS
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper: Get DXF color from index (Standard AutoCAD Colors)
  function getDxfColor(idx) {
    const colors = [
      '#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff',
      '#808080', '#c0c0c0', '#ff0000', '#ff7f7f', '#a50000', '#a55252', '#7f0000', '#7f3f3f',
      '#d70000', '#d76b6b', '#af0000', '#af5757', '#870000', '#874343', '#5f0000', '#5f2f2f',
      '#d72f00', '#d7826b', '#af2700', '#af6a57', '#871e00', '#875243', '#5f1500', '#5f3a2f'
    ];
    return colors[idx] || '#ffffff';
  }

  window.initTool = function (toolConfig, mountEl) {
    let _currentParsed = null;
    let _visibleLayers = new Set();
    let _canvas = null;
    let _ctx = null;
    let _resizeObserver = null;
    let _renderDebounce = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      infoHtml: '<strong>DXF Toolkit:</strong> Professional CAD viewer with layer filtering, entity inspection, and high-fidelity 2D rendering. Supports ASCII DXF formats.',
      
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
        h.showLoading('Analyzing CAD structure...');
        
        // B1: Race condition check for CDN scripts
        if (typeof DxfParser === 'undefined') {
          setTimeout(() => _onFileFn(file, content, h), 200);
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
            'The file may be corrupted, in a binary format, or use an unsupported AutoCAD version (R2018+). Try saving as "AutoCAD R12/2000 DXF" (ASCII) and try again.'
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
      }
    });

    function renderApp(file, parsed, layers, h) {
      let html = '';
      
      // U1: Professional File Info Bar
      html += `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">AutoCAD DXF</span>
          <span class="ml-auto bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">
            ${parsed.entities ? parsed.entities.length.toLocaleString() : 0} entities
          </span>
        </div>
      `;

      // U5: Empty State
      if (!parsed.entities || parsed.entities.length === 0) {
        html += `
          <div class="p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
            <div class="text-4xl mb-3">📐</div>
            <h3 class="text-lg font-semibold text-surface-800">No drawable entities found</h3>
            <p class="text-surface-500 max-w-md mx-auto">This DXF file is valid but doesn't contain any lines, circles, or shapes in the model space.</p>
          </div>
        `;
        h.render(html);
        return;
      }

      // Main Interface
      html += `
        <div class="flex flex-col lg:flex-row h-[75vh] min-h-[600px] border border-surface-200 rounded-2xl overflow-hidden bg-white shadow-sm font-sans">
          <!-- Sidebar -->
          <div class="w-full lg:w-80 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
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
            
            <div id="layer-list" class="flex-1 overflow-y-auto p-3 space-y-2">
              ${renderLayers(parsed, layers, _visibleLayers)}
            </div>

            <div class="p-4 bg-white border-t border-surface-200 grid grid-cols-2 gap-2">
              <button id="btn-show-all" class="px-3 py-2 text-xs font-semibold bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 transition-colors">Show All</button>
              <button id="btn-hide-all" class="px-3 py-2 text-xs font-semibold bg-surface-100 text-surface-700 rounded-lg hover:bg-surface-200 transition-colors">Hide All</button>
            </div>
          </div>

          <!-- Viewport -->
          <div class="flex-1 flex flex-col min-w-0 bg-[#0f172a] relative group">
            <!-- HUD -->
            <div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
              <div class="bg-black/40 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest border border-white/10 shadow-2xl flex items-center gap-2 uppercase">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Vector Canvas
              </div>
            </div>

            <div class="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1 pointer-events-none">
              <div class="text-white/30 text-[10px] uppercase font-medium">Drawing Units</div>
              <div class="text-white/60 text-xs font-mono bg-white/5 px-2 py-1 rounded border border-white/10">
                ${parsed.header && parsed.header.$INSUNITS ? getUnitName(parsed.header.$INSUNITS) : 'Standard'}
              </div>
            </div>

            <!-- Main Drawing Surface -->
            <div id="canvas-container" class="flex-1 flex items-center justify-center overflow-hidden">
              <canvas id="dxf-canvas" class="max-w-full max-h-full"></canvas>
            </div>

            <!-- Interaction Notice -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <span class="bg-black/60 backdrop-blur px-3 py-1 rounded-full text-[10px] text-white/70 border border-white/10">
                Automatic View Fit & Aspect Ratio Management
              </span>
            </div>
          </div>
        </div>

        <!-- U10: Statistics Footer -->
        <div class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Total Entities</h4>
            <div class="text-2xl font-bold text-surface-800">${(parsed.entities || []).length.toLocaleString()}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Active Layers</h4>
            <div id="active-layers-count" class="text-2xl font-bold text-brand-600">${_visibleLayers.size}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Coordinate Span</h4>
            <div id="coord-span" class="text-lg font-semibold text-surface-700 truncate">Calculating...</div>
          </div>
        </div>
      `;

      h.render(html);

      // Initialize State
      _canvas = document.getElementById('dxf-canvas');
      _ctx = _canvas.getContext('2d');
      
      setupInteraction(parsed, layers, h);
      
      // Auto-resize handler
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
        return `
          <div class="py-12 text-center">
            <div class="text-surface-300 mb-2">🔍</div>
            <div class="text-xs text-surface-400 italic">No layers matching "${escapeHtml(filter)}"</div>
          </div>
        `;
      }

      // U9: Content Cards for Layers
      return filtered.map(l => {
        const layerData = parsed.layers[l] || {};
        const color = getDxfColor(layerData.color !== undefined ? layerData.color : 7);
        const isVisible = visible.has(l);
        
        return `
          <label class="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer group ${isVisible ? '' : 'opacity-50'}">
            <div class="flex items-center gap-3 min-w-0">
              <input type="checkbox" class="layer-toggle sr-only" data-layer="${escapeHtml(l)}" ${isVisible ? 'checked' : ''}>
              <div class="w-5 h-5 rounded-md border-2 border-surface-200 flex items-center justify-center transition-all ${isVisible ? 'bg-brand-500 border-brand-500' : 'bg-surface-50'}">
                ${isVisible ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="4"><path d="M5 13l4 4L19 7"></path></svg>' : ''}
              </div>
              <span class="text-xs font-semibold text-surface-700 truncate">${escapeHtml(l)}</span>
            </div>
            <div class="w-3 h-3 rounded-full shadow-inner ring-1 ring-black/5" style="background-color: ${color}"></div>
          </label>
        `;
      }).join('');
    }

    function setupInteraction(parsed, layers, h) {
      const container = h.getRenderEl();
      
      // Event Delegation for layer toggles
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('layer-toggle')) {
          const layer = e.target.getAttribute('data-layer');
          if (e.target.checked) _visibleLayers.add(layer);
          else _visibleLayers.delete(layer);
          
          const search = document.getElementById('layer-search');
          updateLayerList(parsed, layers, search ? search.value : '');
          draw(parsed);
          
          const activeCount = document.getElementById('active-layers-count');
          if (activeCount) activeCount.textContent = _visibleLayers.size;
        }
      });

      // Search with debouncing
      const searchInput = document.getElementById('layer-search');
      if (searchInput) {
        searchInput.oninput = function() {
          updateLayerList(parsed, layers, this.value);
        };
      }

      // Action Buttons
      const btnShowAll = document.getElementById('btn-show-all');
      const btnHideAll = document.getElementById('btn-hide-all');

      if (btnShowAll) {
        btnShowAll.onclick = () => {
          layers.forEach(l => _visibleLayers.add(l));
          updateLayerList(parsed, layers, searchInput ? searchInput.value : '');
          draw(parsed);
          if (document.getElementById('active-layers-count')) {
            document.getElementById('active-layers-count').textContent = _visibleLayers.size;
          }
        };
      }

      if (btnHideAll) {
        btnHideAll.onclick = () => {
          _visibleLayers.clear();
          updateLayerList(parsed, layers, searchInput ? searchInput.value : '');
          draw(parsed);
          if (document.getElementById('active-layers-count')) {
            document.getElementById('active-layers-count').textContent = '0';
          }
        };
      }
    }

    function updateLayerList(parsed, layers, filter) {
      const list = document.getElementById('layer-list');
      if (list) list.innerHTML = renderLayers(parsed, layers, _visibleLayers, filter);
    }

    function draw(parsed) {
      if (!_canvas || !_ctx || !parsed.entities) return;

      const entities = parsed.entities.filter(e => _visibleLayers.has(e.layer));
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // B7: Calculate bounds and entity count (optimization for large files)
      entities.forEach(e => {
        let points = [];
        if (e.type === 'LINE' && e.vertices) {
          points = e.vertices;
        } else if (e.type === 'LWPOLYLINE' && e.vertices) {
          points = e.vertices;
        } else if (e.type === 'POLYLINE' && e.vertices) {
          points = e.vertices;
        } else if (e.center) {
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
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        if (spanEl) spanEl.textContent = 'None';
        return;
      }
      
      const width = maxX - minX;
      const height = maxY - minY;
      if (spanEl) spanEl.textContent = `${width.toFixed(1)} × ${height.toFixed(1)}`;

      const padding = 40;
      const container = _canvas.parentElement;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      const scaleX = (containerWidth - padding * 2) / (width || 1);
      const scaleY = (containerHeight - padding * 2) / (height || 1);
      const scale = Math.min(scaleX, scaleY);

      const dpr = window.devicePixelRatio || 1;
      _canvas.width = containerWidth * dpr;
      _canvas.height = containerHeight * dpr;
      _canvas.style.width = containerWidth + 'px';
      _canvas.style.height = containerHeight + 'px';
      _ctx.scale(dpr, dpr);
      
      const offsetX = (containerWidth - width * scale) / 2 - minX * scale;
      const offsetY = (containerHeight - height * scale) / 2 + maxY * scale;

      _ctx.clearRect(0, 0, containerWidth, containerHeight);
      _ctx.lineWidth = 1 / (scale > 1 ? 1 : scale / dpr);
      if (_ctx.lineWidth < 0.5) _ctx.lineWidth = 0.5;
      _ctx.lineCap = 'round';
      _ctx.lineJoin = 'round';
      
      entities.forEach(e => {
        const layer = parsed.layers[e.layer] || {};
        let color = getDxfColor(layer.color !== undefined ? layer.color : 7);
        if (color === '#000000' || color === '#ffffff') color = '#cbd5e1'; // Optimized for dark theme
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

    function getUnitName(id) {
      const units = [
        'Unspecified', 'Inches', 'Feet', 'Miles', 'Millimeters', 'Centimeters', 
        'Meters', 'Kilometers', 'Microinches', 'Mils', 'Yards', 'Angstroms', 
        'Nanometers', 'Microns', 'Decimeters', 'Decameters', 'Hectometers', 
        'Gigameters', 'Astronomical units', 'Light years', 'Parsecs'
      ];
      return units[id] || `Unit ID: ${id}`;
    }
  };

})();
