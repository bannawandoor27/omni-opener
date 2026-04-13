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
      accept: '.djvu,.djv',
      dropLabel: 'Drop a DjVu file here (.djvu, .djv)',
      actions: [
        {
          label: '📥 Download', id: 'dl', onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing DjVu file...');

        const bytes = new Uint8Array(content);
        const view = new DataView(content);

        // SHA-256
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        // DjVu IFF magic: bytes 0-3 = "AT&T" (0x41 0x54 0x26 0x54), bytes 4-7 = "FORM"
        const ATT_MAGIC = [0x41, 0x54, 0x26, 0x54]; // "AT&T"
        const FORM_MAGIC = [0x46, 0x4F, 0x52, 0x4D]; // "FORM"

        let attValid = bytes.length >= 4;
        if (attValid) {
          for (let i = 0; i < 4; i++) {
            if (bytes[i] !== ATT_MAGIC[i]) { attValid = false; break; }
          }
        }

        let formValid = bytes.length >= 8;
        if (formValid) {
          for (let i = 0; i < 4; i++) {
            if (bytes[4 + i] !== FORM_MAGIC[i]) { formValid = false; break; }
          }
        }

        const magicValid = attValid && formValid;

        const first8Hex = bytes.length >= 8
          ? Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
          : Array.from(bytes.slice(0, bytes.length)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const first16Hex = bytes.length >= 16
          ? Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
          : Array.from(bytes.slice(0, bytes.length)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

        // IFF chunk size at bytes 8-11 (big-endian, size of FORM chunk data)
        let chunkSize = 'N/A';
        let chunkSizeNote = '';
        if (bytes.length >= 12) {
          const rawSize = view.getUint32(8, false); // big-endian
          chunkSize = rawSize.toLocaleString() + ' bytes';
          const totalExpected = rawSize + 8; // 8 for AT&T + FORM header
          chunkSizeNote = `Total expected: ${fmtBytes(totalExpected + 4)}`;
        }

        // Form type at offset 12: 4 chars — DJVM, DJVU, DJVI, THUM
        let formType = 'N/A';
        let formTypeDesc = '';
        if (bytes.length >= 16) {
          formType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
          if (formType === 'DJVM') formTypeDesc = 'Multi-page DjVu document';
          else if (formType === 'DJVU') formTypeDesc = 'Single-page DjVu document';
          else if (formType === 'DJVI') formTypeDesc = 'DjVu shared include file';
          else if (formType === 'THUM') formTypeDesc = 'DjVu thumbnail data';
          else formTypeDesc = 'Unknown form type';
        }

        // Try to read DIRM chunk (directory for multi-page) at offset 16 if DJVM
        let dirmInfo = '';
        if (formType === 'DJVM' && bytes.length >= 24) {
          const chunkId = String.fromCharCode(bytes[16], bytes[17], bytes[18], bytes[19]);
          if (chunkId === 'DIRM') {
            const dirmSize = view.getUint32(20, false);
            if (bytes.length >= 25) {
              const flags = bytes[24];
              const bundled = (flags & 0x80) ? 'Bundled' : 'Indirect';
              const numPages = bytes.length >= 27
                ? view.getUint16(25, false)
                : '?';
              dirmInfo = `
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Directory type</td><td>${esc(bundled)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Number of pages</td><td>${esc(String(numPages))}</td></tr>
              `;
            }
          }
        }

        // INFO chunk for single-page DjVu (width, height, DPI)
        let infoRows = '';
        if (formType === 'DJVU' && bytes.length >= 24) {
          const chunkId = String.fromCharCode(bytes[16], bytes[17], bytes[18], bytes[19]);
          if (chunkId === 'INFO') {
            if (bytes.length >= 36) {
              const width = view.getUint16(24, false);
              const height = view.getUint16(26, false);
              const minorVer = bytes[28];
              const majorVer = bytes[29];
              const dpi = view.getUint16(30, true); // little-endian for DPI
              const gamma = bytes[32];
              infoRows = `
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Image size</td><td>${width} × ${height} pixels</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Resolution</td><td>${dpi} DPI</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Version</td><td>${majorVer}.${minorVer}</td></tr>
              `;
            }
          }
        }

        const hexDump = generateHexDump(bytes, 1024);

        const validBadge = magicValid
          ? '<span style="color:#22c55e;font-weight:bold;">✔ Valid DjVu Signature (AT&amp;T + FORM)</span>'
          : '<span style="color:#ef4444;font-weight:bold;">✘ Invalid DjVu Signature</span>';
        const attBadge = attValid
          ? '<span style="color:#22c55e;">✔</span> "AT&amp;T" found at offset 0'
          : '<span style="color:#ef4444;">✘</span> "AT&amp;T" not found at offset 0';
        const formBadge = formValid
          ? '<span style="color:#22c55e;">✔</span> "FORM" found at offset 4'
          : '<span style="color:#ef4444;">✘</span> "FORM" not found at offset 4';

        h.render(`
          <div style="font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;">
            <h2 style="margin:0 0 4px;font-size:1.3rem;">DjVu File Analysis</h2>
            <p style="margin:0 0 16px;color:#888;font-size:.9rem;">${esc(file.name)} &mdash; ${fmtBytes(file.size)}</p>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">Signature Validation</div>
              <div style="margin-bottom:8px;">${validBadge}</div>
              <div style="font-size:.82rem;margin-bottom:4px;">${attBadge}</div>
              <div style="font-size:.82rem;margin-bottom:8px;">${formBadge}</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Expected bytes 0–7</td><td style="font-family:monospace;">41 54 26 54 46 4F 52 4D &nbsp; "AT&amp;TFORM"</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File bytes 0–7</td><td style="font-family:monospace;">${esc(first8Hex)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Bytes 0–15</td><td style="font-family:monospace;word-break:break-all;">${esc(first16Hex)}</td></tr>
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">DjVu Structure</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Form type</td><td style="font-family:monospace;">${esc(formType)} &mdash; ${esc(formTypeDesc)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">FORM chunk size</td><td>${esc(chunkSize)}${chunkSizeNote ? ' &nbsp; (' + esc(chunkSizeNote) + ')' : ''}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File size</td><td>${fmtBytes(file.size)} (${file.size.toLocaleString()} bytes)</td></tr>
                ${dirmInfo}
                ${infoRows}
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">SHA-256 Hash</div>
              <div style="font-family:monospace;font-size:.8rem;word-break:break-all;color:#86efac;">${esc(hashHex)}</div>
            </div>

            <div style="background:#fdf4ff;border:1px solid #a855f7;border-radius:8px;padding:14px;margin-bottom:16px;color:#581c87;">
              <strong>Opening DjVu Files:</strong> Use <strong>DjVuLibre</strong> (free, cross-platform), <strong>WinDjView</strong> (Windows), or <strong>Okular</strong> (Linux/KDE) to view DjVu files. DjVu is a compressed document format optimized for scanned documents and books, commonly used for academic papers and historical archives.
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
