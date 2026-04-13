(function () {
  'use strict';

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B'; }

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
      dropLabel: 'Drop a NetCDF file here (.nc, .cdf, .netcdf)',
      actions: [
        {
          label: '📥 Download', id: 'dl', onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing NetCDF file...');

        const bytes = new Uint8Array(content);
        const view = new DataView(content);

        // SHA-256
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        // NetCDF-3 magic: bytes 0-2 = "CDF" (0x43 0x44 0x46), byte 3 = version (1 or 2)
        const magic3 = bytes.length >= 3
          ? String.fromCharCode(bytes[0], bytes[1], bytes[2])
          : '';
        const versionByte = bytes.length >= 4 ? bytes[3] : null;

        let magicValid = magic3 === 'CDF';
        let versionStr = 'N/A';
        let versionDesc = '';
        let isNetCDF4 = false;

        // Also check for NetCDF-4 (which is HDF5-based)
        const HDF5_MAGIC = [0x89, 0x48, 0x44, 0x46, 0x0D, 0x0A, 0x1A, 0x0A];
        let hdf5Match = bytes.length >= 8;
        if (hdf5Match) {
          for (let i = 0; i < 8; i++) {
            if (bytes[i] !== HDF5_MAGIC[i]) { hdf5Match = false; break; }
          }
        }

        if (magicValid) {
          if (versionByte === 1) { versionStr = '1'; versionDesc = 'Classic (NetCDF-3, 32-bit offsets)'; }
          else if (versionByte === 2) { versionStr = '2'; versionDesc = '64-bit offset (NetCDF-3 extended)'; }
          else if (versionByte === 5) { versionStr = '5'; versionDesc = '64-bit data (CDF-5)'; }
          else { versionStr = String(versionByte); versionDesc = 'Unknown CDF version'; }
        } else if (hdf5Match) {
          magicValid = true;
          isNetCDF4 = true;
          versionStr = '4';
          versionDesc = 'NetCDF-4 (HDF5-based)';
        }

        const magicHex = bytes.length >= 4
          ? Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
          : 'N/A';
        const first16Hex = bytes.length >= 16
          ? Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
          : Array.from(bytes.slice(0, bytes.length)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

        // Number of records: bytes 4-7, big-endian uint32 (NetCDF-3)
        let numRecords = 'N/A';
        let numRecordsNote = '';
        if (!isNetCDF4 && magicValid && bytes.length >= 8) {
          const rec = view.getUint32(4, false); // big-endian
          if (rec === 0xFFFFFFFF) {
            numRecords = '2³²-1 (streaming / unlimited)';
          } else {
            numRecords = rec.toLocaleString();
          }
        } else if (isNetCDF4) {
          numRecords = 'N/A (HDF5-based, use h5py/netCDF4 library)';
        }

        // Parse dimension list (NetCDF-3 only, basic)
        let dimInfo = '';
        if (!isNetCDF4 && magicValid && bytes.length > 12) {
          try {
            const dimTag = view.getUint32(8, false);
            const numDims = view.getUint32(12, false);
            if ((dimTag === 0x0000000A || dimTag === 0x00000000) && numDims < 1000 && bytes.length > 16) {
              dimInfo = `<tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Dimensions count</td><td>${numDims.toLocaleString()}</td></tr>`;
              // Try to read first dimension name
              if (numDims > 0 && bytes.length > 20) {
                const nameLen = view.getUint32(16, false);
                if (nameLen > 0 && nameLen < 256 && bytes.length > 20 + nameLen) {
                  const nameBytes = bytes.slice(20, 20 + nameLen);
                  const dimName = new TextDecoder('ascii').decode(nameBytes);
                  const dimSize = bytes.length > 20 + nameLen + 4
                    ? view.getUint32(20 + Math.ceil(nameLen / 4) * 4, false)
                    : '?';
                  dimInfo += `<tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">First dimension</td><td style="font-family:monospace;">${esc(dimName)} (size: ${esc(String(dimSize))})</td></tr>`;
                }
              }
            }
          } catch (e) { /* ignore parse errors */ }
        }

        const hexDump = generateHexDump(bytes, 1024);

        const validBadge = magicValid
          ? '<span style="color:#22c55e;font-weight:bold;">✔ Valid ' + (isNetCDF4 ? 'NetCDF-4' : 'NetCDF-3 (CDF)') + ' Signature</span>'
          : '<span style="color:#ef4444;font-weight:bold;">✘ Invalid NetCDF Signature</span>';

        h.render(`
          <div style="font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;">
            <h2 style="margin:0 0 4px;font-size:1.3rem;">NetCDF File Analysis</h2>
            <p style="margin:0 0 16px;color:#888;font-size:.9rem;">${esc(file.name)} &mdash; ${fmtBytes(file.size)}</p>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">Signature Validation</div>
              <div style="margin-bottom:6px;">${validBadge}</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Expected (NetCDF-3)</td><td style="font-family:monospace;">43 44 46 01/02 &nbsp; "CDF\x01" or "CDF\x02"</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File bytes 0–3</td><td style="font-family:monospace;">${esc(magicHex)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Bytes 0–15</td><td style="font-family:monospace;word-break:break-all;">${esc(first16Hex)}</td></tr>
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">NetCDF Header</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Format</td><td>${esc(versionDesc)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Version byte</td><td style="font-family:monospace;">${esc(versionStr)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Number of records</td><td>${esc(String(numRecords))}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File size</td><td>${fmtBytes(file.size)} (${file.size.toLocaleString()} bytes)</td></tr>
                ${dimInfo}
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">SHA-256 Hash</div>
              <div style="font-family:monospace;font-size:.8rem;word-break:break-all;color:#86efac;">${esc(hashHex)}</div>
            </div>

            <div style="background:#f0fdf4;border:1px solid #22c55e;border-radius:8px;padding:14px;margin-bottom:16px;color:#14532d;">
              <strong>Opening NetCDF Files:</strong> Use <strong>Panoply</strong> (NASA, free GUI), <strong>ncview</strong> (Linux/Mac quick viewer), or <strong>Python xarray</strong> (<code>import xarray as xr; ds = xr.open_dataset('file.nc')</code>). NetCDF is widely used for climate, oceanographic, and atmospheric science data.
            </div>

            <div style="background:#0f172a;border-radius:8px;padding:16px;margin-bottom:8px;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">Hex Dump (first 1 KB)</div>
              <pre style="font-family:'Courier New',monospace;font-size:.72rem;color:#94a3b8;margin:0;overflow-x:auto;white-space:pre;line-height:1.5;">${esc(hexDump)}</pre>
            </div>
          </div>
        `);
      }
    });
  };
})();
