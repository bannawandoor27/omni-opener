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
      accept: '.h5,.hdf5,.hdf,.he5,.he4,.hdf4',
      dropLabel: 'Drop an HDF5 file here (.h5, .hdf5, .hdf)',
      actions: [
        {
          label: '📥 Download', id: 'dl', onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing HDF5 file...');

        const bytes = new Uint8Array(content);
        const view = new DataView(content);

        // SHA-256
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        // HDF5 magic bytes: 89 48 44 46 0d 0a 1a 0a
        const HDF5_MAGIC = [0x89, 0x48, 0x44, 0x46, 0x0D, 0x0A, 0x1A, 0x0A];
        let magicValid = bytes.length >= 8;
        if (magicValid) {
          for (let i = 0; i < 8; i++) {
            if (bytes[i] !== HDF5_MAGIC[i]) { magicValid = false; break; }
          }
        }

        const magicHex = bytes.length >= 8
          ? Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
          : 'N/A';
        const magicExpected = '89 48 44 46 0D 0A 1A 0A';

        // Superblock version (byte 8)
        let superblockVersion = 'N/A';
        let superblockDesc = '';
        if (bytes.length > 8) {
          const v = bytes[8];
          superblockVersion = String(v);
          if (v === 0) superblockDesc = 'Version 0 (HDF5 ≤ 1.6)';
          else if (v === 1) superblockDesc = 'Version 1 (HDF5 1.6)';
          else if (v === 2) superblockDesc = 'Version 2 (HDF5 1.8+)';
          else if (v === 3) superblockDesc = 'Version 3 (HDF5 1.10+)';
          else superblockDesc = 'Unknown version';
        }

        // Full magic bytes row (first 16 bytes)
        const first16 = bytes.length >= 16
          ? Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
          : Array.from(bytes.slice(0, bytes.length)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

        // Hex dump first 4KB
        const hexDump = generateHexDump(bytes, 4096);

        const validBadge = magicValid
          ? '<span style="color:#22c55e;font-weight:bold;">✔ Valid HDF5 Signature</span>'
          : '<span style="color:#ef4444;font-weight:bold;">✘ Invalid HDF5 Signature</span>';

        h.render(`
          <div style="font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;">
            <h2 style="margin:0 0 4px;font-size:1.3rem;">HDF5 File Analysis</h2>
            <p style="margin:0 0 16px;color:#888;font-size:.9rem;">${esc(file.name)} &mdash; ${fmtBytes(file.size)}</p>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">Signature Validation</div>
              <div style="margin-bottom:6px;">${validBadge}</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Expected magic</td><td style="font-family:monospace;">${magicExpected}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File bytes 0–7</td><td style="font-family:monospace;">${esc(magicHex)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Bytes 0–15</td><td style="font-family:monospace;word-break:break-all;">${esc(first16)}</td></tr>
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">HDF5 Header</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Superblock Version</td><td style="font-family:monospace;">${esc(superblockVersion)} &mdash; ${esc(superblockDesc)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File Size</td><td>${fmtBytes(file.size)} (${file.size.toLocaleString()} bytes)</td></tr>
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">SHA-256 Hash</div>
              <div style="font-family:monospace;font-size:.8rem;word-break:break-all;color:#86efac;">${esc(hashHex)}</div>
            </div>

            <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:14px;margin-bottom:16px;color:#92400e;">
              <strong>Opening HDF5 Files:</strong> Use <strong>HDF5 Viewer</strong> (HDFView), <strong>Python h5py</strong> (<code>import h5py; f = h5py.File('file.h5','r')</code>), or <strong>MATLAB</strong> (<code>h5info</code> / <code>h5read</code>) to open HDF5 files. HDF5 is a hierarchical data format used in scientific computing.
            </div>

            <div style="background:#0f172a;border-radius:8px;padding:16px;margin-bottom:8px;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">Hex Dump (first 4 KB)</div>
              <pre style="font-family:'Courier New',monospace;font-size:.72rem;color:#94a3b8;margin:0;overflow-x:auto;white-space:pre;line-height:1.5;">${esc(hexDump)}</pre>
            </div>
          </div>
        `);
      }
    });
  };
})();
