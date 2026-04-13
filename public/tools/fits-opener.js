(function () {
  'use strict';

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B'; }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.fits,.fit,.fts,.fits.gz',
      dropLabel: 'Drop a FITS file here (.fits, .fit, .fts)',
      actions: [
        {
          label: '📥 Download', id: 'dl', onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing FITS file...');

        const bytes = new Uint8Array(content);

        // SHA-256
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        // FITS signature: first 8 bytes should be "SIMPLE  " (with spaces) for standard FITS
        const first8 = String.fromCharCode(...bytes.slice(0, Math.min(8, bytes.length)));
        const first4 = String.fromCharCode(...bytes.slice(0, Math.min(4, bytes.length)));

        let sigValid = false;
        let sigNote = '';
        if (first8 === 'SIMPLE  ') {
          sigValid = true;
          sigNote = 'Standard FITS primary HDU';
        } else if (first4 === 'FITS') {
          sigValid = true;
          sigNote = 'FITS variant signature';
        } else if (first8.startsWith('SIMPLE')) {
          sigValid = true;
          sigNote = 'FITS (SIMPLE keyword detected)';
        } else {
          sigNote = 'Expected "SIMPLE  " at offset 0';
        }

        const first8Hex = Array.from(bytes.slice(0, Math.min(8, bytes.length)))
          .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

        // Parse FITS primary header block (2880 bytes, 36 cards of 80 chars each)
        const BLOCK_SIZE = 2880;
        const CARD_SIZE = 80;
        const KNOWN_KEYWORDS = [
          'SIMPLE', 'BITPIX', 'NAXIS', 'NAXIS1', 'NAXIS2', 'NAXIS3',
          'TELESCOP', 'OBJECT', 'DATE-OBS', 'INSTRUME', 'OBSERVER',
          'ORIGIN', 'EXTEND', 'BSCALE', 'BZERO', 'BUNIT', 'EQUINOX',
          'EPOCH', 'CRPIX1', 'CRPIX2', 'CDELT1', 'CDELT2', 'CRVAL1',
          'CRVAL2', 'CTYPE1', 'CTYPE2', 'DATE', 'AUTHOR', 'REFERENC'
        ];

        const headerCards = [];
        const keywords = {};
        let endFound = false;

        const headerLimit = Math.min(bytes.length, BLOCK_SIZE * 4); // scan up to 4 blocks
        const decoder = new TextDecoder('ascii');

        for (let cardStart = 0; cardStart < headerLimit && !endFound; cardStart += CARD_SIZE) {
          if (cardStart + CARD_SIZE > bytes.length) break;
          const cardBytes = bytes.slice(cardStart, cardStart + CARD_SIZE);
          const card = decoder.decode(cardBytes);

          const keyword = card.substring(0, 8).trimEnd();
          if (keyword === 'END') { endFound = true; break; }
          if (keyword === '' || keyword === ' ') continue;

          const valueComment = card.substring(10); // after "KEYWORD = "
          // Strip leading/trailing spaces and comment after /
          let rawValue = card.substring(10, 80);
          // For string values (surrounded by quotes)
          let value = rawValue.trim();
          if (value.startsWith("'")) {
            const closeQ = value.indexOf("'", 1);
            value = closeQ > 0 ? value.substring(1, closeQ).trim() : value.substring(1).trim();
          } else {
            // numeric or logical — take up to /
            const slashIdx = value.indexOf('/');
            value = slashIdx >= 0 ? value.substring(0, slashIdx).trim() : value.trim();
          }

          if (KNOWN_KEYWORDS.includes(keyword) || keyword.startsWith('NAXIS')) {
            keywords[keyword] = value;
            headerCards.push({ keyword, value });
          } else if (keyword && keyword !== 'COMMENT' && keyword !== 'HISTORY') {
            headerCards.push({ keyword, value });
          }
        }

        // Build keyword table rows
        let kwRows = '';
        if (headerCards.length > 0) {
          // prioritize known keywords first
          const priority = ['SIMPLE', 'BITPIX', 'NAXIS', 'NAXIS1', 'NAXIS2', 'NAXIS3',
            'OBJECT', 'TELESCOP', 'INSTRUME', 'OBSERVER', 'ORIGIN', 'DATE-OBS', 'DATE', 'AUTHOR'];
          const shown = new Set();
          const orderedCards = [];

          for (const kw of priority) {
            const card = headerCards.find(c => c.keyword === kw);
            if (card && !shown.has(card.keyword)) { orderedCards.push(card); shown.add(card.keyword); }
          }
          for (const card of headerCards) {
            if (!shown.has(card.keyword)) { orderedCards.push(card); shown.add(card.keyword); }
          }

          for (const { keyword, value } of orderedCards.slice(0, 60)) {
            kwRows += `<tr>
              <td style="color:#7dd3fc;font-family:monospace;padding:3px 14px 3px 0;white-space:nowrap;vertical-align:top;">${esc(keyword)}</td>
              <td style="font-family:monospace;font-size:.82rem;word-break:break-all;">${esc(value)}</td>
            </tr>`;
          }
        } else {
          kwRows = '<tr><td colspan="2" style="color:#94a3b8;font-style:italic;">No parseable FITS keywords found in header block</td></tr>';
        }

        // Image dimensions if present
        let dimInfo = '';
        if (keywords['NAXIS'] && keywords['NAXIS1']) {
          const naxis = keywords['NAXIS'];
          const n1 = keywords['NAXIS1'] || '?';
          const n2 = keywords['NAXIS2'] || '';
          const n3 = keywords['NAXIS3'] || '';
          dimInfo = `<tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Dimensions</td><td>${esc(naxis)}D: ${esc(n1)}${n2 ? ' × ' + esc(n2) : ''}${n3 ? ' × ' + esc(n3) : ''} px</td></tr>`;
        }
        const bitpixDesc = { '8': '8-bit unsigned int', '16': '16-bit signed int', '32': '32-bit signed int', '-32': '32-bit float', '-64': '64-bit double' };
        let bitpixInfo = '';
        if (keywords['BITPIX']) {
          bitpixInfo = `<tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">BITPIX</td><td>${esc(keywords['BITPIX'])} &mdash; ${esc(bitpixDesc[keywords['BITPIX']] || 'Custom')}</td></tr>`;
        }

        const validBadge = sigValid
          ? '<span style="color:#22c55e;font-weight:bold;">✔ Valid FITS Signature</span>'
          : '<span style="color:#ef4444;font-weight:bold;">✘ Invalid FITS Signature</span>';

        h.render(`
          <div style="font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;">
            <h2 style="margin:0 0 4px;font-size:1.3rem;">FITS File Analysis</h2>
            <p style="margin:0 0 16px;color:#888;font-size:.9rem;">${esc(file.name)} &mdash; ${fmtBytes(file.size)}</p>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">Signature Validation</div>
              <div style="margin-bottom:6px;">${validBadge}</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Expected</td><td style="font-family:monospace;">"SIMPLE  " (0x53 49 4D 50 4C 45 20 20)</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File bytes 0–7</td><td style="font-family:monospace;">${esc(first8Hex)} &nbsp; "${esc(first8)}"</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">Note</td><td>${esc(sigNote)}</td></tr>
                <tr><td style="color:#94a3b8;padding:3px 12px 3px 0;white-space:nowrap;">File Size</td><td>${fmtBytes(file.size)} (${file.size.toLocaleString()} bytes)</td></tr>
                ${bitpixInfo}
                ${dimInfo}
              </table>
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:10px;">Primary Header Keywords</div>
              <table style="font-size:.82rem;border-collapse:collapse;width:100%;">
                ${kwRows}
              </table>
              ${!endFound ? '<div style="color:#fbbf24;font-size:.8rem;margin-top:8px;">⚠ END card not found in first 4 blocks — file may be truncated or non-standard</div>' : ''}
            </div>

            <div style="background:#1e293b;border-radius:8px;padding:16px;margin-bottom:16px;color:#e2e8f0;">
              <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px;">SHA-256 Hash</div>
              <div style="font-family:monospace;font-size:.8rem;word-break:break-all;color:#86efac;">${esc(hashHex)}</div>
            </div>

            <div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:14px;margin-bottom:16px;color:#1e3a8a;">
              <strong>Opening FITS Files:</strong> Use <strong>DS9</strong> (SAOImageDS9) for astronomical image viewing, <strong>Astropy</strong> in Python (<code>from astropy.io import fits</code>), or <strong>IRAF</strong> for professional reduction. FITS (Flexible Image Transport System) is the standard format for astronomical data.
            </div>
          </div>
        `);
      }
    });
  };
})();
