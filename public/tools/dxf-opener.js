/**
 * OmniOpener — DXF Production-Grade Toolkit
 * A high-performance CAD viewer with interactive layer management and vector export.
 */
(function () {
  'use strict';

  // AutoCAD Index Colors (ACI) to Hex mapping
  const ACI_COLORS = [
    '#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff',
    '#808080', '#c0c0c0', '#ff0000', '#ff7f7f', '#a50000', '#a55252', '#7f0000', '#7f3f3f',
    '#d70000', '#d76b6b', '#af0000', '#af5757', '#870000', '#874343', '#5f0000', '#5f2f2f',
    '#d72f00', '#d7826b', '#af2700', '#af6a57', '#871e00', '#875243', '#5f1500', '#5f3a2f'
  ];

  function getDxfColor(idx) {
    if (idx === 256) return 'inherit'; // Bylayer
    if (idx === 0) return 'inherit'; // Byblock
    return ACI_COLORS[idx] || '#ffffff';
  }

  function getUnitName(id) {
    const units = [
      'Unspecified', 'Inches', 'Feet', 'Miles', 'Millimeters', 'Centimeters', 
      'Meters', 'Kilometers', 'Microinches', 'Mils', 'Yards', 'Angstroms', 
      'Nanometers', 'Microns', 'Decimeters', 'Decameters', 'Hectometers', 
      'Gigameters', 'Astronomical units', 'Light years', 'Parsecs'
    ];
    return units[id] || `ID: ${id}`;
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  window.initTool = function (toolConfig, mountEl) {
    let _parsed = null;
    let _visibleLayers = new Set();
    let _canvas = null;
    let _ctx = null;
    let _resizeObserver = null;
    let _renderDebounce = null;
    let _activeTab = 'viewer'; // 'viewer' or 'entities'

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      infoHtml: '<strong>DXF Production Toolkit:</strong> Advanced CAD viewer with layer isolation, entity inspection, and high-fidelity 2D rendering.',
      
      actions: [
        {
          label: '📸 Export PNG',
          id: 'export-png',
          onClick: function (h) {
            if (!_canvas) return h.showError('No preview', 'Please load a DXF file first.');
            _canvas.toBlob(function(blob) {
              h.download(h.getFile().name.replace(/\.dxf$/i, '.png'), blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            if (!_parsed) return h.showError('No data', 'Please load a DXF file first.');
            h.copyToClipboard(JSON.stringify(_parsed, null, 2), btn);
          }
        },
        {
          label: '📥 Download DXF',
          id: 'download-raw',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/dxf');
          }
        }
      ],

      onInit: function (h) {
        if (typeof DxfParser === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/dist/dxf-parser.min.js');
        }
      },

      onFile: function _onFileFn(file, content, h) {
        // B1/B4: Handle potential race condition on library load
        if (typeof DxfParser === 'undefined') {
          h.showLoading('Initializing CAD engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Parsing DXF structure...');

        // B7: Warn for extremely large files that might crash the browser
        if (content.length > 20 * 1024 * 1024) {
          console.warn('Large DXF file detected, performance may be impacted.');
        }

        try {
          const parser = new DxfParser();
          _parsed = parser.parseSync(content);
          
          if (!_parsed) throw new Error('Empty result');

          const layers = Object.keys(_parsed.layers || {});
          _visibleLayers = new Set(layers);
          
          renderMain(file, _parsed, h);
          h.hideLoading();
        } catch (err) {
          console.error('[DXF Error]', err);
          h.showError(
            'Failed to parse DXF',
            'This file might be using a binary format or an unsupported AutoCAD version. Try an ASCII DXF (R12/2000/2004).'
          );
        }
      },

      onDestroy: function() {
        if (_resizeObserver) _resizeObserver.disconnect();
        if (_renderDebounce) clearTimeout(_renderDebounce);
        _parsed = null;
        _visibleLayers.clear();
        _canvas = null;
        _ctx = null;
      }
    });

    function renderMain(file, parsed, h) {
      const layers = Object.keys(parsed.layers || {}).sort();
      const entityCount = (parsed.entities || []).length;
      
      let html = `
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${entityCount.toLocaleString()} entities</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">AutoCAD DXF</span>
        </div>

        <div class="flex flex-col gap-6">
          <!-- Main Content Area -->
          <div class="flex flex-col lg:flex-row h-[70vh] min-h-[600px] border border-surface-200 rounded-2xl overflow-hidden bg-white shadow-sm">
            
            <!-- Sidebar: Layers & Info -->
            <div class="w-full lg:w-80 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
              <!-- Tabs -->
              <div class="flex border-b border-surface-200 bg-white">
                <button id="tab-viewer" class="flex-1 py-3 text-sm font-semibold border-b-2 transition-all ${_activeTab === 'viewer' ? 'border-brand-500 text-brand-600 bg-brand-50/30' : 'border-transparent text-surface-500 hover:text-surface-700 hover:bg-surface-50'}">
                  Layers
                </button>
                <button id="tab-entities" class="flex-1 py-3 text-sm font-semibold border-b-2 transition-all ${_activeTab === 'entities' ? 'border-brand-500 text-brand-600 bg-brand-50/30' : 'border-transparent text-surface-500 hover:text-surface-700 hover:bg-surface-50'}">
                  Entities
                </button>
              </div>

              <!-- Layer Content -->
              <div id="side-viewer" class="${_activeTab === 'viewer' ? 'flex' : 'hidden'} flex-col flex-1 min-h-0">
                <div class="p-4 border-b border-surface-200 bg-white">
                  <div class="relative mb-3">
                    <input type="text" id="layer-search" placeholder="Filter layers..." 
                      class="w-full pl-9 pr-3 py-2 text-sm bg-surface-50 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none">
                    <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </div>
                  <div class="flex gap-2">
                    <button id="btn-show-all" class="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-surface-100 text-surface-600 rounded hover:bg-surface-200 transition-all">Show All</button>
                    <button id="btn-hide-all" class="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-surface-100 text-surface-600 rounded hover:bg-surface-200 transition-all">Hide All</button>
                  </div>
                </div>
                <div id="layer-list" class="flex-1 overflow-y-auto p-3 space-y-1">
                  ${renderLayers(parsed, layers, _visibleLayers)}
                </div>
              </div>

              <!-- Entities Content -->
              <div id="side-entities" class="${_activeTab === 'entities' ? 'flex' : 'hidden'} flex-col flex-1 min-h-0">
                <div class="p-4 bg-white border-b border-surface-200">
                  <h3 class="font-semibold text-surface-800 text-sm">Entity Statistics</h3>
                </div>
                <div class="flex-1 overflow-y-auto p-4">
                  ${renderEntityStats(parsed)}
                </div>
              </div>

              <!-- Metadata Footer -->
              <div class="p-4 bg-white border-t border-surface-200 text-[11px] text-surface-500 space-y-1 font-mono">
                <div class="flex justify-between"><span>Unit System:</span> <span class="text-surface-800">${getUnitName(parsed.header?.$INSUNITS || 0)}</span></div>
                <div class="flex justify-between"><span>DXF Version:</span> <span class="text-surface-800">${parsed.header?.$ACADVER || 'Unknown'}</span></div>
                <div class="flex justify-between"><span>Codepage:</span> <span class="text-surface-800">${parsed.header?.$DWGCODEPAGE || 'ANSI_1252'}</span></div>
              </div>
            </div>

            <!-- Viewport -->
            <div class="flex-1 flex flex-col min-w-0 bg-[#0f172a] relative group">
              <!-- Overlay Controls -->
              <div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <div class="bg-black/60 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest border border-white/10 shadow-xl flex items-center gap-2 uppercase">
                  <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  2D Vector Viewport
                </div>
              </div>

              <div id="canvas-container" class="flex-1 flex items-center justify-center overflow-hidden cursor-crosshair relative">
                <canvas id="dxf-canvas" class="max-w-full max-h-full"></canvas>
                <!-- Zoom/Pan Hint -->
                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur px-4 py-2 rounded-full text-[10px] text-white/50 border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                  Auto-fits to window • Layers control visibility
                </div>
              </div>
            </div>
          </div>

          <!-- U10: Statistics Grid -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            ${renderStatCard('Total Entities', entityCount.toLocaleString(), 'text-surface-800')}
            ${renderStatCard('Active Layers', _visibleLayers.size, 'text-brand-600', 'active-layers-count')}
            ${renderStatCard('Canvas Size', 'Calculating...', 'text-surface-700', 'coord-span')}
            ${renderStatCard('Model Extents', getExtentsInfo(parsed), 'text-surface-500 text-xs')}
          </div>
        </div>
      `;

      h.render(html);
      
      _canvas = document.getElementById('dxf-canvas');
      _ctx = _canvas.getContext('2d');

      initEvents(parsed, layers, h);
      
      _resizeObserver = new ResizeObserver(() => {
        if (_renderDebounce) clearTimeout(_renderDebounce);
        _renderDebounce = setTimeout(() => draw(parsed), 60);
      });
      _resizeObserver.observe(document.getElementById('canvas-container'));
      
      draw(parsed);
    }

    function renderStatCard(label, value, valueClass, id = '') {
      return `
        <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 hover:shadow-sm transition-all">
          <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">${label}</h4>
          <div id="${id}" class="text-xl font-bold truncate ${valueClass}">${value}</div>
        </div>
      `;
    }

    function getExtentsInfo(parsed) {
      if (!parsed.header) return 'N/A';
      const min = parsed.header.$EXTMIN;
      const max = parsed.header.$EXTMAX;
      if (!min || !max) return 'Standard Space';
      return `[${min.x.toFixed(0)}, ${min.y.toFixed(0)}] to [${max.x.toFixed(0)}, ${max.y.toFixed(0)}]`;
    }

    function renderLayers(parsed, layers, visible, filter = '') {
      const query = filter.toLowerCase();
      const filtered = layers.filter(l => l.toLowerCase().includes(query));
      
      if (filtered.length === 0) {
        return `<div class="py-12 text-center text-xs text-surface-400 italic">No layers matching "${filter}"</div>`;
      }

      return filtered.map(l => {
        const layerData = parsed.layers[l] || {};
        const color = getDxfColor(layerData.color !== undefined ? layerData.color : 7);
        const isVisible = visible.has(l);
        
        return `
          <label class="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-surface-200 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer group ${isVisible ? '' : 'opacity-40 grayscale'}">
            <div class="flex items-center gap-3 min-w-0">
              <input type="checkbox" class="layer-toggle sr-only" data-layer="${escapeHtml(l)}" ${isVisible ? 'checked' : ''}>
              <div class="w-4 h-4 rounded border border-surface-300 flex items-center justify-center transition-all ${isVisible ? 'bg-brand-500 border-brand-500 shadow-sm' : 'bg-surface-50'}">
                ${isVisible ? '<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="4"><path d="M5 13l4 4L19 7"></path></svg>' : ''}
              </div>
              <span class="text-xs font-medium text-surface-700 truncate">${escapeHtml(l)}</span>
            </div>
            <div class="w-3 h-3 rounded-full border border-black/10" style="background-color: ${color === 'inherit' ? '#94a3b8' : color}"></div>
          </label>
        `;
      }).join('');
    }

    function renderEntityStats(parsed) {
      const stats = {};
      (parsed.entities || []).forEach(e => {
        stats[e.type] = (stats[e.type] || 0) + 1;
      });
      
      const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
      
      return `
        <div class="space-y-3">
          ${sorted.map(([type, count]) => `
            <div class="group">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-mono text-surface-600">${type}</span>
                <span class="font-bold text-surface-800">${count.toLocaleString()}</span>
              </div>
              <div class="h-1.5 w-full bg-surface-100 rounded-full overflow-hidden">
                <div class="h-full bg-brand-500 rounded-full" style="width: ${Math.max(2, (count / parsed.entities.length) * 100)}%"></div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    function initEvents(parsed, layers, h) {
      const container = h.getRenderEl();

      // Tab Switching
      const btnTabViewer = document.getElementById('tab-viewer');
      const btnTabEntities = document.getElementById('tab-entities');
      const sideViewer = document.getElementById('side-viewer');
      const sideEntities = document.getElementById('side-entities');

      function setTab(tab) {
        _activeTab = tab;
        btnTabViewer.className = btnTabViewer.className.replace(/border-brand-500|text-brand-600|bg-brand-50\/30|border-transparent|text-surface-500/, '').trim();
        btnTabEntities.className = btnTabEntities.className.replace(/border-brand-500|text-brand-600|bg-brand-50\/30|border-transparent|text-surface-500/, '').trim();
        
        if (tab === 'viewer') {
          btnTabViewer.classList.add('border-brand-500', 'text-brand-600', 'bg-brand-50/30');
          btnTabEntities.classList.add('border-transparent', 'text-surface-500');
          sideViewer.classList.remove('hidden');
          sideViewer.classList.add('flex');
          sideEntities.classList.add('hidden');
        } else {
          btnTabEntities.classList.add('border-brand-500', 'text-brand-600', 'bg-brand-50/30');
          btnTabViewer.classList.add('border-transparent', 'text-surface-500');
          sideEntities.classList.remove('hidden');
          sideEntities.classList.add('flex');
          sideViewer.classList.add('hidden');
        }
      }

      btnTabViewer.onclick = () => setTab('viewer');
      btnTabEntities.onclick = () => setTab('entities');

      // Layer Toggles
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

      // Search Filter
      const searchInput = document.getElementById('layer-search');
      if (searchInput) {
        searchInput.oninput = function() {
          updateLayerUI(parsed, layers, this.value);
        };
      }

      // Bulk Actions
      document.getElementById('btn-show-all').onclick = () => {
        layers.forEach(l => _visibleLayers.add(l));
        updateLayerUI(parsed, layers, searchInput?.value || '');
        draw(parsed);
      };

      document.getElementById('btn-hide-all').onclick = () => {
        _visibleLayers.clear();
        updateLayerUI(parsed, layers, searchInput?.value || '');
        draw(parsed);
      };
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
      
      // Pass 1: Bounding Box Calculation
      entities.forEach(e => {
        let pts = [];
        if (e.vertices) pts = e.vertices;
        else if (e.center) {
          const r = e.radius || 0;
          pts.push({x: e.center.x - r, y: e.center.y - r});
          pts.push({x: e.center.x + r, y: e.center.y + r});
        }
        pts.forEach(v => {
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
        if (spanEl) spanEl.textContent = 'None';
        return;
      }
      
      const width = maxX - minX;
      const height = maxY - minY;
      if (spanEl) spanEl.textContent = `${width.toFixed(1)} × ${height.toFixed(1)}`;

      const padding = 60;
      const cW = _canvas.parentElement.clientWidth;
      const cH = _canvas.parentElement.clientHeight;
      
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
      _ctx.lineWidth = Math.max(0.6, 1.2 / (scale || 1));
      _ctx.lineCap = 'round';
      _ctx.lineJoin = 'round';
      
      // Pass 2: Rendering
      entities.forEach(e => {
        const layer = parsed.layers[e.layer] || {};
        let color = getDxfColor(layer.color !== undefined ? layer.color : 7);
        
        // Visibility tweak for dark background
        if (color === '#000000' || color === 'inherit') color = '#e2e8f0'; 
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
        } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
          _ctx.fillStyle = color;
          _ctx.font = `${Math.max(8, (e.textHeight || 10) * scale)}px Inter, sans-serif`;
          const px = e.startPoint.x * scale + offsetX;
          const py = offsetY - e.startPoint.y * scale;
          _ctx.fillText(e.text || '', px, py);
        }
      });
    }
  };

})();
