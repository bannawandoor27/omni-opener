/**
 * OmniOpener — Draw.io Viewer Tool
 * Uses OmniTool SDK. Renders .drawio XML diagrams as SVG in the browser.
 */
(function () {
  'use strict';

  var currentScale = 1;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.drawio,.xml',
      dropLabel: 'Drop a .drawio file here',
      infoHtml: '<strong>How it works:</strong> This tool parses the XML structure of .drawio files and renders the diagram as SVG directly in your browser. No data leaves your machine.',

      actions: [
        { label: '🔍+ Zoom In', id: 'zoom-in', onClick: function (h) { zoom(h, 0.2); } },
        { label: '🔍− Zoom Out', id: 'zoom-out', onClick: function (h) { zoom(h, -0.2); } },
        { label: '⊞ Fit', id: 'fit', onClick: function (h) { currentScale = 1; applyZoom(h); } },
        { label: '📥 Export SVG', id: 'export', onClick: function (h) {
          var svg = h.getRenderEl().querySelector('svg');
          if (svg) h.download('diagram.svg', svg.outerHTML, 'image/svg+xml');
        }},
      ],

      onInit: function (h) {
        // Load pako for inflate
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing diagram…');
        // Small delay to let pako finish loading if needed
        setTimeout(function () {
          try {
            renderDrawio(content, h);
          } catch (err) {
            h.showError('Failed to parse diagram', err.message);
          }
        }, 100);
      }
    });
  };

  // ── Zoom ──────────────────────────────────────────────
  function zoom(h, delta) {
    currentScale = Math.max(0.2, Math.min(5, currentScale + delta));
    applyZoom(h);
  }

  function applyZoom(h) {
    var svg = h.getRenderEl().querySelector('svg');
    if (svg) {
      svg.style.transform = 'scale(' + currentScale + ')';
      svg.style.transformOrigin = 'top left';
    }
  }

  // ── Drawio Parser ─────────────────────────────────────
  function renderDrawio(xmlStr, h) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlStr, 'text/xml');
    var diagrams = doc.querySelectorAll('diagram');

    if (diagrams.length === 0) {
      var model = doc.querySelector('mxGraphModel');
      if (model) {
        h.render('<div id="drawio-render" class="p-4"></div>');
        renderMxGraph(model, document.getElementById('drawio-render'));
      } else {
        h.showError('No diagram content found');
      }
      return;
    }

    // Build tab bar + render area
    var tabHtml = '';
    if (diagrams.length > 1) {
      tabHtml = '<div class="flex gap-1 p-2 border-b border-surface-200 bg-surface-50">' +
        Array.from(diagrams).map(function (d, i) {
          var name = d.getAttribute('name') || 'Page ' + (i + 1);
          var cls = i === 0 ? 'bg-brand-600 text-white' : 'text-surface-600 hover:bg-surface-200';
          return '<button class="diagram-tab px-3 py-1 text-sm rounded-md ' + cls + '" data-idx="' + i + '">' + name + '</button>';
        }).join('') + '</div>';
    }

    h.render(tabHtml + '<div id="drawio-render" class="p-4"></div>');

    // Bind tabs
    h.getRenderEl().querySelectorAll('.diagram-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        h.getRenderEl().querySelectorAll('.diagram-tab').forEach(function (b) {
          b.className = b.className.replace('bg-brand-600 text-white', 'text-surface-600 hover:bg-surface-200');
        });
        btn.className = btn.className.replace('text-surface-600 hover:bg-surface-200', 'bg-brand-600 text-white');
        decodeDiagram(diagrams[parseInt(btn.dataset.idx)]);
      });
    });

    decodeDiagram(diagrams[0]);
  }

  function decodeDiagram(diagramEl) {
    var renderArea = document.getElementById('drawio-render');
    var content = diagramEl.textContent.trim();

    if (!content) {
      var model = diagramEl.querySelector('mxGraphModel');
      if (model) { renderMxGraph(model, renderArea); return; }
      renderArea.innerHTML = '<p class="text-surface-400 text-center py-8">Empty diagram</p>';
      return;
    }

    try {
      var decoded = atob(content);
      var bytes = new Uint8Array(decoded.length);
      for (var i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      var inflated = new TextDecoder().decode(pako.inflateRaw(bytes));
      var xml = decodeURIComponent(inflated);
      var doc = new DOMParser().parseFromString(xml, 'text/xml');
      var model = doc.querySelector('mxGraphModel');
      if (model) renderMxGraph(model, renderArea);
      else renderArea.innerHTML = '<p class="text-surface-400">Could not parse diagram XML.</p>';
    } catch (_e) {
      try {
        var doc2 = new DOMParser().parseFromString(content, 'text/xml');
        var model2 = doc2.querySelector('mxGraphModel');
        if (model2) renderMxGraph(model2, renderArea);
        else renderArea.innerHTML = '<p class="text-surface-400">Could not parse diagram content.</p>';
      } catch (e2) {
        renderArea.innerHTML = '<p class="text-red-500">Parse error: ' + e2.message + '</p>';
      }
    }
  }

  function renderMxGraph(model, renderArea) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.style.width = '100%';
    svg.style.minHeight = '400px';

    var minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    var shapes = [], edges = [];

    model.querySelectorAll('mxCell').forEach(function (cell) {
      var geo = cell.querySelector('mxGeometry');
      var style = cell.getAttribute('style') || '';
      var value = cell.getAttribute('value') || '';

      if (cell.getAttribute('vertex') === '1' && geo) {
        var x = parseFloat(geo.getAttribute('x')) || 0;
        var y = parseFloat(geo.getAttribute('y')) || 0;
        var w = parseFloat(geo.getAttribute('width')) || 120;
        var h = parseFloat(geo.getAttribute('height')) || 60;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
        shapes.push({ x: x, y: y, w: w, h: h, value: value, style: style, id: cell.getAttribute('id') });
      } else if (cell.getAttribute('edge') === '1') {
        edges.push({ source: cell.getAttribute('source'), target: cell.getAttribute('target'), value: value, style: style });
      }
    });

    if (shapes.length === 0) {
      renderArea.innerHTML = '<p class="text-surface-400 text-center py-8">No renderable shapes found.</p>';
      return;
    }

    var pad = 40;
    svg.setAttribute('viewBox', (minX - pad) + ' ' + (minY - pad) + ' ' + (maxX - minX + pad * 2) + ' ' + (maxY - minY + pad * 2));

    // Defs (arrow marker)
    var defs = document.createElementNS(svgNS, 'defs');
    var marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', 'arrow'); marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '7'); marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '3.5'); marker.setAttribute('orient', 'auto');
    var poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', '0 0, 10 3.5, 0 7'); poly.setAttribute('fill', '#666');
    marker.appendChild(poly); defs.appendChild(marker); svg.appendChild(defs);

    // Shapes
    shapes.forEach(function (s) {
      var fill = extractStyle(s.style, 'fillColor') || '#dae8fc';
      var stroke = extractStyle(s.style, 'strokeColor') || '#6c8ebf';
      var g = document.createElementNS(svgNS, 'g');

      if (s.style.includes('ellipse')) {
        var ell = document.createElementNS(svgNS, 'ellipse');
        ell.setAttribute('cx', s.x + s.w / 2); ell.setAttribute('cy', s.y + s.h / 2);
        ell.setAttribute('rx', s.w / 2); ell.setAttribute('ry', s.h / 2);
        ell.setAttribute('fill', fill); ell.setAttribute('stroke', stroke); ell.setAttribute('stroke-width', '1.5');
        g.appendChild(ell);
      } else {
        var rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', s.x); rect.setAttribute('y', s.y);
        rect.setAttribute('width', s.w); rect.setAttribute('height', s.h);
        rect.setAttribute('rx', s.style.includes('rounded=1') ? '8' : '2');
        rect.setAttribute('fill', fill); rect.setAttribute('stroke', stroke); rect.setAttribute('stroke-width', '1.5');
        g.appendChild(rect);
      }

      if (s.value) {
        var text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', s.x + s.w / 2); text.setAttribute('y', s.y + s.h / 2);
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', '12'); text.setAttribute('font-family', 'Inter, sans-serif'); text.setAttribute('fill', '#333');
        text.textContent = s.value.replace(/<[^>]*>/g, '');
        g.appendChild(text);
      }
      svg.appendChild(g);
    });

    // Edges
    var shapeMap = {};
    shapes.forEach(function (s) { shapeMap[s.id] = s; });
    edges.forEach(function (e) {
      var src = shapeMap[e.source], tgt = shapeMap[e.target];
      if (src && tgt) {
        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', src.x + src.w / 2); line.setAttribute('y1', src.y + src.h / 2);
        line.setAttribute('x2', tgt.x + tgt.w / 2); line.setAttribute('y2', tgt.y + tgt.h / 2);
        line.setAttribute('stroke', extractStyle(e.style, 'strokeColor') || '#666');
        line.setAttribute('stroke-width', '1.5'); line.setAttribute('marker-end', 'url(#arrow)');
        svg.appendChild(line);
      }
    });

    renderArea.innerHTML = '';
    renderArea.appendChild(svg);
  }

  function extractStyle(style, key) {
    var m = style.match(new RegExp(key + '=([^;]+)'));
    return m ? m[1] : null;
  }
})();
