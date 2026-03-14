/**
 * OmniOpener — Draw.io Viewer Tool
 * Renders .drawio XML diagrams in the browser using mxGraph.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    mountEl.innerHTML = `
      <div class="space-y-6">
        <!-- Drop Zone -->
        <div id="drawio-drop" class="drop-zone border-2 border-dashed border-surface-300 rounded-2xl p-10 text-center cursor-pointer hover:border-brand-400 transition-all">
          <div class="flex flex-col items-center gap-3">
            <span class="text-4xl">📐</span>
            <p class="font-semibold text-surface-700">Drop a .drawio file here</p>
            <p class="text-sm text-surface-400">or click to browse</p>
            <input type="file" id="drawio-file-input" accept=".drawio,.xml" class="hidden">
          </div>
        </div>

        <!-- Controls -->
        <div id="drawio-controls" class="hidden flex items-center gap-3 flex-wrap">
          <button id="drawio-zoom-in" class="px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium hover:bg-surface-50 transition-colors">🔍+ Zoom In</button>
          <button id="drawio-zoom-out" class="px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium hover:bg-surface-50 transition-colors">🔍− Zoom Out</button>
          <button id="drawio-fit" class="px-3 py-1.5 rounded-lg border border-surface-200 bg-white text-sm font-medium hover:bg-surface-50 transition-colors">⊞ Fit</button>
          <span id="drawio-filename" class="ml-auto text-sm text-surface-400"></span>
        </div>

        <!-- Render Area -->
        <div id="drawio-canvas" class="hidden rounded-xl border border-surface-200 bg-white overflow-auto" style="min-height: 500px; position: relative;">
        </div>

        <!-- Info -->
        <div class="bg-surface-50 rounded-xl p-4 text-sm text-surface-500">
          <strong class="text-surface-700">How it works:</strong> This tool parses the XML structure of .drawio files and renders the diagram as SVG directly in your browser. No data leaves your machine.
        </div>
      </div>
    `;

    const dropZone = document.getElementById('drawio-drop');
    const fileInput = document.getElementById('drawio-file-input');
    const canvas = document.getElementById('drawio-canvas');
    const controls = document.getElementById('drawio-controls');
    const filenameEl = document.getElementById('drawio-filename');
    let currentScale = 1;

    // Handle dropped file from global drop zone
    if (window.__droppedFile) {
      processFile(window.__droppedFile);
      window.__droppedFile = null;
    }

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) processFile(e.target.files[0]);
    });

    // Drag and drop
    ['dragenter', 'dragover'].forEach(evt =>
      dropZone.addEventListener(evt, e => { e.preventDefault(); dropZone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(evt =>
      dropZone.addEventListener(evt, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); })
    );
    dropZone.addEventListener('drop', e => {
      if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
    });

    // Zoom controls
    document.getElementById('drawio-zoom-in').addEventListener('click', () => zoom(0.2));
    document.getElementById('drawio-zoom-out').addEventListener('click', () => zoom(-0.2));
    document.getElementById('drawio-fit').addEventListener('click', () => { currentScale = 1; applyZoom(); });

    function zoom(delta) {
      currentScale = Math.max(0.2, Math.min(5, currentScale + delta));
      applyZoom();
    }

    function applyZoom() {
      const svg = canvas.querySelector('svg');
      if (svg) {
        svg.style.transform = `scale(${currentScale})`;
        svg.style.transformOrigin = 'top left';
      }
    }

    function processFile(file) {
      filenameEl.textContent = file.name;
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const xmlStr = e.target.result;
          renderDrawio(xmlStr);
          dropZone.classList.add('hidden');
          canvas.classList.remove('hidden');
          controls.classList.remove('hidden');
        } catch (err) {
          canvas.innerHTML = `<div class="p-8 text-center text-red-500"><p class="font-medium">Failed to parse file</p><p class="text-sm mt-1">${err.message}</p></div>`;
          canvas.classList.remove('hidden');
        }
      };
      reader.readAsText(file);
    }

    function renderDrawio(xmlStr) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlStr, 'text/xml');

      // Draw.io files can have compressed content in <diagram> tags
      const diagrams = doc.querySelectorAll('diagram');
      if (diagrams.length === 0) {
        // Try to render as raw mxGraphModel
        const model = doc.querySelector('mxGraphModel');
        if (model) {
          renderMxGraph(model);
        } else {
          canvas.innerHTML = '<div class="p-8 text-center text-surface-500">No diagram content found in this file.</div>';
        }
        return;
      }

      // Render tab selector if multiple diagrams
      let tabHtml = '';
      if (diagrams.length > 1) {
        tabHtml = `<div class="flex gap-1 p-2 border-b border-surface-200 bg-surface-50">` +
          Array.from(diagrams).map((d, i) => {
            const name = d.getAttribute('name') || `Page ${i + 1}`;
            return `<button class="diagram-tab px-3 py-1 text-sm rounded-md ${i === 0 ? 'bg-brand-600 text-white' : 'text-surface-600 hover:bg-surface-200'}" data-idx="${i}">${name}</button>`;
          }).join('') + '</div>';
      }

      canvas.innerHTML = tabHtml + '<div id="drawio-render" class="p-4"></div>';

      // Bind tabs
      canvas.querySelectorAll('.diagram-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          canvas.querySelectorAll('.diagram-tab').forEach(b => { b.className = b.className.replace('bg-brand-600 text-white', 'text-surface-600 hover:bg-surface-200'); });
          btn.className = btn.className.replace('text-surface-600 hover:bg-surface-200', 'bg-brand-600 text-white');
          decodeDiagram(diagrams[parseInt(btn.dataset.idx)]);
        });
      });

      // Render first diagram
      decodeDiagram(diagrams[0]);
    }

    function decodeDiagram(diagramEl) {
      const renderArea = document.getElementById('drawio-render');
      let content = diagramEl.textContent.trim();

      if (!content) {
        // Check for inline mxGraphModel
        const model = diagramEl.querySelector('mxGraphModel');
        if (model) {
          renderMxGraph(model);
          return;
        }
        renderArea.innerHTML = '<p class="text-surface-400 text-center py-8">Empty diagram</p>';
        return;
      }

      // Decode: base64 → inflate → URL decode
      try {
        const decoded = atob(content);
        const inflated = pako_inflate(decoded);
        const xml = decodeURIComponent(inflated);
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const model = doc.querySelector('mxGraphModel');
        if (model) renderMxGraph(model);
        else renderArea.innerHTML = '<p class="text-surface-400">Could not parse diagram XML.</p>';
      } catch {
        // Some drawio files store uncompressed XML
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, 'text/xml');
          const model = doc.querySelector('mxGraphModel');
          if (model) renderMxGraph(model);
          else renderArea.innerHTML = '<p class="text-surface-400">Could not parse diagram content.</p>';
        } catch (e2) {
          renderArea.innerHTML = `<p class="text-red-500">Parse error: ${e2.message}</p>`;
        }
      }
    }

    // Minimal inflate using pako (loaded from CDN)
    function pako_inflate(data) {
      // Convert string to Uint8Array
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
      // Use pako
      if (typeof pako !== 'undefined') {
        return new TextDecoder().decode(pako.inflateRaw(bytes));
      }
      throw new Error('pako not loaded');
    }

    function renderMxGraph(model) {
      const renderArea = document.getElementById('drawio-render');
      const cells = model.querySelectorAll('mxCell');

      // Build SVG from mxGraph cells
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('xmlns', svgNS);
      svg.style.width = '100%';
      svg.style.minHeight = '400px';

      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
      const shapes = [];
      const edges = [];

      cells.forEach(cell => {
        const geo = cell.querySelector('mxGeometry');
        const style = cell.getAttribute('style') || '';
        const value = cell.getAttribute('value') || '';
        const isEdge = cell.getAttribute('edge') === '1';
        const isVertex = cell.getAttribute('vertex') === '1';

        if (isVertex && geo) {
          const x = parseFloat(geo.getAttribute('x')) || 0;
          const y = parseFloat(geo.getAttribute('y')) || 0;
          const w = parseFloat(geo.getAttribute('width')) || 120;
          const h = parseFloat(geo.getAttribute('height')) || 60;

          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);

          shapes.push({ x, y, w, h, value, style, id: cell.getAttribute('id') });
        } else if (isEdge) {
          const source = cell.getAttribute('source');
          const target = cell.getAttribute('target');
          edges.push({ source, target, value, style });
        }
      });

      if (shapes.length === 0) {
        renderArea.innerHTML = '<p class="text-surface-400 text-center py-8">No renderable shapes found in this diagram.</p>';
        return;
      }

      const padding = 40;
      const viewW = maxX - minX + padding * 2;
      const viewH = maxY - minY + padding * 2;
      svg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${viewW} ${viewH}`);

      // Render shapes
      shapes.forEach(s => {
        const fillColor = extractStyle(s.style, 'fillColor') || '#dae8fc';
        const strokeColor = extractStyle(s.style, 'strokeColor') || '#6c8ebf';
        const isRounded = s.style.includes('rounded=1');
        const isEllipse = s.style.includes('ellipse');

        const g = document.createElementNS(svgNS, 'g');

        if (isEllipse) {
          const ellipse = document.createElementNS(svgNS, 'ellipse');
          ellipse.setAttribute('cx', s.x + s.w / 2);
          ellipse.setAttribute('cy', s.y + s.h / 2);
          ellipse.setAttribute('rx', s.w / 2);
          ellipse.setAttribute('ry', s.h / 2);
          ellipse.setAttribute('fill', fillColor);
          ellipse.setAttribute('stroke', strokeColor);
          ellipse.setAttribute('stroke-width', '1.5');
          g.appendChild(ellipse);
        } else {
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', s.x);
          rect.setAttribute('y', s.y);
          rect.setAttribute('width', s.w);
          rect.setAttribute('height', s.h);
          rect.setAttribute('rx', isRounded ? '8' : '2');
          rect.setAttribute('fill', fillColor);
          rect.setAttribute('stroke', strokeColor);
          rect.setAttribute('stroke-width', '1.5');
          g.appendChild(rect);
        }

        if (s.value) {
          const text = document.createElementNS(svgNS, 'text');
          text.setAttribute('x', s.x + s.w / 2);
          text.setAttribute('y', s.y + s.h / 2);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.setAttribute('font-size', '12');
          text.setAttribute('font-family', 'Inter, sans-serif');
          text.setAttribute('fill', '#333');
          // Strip HTML tags from value
          text.textContent = s.value.replace(/<[^>]*>/g, '');
          g.appendChild(text);
        }

        svg.appendChild(g);
      });

      // Render edges (simple lines between shape centers)
      const shapeMap = {};
      shapes.forEach(s => { shapeMap[s.id] = s; });

      edges.forEach(e => {
        const src = shapeMap[e.source];
        const tgt = shapeMap[e.target];
        if (src && tgt) {
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', src.x + src.w / 2);
          line.setAttribute('y1', src.y + src.h / 2);
          line.setAttribute('x2', tgt.x + tgt.w / 2);
          line.setAttribute('y2', tgt.y + tgt.h / 2);
          const strokeColor = extractStyle(e.style, 'strokeColor') || '#666';
          line.setAttribute('stroke', strokeColor);
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('marker-end', 'url(#arrow)');
          svg.appendChild(line);
        }
      });

      // Arrow marker
      const defs = document.createElementNS(svgNS, 'defs');
      const marker = document.createElementNS(svgNS, 'marker');
      marker.setAttribute('id', 'arrow');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '10');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      const polygon = document.createElementNS(svgNS, 'polygon');
      polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
      polygon.setAttribute('fill', '#666');
      marker.appendChild(polygon);
      defs.appendChild(marker);
      svg.insertBefore(defs, svg.firstChild);

      renderArea.innerHTML = '';
      renderArea.appendChild(svg);
    }

    function extractStyle(style, key) {
      const re = new RegExp(key + '=([^;]+)');
      const m = style.match(re);
      return m ? m[1] : null;
    }
  };

  // Load pako for inflate
  if (typeof pako === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js';
    document.head.appendChild(s);
  }
})();
