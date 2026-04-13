/**
 * OmniOpener — NetCDF (.nc) Viewer Tool
 * Uses OmniTool SDK and netcdfjs to explore NetCDF-3 files in the browser.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.nc',
      dropLabel: 'Drop a NetCDF (.nc) file here',
      infoHtml: '<strong>Privacy:</strong> This tool uses <a href="https://github.com/cheminfo/netcdfjs" target="_blank" class="text-brand-600 hover:underline">netcdfjs</a> to parse NetCDF files locally in your browser. No data is uploaded.',

      actions: [
        {
          label: '📥 Download Metadata (JSON)',
          id: 'dl-json',
          onClick: function (h) {
            const reader = h.getState().reader;
            if (reader) {
              const meta = {
                header: reader.header,
                dimensions: reader.dimensions,
                variables: reader.variables,
                attributes: reader.attributes
              };
              h.download(h.getFile().name + '.json', JSON.stringify(meta, null, 2), 'application/json');
            }
          }
        },
        {
          label: '📋 Copy Variable Names',
          id: 'copy-vars',
          onClick: function (h, btn) {
            const reader = h.getState().reader;
            if (reader) {
              const names = reader.variables.map(v => v.name).join(', ');
              h.copyToClipboard(names, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/netcdfjs@0.11.0/dist/netcdfjs.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing NetCDF file…');

        // Small delay for script load
        setTimeout(function () {
          if (typeof netcdfjs === 'undefined' && typeof NetCDFReader === 'undefined') {
            h.showError('Dependency Error', 'netcdfjs library failed to load.');
            return;
          }

          try {
            // Depending on the build, it might be netcdfjs or NetCDFReader
            const Reader = typeof netcdfjs === 'function' ? netcdfjs : NetCDFReader;
            const reader = new Reader(content);
            h.setState('reader', reader);
            renderNetCDF(reader, h);
          } catch (err) {
            h.showError('Parse Error', 'The file might be a NetCDF-4 (HDF5) file or invalid NetCDF-3. ' + err.message);
          }
        }, 200);
      }
    });
  };

  /**
   * Render NetCDF metadata and structure
   */
  function renderNetCDF(reader, h) {
    const { dimensions, variables, attributes } = reader;
    
    let html = `
      <div class="p-6">
        <h2 class="text-xl font-bold text-surface-800 mb-4 flex items-center gap-2">
          <span class="text-2xl">🌍</span> ${h.getFile().name}
        </h2>
        
        <div class="space-y-6">
          <!-- Global Attributes -->
          <section>
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-2">Global Attributes</h3>
            <div class="bg-surface-50 rounded-lg p-3 border border-surface-200">
              ${renderAttributes(attributes)}
            </div>
          </section>

          <!-- Dimensions -->
          <section>
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-2">Dimensions</h3>
            <div class="flex flex-wrap gap-2">
              ${dimensions.map(d => `
                <span class="px-3 py-1 bg-white border border-surface-200 rounded-full text-sm">
                  <span class="font-bold text-brand-600">${d.name}</span>: ${d.size}
                </span>
              `).join('')}
            </div>
          </section>

          <!-- Variables -->
          <section>
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-2">Variables</h3>
            <div class="border border-surface-200 rounded-lg overflow-hidden bg-white">
              <table class="w-full text-left text-sm border-collapse">
                <thead class="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th class="px-4 py-2 font-semibold text-surface-700">Name</th>
                    <th class="px-4 py-2 font-semibold text-surface-700">Type</th>
                    <th class="px-4 py-2 font-semibold text-surface-700">Dimensions</th>
                    <th class="px-4 py-2 font-semibold text-surface-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${variables.map((v, i) => `
                    <tr class="border-b border-surface-100 hover:bg-surface-50">
                      <td class="px-4 py-3 font-medium text-surface-800">${v.name}</td>
                      <td class="px-4 py-3 text-surface-500">${v.type}</td>
                      <td class="px-4 py-3 text-surface-500">${v.dimensions.map(di => dimensions[di].name).join(', ')}</td>
                      <td class="px-4 py-3">
                        <button class="text-brand-600 hover:underline nc-view-data" data-idx="${i}">View Data</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <!-- Data Preview Area -->
          <div id="nc-data-preview" class="hidden mt-6 space-y-3">
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider">Data Preview: <span id="nc-preview-name" class="text-brand-600"></span></h3>
            <div class="bg-surface-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-64 shadow-inner" id="nc-preview-content"></div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    // Bind data view events
    h.getRenderEl().querySelectorAll('.nc-view-data').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        const variable = variables[idx];
        const previewEl = document.getElementById('nc-data-preview');
        const nameEl = document.getElementById('nc-preview-name');
        const contentEl = document.getElementById('nc-preview-content');

        try {
          const data = reader.getDataVariable(variable.name);
          nameEl.textContent = variable.name;
          previewEl.classList.remove('hidden');
          
          // Format data preview (first 100 elements)
          const slice = data.length > 100 ? Array.from(data.slice(0, 100)).join(', ') + ' ...' : Array.from(data).join(', ');
          contentEl.textContent = `[${slice}]`;
          
          previewEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch (err) {
          alert('Error reading variable data: ' + err.message);
        }
      });
    });
  }

  function renderAttributes(attrs) {
    if (!attrs || attrs.length === 0) return '<p class="text-sm text-surface-400 italic">No attributes</p>';

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        ${attrs.map(a => `
          <div class="flex text-sm py-1 border-b border-surface-100 last:border-0 md:last:border-b">
            <span class="font-medium text-surface-600 w-1/3 truncate" title="${a.name}">${a.name}</span>
            <span class="text-surface-500 w-2/3 truncate" title="${a.value}">${a.value}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

})();
