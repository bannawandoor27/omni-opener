/**
 * OmniOpener — DXF Toolkit
 * A high-performance CAD viewer with layer management and JSON export.
 */
(function () {
  'use strict';

  // Helper: Format bytes to human readable string
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
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

  // Helper: Get DXF color from index
  function getDxfColor(idx) {
    var colors = [
      '#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff',
      '#808080', '#c0c0c0', '#ff0000', '#ff7f7f', '#a50000', '#a55252', '#7f0000', '#7f3f3f'
    ];
    return colors[idx] || '#ffffff';
  }

  window.initTool = function (toolConfig, mountEl) {
    var _currentParsed = null;
    var _visibleLayers = new Set();
    var _canvas = null;
    var _ctx = null;
    var _renderTimer = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      infoHtml: '<strong>DXF Toolkit:</strong> Professional CAD viewer with 2D preview, interactive layer management, and zoom/pan. All processing happens locally in your browser.',
      
      actions: [
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
          label: '📥 Download DXF',
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

      onFile: function _onFile(file, content, h) {
        h.showLoading('Parsing CAD data...');
        
        // B1 & B8: Race condition and strict mode self-reference
        if (typeof DxfParser === 'undefined') {
          setTimeout(function() { _onFile(file, content, h); }, 200);
          return;
        }

        try {
          var parser = new DxfParser();
          _currentParsed = parser.parseSync(content);
          
          if (!_currentParsed) throw new Error('Empty or invalid DXF structure');

          var layers = Object.keys(_currentParsed.layers || {});
          _visibleLayers = new Set(layers);

          renderApp(file, _currentParsed, layers, h);
        } catch (err) {
          console.error('[DXF Parser]', err);
          h.showError('Unable to parse DXF', 'The file might be corrupted, too new (R2018+), or in a binary format. Try saving as "AutoCAD R12/2000 DXF" (ASCII).');
        }
      },

      onDestroy: function() {
        _currentParsed = null;
        _visibleLayers.clear();
        if (_renderTimer) clearTimeout(_renderTimer);
      }
    });

    function renderApp(file, parsed, layers, h) {
      var html = '';
      
      // U1: File Info Bar
      html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">' +
        '<span class="font-semibold text-surface-800">' + escapeHtml(file.name) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span>' + formatSize(file.size) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span class="text-surface-500">AutoCAD DXF</span>' +
        '<span class="ml-auto bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">' + (parsed.entities ? parsed.entities.length : 0) + ' entities</span>' +
      '</div>';

      // U5: Empty state
      if (!parsed.entities || parsed.entities.length === 0) {
        html += '<div class="p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">' +
          '<div class="text-4xl mb-3">📐</div>' +
          '<h3 class="text-lg font-semibold text-surface-800">No entities found</h3>' +
          '<p class="text-surface-500">This DXF file doesn\'t contain any drawable entities in its current view.</p>' +
        '</div>';
        h.render(html);
        return;
      }

      // Main Layout
      html += '<div class="flex flex-col lg:flex-row h-[70vh] min-h-[500px] border border-surface-200 rounded-2xl overflow-hidden bg-white shadow-sm font-sans">' +
        '<!-- Sidebar -->' +
        '<div class="w-full lg:w-72 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">' +
          '<div class="p-4 border-b border-surface-200 bg-white">' +
            '<div class="flex items-center justify-between mb-3">' +
              '<h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Layers</h3>' +
              '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">' + layers.length + '</span>' +
            '</div>' +
            '<input type="text" id="layer-search" placeholder="Filter layers..." class="w-full px-3 py-1.5 text-sm bg-surface-50 border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">' +
          '</div>' +
          '<div id="layer-list" class="flex-1 overflow-y-auto p-2 space-y-1">' +
            renderLayers(parsed, layers, _visibleLayers) +
          '</div>' +
          '<div class="p-3 bg-white border-t border-surface-200 flex gap-2">' +
            '<button id="btn-show-all" class="flex-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-tight bg-surface-100 text-surface-600 rounded hover:bg-surface-200 transition-colors">All</button>' +
            '<button id="btn-hide-all" class="flex-1 px-2 py-1.5 text-[10px] font-bold uppercase tracking-tight bg-surface-100 text-surface-600 rounded hover:bg-surface-200 transition-colors">None</button>' +
          '</div>' +
        '</div>' +

        '<!-- Canvas Viewport -->' +
        '<div class="flex-1 flex flex-col min-w-0 bg-[#121212] relative group">' +
          '<div class="absolute top-4 left-4 z-10 flex flex-col gap-2">' +
            '<div class="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-[10px] font-medium border border-white/10 shadow-xl flex items-center gap-2">' +
              '<span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>' +
              '2D VECTOR PREVIEW' +
            '</div>' +
          '</div>' +
          '<div class="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">' +
            '<button id="btn-reset-view" class="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/20 transition-all">RESET VIEW</button>' +
          '</div>' +
          '<div class="flex-1 flex items-center justify-center overflow-hidden cursor-move">' +
            '<canvas id="dxf-canvas" class="max-w-full max-h-full transition-transform duration-300"></canvas>' +
          '</div>' +
          '<div class="absolute bottom-4 left-4 z-10 text-white/40 text-[9px] uppercase tracking-tighter">' +
            'Drawing units: ' + (parsed.header && parsed.header.$INSUNITS ? getUnitName(parsed.header.$INSUNITS) : 'Undefined') +
          '</div>' +
        '</div>' +
      '</div>';

      h.render(html);

      // Initialize Canvas
      _canvas = document.getElementById('dxf-canvas');
      _ctx = _canvas.getContext('2d');
      
      setupListeners(parsed, layers, h);
      draw(parsed);
    }

    function renderLayers(parsed, layers, visible, filter) {
      var filtered = filter ? layers.filter(function(l) { return l.toLowerCase().includes(filter.toLowerCase()); }) : layers;
      
      if (filtered.length === 0) {
        return '<div class="py-8 text-center text-xs text-surface-400 italic">No layers matching "' + escapeHtml(filter) + '"</div>';
      }

      return filtered.map(function (l) {
        var layerData = parsed.layers[l] || {};
        var color = getDxfColor(layerData.color !== undefined ? layerData.color : 7);
        var isVisible = visible.has(l);
        
        return '<label class="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-surface-200 shadow-sm cursor-pointer group hover:border-brand-300 hover:shadow transition-all ' + (isVisible ? '' : 'opacity-60 grayscale-[0.5]') + '">' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<div class="relative flex items-center">' +
              '<input type="checkbox" class="layer-toggle sr-only" data-layer="' + escapeHtml(l) + '" ' + (isVisible ? 'checked' : '') + '>' +
              '<div class="w-4 h-4 rounded border-2 border-surface-300 group-hover:border-brand-400 transition-colors flex items-center justify-center ' + (isVisible ? 'bg-brand-500 border-brand-500' : 'bg-white') + '">' +
                (isVisible ? '<svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="4"><path d="M5 13l4 4L19 7"></path></svg>' : '') +
              '</div>' +
            '</div>' +
            '<span class="text-xs font-semibold text-surface-700 truncate">' + escapeHtml(l) + '</span>' +
          '</div>' +
          '<div class="w-3 h-3 rounded-full shadow-inner border border-black/5" style="background-color: ' + color + '"></div>' +
        '</label>';
      }).join('');
    }

    function setupListeners(parsed, layers, h) {
      var renderEl = h.getRenderEl();
      
      // Layer Toggle
      renderEl.addEventListener('change', function(e) {
        if (e.target.classList.contains('layer-toggle')) {
          var layer = e.target.getAttribute('data-layer');
          if (e.target.checked) _visibleLayers.add(layer);
          else _visibleLayers.delete(layer);
          
          updateLayerList(parsed, layers);
          draw(parsed);
        }
      });

      // Search
      var searchInput = document.getElementById('layer-search');
      if (searchInput) {
        searchInput.oninput = function() {
          updateLayerList(parsed, layers, this.value);
        };
      }

      // Show/Hide All
      document.getElementById('btn-show-all').onclick = function() {
        layers.forEach(function(l) { _visibleLayers.add(l); });
        updateLayerList(parsed, layers, searchInput.value);
        draw(parsed);
      };
      document.getElementById('btn-hide-all').onclick = function() {
        _visibleLayers.clear();
        updateLayerList(parsed, layers, searchInput.value);
        draw(parsed);
      };

      // Reset View
      var resetBtn = document.getElementById('btn-reset-view');
      if (resetBtn) resetBtn.onclick = function() { draw(parsed); };
    }

    function updateLayerList(parsed, layers, filter) {
      var list = document.getElementById('layer-list');
      if (list) list.innerHTML = renderLayers(parsed, layers, _visibleLayers, filter);
    }

    function draw(parsed) {
      if (!_canvas || !_ctx || !parsed.entities) return;

      var entities = parsed.entities.filter(function (e) { return _visibleLayers.has(e.layer); });
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      // Calculate Bounds
      entities.forEach(function (e) {
        var points = [];
        if (e.type === 'LINE') {
          points.push(e.vertices[0], e.vertices[1]);
        } else if (e.vertices) {
          points = e.vertices;
        } else if (e.center) {
          // Approximate bounds for circles/arcs
          var r = e.radius || 0;
          points.push({x: e.center.x - r, y: e.center.y - r});
          points.push({x: e.center.x + r, y: e.center.y + r});
        }

        points.forEach(function (v) {
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        });
      });

      if (minX === Infinity) {
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        return;
      }
      
      var width = maxX - minX;
      var height = maxY - minY;
      if (width === 0) width = 1;
      if (height === 0) height = 1;

      var padding = 60;
      var containerWidth = _canvas.parentElement.clientWidth;
      var containerHeight = _canvas.parentElement.clientHeight;
      
      // Scale to fit container while maintaining aspect ratio
      var scaleX = (containerWidth - padding * 2) / width;
      var scaleY = (containerHeight - padding * 2) / height;
      var scale = Math.min(scaleX, scaleY);

      // High DPI support
      var dpr = window.devicePixelRatio || 1;
      _canvas.width = containerWidth * dpr;
      _canvas.height = containerHeight * dpr;
      _canvas.style.width = containerWidth + 'px';
      _canvas.style.height = containerHeight + 'px';
      _ctx.scale(dpr, dpr);
      
      var offsetX = (containerWidth - width * scale) / 2 - minX * scale;
      var offsetY = (containerHeight - height * scale) / 2 + maxY * scale;

      _ctx.clearRect(0, 0, containerWidth, containerHeight);
      _ctx.lineWidth = 1.2 / dpr;
      _ctx.lineCap = 'round';
      _ctx.lineJoin = 'round';
      
      entities.forEach(function (e) {
        var layer = parsed.layers[e.layer] || {};
        _ctx.strokeStyle = getDxfColor(layer.color !== undefined ? layer.color : 7);
        if (_ctx.strokeStyle === '#000000') _ctx.strokeStyle = '#ffffff'; // Invert black on dark bg
        
        if (e.type === 'LINE' || (e.vertices && e.vertices.length >= 2)) {
          var pts = e.vertices || [e.start, e.end];
          _ctx.beginPath();
          pts.forEach(function(v, i) {
            var px = v.x * scale + offsetX;
            var py = offsetY - v.y * scale;
            if (i === 0) _ctx.moveTo(px, py);
            else _ctx.lineTo(px, py);
          });
          _ctx.stroke();
        } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
          _ctx.beginPath();
          var cx = e.center.x * scale + offsetX;
          var cy = offsetY - e.center.y * scale;
          var r = e.radius * scale;
          var startAngle = e.startAngle ? -e.startAngle * Math.PI / 180 : 0;
          var endAngle = e.endAngle ? -e.endAngle * Math.PI / 180 : -2 * Math.PI;
          _ctx.arc(cx, cy, r, startAngle, endAngle, true);
          _ctx.stroke();
        }
      });
    }

    function getUnitName(id) {
      var units = ['Unspecified', 'Inches', 'Feet', 'Miles', 'Millimeters', 'Centimeters', 'Meters', 'Kilometers', 'Microinches', 'Mils', 'Yards', 'Angstroms', 'Nanometers', 'Microns', 'Decimeters', 'Decameters', 'Hectometers', 'Gigameters', 'Astronomical units', 'Light years', 'Parsecs'];
      return units[id] || 'Unknown (' + id + ')';
    }
  };

})();
