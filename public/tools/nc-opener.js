(function () {
  'use strict';

  function esc(s) {
    if (!s) return '';
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
      lines.push(offset + '  ' + hexPadded + '  |' + ascii + '|');
    }
    return lines.join('\n');
  }

  window.initTool = function (toolConfig, mountEl) {
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
            const data = h.getState().metadata;
            if (data) h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/netcdfjs@3.0.0/dist/netcdfjs.min.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing NetCDF file...');

        // Wait for dependency
        await h.loadScript('https://cdn.jsdelivr.net/npm/netcdfjs@3.0.0/dist/netcdfjs.min.js');

        const bytes = new Uint8Array(content);
        
        // HDF5 Magic: 89 48 44 46 0D 0A 1A 0A
        const isHDF5 = bytes.length >= 8 &&
          bytes[0] === 0x89 && bytes[1] === 0x48 && bytes[2] === 0x44 && bytes[3] === 0x46 &&
          bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;

        // SHA-256 Hash
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        let metadata = {
          filename: file.name,
          size: file.size,
          sha256: hashHex,
          format: isHDF5 ? 'NetCDF-4 (HDF5)' : 'NetCDF-3 (Classic)',
          dimensions: [],
          variables: [],
          attributes: []
        };

        let renderHtml = '';

        if (!isHDF5 && typeof netcdfjs !== 'undefined') {
          try {
            const reader = new netcdfjs.NetCDFReader(content);
            metadata.dimensions = reader.dimensions;
            metadata.variables = reader.variables;
            metadata.attributes = reader.globalAttributes;
            h.setState({ metadata });

            renderHtml = renderNetCDFView(metadata, h);
          } catch (err) {
            console.error('NetCDF Parse Error:', err);
            renderHtml = renderFallbackView(file, bytes, 'NetCDF-3 (Parsing Error: ' + err.message + ')', h, hashHex);
          }
        } else if (isHDF5) {
          h.setState({ metadata });
          renderHtml = renderFallbackView(file, bytes, 'NetCDF-4 (HDF5-based)', h, hashHex);
        } else {
          renderHtml = renderFallbackView(file, bytes, 'Unknown/Unsupported NetCDF Variant', h, hashHex);
        }

        h.render(renderHtml);
      }
    });
  };

  function renderNetCDFView(data, h) {
    return `
      <div class="p-6 space-y-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-surface-900">${esc(data.filename)}</h2>
            <p class="text-sm text-surface-500">${fmtBytes(data.size)} — ${esc(data.format)}</p>
          </div>
          <div class="text-[10px] font-mono text-surface-400 bg-surface-50 p-2 rounded border">
            SHA256: ${data.sha256}
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-surface-400">Dimensions</h3>
            <div class="border rounded-xl overflow-hidden bg-white">
              <table class="w-full text-sm border-collapse">
                <thead class="bg-surface-50 border-b">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-surface-600">Name</th>
                    <th class="px-4 py-2 text-right text-xs font-semibold text-surface-600">Size</th>
                  </tr>
                </thead>
                <tbody class="divide-y text-surface-700">
                  ${data.dimensions.map(d => `
                    <tr class="hover:bg-surface-50">
                      <td class="px-4 py-2 font-mono text-xs">${esc(d.name)}</td>
                      <td class="px-4 py-2 text-right">${d.size}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="2" class="px-4 py-8 text-center text-surface-400">No dimensions defined</td></tr>'}
                </tbody>
              </table>
            </div>
          </section>

          <section class="space-y-3">
            <h3 class="text-xs font-bold uppercase tracking-widest text-surface-400">Global Attributes</h3>
            <div class="border rounded-xl p-4 space-y-3 max-h-64 overflow-auto bg-white">
              ${data.attributes.length > 0 ? data.attributes.map(a => `
                <div class="text-xs flex flex-col gap-0.5">
                  <span class="font-bold text-surface-700 underline decoration-surface-200 decoration-2">${esc(a.name)}</span>
                  <span class="text-surface-600 whitespace-pre-wrap">${esc(a.value)}</span>
                </div>
              `).join('') : '<p class="text-xs text-surface-400 italic">No global attributes found</p>'}
            </div>
          </section>
        </div>

        <section class="space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-widest text-surface-400">Variables</h3>
          <div class="border rounded-xl overflow-hidden bg-white shadow-sm">
            <div class="overflow-x-auto">
              <table class="w-full text-sm border-collapse">
                <thead class="bg-surface-50 border-b">
                  <tr>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-surface-600">Variable Name</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-surface-600">Type</th>
                    <th class="px-4 py-2 text-left text-xs font-semibold text-surface-600">Dimensions</th>
                    <th class="px-4 py-2 text-right text-xs font-semibold text-surface-600">Attrs</th>
                  </tr>
                </thead>
                <tbody class="divide-y text-surface-700">
                  ${data.variables.map(v => `
                    <tr class="hover:bg-surface-50">
                      <td class="px-4 py-2 font-bold text-brand-700">${esc(v.name)}</td>
                      <td class="px-4 py-2 text-xs text-surface-500 font-mono">${esc(v.type)}</td>
                      <td class="px-4 py-2 text-xs text-surface-500">
                        ${v.dimensions.map(di => `<span class="bg-surface-100 px-1.5 py-0.5 rounded text-surface-700 mr-1">${esc(data.dimensions[di].name)}</span>`).join('') || '<span class="text-surface-300">scalar</span>'}
                      </td>
                      <td class="px-4 py-2 text-right text-surface-400 text-xs">${v.attributes.length}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-widest text-surface-400">Binary Preview (First 512 bytes)</h3>
          <pre class="bg-surface-900 text-surface-300 p-4 rounded-xl text-[10px] leading-relaxed overflow-x-auto shadow-inner">${esc(generateHexDump(new Uint8Array(h.getContent()), 512))}</pre>
        </section>
      </div>
    `;
  }

  function renderFallbackView(file, bytes, formatInfo, h, hash) {
    return `
      <div class="p-6 space-y-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-surface-900">${esc(file.name)}</h2>
            <p class="text-sm text-surface-500">${fmtBytes(file.size)} — ${esc(formatInfo)}</p>
          </div>
          <div class="text-[10px] font-mono text-surface-400 bg-surface-50 p-2 rounded border">
            SHA256: ${hash}
          </div>
        </div>

        <div class="bg-blue-50 border border-blue-100 rounded-xl p-5 text-blue-800 text-sm flex gap-4 items-start">
          <span class="text-xl">ℹ️</span>
          <div>
            ${formatInfo.includes('HDF5') ?
              `<strong>NetCDF-4 (HDF5) Detected:</strong> This file format uses HDF5 for storage. While detailed browser-side parsing for complex HDF5 structures is limited, you can inspect the raw binary header below or download the file for use with tools like <code>ncdump</code> or Python's <code>xarray</code>.` :
              `<strong>Unsupported NetCDF Variant:</strong> This file version or variant is not directly parsable by the current browser library. Showing the binary signature and header preview for inspection.`
            }
          </div>
        </div>

        <section class="space-y-3">
          <h3 class="text-xs font-bold uppercase tracking-widest text-surface-400">Header Signature & Hex Dump</h3>
          <div class="bg-surface-50 p-4 rounded-xl border border-surface-200 mb-4">
            <table class="text-xs w-full">
              <tr>
                <td class="py-1 text-surface-400 w-32 uppercase font-semibold">Magic Bytes</td>
                <td class="font-mono text-brand-700 font-bold">${Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</td>
              </tr>
              <tr>
                <td class="py-1 text-surface-400 uppercase font-semibold">ASCII Trace</td>
                <td class="font-mono text-surface-600">${esc(String.fromCharCode(...bytes.slice(0, 16)).replace(/[^\x20-\x7E]/g, '.'))}</td>
              </tr>
            </table>
          </div>
          <pre class="bg-surface-900 text-surface-300 p-4 rounded-xl text-[10px] leading-relaxed overflow-x-auto shadow-inner">${esc(generateHexDump(bytes, 1024))}</pre>
        </section>
      </div>
    `;
  }

})();
