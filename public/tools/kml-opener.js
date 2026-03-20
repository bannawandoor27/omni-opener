/**
 * OmniOpener — KML Toolkit
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

    OmniTool.create(mountEl, toolConfig, {
      accept: '.kml',
      binary: false,
      infoHtml: '<strong>KML Toolkit:</strong> Advanced geographic viewer with elevation profiling, feature inspection, and GeoJSON export.',
      
      onInit: function (h) {
        h.loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        h.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js');
          h.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
        });
      },

      actions: [
        {
          label: '📥 Export GeoJSON',
          id: 'export-geojson',
          onClick: function (h) {
             const geojson = h.getState().geojson;
             if (geojson) h.download(h.getFile().name.replace(/\.kml$/i, '.geojson'), JSON.stringify(geojson, null, 2));
          }
        }
      ],

      onFile: function _onFile(file, content, h) {
        if (typeof L === 'undefined' || typeof toGeoJSON === 'undefined' || typeof Chart === 'undefined') {
          h.showLoading('Loading map engines...');
          setTimeout(() => _onFile(file, content, h), 500);
          return;
        }

        try {
          const dom = new DOMParser().parseFromString(content, 'text/xml');
          const geojson = toGeoJSON.kml(dom);
          h.setState('geojson', geojson);
          
          // Extract Elevation
          const elevations = [];
          geojson.features.forEach(f => {
             if (f.geometry.type === 'LineString') {
                f.geometry.coordinates.forEach(c => { if(c[2] !== undefined) elevations.push(c[2]); });
             }
          });

          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                 <div class="flex items-center gap-4">
                    <div class="flex px-1 bg-white border border-surface-200 rounded-lg">
                       <button id="tab-map" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Map</button>
                       ${elevations.length > 0 ? `<button id="tab-elev" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Elevation</button>` : ''}
                    </div>
                 </div>
                 <div class="flex gap-2">
                    <button id="btn-fit" class="px-2 py-1 bg-white border border-surface-200 rounded text-[10px] font-bold">🎯 Fit</button>
                 </div>
              </div>
              <div class="flex-1 relative">
                 <div id="map-container" class="absolute inset-0">
                    <div id="map" class="w-full h-full bg-surface-100"></div>
                 </div>
                 <div id="elev-container" class="absolute inset-0 hidden bg-white p-8 overflow-auto">
                    <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-6">Elevation Profile</h3>
                    <div class="h-64 w-full"><canvas id="elev-chart"></canvas></div>
                 </div>
                 <div id="prop-inspector" class="absolute top-4 right-4 bottom-4 w-64 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-surface-200 flex flex-col hidden z-[1000]">
                    <div class="p-3 border-b border-surface-100 flex items-center justify-between">
                       <h3 class="font-bold text-[10px] uppercase text-surface-400">Properties</h3>
                       <button onclick="document.getElementById('prop-inspector').classList.add('hidden')" class="text-surface-400 hover:text-surface-600">✕</button>
                    </div>
                    <div id="prop-content" class="flex-1 overflow-auto p-3 text-[11px] font-mono"></div>
                 </div>
              </div>
            </div>
          `);

          if (map) map.remove();
          map = L.map('map', { attributionControl: false }).setView([0, 0], 2);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);

          const geojsonLayer = L.geoJSON(geojson, {
             style: { color: '#4f46e5', weight: 2, fillOpacity: 0.1 },
             onEachFeature: (feature, layer) => {
                layer.on('click', (e) => {
                   L.DomEvent.stopPropagation(e);
                   const inspector = document.getElementById('prop-inspector');
                   const content = document.getElementById('prop-content');
                   inspector.classList.remove('hidden');
                   content.innerHTML = Object.entries(feature.properties || {}).map(([k, v]) => `
                      <div class="mb-2 border-b border-surface-50 pb-1">
                         <div class="text-brand-600 font-bold mb-0.5 text-[10px]">${escapeHtml(k)}</div>
                         <div class="text-surface-600 break-all text-[10px]">${escapeHtml(String(v))}</div>
                      </div>
                   `).join('') || '<div class="italic text-surface-400">No properties</div>';
                });
             }
          }).addTo(map);

          map.fitBounds(geojsonLayer.getBounds());
          document.getElementById('btn-fit').onclick = () => map.fitBounds(geojsonLayer.getBounds());

          const tabMap = document.getElementById('tab-map');
          const tabElev = document.getElementById('tab-elev');
          const viewMap = document.getElementById('map-container');
          const viewElev = document.getElementById('elev-container');

          tabMap.onclick = () => {
             tabMap.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             if(tabElev) tabElev.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
             viewMap.classList.remove('hidden');
             viewElev.classList.add('hidden');
          };

          if (tabElev) {
             tabElev.onclick = () => {
                tabElev.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
                tabMap.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
                viewElev.classList.remove('hidden');
                viewMap.classList.add('hidden');
                renderElevChart(elevations);
             };
          }

          function renderElevChart(data) {
             new Chart(document.getElementById('elev-chart'), {
                type: 'line',
                data: {
                   labels: data.map((_, i) => i),
                   datasets: [{ label: 'Elevation (m)', data: data, borderColor: '#4f46e5', tension: 0.4, fill: true, backgroundColor: 'rgba(79, 70, 229, 0.1)', pointRadius: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { display: false }, y: { ticks: { font: { size: 10 } } } } }
             });
          }

        } catch (err) { h.showError('KML Error', 'Failed to parse map'); }
      }
    });
  };
})();

