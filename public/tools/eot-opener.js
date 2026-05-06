/**
 * OmniOpener — EOT (Embedded OpenType) Font Viewer
 * Parses EOT headers and attempts to render font previews.
 */
(function () {
  'use strict';

  /**
   * Escapes HTML special characters.
   */
  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /**
   * Formats bytes into human-readable strings.
   */
  function fmtSize(b) {
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  /**
   * Parses EOT file header.
   * Reference: https://www.w3.org/Submission/EOT/
   */
  function parseEOT(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 82) return null;

    const magic = view.getUint16(34, true);
    if (magic !== 0x504C) return null; // 'LP'

    const info = {
      eotSize: view.getUint32(0, true),
      fontDataSize: view.getUint32(4, true),
      version: '0x' + view.getUint32(8, true).toString(16).toUpperCase(),
      flags: view.getUint32(12, true),
      charset: new Uint8Array(buffer)[26],
      italic: new Uint8Array(buffer)[27] !== 0,
      weight: view.getUint16(28, true),
      fsType: view.getUint16(32, true),
      isCompressed: (view.getUint32(12, true) & 0x00000004) !== 0
    };

    // Read variable length strings (UTF-16LE)
    let offset = 82;
    function readString() {
      if (offset + 2 > buffer.byteLength) return '';
      const len = view.getUint16(offset, true);
      offset += 2;
      if (len === 0) {
        offset += 2; // Padding
        return '';
      }
      if (offset + len > buffer.byteLength) return '';
      const strBytes = new Uint16Array(buffer.slice(offset, offset + len));
      let str = '';
      for (let i = 0; i < strBytes.length; i++) {
        if (strBytes[i] === 0) break;
        str += String.fromCharCode(strBytes[i]);
      }
      offset += len + 2; // String length + 2 bytes padding
      return str;
    }

    info.familyName = readString();
    info.styleName = readString();
    info.versionName = readString();
    info.fullName = readString();

    return info;
  }

  window.initTool = function (toolConfig, mountEl) {
    let fontStyleEl = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.eot',
      dropLabel: 'Drop an EOT font file here',
      infoHtml: '<strong>Privacy:</strong> All processing is done locally in your browser. EOT is a legacy format primarily used by Internet Explorer.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const info = h.getState().fontInfo;
            if (info) h.copyToClipboard(JSON.stringify(info, null, 2), btn);
          }
        },
        {
          label: '🔑 Copy Hash',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().hash;
            if (hash) h.copyToClipboard(hash, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/vnd.ms-fontobject');
          }
        }
      ],

      onFile: async function (file, content, h) {
        h.showLoading('Parsing EOT file...');

        const info = parseEOT(content);
        if (!info) {
          h.showError('Invalid EOT File', 'This file does not appear to be a valid Embedded OpenType font.');
          return;
        }

        // Calculate SHA-256
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        h.setState({ fontInfo: info, hash: hashHex });

        // Clean up previous font injection
        if (fontStyleEl) fontStyleEl.remove();

        // Inject font-face for preview
        const fontId = 'omni-eot-' + Math.random().toString(36).substring(2, 10);
        const blob = new Blob([content], { type: 'application/vnd.ms-fontobject' });
        const fontUrl = URL.createObjectURL(blob);

        fontStyleEl = document.createElement('style');
        fontStyleEl.textContent = `@font-face { font-family: "${fontId}"; src: url("${fontUrl}") format("embedded-opentype"); }`;
        document.head.appendChild(fontStyleEl);

        // Auto-revoke after some time to free memory
        setTimeout(() => URL.revokeObjectURL(fontUrl), 5000);

        const sampleText = 'The quick brown fox jumps over the lazy dog.';

        h.render(`
          <div class="p-6 space-y-8">
            <div class="flex flex-wrap items-center justify-between gap-4 border-b border-surface-200 pb-6">
              <div>
                <h3 class="text-2xl font-bold text-surface-900">${esc(file.name)}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-sm text-surface-500">${fmtSize(file.size)}</span>
                  <span class="text-surface-300">·</span>
                  <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">EOT Font</span>
                  ${info.isCompressed ? '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Compressed</span>' : ''}
                </div>
              </div>
              <div class="text-right">
                <div class="text-[10px] font-mono text-surface-400 uppercase">SHA-256</div>
                <div class="text-xs font-mono text-surface-600">${hashHex.slice(0, 16)}...</div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-4">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Identification</h4>
                <div class="bg-surface-50 rounded-xl p-5 border border-surface-200 space-y-3 text-sm">
                  <div class="flex justify-between"><span class="text-surface-500">Family:</span><span class="font-semibold text-surface-900">${esc(info.familyName) || 'Unknown'}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Style:</span><span class="text-surface-700">${esc(info.styleName) || 'Regular'}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Full Name:</span><span class="text-surface-700">${esc(info.fullName) || 'Unknown'}</span></div>
                  <div class="pt-2 border-t border-surface-100 flex justify-between"><span class="text-surface-500">Version:</span><span class="text-xs text-surface-500 italic">${esc(info.versionName) || 'N/A'}</span></div>
                </div>
              </div>

              <div class="space-y-4">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Technical Profile</h4>
                <div class="bg-surface-50 rounded-xl p-5 border border-surface-200 space-y-3 text-sm">
                  <div class="flex justify-between"><span class="text-surface-500">Spec Version:</span><span class="font-mono text-surface-700">${info.version}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Weight:</span><span class="text-surface-700">${info.weight}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Italic:</span><span class="text-surface-700">${info.italic ? 'Yes' : 'No'}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Font Data Size:</span><span class="text-surface-700">${fmtSize(info.fontDataSize)}</span></div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Preview</h4>
                <div class="flex items-center gap-2">
                   ${!window.chrome ? '' : '<span class="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded">Note: EOT rendering may not be supported in modern browsers</span>'}
                </div>
              </div>
              <div class="border border-surface-200 rounded-2xl bg-white p-8 space-y-8 overflow-hidden" style="font-family: '${fontId}', sans-serif;">
                <div class="text-5xl leading-tight border-b border-surface-100 pb-6">${esc(sampleText)}</div>
                <div class="text-3xl text-surface-800">${esc(sampleText)}</div>
                <div class="text-xl text-surface-600">${esc(sampleText)}</div>
                <div class="text-base text-surface-500">${esc(sampleText)}</div>
                <div class="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-mono text-surface-400">
                  <div>ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
                  <div>abcdefghijklmnopqrstuvwxyz</div>
                  <div>0123456789 !@#$%^&*()</div>
                </div>
              </div>
            </div>

            <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
              <div class="text-blue-500 text-lg">ℹ️</div>
              <div class="text-xs text-blue-700 leading-relaxed">
                <strong>Why is the preview generic?</strong> EOT fonts are a legacy format from 1999. Most modern browsers (Chrome, Firefox, Safari) have removed support for them. Additionally, EOT files are often "domain-locked" or compressed with proprietary algorithms (MTX) that prevent easy browser rendering today.
              </div>
            </div>
          </div>
        `);
      },

      onDestroy: function () {
        if (fontStyleEl) fontStyleEl.remove();
      }
    });
  };
})();
