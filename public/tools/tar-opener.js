(function () {
  'use strict';

  /**
   * Senior Staff Engineer Edition: Tar Opener
   * A high-performance, browser-native TAR/TGZ explorer.
   */

  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(ext)) return '🖼️';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return '🎵';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'php', 'html', 'css', 'json', 'xml', 'md', 'yaml', 'toml', 'sql'].includes(ext)) return '📜';
    if (['pdf'].includes(ext)) return '📕';
    if (['exe', 'dll', 'so', 'dylib', 'bin'].includes(ext)) return '⚙️';
    if (['zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'tgz'].includes(ext)) return '📦';
    return '📄';
  }

  /**
   * Robust TAR parser for POSIX/ustar/GNU formats.
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    let nextFileName = null;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      
      // Check for end of archive (two 512-byte blocks of zeros)
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512;
        continue;
      }

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
        if (prefix && !nextFileName) {
          name = prefix + (prefix.endsWith('/') ? '' : '/') + name;
        }
      }

      const contentOffset = offset + 512;
      const data = bytes.subarray(contentOffset, contentOffset + size);

      if (type === 'L') {
        // GNU Long Link
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
    }
    return files;
  }

  function generateHexDump(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    const limit = 4096;
    const len = Math.min(bytes.length, limit);
    for (let i = 0; i < len; i += 16) {
      let line = i.toString(16).padStart(8, '0') + '  ';
      let ascii = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < len) {
          const b = bytes[i + j];
          line += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          line += '   ';
        }
        if (j === 7) line += ' ';
      }
      out += line + ' |' + ascii + '|\n';
    }
    if (bytes.length > limit) out += '\n... (truncated for preview)';
    return out;
  }

  window.initTool = function (toolConfig, mountEl) {
    let _lastUrl = null;

    function revoke() {
      if (_lastUrl) {
        URL.revokeObjectURL(_lastUrl);
        _lastUrl = null;
      }
    }

    const _renderTar = function _renderFn(h) {
      const state = h.getState();
      const files = state.tarFiles || [];
      const searchTerm = (state.searchTerm || '').toLowerCase();
      const sortCol = state.sortCol || 'name';
      const sortDir = state.sortDir || 'asc';

      let filtered = searchTerm 
        ? files.filter(f => f.name.toLowerCase().includes(searchTerm))
        : [...files];

      // Sorting Logic
      filtered.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];
        
        if (sortCol === 'name') {
          // Keep directories at top if sorting by name
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });

      const html = `
        <div class="p-6 max-w-6xl mx-auto">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${state.isGzip ? '.tar.gz (Gzipped TAR)' : '.tar archive'}</span>
            ${state.totalUncompressedSize ? `
              <span class="text-surface-300">|</span>
              <span class="text-brand-600 font-medium">Extracted: ${formatSize(state.totalUncompressedSize)}</span>
            ` : ''}
          </div>

          <!-- U10. Section header with count -->
          <div class="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-surface-800">Archive Entries</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">${files.length} items</span>
            </div>
            
            <div class="relative group">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">🔍</span>
              <input 
                type="text" 
                id="tar-search" 
                placeholder="Search archive contents..." 
                value="${esc(state.searchTerm)}"
                class="w-full md:w-80 pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none shadow-sm"
              >
            </div>
          </div>

          <!-- U7. Beautiful Tables -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/50">
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors sort-header" data-col="name">
                    Name ${sortCol === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32 cursor-pointer hover:bg-surface-100 transition-colors sort-header" data-col="size">
                    Size ${sortCol === 'size' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filtered.map((f) => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group cursor-pointer tar-entry-row" data-name="${esc(f.name)}">
                    <td class="px-4 py-2.5 text-surface-700 font-mono text-xs truncate max-w-lg">
                      <span class="mr-2 inline-block w-5 text-center transition-transform group-hover:scale-110">${f.isDir ? '📁' : getFileIcon(f.name)}</span>
                      <span class="${f.isDir ? 'font-bold text-surface-900' : ''}">${esc(f.name)}</span>
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 whitespace-nowrap tabular-nums">
                      ${f.isDir ? '<span class="text-surface-300">—</span>' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      <div class="flex items-center justify-end gap-1">
                        ${f.isDir ? '' : `
                          <button class="preview-entry-btn text-brand-600 hover:text-brand-700 font-semibold px-2 py-1 rounded-lg hover:bg-brand-100 transition-colors text-xs" data-name="${esc(f.name)}">Preview</button>
                          <button class="dl-entry-btn p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-lg transition-all" data-name="${esc(f.name)}" title="Download entry">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12 a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${filtered.length === 0 ? `
              <div class="py-20 text-center bg-white">
                <div class="text-5xl mb-4 opacity-20">📦</div>
                <h4 class="text-surface-800 font-medium mb-1">${files.length === 0 ? 'Empty Archive' : 'No matches found'}</h4>
                <p class="text-surface-500 text-xs">${files.length === 0 ? 'This TAR file has no entries.' : 'Try a different search term.'}</p>
              </div>
            ` : ''}
          </div>

          <!-- Preview Modal -->
          <div id="tar-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 bg-surface-950/40 backdrop-blur-[2px]">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-surface-200">
              <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/80 backdrop-blur">
                <div class="flex items-center gap-4 overflow-hidden">
                  <span id="modal-icon" class="text-3xl"></span>
                  <div class="overflow-hidden">
                    <h4 id="modal-filename" class="text-sm font-bold text-surface-900 truncate"></h4>
                    <p id="modal-meta" class="text-[10px] text-surface-500 font-bold uppercase tracking-widest"></p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button id="modal-copy" class="hidden px-4 py-1.5 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-xl transition-all">Copy Content</button>
                  <button id="modal-close" class="p-2 text-surface-400 hover:text-surface-900 hover:bg-surface-200 rounded-full transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
              </div>
              <div id="modal-body" class="flex-1 overflow-auto bg-white min-h-[400px]"></div>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      // Search Persistence
      const search = document.getElementById('tar-search');
      if (search) {
        search.addEventListener('input', (e) => {
          h.setState('searchTerm', e.target.value);
          _renderFn(h);
          const input = document.getElementById('tar-search');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        });
      }

      // Sorting Listeners
      const mount = h.getRenderEl();
      mount.querySelectorAll('.sort-header').forEach(header => {
        header.onclick = () => {
          const col = header.dataset.col;
          const currentDir = state.sortDir || 'asc';
          const newDir = (state.sortCol === col && currentDir === 'asc') ? 'desc' : 'asc';
          h.setState({ sortCol: col, sortDir: newDir });
          _renderFn(h);
        };
      });

      // Entry Actions
      const openPreview = (name) => {
        const file = files.find(f => f.name === name);
        if (file && !file.isDir) showPreview(file, h);
      };

      mount.querySelectorAll('.tar-entry-row').forEach(row => {
        row.onclick = () => openPreview(row.dataset.name);
      });

      mount.querySelectorAll('.preview-entry-btn').forEach(btn => {
        btn.onclick = (e) => { e.stopPropagation(); openPreview(btn.dataset.name); };
      });

      mount.querySelectorAll('.dl-entry-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const file = files.find(f => f.name === btn.dataset.name);
          if (file) h.download(file.name.split('/').pop(), file.data);
        };
      });
    };

    const showPreview = (file, h) => {
      const modal = document.getElementById('tar-modal');
      const body = document.getElementById('modal-body');
      const filename = document.getElementById('modal-filename');
      const meta = document.getElementById('modal-meta');
      const icon = document.getElementById('modal-icon');
      const copy = document.getElementById('modal-copy');
      const close = document.getElementById('modal-close');

      if (!modal || !body) return;

      revoke();
      modal.classList.remove('hidden');
      filename.textContent = file.name;
      meta.textContent = `${formatSize(file.size)} • Extracted Entry`;
      icon.textContent = getFileIcon(file.name);
      copy.classList.add('hidden');
      body.innerHTML = '';

      const hide = () => {
        modal.classList.add('hidden');
        body.innerHTML = '';
        revoke();
      };

      close.onclick = hide;
      modal.onclick = (e) => { if (e.target === modal) hide(); };

      const ext = file.name.split('.').pop().toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'avif'].includes(ext);

      if (isImage) {
        const blob = new Blob([file.data]);
        const url = URL.createObjectURL(blob);
        _lastUrl = url;
        body.innerHTML = `
          <div class="flex items-center justify-center p-12 h-full bg-surface-50/50">
            <img src="${url}" class="max-w-full max-h-[70vh] object-contain shadow-2xl rounded-xl border border-surface-200 bg-white">
          </div>`;
      } else {
        const text = new TextDecoder().decode(file.data);
        const isBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1024));
        
        if (isBinary) {
          // U8. Code/pre block
          body.innerHTML = `
            <div class="h-full bg-gray-950 overflow-hidden">
              <pre class="p-6 text-[11px] font-mono text-blue-400 overflow-x-auto leading-relaxed h-full select-all">${generateHexDump(file.data)}</pre>
            </div>`;
        } else {
          // U8. Code/pre block
          body.innerHTML = `
            <div class="h-full bg-gray-900 overflow-hidden">
              <pre class="p-8 text-sm font-mono text-gray-100 overflow-x-auto leading-relaxed h-full select-all">${esc(text)}</pre>
            </div>`;
          copy.classList.remove('hidden');
          copy.onclick = (e) => h.copyToClipboard(text, e.target);
        }
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.tar,.tgz,.tar.gz',
      binary: true,
      dropLabel: 'Drop a .tar or .tgz file here',
      infoHtml: 'Secure browser-side extraction. No data ever leaves your device.',

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
          'https://cdn.jsdelivr.net/npm/fflate@0.8.2/lib/browser.min.js'
        ]);
      },

      onDestroy: function () {
        revoke();
      },

      onFile: function _onFileFn(file, content, h) {
        revoke(); // B5. Revoke any existing object URLs on new file load
        h.showLoading('Reading archive structure...');
        
        const checkLibraries = () => {
          if (typeof pako === 'undefined' || typeof fflate === 'undefined') {
            setTimeout(checkLibraries, 50);
            return;
          }

          try {
            let data = new Uint8Array(content);
            let isGzip = false;
            
            // B1. Handle GZIP if detected (0x1f 0x8b magic)
            if (data[0] === 0x1f && data[1] === 0x8b) {
              isGzip = true;
              h.showLoading('Decompressing GZIP stream...');
              data = pako.ungzip(data);
            }

            h.showLoading('Parsing TAR entries...');
            const files = parseTar(data.buffer);
            
            if (!files || files.length === 0) {
              return h.showError('Empty Archive', 'The TAR file contains no valid entries.');
            }

            let totalUncompressedSize = 0;
            files.forEach(f => { if (!f.isDir) totalUncompressedSize += f.size; });

            h.setState({
              tarFiles: files,
              fileName: file.name,
              fileSize: file.size,
              isGzip: isGzip,
              totalUncompressedSize: totalUncompressedSize,
              searchTerm: '',
              sortCol: 'name',
              sortDir: 'asc'
            });

            _renderTar(h);
            h.showLoading(false);
          } catch (e) {
            console.error('[TarOpener] Parsing error:', e);
            h.showError('Failed to open archive', 'The file may be corrupted, or uses an unsupported compression variant. Only standard TAR and GZIP-TAR are supported.');
          }
        };

        checkLibraries();
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.tarFiles) return;
            const list = state.tarFiles.map(f => f.name).join('\n');
            h.copyToClipboard(list, btn);
          }
        },
        {
          label: '📦 Convert to ZIP',
          id: 'convert-zip',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.tarFiles || typeof fflate === 'undefined') return;
            
            h.showLoading('Preparing ZIP archive...');
            
            // Use setTimeout to allow UI to update
            setTimeout(() => {
              try {
                const zipData = {};
                let filesIncluded = 0;
                
                state.tarFiles.forEach(f => {
                  if (!f.isDir && f.data) {
                    zipData[f.name] = f.data;
                    filesIncluded++;
                  }
                });

                if (filesIncluded === 0) {
                  h.showError('No files to compress', 'The archive only contains directories.');
                  return;
                }

                const zipped = fflate.zipSync(zipData);
                const zipName = state.fileName.replace(/\.tar(\.gz)?$/i, '') + '.zip';
                h.download(zipName, zipped, 'application/zip');
                h.showLoading(false);
              } catch (e) {
                h.showError('Conversion failed', 'An error occurred during ZIP creation: ' + e.message);
              }
            }, 50);
          }
        }
      ]
    });
  };
})();
