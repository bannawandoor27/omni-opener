(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let map = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.geojson,.json',
      binary: false,
      onInit: function (h) {
        h.loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        h.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      },
      onFile: function (file, content, h) {
        if (typeof L === 'undefined') {
          h.showLoading('Loading map...');
          h.loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const data = JSON.parse(content);
          h.render(`
            <div class="p-4">
              <div class="mb-4 font-bold">${esc(file.name)}</div>
              <div id="map" class="w-full h-[60vh] rounded shadow-lg bg-surface-100"></div>
            </div>
          `);

          if (map) map.remove();
          map = L.map('map').setView([0, 0], 2);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          const geojsonLayer = L.geoJSON(data).addTo(map);
          map.fitBounds(geojsonLayer.getBounds());
        } catch (err) {
          h.showError('GeoJSON Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
