(function () {
  'use strict';

  function formatSize(b) {
    if (b === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.shp',
      dropLabel: 'Drop a .shp file here',
      binary: true,
      onInit: function (helpers) {
        helpers.loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        helpers.loadScripts([
          'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
          'https://cdn.jsdelivr.net/npm/shpjs@6.1.0/dist/shp.js'
        ]);
      },
      onFile: function _onFile(file, content, helpers) {
        if (typeof L === 'undefined' || typeof shp === 'undefined') {
          helpers.showLoading('Loading mapping engine...');
          setTimeout(function () { _onFile(file, content, helpers); }, 300);
          return;
        }

        if (file.size > 20 * 1024 * 1024) {
          const proceed = confirm('This file is over 20MB and may be slow to render. Do you want to continue?');
          if (!proceed) {
            helpers.hideLoading();
            return;
          }
        }

        helpers.showLoading('Parsing shapefile geometries...');

        try {
          // shp.parseShp(buffer) parses raw .shp binary data and returns an array of GeoJSON geometries
          const geometries = shp.parseShp(content);
          
          if (!geometries || !Array.isArray(geometries) || geometries.length === 0) {
            throw new Error('No valid geometries found in this shapefile.');
          }

          const geojson = {
            type: 'FeatureCollection',
            features: geometries.map(function (geom) {
              return {
                type: 'Feature',
                geometry: geom,
                properties: {} // Individual .shp files do not contain attribute data (.dbf)
              };
            })
          };

          helpers.setState('geojson', geojson);
          renderApp(geojson, file, helpers);
        } catch (e) {
          helpers.showError('Could not parse SHP file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy GeoJSON',
          id: 'copy-json',
          onClick: function (helpers, btn) {
            const geojson = helpers.getState().geojson;
            if (geojson) {
              helpers.copyToClipboard(JSON.stringify(geojson, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download GeoJSON',
          id: 'dl-json',
          onClick: function (helpers) {
            const geojson = helpers.getState().geojson;
            if (geojson) {
              const name = helpers.getFile().name.replace(/\.shp$/i, '') + '.geojson';
              helpers.download(name, JSON.stringify(geojson, null, 2), 'application/json');
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your SHP files never leave your device. Note: Metadata (.dbf) and projection (.prj) files are not processed when opening a single .shp file.'
    });
  };

  function renderApp(geojson, file, helpers) {
    const featureCount = geojson.features.length;
    const firstGeom = geojson.features[0].geometry;
    const geomType = firstGeom.type;

    const html = `
      <div class="p-6">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
          <span class="font-medium text-surface-900">${file.name}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${featureCount.toLocaleString()} features</span>
        </div>
        
        <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden mb-6">
          <div id="shp-map" style="height: 550px; width: 100%; background: #f8fafc;" class="z-0"></div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm transition-all hover:shadow-md">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-wider">Geometry Type</p>
            <p class="text-lg font-bold text-brand-600">${geomType}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm transition-all hover:shadow-md">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-wider">Feature Count</p>
            <p class="text-lg font-bold text-brand-600">${featureCount.toLocaleString()}</p>
          </div>
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm transition-all hover:shadow-md">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-wider">Projection</p>
            <p class="text-lg font-bold text-brand-600">WGS 84 (Auto)</p>
          </div>
        </div>
        
        <div class="mt-6 p-4 bg-surface-50 rounded-xl border border-surface-200 text-xs text-surface-500 leading-relaxed">
          <div class="flex items-start gap-2">
            <span class="text-lg">ℹ️</span>
            <div>
              <strong>Technical Note:</strong> Shapefiles (.shp) store geographic geometries but often omit coordinate system details (found in .prj) and attributes (found in .dbf). This viewer assumes the standard <strong>WGS 84 (EPSG:4326)</strong> projection used by most GIS software.
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Initialize Leaflet after render
    setTimeout(function () {
      const mapEl = document.getElementById('shp-map');
      if (!mapEl) return;

      const map = L.map(mapEl, {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([0, 0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      const geoLayer = L.geoJSON(geojson, {
        style: {
          color: '#4f46e5',
          weight: 2,
          opacity: 0.8,
          fillColor: '#818cf8',
          fillOpacity: 0.2
        },
        pointToLayer: function (feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: "#4f46e5",
            color: "#fff",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          });
        }
      }).addTo(map);

      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
        }
      } catch (err) {
        console.error('Map bounds error:', err);
      }
    }, 100);
  }
})();
