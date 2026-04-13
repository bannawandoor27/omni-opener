/**
 * OmniOpener — CBR/CBZ Comic Archive Viewer
 * CBZ (ZIP-based): extracts and shows all images using JSZip.
 * CBR (RAR-based): shows metadata and hex dump (RAR extraction requires desktop software).
 */
(function () {
  'use strict';

  function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtBytes(b) { return b > 1048576 ? (b/1048576).toFixed(1)+' MB' : b > 1024 ? (b/1024).toFixed(0)+' KB' : b+' B'; }

  window.initTool = function (toolConfig, mountEl) {
    var blobUrls = [];

    function cleanup() {
      blobUrls.forEach(function(u) { URL.revokeObjectURL(u); });
      blobUrls = [];
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbr,.cbz,.rar,.zip',
      binary: true,
      dropLabel: 'Drop a CBR or CBZ comic archive here',
      infoHtml: '<strong>Privacy:</strong> All processing happens in your browser. Files are never uploaded.',
      actions: [
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) { var f = h.getFile(); h.download(f.name, h.getContent()); }
        }
      ],

      onFile: async function (file, content, h) {
        cleanup();
        h.showLoading('Reading archive…');

        const bytes = new Uint8Array(content);
        const magic = (bytes[0] << 8 | bytes[1]);

        // Detect format by magic bytes
        const isZip = (bytes[0] === 0x50 && bytes[1] === 0x4B); // PK
        const isRar = (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72); // Rar!
        const isRar5 = (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1A && bytes[5] === 0x07 && bytes[6] === 0x01);

        // SHA-256 hash
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');

        const magicStr = Array.from(bytes.slice(0,16)).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');

        if (isZip) {
          // CBZ — ZIP format, extract images with JSZip
          h.showLoading('Loading JSZip…');
          h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', async function() {
            try {
              const zip = await JSZip.loadAsync(content);
              const imageFiles = [];
              zip.forEach(function(path, entry) {
                if (!entry.dir && /\.(jpe?g|png|gif|webp|bmp)$/i.test(path)) {
                  imageFiles.push({ path: path, entry: entry });
                }
              });
              imageFiles.sort(function(a, b) { return a.path.localeCompare(b.path); });

              h.render(`
                <div class="p-4 space-y-4">
                  <div class="flex flex-wrap items-center gap-3 border-b border-surface-200 pb-3">
                    <div>
                      <h3 class="font-bold text-surface-900">${esc(file.name)}</h3>
                      <p class="text-sm text-surface-500">${fmtBytes(file.size)} • CBZ (ZIP) • ${imageFiles.length} pages</p>
                    </div>
                  </div>
                  <div id="cbz-pages" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"></div>
                  <p class="text-xs text-surface-400 text-center">SHA-256: ${hashHex}</p>
                </div>
              `);

              const container = document.getElementById('cbz-pages');
              for (const imgFile of imageFiles.slice(0, 50)) {
                const blob = await imgFile.entry.async('blob');
                const url = URL.createObjectURL(blob);
                blobUrls.push(url);
                const div = document.createElement('div');
                div.className = 'border border-surface-200 rounded-lg overflow-hidden';
                div.innerHTML = '<img src="' + url + '" class="w-full h-auto object-contain" loading="lazy">'
                  + '<p class="text-[10px] text-center text-surface-400 p-1 truncate">' + esc(imgFile.path.split('/').pop()) + '</p>';
                container.appendChild(div);
              }
              if (imageFiles.length > 50) {
                container.insertAdjacentHTML('beforeend', '<p class="col-span-full text-center text-sm text-surface-400">Showing first 50 of ' + imageFiles.length + ' pages</p>');
              }
            } catch(e) {
              h.showError('Failed to read ZIP archive', e.message);
            }
          });

        } else if (isRar || isRar5) {
          // CBR — RAR format, can't extract in browser (no reliable WASM RAR library)
          const rarVer = isRar5 ? '5.x' : '4.x and earlier';
          const hexDump = generateHexDump(bytes.slice(0, 1024));
          h.render(`
            <div class="p-6 space-y-6">
              <div class="border-b border-surface-200 pb-4">
                <h3 class="text-xl font-bold text-surface-900">${esc(file.name)}</h3>
                <p class="text-sm text-surface-500">${fmtBytes(file.size)} • CBR (RAR ${rarVer})</p>
              </div>
              <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <strong>RAR format detected.</strong> Full comic extraction requires a desktop app like
                CDisplay Ex, YACReader, or ComicRack. Download the file below.
              </div>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="font-bold text-surface-700 mb-2 uppercase text-xs">Archive Info</h4>
                  <div class="space-y-1">
                    <div class="flex justify-between"><span class="text-surface-500">Format:</span><span>RAR ${rarVer}</span></div>
                    <div class="flex justify-between"><span class="text-surface-500">Magic:</span><span class="font-mono text-xs">${magicStr.slice(0,17)}…</span></div>
                  </div>
                </div>
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="font-bold text-surface-700 mb-2 uppercase text-xs">Hash</h4>
                  <span class="font-mono text-[10px] break-all">${hashHex}</span>
                </div>
              </div>
              <div class="border border-surface-200 rounded-xl overflow-hidden">
                <div class="bg-surface-100 px-4 py-2 border-b text-xs font-bold text-surface-700 uppercase">Hex Dump (first 1KB)</div>
                <pre class="p-4 font-mono text-[10px] leading-tight overflow-auto max-h-48 bg-white">${esc(hexDump)}</pre>
              </div>
            </div>
          `);
        } else {
          h.showError('Unknown format', 'Not a valid CBR (RAR) or CBZ (ZIP) file. Magic: ' + magicStr.slice(0,11));
        }
      },
      onDestroy: cleanup
    });

    function generateHexDump(bytes) {
      var out = '';
      for (var i = 0; i < bytes.length; i += 16) {
        var line = i.toString(16).padStart(6, '0') + '  ';
        var ascii = '';
        for (var j = 0; j < 16; j++) {
          if (i + j < bytes.length) {
            var b = bytes[i + j];
            line += b.toString(16).padStart(2, '0') + ' ';
            ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else { line += '   '; }
          if (j === 7) line += ' ';
        }
        out += line + '|' + ascii + '|\n';
      }
      return out;
    }
  };
})();
