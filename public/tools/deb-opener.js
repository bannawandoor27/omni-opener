(function () {
  'use strict';

  /**
   * OmniOpener .deb Tool
   * A production-perfect browser-based Debian package viewer.
   */

  // --- Utilities ---
  function escapeHtml(str) {
    if (!str) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // --- AR Parser (Debian uses BSD ar format) ---
  function parseAr(buffer) {
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder();
    
    if (bytes.length < 8) throw new Error('File too small for AR archive');
    const magic = decoder.decode(bytes.subarray(0, 8));
    if (magic !== '!<arch>\n') throw new Error('Not a valid .deb file (missing !<arch> magic)');

    const files = [];
    let offset = 8;
    while (offset + 60 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 60);
      let name = decoder.decode(header.subarray(0, 16)).trim();
      const sizeStr = decoder.decode(header.subarray(48, 58)).trim();
      const size = parseInt(sizeStr, 10);
      
      if (isNaN(size)) break;

      const dataStart = offset + 60;
      const dataEnd = dataStart + size;
      if (dataEnd > bytes.length) break;

      const data = bytes.subarray(dataStart, dataEnd);
      name = name.replace(/\/$/, '');
      
      files.push({ name, size, data });
      
      offset = dataEnd;
      if (offset % 2 !== 0) offset++; 
    }
    return files;
  }

  // --- TAR Parser ---
  function parseTar(bytes) {
    const files = [];
    let offset = 0;
    let nextFileName = null;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      const allZeros = header.every(b => b === 0);
      if (allZeros) {
        if (offset + 1024 <= bytes.length && bytes.subarray(offset + 512, offset + 1024).every(b => b === 0)) break;
        offset += 512;
        continue;
      }

      try {
        let name = nextFileName || decoder.decode(header.subarray(0, 100)).replace(/\0/g, '').trim();
        nextFileName = null;
        
        const sizeStr = decoder.decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
        const size = parseInt(sizeStr, 8) || 0;
        const type = String.fromCharCode(header[156]);
        const mtimeStr = decoder.decode(header.subarray(136, 148)).replace(/\0/g, '').trim();
        const mtime = parseInt(mtimeStr, 8) || 0;

        const magic = decoder.decode(header.subarray(257, 263));
        if (magic.startsWith('ustar')) {
          const prefix = decoder.decode(header.subarray(345, 500)).replace(/\0/g, '').trim();
          if (prefix) name = (prefix.endsWith('/') ? prefix : prefix + '/') + name;
        }

        const dataOffset = offset + 512;
        const data = bytes.subarray(dataOffset, dataOffset + size);

        if (type === 'L') { 
          nextFileName = decoder.decode(data).replace(/\0/g, '').trim();
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
    const lines = text.split(/\r?\n/);
    const meta = {};
    let lastKey = '';
    lines.forEach(line => {
      if (line.startsWith(' ') || line.startsWith('\t')) {
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

  // --- Decompression Wrapper ---
  async function decompress(data, filename) {
    const uint8 = new Uint8Array(data);
    if (filename.endsWith('.gz')) {
      return pako.ungzip(uint8);
    }
    if (filename.endsWith('.xz')) {
      const xz = new XZDecompressor();
      return xz.decompress(uint8);
    }
    if (filename.endsWith('.zst')) {
      throw new Error('.zst compression is not supported in the browser yet.');
    }
    return uint8;
  }

  // --- Main Tool Definition ---
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.deb',
      dropLabel: 'Drop a Debian package (.deb) here',
      binary: true,
      infoHtml: '<strong>Security:</strong> All extraction and parsing is done locally in your browser.',

      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/xz-decompress@0.1.3/dist/xz-decompress.min.js');
      },

      onFile: async function (file, content, helpers) {
        helpers.showLoading('Analyzing .deb package...');
        
        try {
          // B1 & B4: Race condition check for CDN scripts
          const waitForLibs = () => new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
              if (typeof pako !== 'undefined' && typeof XZDecompressor !== 'undefined') {
                resolve();
              } else if (attempts > 50) {
                reject(new Error('Required libraries (pako/xz-decompress) failed to load. Please check your connection.'));
              } else {
                attempts++;
                setTimeout(check, 100);
              }
            };
            check();
          });
          await waitForLibs();

          // B2: Ensure content is binary
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Input is not binary data.');
          }

          const arFiles = parseAr(content);
          
          let controlEntry = null, dataEntry = null;
          for (const f of arFiles) {
            if (f.name.startsWith('control.tar')) controlEntry = f;
            if (f.name.startsWith('data.tar')) dataEntry = f;
          }

          if (!controlEntry) throw new Error('Missing control archive (control.tar.*) in .deb');
          if (!dataEntry) throw new Error('Missing data archive (data.tar.*) in .deb');

          helpers.showLoading(`Decompressing ${controlEntry.name}...`);
          const controlRaw = await decompress(controlEntry.data, controlEntry.name);
          const controlTar = parseTar(controlRaw);
          const controlFile = controlTar.find(f => f.name === './control' || f.name === 'control');
          
          let metadata = {};
          if (controlFile && controlFile.data) {
            metadata = parseControl(new TextDecoder().decode(controlFile.data));
          } else {
            throw new Error('Control file not found inside control archive');
          }

          helpers.showLoading(`Extracting file list from ${dataEntry.name}...`);
          const dataRaw = await decompress(dataEntry.data, dataEntry.name);
          const dataTar = parseTar(dataRaw);
          
          // U5: Empty state handling
          if (!dataTar.length) {
            throw new Error('The data archive appears to be empty.');
          }

          dataTar.sort((a, b) => {
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
            return a.name.localeCompare(b.name);
          });

          helpers.setState('metadata', metadata);
          helpers.setState('files', dataTar);
          helpers.setState('fileName', file.name);
          helpers.setState('fileSize', file.size);
          
          renderResult(helpers);
        } catch (err) {
          helpers.showError('Could not open .deb file', err.message || 'The file may be corrupted or in an unsupported format.');
        }
      },

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const m = h.getState().metadata;
            if (!m) return;
            const text = Object.entries(m).map(([k,v]) => `${k}: ${v}`).join('\n');
            h.copyToClipboard(text, btn);
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

  function renderResult(h) {
    const state = h.getState();
    const metadata = state.metadata;
    const files = state.files;
    const fileName = state.fileName;
    const fileSize = state.fileSize;

    const pkg = metadata.Package || 'Unknown';
    const ver = metadata.Version || 'N/A';
    const arch = metadata.Architecture || 'all';

    let html = `
      <div class="p-4 max-w-6xl mx-auto space-y-6">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.deb archive</span>
        </div>

        <!-- U9: Package Summary -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all">
            <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Package</div>
            <div class="text-lg font-bold text-brand-600 truncate" title="${escapeHtml(pkg)}">${escapeHtml(pkg)}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all">
            <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Version</div>
            <div class="text-lg font-mono text-surface-800 truncate" title="${escapeHtml(ver)}">${escapeHtml(ver)}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all">
            <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Architecture</div>
            <div class="text-lg font-mono text-surface-800">${escapeHtml(arch)}</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <!-- Metadata Card -->
            <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
              <h3 class="font-bold text-surface-800 mb-4 flex items-center gap-2">
                <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Information
              </h3>
              <div class="space-y-4">
                <div>
                  <div class="text-xs font-bold text-surface-400 uppercase tracking-tighter mb-1">Description</div>
                  <p class="text-sm text-surface-600 leading-relaxed max-h-48 overflow-y-auto pr-2">${escapeHtml(metadata.Description || 'No description available.')}</p>
                </div>
                <div class="pt-2 border-t border-surface-50 space-y-2">
                  <div class="flex justify-between text-sm">
                    <span class="text-surface-400">Maintainer</span>
                    <span class="text-surface-700 font-medium">${escapeHtml(metadata.Maintainer || 'Unknown')}</span>
                  </div>
                  <div class="flex justify-between text-sm">
                    <span class="text-surface-400">Depends</span>
                    <span class="text-surface-700 font-mono text-[11px] max-w-[200px] truncate" title="${escapeHtml(metadata.Depends || 'None')}">${escapeHtml(metadata.Depends || 'None')}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- U8: Raw View -->
            <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
              <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 flex items-center justify-between">
                <span class="text-xs font-bold text-surface-500 uppercase">Control File</span>
              </div>
              <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-64">${escapeHtml(Object.entries(metadata).map(([k,v]) => `${k}: ${v}`).join('\n'))}</pre>
            </div>
          </div>

          <!-- U7 & U10: File Explorer -->
          <div class="lg:col-span-3 rounded-xl border border-surface-200 bg-white shadow-sm flex flex-col overflow-hidden">
            <div class="px-4 py-3 bg-surface-50 border-b border-surface-200 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <h3 class="font-bold text-surface-800">Archive Contents</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${files.length} items</span>
              </div>
              <div class="relative flex-grow max-w-[180px]">
                <input type="text" id="file-search" placeholder="Search path..." class="w-full text-xs px-8 py-1.5 rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <svg class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>

            <div class="overflow-y-auto max-h-[600px] relative">
              <table class="min-w-full text-sm" id="files-table">
                <thead>
                  <tr>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Path</th>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Size</th>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-16"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${files.map((f, i) => `
                    <tr class="file-row even:bg-surface-50/30 hover:bg-brand-50 transition-colors" data-name="${escapeHtml(f.name.toLowerCase())}">
                      <td class="px-4 py-2.5 text-surface-700 flex items-center gap-2 overflow-hidden">
                        <span class="flex-shrink-0 text-base">${f.isDir ? '📁' : '📄'}</span>
                        <span class="truncate font-mono text-[11px] text-surface-600" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                      </td>
                      <td class="px-4 py-2.5 text-surface-500 text-right text-[11px] font-mono whitespace-nowrap">
                        ${f.isDir ? '-' : formatSize(f.size)}
                      </td>
                      <td class="px-4 py-2.5 text-center">
                        ${f.isDir ? '' : `<button class="dl-btn p-1.5 text-brand-600 hover:bg-brand-100 rounded-lg transition-colors" data-idx="${i}">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </button>`}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div id="no-results" class="hidden p-12 text-center">
                <div class="text-surface-400 text-sm mb-1 italic">No matching files found.</div>
                <div class="text-xs text-surface-300">Try a different search term.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const el = h.getRenderEl();

    // Event: Download/Extract
    el.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        const f = files[idx];
        if (f && f.data) {
          const nameParts = f.name.split('/');
          h.download(nameParts[nameParts.length - 1] || 'extracted-file', f.data);
        }
      });
    });

    // Event: Live Filter
    const searchInput = el.querySelector('#file-search');
    const rows = el.querySelectorAll('.file-row');
    const noResults = el.querySelector('#no-results');
    
    searchInput.addEventListener('input', function() {
      const q = this.value.toLowerCase().trim();
      let visibleCount = 0;
      rows.forEach(row => {
        const match = row.dataset.name.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
      noResults.classList.toggle('hidden', visibleCount > 0);
    });
  }

})();
