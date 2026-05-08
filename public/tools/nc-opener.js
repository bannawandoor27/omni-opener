(function () {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtBytes(b) {
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function generateHexDump(bytes, maxBytes) {
    const limit = Math.min(bytes.length, maxBytes);
    const lines = [];
    for (let i = 0; i < limit; i += 16) {
      const offset = i.toString(16).padStart(8, '0').toUpperCase();
      const chunk = bytes.slice(i, Math.min(i + 16, limit));
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const ascii = Array.from(chunk).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
      const hexPadded = hex.padEnd(16 * 3 - 1, ' ');
      lines.push(`${offset}  ${hexPadded}  |${ascii}|`);
    }
    return lines.join('\n');
  }

  window.initTool = function (toolConfig, mountEl) {
    let currentMetadata = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.nc,.cdf,.netcdf,.nc3,.nc4',
      dropLabel: 'Drop a NetCDF file here',
      dropSub: 'Support for NetCDF-3 (Classic) and NetCDF-4 (HDF5)',
      infoHtml: '<strong>NetCDF Tool:</strong> Inspect metadata, dimensions, and variables of NetCDF files. Everything is processed locally in your browser.',

      actions: [
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        },
        {
          label: '📋 Copy Metadata JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            if (currentMetadata) {
              h.copyToClipboard(JSON.stringify(currentMetadata, null, 2), btn);
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/netcdfjs@3.0.0/dist/netcdfjs.min.js');
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing NetCDF structure...');

        try {
          if (typeof netcdfjs === 'undefined') {
            await h.loadScript('https://cdn.jsdelivr.net/npm/netcdfjs@3.0.0/dist/netcdfjs.min.js');
          }

          const bytes = new Uint8Array(content);
          
          // Detect HDF5 (NetCDF-4) magic bytes: \x89HDF\r\n\x1a\n
          const isHDF5 = bytes.length >= 8 &&
            bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46 &&
            bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;

          const isClassic = bytes.length >= 3 &&
            bytes[0] === 0x43 && bytes[1] === 0x44 && bytes[2] === 0x46; // 'CDF'

          const hashBuf = await crypto.subtle.digest('SHA-256', content);
          const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

          let metadata = {
            filename: file.name,
            size: file.size,
            sha256: hashHex,
            format: isHDF5 ? 'NetCDF-4 (HDF5)' : (isClassic ? 'NetCDF-3 (Classic)' : 'Unknown NetCDF Variant'),
            dimensions: [],
            variables: [],
            globalAttributes: []
          };

          let error = null;
          if (isClassic && typeof netcdfjs !== 'undefined') {
            try {
              const reader = new netcdfjs.NetCDFReader(content);
              metadata.dimensions = reader.dimensions || [];
              metadata.variables = reader.variables || [];
              metadata.globalAttributes = reader.globalAttributes || [];
            } catch (err) {
              console.error('NetCDF Parse Error:', err);
              error = `Failed to parse classic NetCDF: ${err.message}`;
            }
          }

          currentMetadata = metadata;
          renderView(metadata, error, h);

        } catch (fatal) {
          h.showError('Could not process file', fatal.message);
        }
      },

      onDestroy: function() {
        currentMetadata = null;
      }
    });

    function renderView(data, error, h) {
      const file = h.getFile();
      
      let html = `
        <div class="p-4 max-w-6xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${fmtBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500 font-medium">${esc(data.format)}</span>
          </div>
      `;

      if (error) {
        html += `
          <div class="bg-red-50 border border-red-100 rounded-xl p-6 mb-6">
            <div class="flex items-center gap-3 text-red-800 font-bold mb-2">
              <span class="text-xl">⚠️</span>
              <span>Parsing Error</span>
            </div>
            <p class="text-red-700 text-sm">${esc(error)}</p>
            <p class="text-red-600 text-xs mt-4 italic">Note: Only NetCDF-3 (Classic) files are fully parsable in-browser. NetCDF-4/HDF5 files show limited metadata.</p>
          </div>
        `;
      }

      if (data.format.includes('HDF5')) {
        html += `
          <div class="bg-brand-50 border border-brand-100 rounded-xl p-6 mb-6">
            <div class="flex items-center gap-3 text-brand-800 font-bold mb-2">
              <span class="text-xl">ℹ️</span>
              <span>NetCDF-4 (HDF5) Detected</span>
            </div>
            <p class="text-brand-700 text-sm leading-relaxed">
              This file uses the HDF5 storage layer. Browser-based NetCDF libraries currently prioritize NetCDF-3. 
              You can still inspect the header signature and hex dump below, or use the <strong>Download</strong> action to use it with desktop tools.
            </p>
          </div>
        `;
      }

      // Metadata Stats
      html += `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
            <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Dimensions</div>
            <div class="text-2xl font-bold text-surface-800">${data.dimensions.length}</div>
          </div>
          <div class="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
            <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Variables</div>
            <div class="text-2xl font-bold text-surface-800">${data.variables.length}</div>
          </div>
          <div class="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">
            <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Global Attrs</div>
            <div class="text-2xl font-bold text-surface-800">${data.globalAttributes.length}</div>
          </div>
        </div>
      `;

      // Main Content
      html += `<div class="space-y-8">`;

      // Dimensions Table
      if (data.dimensions.length > 0) {
        html += `
          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-surface-800 text-lg">Dimensions</h3>
              <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full border border-surface-200">${data.dimensions.length} items</span>
            </div>
            <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700">Size</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${data.dimensions.map(d => `
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-4 py-3 font-mono text-xs text-brand-700 font-bold">${esc(d.name)}</td>
                      <td class="px-4 py-3 text-right text-surface-600 font-mono">${d.size}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }

      // Variables Section with Search
      if (data.variables.length > 0) {
        html += `
          <section>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div class="flex items-center gap-2">
                <h3 class="font-bold text-surface-800 text-lg">Variables</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">${data.variables.length} items</span>
              </div>
              <div class="relative">
                <input type="text" id="var-search" placeholder="Search variables..." 
                  class="text-xs border border-surface-300 rounded-lg px-3 py-2 w-full sm:w-64 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
              </div>
            </div>
            <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
              <table class="min-w-full text-sm" id="vars-table">
                <thead>
                  <tr class="bg-surface-50 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Dimensions</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700">Attributes</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${data.variables.map(v => {
                    const dims = v.dimensions.map(di => {
                      const d = data.dimensions[di];
                      return d ? `<span class="inline-block bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded text-[10px] mr-1 mb-1 border border-surface-200">${esc(d.name)}</span>` : '';
                    }).join('');
                    
                    return `
                      <tr class="var-row hover:bg-brand-50/30 transition-colors">
                        <td class="px-4 py-3 font-bold text-surface-800">${esc(v.name)}</td>
                        <td class="px-4 py-3 text-xs font-mono text-surface-500">${esc(v.type)}</td>
                        <td class="px-4 py-3">${dims || '<span class="text-surface-300 italic text-xs">scalar</span>'}</td>
                        <td class="px-4 py-3 text-right">
                          <span class="text-xs font-medium text-surface-400 bg-surface-50 px-2 py-0.5 rounded-full border border-surface-100">
                            ${v.attributes.length}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </section>
        `;
      }

      // Global Attributes
      if (data.globalAttributes.length > 0) {
        html += `
          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-surface-800 text-lg">Global Attributes</h3>
              <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full border border-surface-200">${data.globalAttributes.length} items</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${data.globalAttributes.map(attr => `
                <div class="bg-white border border-surface-200 rounded-xl p-4 hover:border-brand-300 transition-all shadow-sm">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter mb-1">${esc(attr.name)}</div>
                  <div class="text-sm text-surface-700 whitespace-pre-wrap leading-relaxed">${esc(attr.value)}</div>
                </div>
              `).join('')}
            </div>
          </section>
        `;
      }

      // Binary Preview
      html += `
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-surface-800 text-lg">Binary Preview</h3>
            <span class="text-xs text-surface-400">First 512 bytes</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-4 text-[10px] font-mono bg-surface-900 text-brand-100 overflow-x-auto leading-normal">${esc(generateHexDump(new Uint8Array(h.getContent()), 512))}</pre>
          </div>
        </section>
      `;

      html += `</div></div>`; // End main space-y-8 and p-4 container

      h.render(html);

      // Add Search Logic
      const searchInput = document.getElementById('var-search');
      if (searchInput) {
        searchInput.addEventListener('input', function(e) {
          const q = e.target.value.toLowerCase();
          const rows = document.querySelectorAll('.var-row');
          rows.forEach(row => {
            const name = row.cells[0].textContent.toLowerCase();
            row.style.display = name.includes(q) ? '' : 'none';
          });
        });
      }
    }
  };
})();
