/**
 * OmniOpener — KML Toolkit
 * Uses OmniTool SDK, Leaflet, and toGeoJSON.
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
      infoHtml: '<strong>KML Toolkit:</strong> Advanced geographic viewer with feature inspection and multiple map layers.',
      
      onInit: function (h) {
        h.loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        h.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/togeojson/0.16.0/togeojson.min.js');
        });
      },

      onFile: function _onFile(file, content, h) {
        if (typeof L === 'undefined' || typeof toGeoJSON === 'undefined') {
          h.showLoading('Loading Map engines...');
          setTimeout(() => _onFile(file, content, h), 500);
          return;
        }

        try {
          const dom = new DOMParser().parseFromString(content, 'text/xml');
          const geojson = toGeoJSON.kml(dom);
          
          if (!geojson.features || geojson.features.length === 0) {
             h.render(`<div class="p-12 text-center text-surface-400">This KML file does not contain any map features.</div>`);
             return;
          }

          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                 <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                 <div class="flex gap-2">
                    <select id="map-style" class="text-[10px] border border-surface-200 rounded px-2 py-1 outline-none">
                       <option value="light">Light Mode</option>
                       <option value="dark">Dark Mode</option>
                       <option value="osm">Standard (OSM)</option>
                    </select>
                    <button id="btn-fit" class="px-2 py-1 bg-white border border-surface-200 rounded text-[10px] font-bold">🎯 Fit</button>
                 </div>
              </div>
              <div class="flex-1 relative">
                 <div id="map" class="w-full h-full bg-surface-100"></div>
                 <div id="prop-inspector" class="absolute top-4 right-4 bottom-4 w-64 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-surface-200 flex flex-col hidden z-[1000]">
                    <div class="p-3 border-b border-surface-100 flex items-center justify-between">
                       <h3 class="font-bold text-[10px] uppercase tracking-widest text-surface-400">Properties</h3>
                       <button onclick="document.getElementById('prop-inspector').classList.add('hidden')" class="text-surface-400 hover:text-surface-600">✕</button>
                    </div>
                    <div id="prop-content" class="flex-1 overflow-auto p-3 text-[11px] font-mono"></div>
                 </div>
              </div>
            </div>
          `);

          if (map) map.remove();
          map = L.map('map', { attributionControl: false }).setView([0, 0], 2);
          
          const tiles = {
             light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
             dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
             osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          };
          let layer = L.tileLayer(tiles.light).addTo(map);

          document.getElementById('map-style').onchange = (e) => {
             map.removeLayer(layer);
             layer = L.tileLayer(tiles[e.target.value]).addTo(map);
          };

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
                         <div class="text-brand-600 font-bold mb-0.5">${escapeHtml(k)}</div>
                         <div class="text-surface-600 break-all text-[10px]">${escapeHtml(String(v))}</div>
                      </div>
                   `).join('') || '<div class="italic text-surface-400">No properties</div>';
                });
             }
          }).addTo(map);

          map.fitBounds(geojsonLayer.getBounds());
          document.getElementById('btn-fit').onclick = () => map.fitBounds(geojsonLayer.getBounds());

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">This file could not be parsed as a map. It may be invalid KML.</div>`);
        }
      }
    });
  };
})();
