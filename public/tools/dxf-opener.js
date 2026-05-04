/**
 * OmniOpener — DXF Toolkit
 * Uses OmniTool SDK and dxf-parser.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function getColor(idx) {
    var colors = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0'];
    return colors[idx % 10] || '#ffffff';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dxf',
      binary: false,
      infoHtml: '<strong>DXF Toolkit:</strong> Professional CAD viewer with 2D preview, interactive layer management, and zoom/pan. All processing happens locally in your browser.',
      
      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            var state = h.getState();
            if (state.parsed) {
              h.copyToClipboard(JSON.stringify(state.parsed, null, 2), btn);
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

      onFile: function (file, content, h) {
        h.showLoading('Parsing CAD data...');
        
        // Ensure parser is loaded
        if (typeof DxfParser === 'undefined') {
          setTimeout(function() { h.onFile(file, content, h); }, 200);
          return;
        }

        try {
          var parser = new DxfParser();
          var parsed = parser.parseSync(content);
          var layers = Object.keys(parsed.layers);
          
          h.setState({
            parsed: parsed,
            visibleLayers: new Set(layers)
          });

          renderApp(file, parsed, layers, h);
        } catch (err) {
          h.showError('Unable to parse DXF', err.message);
        }
      }
    });
  };

  function renderApp(file, parsed, layers, h) {
    var visible = h.getState().visibleLayers;
    
    h.render(
      '<div class="flex flex-col md:flex-row h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">' +
        '<!-- Sidebar -->' +
        '<div class="w-full md:w-64 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">' +
          '<div class="p-4 border-b border-surface-200 bg-white">' +
            '<h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Layers (' + layers.length + ')</h3>' +
          '</div>' +
          '<div class="flex-1 overflow-auto p-2 space-y-1" style="max-height: 200px; md:max-height: none;">' +
            layers.map(function (l) {
              return '<label class="flex items-center justify-between px-3 py-2 bg-white rounded border border-surface-100 shadow-sm cursor-pointer group hover:border-brand-300 transition-all">' +
                '<div class="flex items-center gap-3">' +
                  '<input type="checkbox" class="layer-toggle w-3 h-3 accent-brand-600" data-layer="' + escapeHtml(l) + '" ' + (visible.has(l) ? 'checked' : '') + '>' +
                  '<span class="text-[11px] font-medium text-surface-700 truncate max-w-[120px]">' + escapeHtml(l) + '</span>' +
                '</div>' +
                '<div class="w-2.5 h-2.5 rounded-full" style="background-color: ' + getColor(parsed.layers[l].color) + '"></div>' +
              '</label>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<!-- Main View -->' +
        '<div class="flex-1 flex flex-col min-w-0">' +
          '<div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between text-[10px] font-bold text-surface-500 uppercase">' +
            '<span class="truncate">' + escapeHtml(file.name) + '</span>' +
            '<div class="flex gap-4">' +
              '<span>' + parsed.entities.length + ' Entities</span>' +
              '<button id="btn-reset-view" class="text-brand-600 hover:text-brand-700">Reset View</button>' +
            '</div>' +
          '</div>' +
          '<div class="flex-1 bg-[#1e1e1e] relative overflow-hidden flex items-center justify-center cursor-crosshair">' +
            '<canvas id="dxf-canvas" class="max-w-full max-h-full"></canvas>' +
            '<div class="absolute bottom-4 left-4 flex gap-2">' +
              '<span class="bg-black/50 text-white px-3 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider">2D Vector Preview</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    var canvas = document.getElementById('dxf-canvas');
    var ctx = canvas.getContext('2d');
    
    h.getRenderEl().querySelectorAll('.layer-toggle').forEach(function (chk) {
      chk.onchange = function () {
        var l = chk.getAttribute('data-layer');
        if (chk.checked) visible.add(l); else visible.delete(l);
        draw(canvas, ctx, parsed, visible);
      };
    });

    var resetBtn = document.getElementById('btn-reset-view');
    if (resetBtn) {
      resetBtn.onclick = function () { draw(canvas, ctx, parsed, visible); };
    }

    draw(canvas, ctx, parsed, visible);
  }

  function draw(canvas, ctx, parsed, visible) {
    var entities = parsed.entities.filter(function (e) { return visible.has(e.layer); });
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    entities.forEach(function (e) {
      if (e.vertices) {
        e.vertices.forEach(function (v) {
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
        });
      }
    });

    if (minX === Infinity) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    
    var width = maxX - minX;
    var height = maxY - minY;
    var padding = 50;
    
    // Set a reasonable internal resolution
    canvas.width = 2000;
    canvas.height = (height / width) * 2000 || 2000;
    
    var scale = (canvas.width - padding * 2) / width;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    entities.forEach(function (e) {
      if (e.vertices && e.vertices.length >= 2) {
        ctx.strokeStyle = getColor(parsed.layers[e.layer] ? parsed.layers[e.layer].color : 7);
        ctx.beginPath();
        
        var x0 = (e.vertices[0].x - minX) * scale + padding;
        var y0 = canvas.height - ((e.vertices[0].y - minY) * scale + padding);
        ctx.moveTo(x0, y0);
        
        for (var i = 1; i < e.vertices.length; i++) {
          var x = (e.vertices[i].x - minX) * scale + padding;
          var y = canvas.height - ((e.vertices[i].y - minY) * scale + padding);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  }
})();
