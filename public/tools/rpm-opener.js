(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- RPM Parser ---
  function readUint32(view, offset) {
    return view.getUint32(offset, false);
  }

  function parseHeader(buffer, offset) {
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    
    const magic = new Uint8Array(buffer, offset, 3);
    if (magic[0] !== 0x8e || magic[1] !== 0xad || magic[2] !== 0xe8) {
      throw new Error('Invalid RPM header magic');
    }
    
    const nindex = readUint32(view, offset + 8);
    const hsize = readUint32(view, offset + 12);
    
    const indexOffset = offset + 16;
    const dataOffset = indexOffset + nindex * 16;
    
    const tags = {};
    for (let i = 0; i < nindex; i++) {
      const entryOffset = indexOffset + i * 16;
      const tag = readUint32(view, entryOffset);
      const type = readUint32(view, entryOffset + 4);
      const off = readUint32(view, entryOffset + 8);
      const count = readUint32(view, entryOffset + 12);
      
      const valOffset = dataOffset + off;
      let value;
      
      if (type === 6 || type === 9) { // STRING or I18NSTRING
        const end = new Uint8Array(buffer, valOffset).indexOf(0);
        value = decoder.decode(new Uint8Array(buffer, valOffset, end));
      } else if (type === 8) { // STRING_ARRAY
        value = [];
        let curr = valOffset;
        for (let j = 0; j < count; j++) {
          const end = new Uint8Array(buffer, curr).indexOf(0);
          value.push(decoder.decode(new Uint8Array(buffer, curr, end)));
          curr += end + 1;
        }
      } else if (type === 4) { // INT32
        if (count === 1) value = readUint32(view, valOffset);
        else {
          value = [];
          for (let j = 0; j < count; j++) value.push(readUint32(view, valOffset + j * 4));
        }
      } else if (type === 7) { // BIN
        value = new Uint8Array(buffer, valOffset, count);
      }
      
      tags[tag] = value;
    }
    
    return { tags, nextOffset: dataOffset + hsize };
  }

  function parseRpm(buffer) {
    const view = new DataView(buffer);
    const leadMagic = view.getUint32(0, false);
    if (leadMagic !== 0xedabeeed) throw new Error('Not a valid RPM file (lead magic mismatch)');
    
    // Skip Lead (96 bytes)
    let offset = 96;
    
    // Parse Signature Header
    const sigHeader = parseHeader(buffer, offset);
    offset = sigHeader.nextOffset;
    
    // Pad to 8-byte boundary
    if (offset % 8 !== 0) offset += 8 - (offset % 8);
    
    // Parse Main Header
    const mainHeader = parseHeader(buffer, offset);
    
    return {
      metadata: mainHeader.tags,
      payloadOffset: mainHeader.nextOffset
    };
  }

  // --- CPIO Parser (New ASCII Format) ---
  function parseCpio(buffer) {
    const decoder = new TextDecoder();
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    
    while (offset + 110 <= bytes.length) {
      const magic = decoder.decode(bytes.subarray(offset, offset + 6));
      if (magic !== '070701' && magic !== '070702') break;
      
      const namesize = parseInt(decoder.decode(bytes.subarray(offset + 94, offset + 102)), 16);
      const filesize = parseInt(decoder.decode(bytes.subarray(offset + 54, offset + 62)), 16);
      const mode = parseInt(decoder.decode(bytes.subarray(offset + 14, offset + 22)), 16);
      const mtime = parseInt(decoder.decode(bytes.subarray(offset + 46, offset + 54)), 16);
      
      offset += 110;
      let name = decoder.decode(bytes.subarray(offset, offset + namesize - 1)); // -1 to skip null
      offset += namesize;
      if (offset % 4 !== 0) offset += 4 - (offset % 4); // Padding
      
      if (name === 'TRAILER!!!') break;
      
      const data = bytes.subarray(offset, offset + filesize);
      offset += filesize;
      if (offset % 4 !== 0) offset += 4 - (offset % 4); // Padding
      
      const isDir = (mode & 0xF000) === 0x4000;
      files.push({
        name: name.startsWith('./') ? name.substring(2) : name,
        size: isDir ? 0 : filesize,
        mtime: new Date(mtime * 1000),
        isDir: isDir,
        data: isDir ? null : data
      });
    }
    return files;
  }

  // --- Decompression ---
  async function decompress(data, compressor) {
    if (!compressor || compressor === 'none' || compressor === 'gzip') {
      if (typeof pako === 'undefined') throw new Error('pako (gzip) dependency not loaded');
      try {
        return pako.ungzip(data);
      } catch (e) {
        if (!compressor || compressor === 'none') return data; // Maybe it wasn't gzipped
        throw e;
      }
    }
    if (compressor === 'xz' || compressor === 'lzma') {
      if (typeof XZDecompressor === 'undefined') throw new Error('xz-decompress dependency not loaded');
      const xz = new XZDecompressor();
      return xz.decompress(data);
    }
    throw new Error('Unsupported compression: ' + compressor);
  }

  // --- Tool Implementation ---
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.rpm',
      dropLabel: 'Drop an RPM package here',
      binary: true,
      infoHtml: '<strong>Privacy:</strong> Everything happens in your browser. RPM headers and CPIO payloads are parsed locally.',

      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/xz-decompress@0.1.3/dist/xz-decompress.min.js');
      },

      onFile: async function (file, content, helpers) {
        helpers.showLoading('Parsing RPM headers...');
        try {
          const rpm = parseRpm(content);
          const meta = rpm.metadata;
          
          const compressor = meta[1125] || 'gzip'; // PayloadCompressor
          const payload = new Uint8Array(content, rpm.payloadOffset);
          
          helpers.showLoading(`Decompressing ${compressor} payload...`);
          const decompressed = await decompress(payload, compressor);
          
          helpers.showLoading('Parsing CPIO archive...');
          const files = parseCpio(decompressed.buffer);
          
          const metadata = {
            Package: meta[1000],
            Version: meta[1001],
            Release: meta[1002],
            Architecture: meta[1022],
            Summary: meta[1004],
            Description: meta[1005],
            License: meta[1014],
            Group: meta[1016],
            URL: meta[1020],
            Vendor: meta[1011],
            Packager: meta[1015]
          };

          helpers.setState('metadata', metadata);
          helpers.setState('files', files);
          
          renderResult(file, metadata, files, helpers);
        } catch (err) {
          helpers.showError('Error processing RPM', err.message);
          console.error(err);
        }
      },

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const m = h.getState().metadata;
            if (!m) return;
            const text = Object.entries(m)
              .filter(([_, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 File List',
          id: 'dl-list',
          onClick: function (h) {
            const files = h.getState().files;
            if (!files) return;
            const text = files.map(f => `${f.isDir ? '[DIR]' : '[FILE]'} ${f.name} (${formatSize(f.size)})`).join('\n');
            h.download('rpm-file-list.txt', text);
          }
        }
      ]
    });
  };

  function renderResult(file, metadata, files, h) {
    const pkg = metadata.Package || 'unknown';
    const ver = metadata.Version || 'unknown';
    const rel = metadata.Release || 'unknown';
    const arch = metadata.Architecture || 'unknown';
    
    let html = `
      <div class="p-4 space-y-6">
        <!-- Header Info -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Package</p>
            <p class="text-lg font-bold text-brand-600 truncate">${escapeHtml(pkg)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Version</p>
            <p class="text-lg font-mono truncate">${escapeHtml(ver)}-${escapeHtml(rel)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Architecture</p>
            <p class="text-lg font-mono truncate">${escapeHtml(arch)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">License</p>
            <p class="text-lg font-mono truncate">${escapeHtml(metadata.License || 'unknown')}</p>
          </div>
        </div>

        <!-- Summary & Description -->
        <div class="space-y-4">
          <div class="p-4 bg-white border border-surface-200 rounded-xl shadow-sm">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-2">Summary</p>
            <p class="text-sm font-medium text-surface-800">${escapeHtml(metadata.Summary || 'No summary available.')}</p>
          </div>
          <div class="p-4 bg-white border border-surface-200 rounded-xl shadow-sm">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-2">Description</p>
            <p class="text-sm text-surface-700 whitespace-pre-wrap">${escapeHtml(metadata.Description || 'No description available.')}</p>
          </div>
        </div>

        <!-- File List -->
        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 flex justify-between items-center">
            <h3 class="text-sm font-bold text-surface-700">Contents (${files.length} items)</h3>
            <span class="text-xs text-surface-400">${formatSize(files.reduce((acc, f) => acc + f.size, 0))} uncompressed</span>
          </div>
          <div class="overflow-x-auto max-h-[500px]">
            <table class="w-full text-sm text-left border-collapse">
              <thead class="bg-surface-50 sticky top-0 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-2 font-semibold text-surface-600">Path</th>
                  <th class="px-4 py-2 font-semibold text-surface-600 w-24 text-right">Size</th>
                  <th class="px-4 py-2 font-semibold text-surface-600 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${files.map((f, i) => `
                  <tr class="hover:bg-surface-50 transition-colors">
                    <td class="px-4 py-2 font-mono text-xs text-surface-600 truncate max-w-lg" title="${escapeHtml(f.name)}">
                      ${f.isDir ? '📁' : '📄'} ${escapeHtml(f.name)}
                    </td>
                    <td class="px-4 py-2 text-surface-500 text-xs text-right whitespace-nowrap">
                      ${f.isDir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2 text-center">
                      ${f.isDir ? '' : `
                        <button class="dl-entry text-brand-600 hover:text-brand-700 text-xs font-bold" data-idx="${i}">Extract</button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    h.getRenderEl().querySelectorAll('.dl-entry').forEach(btn => {
      btn.addEventListener('click', function() {
        const entry = files[parseInt(this.dataset.idx)];
        if (entry && entry.data) {
          const parts = entry.name.split('/');
          h.download(parts[parts.length - 1] || 'extracted', entry.data);
        }
      });
    });
  }
})();
