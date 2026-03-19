(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let map = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.kml',
      binary: false,
      onInit: function (h) {
        h.loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        h.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/togeojson@0.16.0/togeojson.js');
        });
      },
      onFile: function (file, content, h) {
        if (typeof L === 'undefined' || typeof toGeoJSON === 'undefined') {
          h.showLoading('Loading map...');
          setTimeout(() => this.onFile(file, content, h), 1000);
          return;
        }

        try {
          const dom = new DOMParser().parseFromString(content, 'text/xml');
          const geojson = toGeoJSON.kml(dom);
          
          h.render(`
            <div class="p-4">
              <div class="mb-4 font-bold">${esc(file.name)}</div>
              <div id="map" class="w-full h-[60vh] rounded shadow-lg bg-surface-100"></div>
            </div>
          `);

          if (map) map.remove();
          map = L.map('map').setView([0, 0], 2);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          const geojsonLayer = L.geoJSON(geojson).addTo(map);
          map.fitBounds(geojsonLayer.getBounds());
        } catch (err) {
          h.showError('KML Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
