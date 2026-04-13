/**
 * OmniOpener — PNG Toolkit
 * Uses OmniTool SDK. Parses PNG binary chunks manually — no external dependencies.
 */
(function () {
  'use strict';

  function esc(s) {
    if (s === null || s === undefined) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s)));
    return d.innerHTML;
  }

  function fmtBytes(b) {
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  const COLOR_TYPES = {
    0: 'Grayscale',
    2: 'RGB (Truecolor)',
    3: 'Indexed (Palette)',
    4: 'Grayscale + Alpha',
    6: 'RGBA (Truecolor + Alpha)'
  };

  function parsePNG(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // Validate magic bytes: 89 50 4E 47 0D 0A 1A 0A
    const MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== MAGIC[i]) throw new Error('Not a valid PNG file (bad magic bytes)');
    }

    const result = {
      width: 0, height: 0, bitDepth: 0,
      colorType: 0, colorTypeName: '',
      compression: 0, filter: 0, interlace: 0,
      interlaceName: '',
      chunks: [],
      textMetadata: [],
      chunkCount: 0
    };

    let offset = 8; // skip magic
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset, false);
      const typeBytes = bytes.slice(offset + 4, offset + 8);
      const type = String.fromCharCode(...typeBytes);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;

      result.chunks.push(type);
      result.chunkCount++;

      if (type === 'IHDR' && length >= 13) {
        result.width = view.getUint32(dataStart, false);
        result.height = view.getUint32(dataStart + 4, false);
        result.bitDepth = bytes[dataStart + 8];
        result.colorType = bytes[dataStart + 9];
        result.colorTypeName = COLOR_TYPES[bytes[dataStart + 9]] || ('Unknown (' + bytes[dataStart + 9] + ')');
        result.compression = bytes[dataStart + 10];
        result.filter = bytes[dataStart + 11];
        result.interlace = bytes[dataStart + 12];
        result.interlaceName = bytes[dataStart + 12] === 0 ? 'None' : 'Adam7';
      } else if (type === 'tEXt' && length > 0) {
        // keyword\0text
        const chunkData = bytes.slice(dataStart, dataEnd);
        let nullIdx = chunkData.indexOf(0);
        if (nullIdx === -1) nullIdx = chunkData.length;
        const keyword = new TextDecoder('latin1').decode(chunkData.slice(0, nullIdx));
        const text = new TextDecoder('latin1').decode(chunkData.slice(nullIdx + 1));
        result.textMetadata.push({ keyword, text });
      } else if (type === 'iTXt' && length > 0) {
        // keyword\0compression_flag\0compression_method\0language\0translated_keyword\0text
        const chunkData = bytes.slice(dataStart, dataEnd);
        let pos = 0;
        let nullIdx = chunkData.indexOf(0, pos);
        if (nullIdx === -1) nullIdx = chunkData.length;
        const keyword = new TextDecoder('utf-8').decode(chunkData.slice(pos, nullIdx));
        pos = nullIdx + 3; // skip null + compression_flag + compression_method
        // skip language tag
        let langEnd = chunkData.indexOf(0, pos);
        if (langEnd === -1) langEnd = chunkData.length;
        pos = langEnd + 1;
        // skip translated keyword
        let tkEnd = chunkData.indexOf(0, pos);
        if (tkEnd === -1) tkEnd = chunkData.length;
        pos = tkEnd + 1;
        const text = new TextDecoder('utf-8').decode(chunkData.slice(pos));
        result.textMetadata.push({ keyword, text });
      } else if (type === 'zTXt' && length > 0) {
        // keyword\0compression_method\0compressed_text (skip decompression)
        const chunkData = bytes.slice(dataStart, dataEnd);
        let nullIdx = chunkData.indexOf(0);
        if (nullIdx === -1) nullIdx = chunkData.length;
        const keyword = new TextDecoder('latin1').decode(chunkData.slice(0, nullIdx));
        result.textMetadata.push({ keyword, text: '(compressed)' });
      }

      offset = dataEnd + 4; // skip CRC
      if (type === 'IEND') break;
    }

    return result;
  }

  async function sha256Hex(buffer) {
    const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Checkerboard pattern as inline background (SVG data URI for crisp rendering)
  const CHECKER_BG = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23ccc'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23ccc'/%3E%3Crect x='8' width='8' height='8' fill='%23fff'/%3E%3Crect y='8' width='8' height='8' fill='%23fff'/%3E%3C/svg%3E\")";

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.png',
      binary: true,
      dropLabel: 'Drop a PNG file here',
      infoHtml: '<strong>PNG Toolkit:</strong> Advanced PNG viewer with chunk-level metadata parsing, transparency support, and SHA-256 integrity hash.',

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing PNG structure...');

        // Build blob URL
        const blob = new Blob([content], { type: 'image/png' });
        const url = URL.createObjectURL(blob);

        // Parse PNG chunks
        let info = null;
        let parseError = null;
        try {
          info = parsePNG(content);
        } catch (e) {
          parseError = e.message;
        }

        // SHA-256 hash
        let hash = null;
        try {
          hash = await sha256Hex(content);
        } catch (e) { hash = null; }

        // Build metadata section
        let metaRows = '';

        if (info) {
          // Image info
          metaRows += `
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">Dimensions</td>
              <td class="py-2 text-[11px] text-surface-800">${esc(info.width)} × ${esc(info.height)} px</td>
            </tr>
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">Color Type</td>
              <td class="py-2 text-[11px] text-surface-800">${esc(info.colorTypeName)}</td>
            </tr>
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">Bit Depth</td>
              <td class="py-2 text-[11px] text-surface-800">${esc(info.bitDepth)} bits per channel</td>
            </tr>
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">Interlacing</td>
              <td class="py-2 text-[11px] text-surface-800">${esc(info.interlaceName)}</td>
            </tr>
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">Total Chunks</td>
              <td class="py-2 text-[11px] text-surface-800">${esc(info.chunkCount)}</td>
            </tr>
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">Chunk Types</td>
              <td class="py-2 text-[11px] text-surface-800 font-mono">${esc([...new Set(info.chunks)].join(', '))}</td>
            </tr>
          `;
        }

        // File info
        metaRows += `
          <tr class="border-b border-surface-100">
            <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap">File Size</td>
            <td class="py-2 text-[11px] text-surface-800">${esc(fmtBytes(file.size))}</td>
          </tr>
        `;
        if (hash) {
          metaRows += `
            <tr class="border-b border-surface-100">
              <td class="py-2 pr-4 text-[11px] font-medium text-surface-500 whitespace-nowrap align-top">SHA-256</td>
              <td class="py-2 text-[10px] text-surface-600 font-mono break-all">${esc(hash)}</td>
            </tr>
          `;
        }

        // tEXt / iTXt metadata table
        let textMetaHtml = '';
        if (info && info.textMetadata.length > 0) {
          const rows = info.textMetadata.map(m =>
            `<tr class="border-b border-surface-100">
              <td class="py-1.5 pr-3 text-[11px] font-medium text-surface-500 whitespace-nowrap align-top">${esc(m.keyword)}</td>
              <td class="py-1.5 text-[11px] text-surface-800 break-all">${esc(m.text)}</td>
            </tr>`
          ).join('');
          textMetaHtml = `
            <div class="mt-4 mb-1">
              <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Embedded Text Metadata</h3>
              <table class="w-full border-collapse">${rows}</table>
            </div>
          `;
        }

        if (parseError) {
          metaRows = `<tr><td colspan="2" class="py-2 text-[11px] text-red-500">${esc(parseError)}</td></tr>`;
        }

        h.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">

            <!-- Toolbar -->
            <div class="shrink-0 bg-white border-b border-surface-200 px-4 py-2 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs font-bold text-surface-900 truncate">${esc(file.name)}</span>
                ${info ? `<span class="shrink-0 text-[10px] font-bold text-surface-400 bg-surface-50 border border-surface-100 px-2 py-0.5 rounded">${info.width} × ${info.height}</span>` : ''}
                ${info ? `<span class="shrink-0 text-[10px] font-bold text-surface-400 bg-surface-50 border border-surface-100 px-2 py-0.5 rounded">${esc(info.colorTypeName)}</span>` : ''}
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button id="btn-zoom-in" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors text-sm">＋</button>
                <button id="btn-zoom-out" class="p-1.5 hover:bg-surface-50 rounded text-surface-600 transition-colors text-sm">－</button>
                <button id="btn-dl" class="px-3 py-1 bg-brand-600 text-white rounded text-[10px] font-bold shadow-sm hover:bg-brand-700 transition-colors">Download</button>
              </div>
            </div>

            <!-- Scrollable content -->
            <div class="flex-1 min-h-0 overflow-y-auto">

              <!-- Image display with checkerboard -->
              <div class="w-full flex justify-center items-center p-8 min-h-[280px]"
                   style="background: ${CHECKER_BG}; background-size: 16px 16px;">
                <img id="png-preview" src="${url}"
                     class="max-w-full h-auto shadow-2xl rounded transition-all duration-300 ease-out"
                     style="transform: scale(1);" />
              </div>

              <!-- Metadata below -->
              <div class="px-6 py-4 border-t border-surface-100 bg-white">
                <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-3">PNG Structure</h3>
                <table class="w-full border-collapse">
                  ${metaRows}
                </table>
                ${textMetaHtml}
              </div>

            </div>
          </div>
        `);

        // Wire up controls
        let scale = 1;
        const imgPreview = document.getElementById('png-preview');
        const updateScale = () => { imgPreview.style.transform = `scale(${scale})`; };

        document.getElementById('btn-zoom-in').onclick = () => { scale = Math.min(scale + 0.2, 5); updateScale(); };
        document.getElementById('btn-zoom-out').onclick = () => { scale = Math.max(scale - 0.2, 0.1); updateScale(); };
        document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
      }
    });
  };
})();
