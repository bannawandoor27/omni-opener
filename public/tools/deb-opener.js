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

  // --- AR Parser ---
  function parseAr(buffer) {
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder();
    const magic = decoder.decode(bytes.subarray(0, 8));
    if (magic !== '!<arch>\n') throw new Error('Not a valid ar archive (missing !<arch>\\n magic)');

    const files = [];
    let offset = 8;
    while (offset + 60 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 60);
      let name = decoder.decode(header.subarray(0, 16)).trim();
      const size = parseInt(decoder.decode(header.subarray(48, 58)).trim(), 10);
      const data = bytes.subarray(offset + 60, offset + 60 + size);
      
      // Standard ar uses "/" for normal names and "//" for long names table
      // Deb files usually have names like "debian-binary", "control.tar.gz", etc.
      name = name.replace(/\/$/, '');
      
      files.push({ name, size, data });
      offset += 60 + size;
      if (offset % 2 !== 0) offset++; // Padding
    }
    return files;
  }

  // --- TAR Parser (Optimized from tar-opener.js) ---
  function parseTar(bytes) {
    const files = [];
    let offset = 0;
    let nextFileName = null;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512;
        continue;
      }

      try {
        let name = nextFileName || decoder.decode(header.subarray(0, 100)).split('\0')[0];
        nextFileName = null;
        const sizeStr = decoder.decode(header.subarray(124, 136)).split('\0')[0].trim();
        const size = parseInt(sizeStr, 8) || 0;
        const type = String.fromCharCode(header[156]);
        const mtimeStr = decoder.decode(header.subarray(136, 148)).split('\0')[0].trim();
        const mtime = parseInt(mtimeStr, 8) || 0;

        const magic = decoder.decode(header.subarray(257, 263));
        if (magic.startsWith('ustar')) {
          const prefix = decoder.decode(header.subarray(345, 500)).split('\0')[0];
          if (prefix) name = (prefix.endsWith('/') ? prefix : prefix + '/') + name;
        }

        const dataOffset = offset + 512;
        const data = bytes.subarray(dataOffset, dataOffset + size);

        if (type === 'L') {
          nextFileName = decoder.decode(data).split('\0')[0];
        } else {
          const isDir = type === '5' || name.endsWith('/');
          files.push({
            name: name,
            size: isDir ? 0 : size,
            mtime: mtime ? new Date(mtime * 1000) : null,
            isDir: isDir,
            data: isDir ? null : data
          });
        }
        offset += 512 + Math.ceil(size / 512) * 512;
      } catch (err) { break; }
    }
    return files;
  }

  // --- Metadata Parser ---
  function parseControl(text) {
    const lines = text.split('\n');
    const meta = {};
    let lastKey = '';
    lines.forEach(line => {
      if (line.startsWith(' ')) {
        if (lastKey) meta[lastKey] += '\n' + line.trim();
      } else {
        const i = line.indexOf(':');
        if (i > -1) {
          lastKey = line.substring(0, i).trim();
          meta[lastKey] = line.substring(i + 1).trim();
        }
      }
    });
    return meta;
  }

  // --- Decompression ---
  async function decompress(data, filename) {
    const uint8 = new Uint8Array(data);
    if (filename.endsWith('.gz')) {
      if (typeof pako === 'undefined') throw new Error('pako (gzip) not loaded');
      return pako.ungzip(uint8);
    }
    if (filename.endsWith('.xz')) {
      if (typeof XZDecompressor === 'undefined') throw new Error('xz-decompress not loaded');
      const xz = new XZDecompressor();
      return xz.decompress(uint8);
    }
    if (filename.endsWith('.zst')) {
      throw new Error('.zst decompression not implemented yet');
    }
    return uint8; // Raw if unknown
  }

  // --- Tool ---
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.deb',
      dropLabel: 'Drop a .deb package here',
      binary: true,
      infoHtml: '<strong>Privacy:</strong> All processing is done 100% locally in your browser.',

      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/xz-decompress@0.1.3/dist/xz-decompress.min.js');
      },

      onFile: async function (file, content, helpers) {
        helpers.showLoading('Reading .deb archive...');
        try {
          const arFiles = parseAr(content);
          
          let controlData = null, dataArchive = null;
          for (const f of arFiles) {
            if (f.name.startsWith('control.tar')) controlData = f;
            if (f.name.startsWith('data.tar')) dataArchive = f;
          }

          if (!controlData || !dataArchive) throw new Error('Missing control or data archive in .deb');

          helpers.showLoading('Decompressing control archive...');
          const controlRaw = await decompress(controlData.data, controlData.name);
          const controlTar = parseTar(controlRaw);
          const controlFile = controlTar.find(f => f.name === './control' || f.name === 'control');
          
          let metadata = {};
          if (controlFile) {
            metadata = parseControl(new TextDecoder().decode(controlFile.data));
          }

          helpers.showLoading('Decompressing data archive...');
          const dataRaw = await decompress(dataArchive.data, dataArchive.name);
          const dataTar = parseTar(dataRaw);
          
          helpers.setState('metadata', metadata);
          helpers.setState('files', dataTar);
          
          renderResult(file, metadata, dataTar, helpers);
        } catch (err) {
          helpers.showError('Error processing DEB', err.message);
        }
      },

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const m = h.getState().metadata;
            if (!m) return;
            h.copyToClipboard(Object.entries(m).map(([k,v]) => `${k}: ${v}`).join('\n'), btn);
          }
        },
        {
          label: '📥 Download File List',
          id: 'dl-list',
          onClick: function (h) {
            const files = h.getState().files;
            if (!files) return;
            const text = files.map(f => `${f.isDir ? '[DIR]' : '[FILE]'} ${f.name} (${formatSize(f.size)})`).join('\n');
            h.download('deb-file-list.txt', text);
          }
        }
      ]
    });
  };

  function renderResult(file, metadata, files, h) {
    const pkg = metadata.Package || 'unknown';
    const ver = metadata.Version || 'unknown';
    const arch = metadata.Architecture || 'unknown';
    
    let html = `
      <div class="p-4 space-y-6">
        <!-- Header Info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Package</p>
            <p class="text-lg font-bold text-brand-600 truncate">${escapeHtml(pkg)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Version</p>
            <p class="text-lg font-mono truncate">${escapeHtml(ver)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Architecture</p>
            <p class="text-lg font-mono truncate">${escapeHtml(arch)}</p>
          </div>
        </div>

        <!-- Description -->
        <div class="p-4 bg-white border border-surface-200 rounded-xl shadow-sm">
          <p class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-2">Description</p>
          <p class="text-sm text-surface-700 whitespace-pre-wrap">${escapeHtml(metadata.Description || 'No description available.')}</p>
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
