/**
 * OmniOpener — GPX Toolkit
 * Uses OmniTool SDK, Leaflet, toGeoJSON, and Chart.js.
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
    let map = null;
    let elevationMarker = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.gpx',
      binary: false,
      infoHtml: '<strong>GPX Toolkit:</strong> Professional GPS track viewer with interactive elevation profiling and activity statistics.',
      
      onInit: function (h) {
        h.loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        h.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js');
          h.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
        });
      },

      onFile: function _onFile(file, content, h) {
        if (typeof L === 'undefined' || typeof toGeoJSON === 'undefined' || typeof Chart === 'undefined') {
          h.showLoading('Loading map engines...');
          setTimeout(() => _onFile(file, content, h), 500);
          return;
        }

        try {
          const dom = new DOMParser().parseFromString(content, 'text/xml');
          const geojson = toGeoJSON.gpx(dom);
          
          // Calculate Stats
          let distance = 0;
          const elevations = [];
          const coords = [];
          geojson.features.forEach(f => {
             if (f.geometry.type === 'LineString') {
                const c = f.geometry.coordinates;
                for (let i = 0; i < c.length - 1; i++) {
                   const p1 = L.latLng(c[i][1], c[i][0]);
                   const p2 = L.latLng(c[i+1][1], c[i+1][0]);
                   distance += p1.distanceTo(p2);
                   if (c[i][2] !== undefined) { elevations.push(c[i][2]); coords.push(c[i]); }
                }
             }
          });

          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                 <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                 <div class="flex items-center gap-4">
                    <div class="flex gap-3 text-[10px] font-bold text-surface-500 uppercase tracking-widest border-r border-surface-200 pr-4">
                       <span>Dist: ${(distance/1000).toFixed(2)} km</span>
                       ${elevations.length > 0 ? `<span>Elev: ${Math.max(...elevations).toFixed(0)}m</span>` : ''}
                    </div>
                    <button id="btn-fit" class="px-2 py-1 bg-white border border-surface-200 rounded text-[10px] font-bold">🎯 Fit</button>
                 </div>
              </div>
              <div class="flex-1 flex flex-col relative">
                 <div id="map" class="flex-1 bg-surface-100"></div>
                 ${elevations.length > 0 ? `
                   <div id="elev-panel" class="h-32 bg-white border-t border-surface-200 p-4 relative">
                      <canvas id="elev-chart"></canvas>
                   </div>
                 ` : ''}
              </div>
            </div>
          `);

          if (map) map.remove();
          map = L.map('map', { attributionControl: false }).setView([0, 0], 2);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

          const trackLayer = L.geoJSON(geojson, { style: { color: '#ef4444', weight: 4, opacity: 0.8 } }).addTo(map);
          map.fitBounds(trackLayer.getBounds());
          document.getElementById('btn-fit').onclick = () => map.fitBounds(trackLayer.getBounds());

          if (elevations.length > 0) {
             const ctx = document.getElementById('elev-chart').getContext('2d');
             elevationMarker = L.circleMarker([0, 0], { radius: 6, color: '#4f46e5', fillOpacity: 1 }).addTo(map);
             
             new Chart(ctx, {
                type: 'line',
                data: {
                   labels: elevations.map((_, i) => i),
                   datasets: [{ label: 'Elevation', data: elevations, borderColor: '#ef4444', borderWidth: 2, fill: true, backgroundColor: 'rgba(239, 68, 68, 0.1)', pointRadius: 0 }]
                },
                options: {
                   responsive: true,
                   maintainAspectRatio: false,
                   plugins: { legend: { display: false } },
                   scales: { x: { display: false }, y: { ticks: { font: { size: 8 } } } },
                   onHover: (e, elements) => {
                      if (elements.length > 0) {
                         const idx = elements[0].index;
                         const coord = coords[idx];
                         elevationMarker.setLatLng([coord[1], coord[0]]);
                      }
                   }
                }
             });
          }

        } catch (err) { h.showError('GPX Error', 'Failed to render track'); }
      }
    });
  };
})();

