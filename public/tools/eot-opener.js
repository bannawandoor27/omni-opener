/**
 * OmniOpener — EOT (Embedded OpenType) Font Viewer
 * Parses EOT header and renders font preview using native browser @font-face.
 * No external CDN required.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtBytes(b) {
    return b > 1048576 ? (b/1048576).toFixed(1)+' MB' : b > 1024 ? (b/1024).toFixed(0)+' KB' : b+' B';
  }

  function parseEOTHeader(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const info = { valid: false };

    // Check minimum size
    if (buffer.byteLength < 82) return info;

    const magic = view.getUint16(34, true); // MagicNumber at offset 34
    info.valid = (magic === 0x504C); // 'LP'
    info.eotSize = view.getUint32(0, true);
    info.fontDataSize = view.getUint32(4, true);
    info.version = '0x' + view.getUint32(8, true).toString(16).toUpperCase();
    info.flags = view.getUint32(12, true);
    info.charset = bytes[26];
    info.italic = bytes[27];
    info.weight = view.getUint16(28, true);
    info.fsType = view.getUint16(32, true);
    info.embedded = (info.fsType & 0x0200) !== 0 ? 'Editable' : (info.fsType & 0x0100) ? 'Print/Preview' : 'Installable';

    // Read variable-length strings at offset 82
    let offset = 82;
    function readUTF16(off) {
      if (off + 2 > buffer.byteLength) return '';
      const len = view.getUint16(off, true);
      if (len === 0) return '';
      const chars = [];
      for (let i = 0; i < len && off + 2 + i * 2 + 2 <= buffer.byteLength; i++) {
        const code = view.getUint16(off + 2 + i * 2, true);
        if (code === 0) break;
        chars.push(String.fromCharCode(code));
      }
      return chars.join('');
    }

    if (offset + 2 <= buffer.byteLength) {
      const familyLen = view.getUint16(offset, true);
      info.familyName = readUTF16(offset);
      offset += 2 + familyLen;
    }
    if (offset + 2 <= buffer.byteLength) {
      const styleLen = view.getUint16(offset, true);
      info.styleName = readUTF16(offset);
      offset += 2 + styleLen;
    }
    if (offset + 2 <= buffer.byteLength) {
      const versionLen = view.getUint16(offset, true);
      info.versionName = readUTF16(offset);
      offset += 2 + versionLen;
    }
    if (offset + 2 <= buffer.byteLength) {
      info.fullName = readUTF16(offset);
    }

    return info;
  }

  window.initTool = function (toolConfig, mountEl) {
    var fontStyleEl = null;
    var blobUrl = null;
    var fontId = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.eot',
      dropLabel: 'Drop an .eot font file here',
      infoHtml: '<strong>Privacy:</strong> Font parsed entirely in your browser. No uploads.',
      actions: [
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            var f = h.getFile();
            h.download(f.name, h.getContent());
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Parsing EOT font…');

        // Compute SHA-256
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');

        const info = parseEOTHeader(content);
        const magicBytes = Array.from(new Uint8Array(content.slice(0,16)))
          .map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');

        // Create @font-face with raw EOT blob
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        if (fontStyleEl) fontStyleEl.remove();

        fontId = 'eot-' + Math.random().toString(36).slice(2, 9);
        blobUrl = URL.createObjectURL(new Blob([content], { type: 'application/vnd.ms-fontobject' }));
        fontStyleEl = document.createElement('style');
        fontStyleEl.textContent = '@font-face { font-family: "' + fontId + '"; src: url("' + blobUrl + '") format("embedded-opentype"); }';
        document.head.appendChild(fontStyleEl);

        const sampleSizes = [12, 18, 24, 32, 48];
        const sampleText = 'AaBbCc 123 The quick brown fox';

        h.render(`
          <div class="p-6 space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200 pb-4">
              <div>
                <h3 class="text-xl font-bold text-surface-900">${esc(file.name)}</h3>
                <p class="text-sm text-surface-500">${fmtBytes(file.size)} • EOT Font</p>
              </div>
              <button id="btn-copy-hash" class="px-3 py-1 text-xs border border-surface-200 rounded hover:bg-surface-50">Copy SHA-256</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                <h4 class="text-xs font-bold text-surface-600 uppercase mb-3">Font Metadata</h4>
                <div class="space-y-1.5 text-sm">
                  ${info.familyName ? `<div class="flex justify-between"><span class="text-surface-500">Family:</span><span class="font-medium">${esc(info.familyName)}</span></div>` : ''}
                  ${info.styleName ? `<div class="flex justify-between"><span class="text-surface-500">Style:</span><span>${esc(info.styleName)}</span></div>` : ''}
                  ${info.versionName ? `<div class="flex justify-between"><span class="text-surface-500">Version:</span><span class="text-xs">${esc(info.versionName)}</span></div>` : ''}
                  <div class="flex justify-between"><span class="text-surface-500">Weight:</span><span>${info.weight || '?'}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Italic:</span><span>${info.italic ? 'Yes' : 'No'}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Embedding:</span><span>${esc(info.embedded || '?')}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Valid EOT:</span><span>${info.valid ? '✓ Yes' : '✗ No'}</span></div>
                </div>
              </div>
              <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                <h4 class="text-xs font-bold text-surface-600 uppercase mb-3">File Info</h4>
                <div class="space-y-1.5 text-sm">
                  <div class="flex justify-between"><span class="text-surface-500">Magic Bytes:</span><span class="font-mono text-xs">${magicBytes.slice(0,23)}…</span></div>
                  <div><span class="text-surface-500">SHA-256:</span><br><span class="font-mono text-[10px] break-all">${hashHex}</span></div>
                </div>
              </div>
            </div>

            <div class="border border-surface-200 rounded-xl overflow-hidden">
              <div class="bg-surface-100 px-4 py-2 border-b border-surface-200">
                <span class="text-xs font-bold text-surface-700 uppercase">Font Preview</span>
              </div>
              <div class="p-5 space-y-3 bg-white">
                ${sampleSizes.map(sz => `<div style="font-family:'${fontId}',serif;font-size:${sz}px;line-height:1.3;">${esc(sampleText)}</div>`).join('')}
                <div class="mt-4 border-t border-surface-100 pt-4">
                  <div style="font-family:'${fontId}',serif;font-size:20px;letter-spacing:0.05em;">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
                  <div style="font-family:'${fontId}',serif;font-size:20px;letter-spacing:0.05em;">abcdefghijklmnopqrstuvwxyz</div>
                  <div style="font-family:'${fontId}',serif;font-size:20px;">0123456789 !@#$%^&*()</div>
                </div>
              </div>
            </div>
          </div>
        `);

        document.getElementById('btn-copy-hash').onclick = function(e) {
          h.copyToClipboard(hashHex, e.target);
        };
      },
      onDestroy: function () {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        if (fontStyleEl) fontStyleEl.remove();
      }
    });
  };
})();
