/**
 * OmniOpener — XZ Opener Tool (Production Perfect)
 * A high-performance .xz and .tar.xz explorer.
 * Uses xz-decompress for decompression and a robust TAR parser.
 */
(function() {
  'use strict';

  // --- Utilities ---
  
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Robust TAR parser for POSIX/ustar/GNU formats.
   */
  function parseTar(bytes) {
    const files = [];
    let offset = 0;
    let nextFileName = null;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      
      // End of archive: two null blocks
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512;
        continue;
      }

      try {
        // Read name
        let name = nextFileName || decoder.decode(header.subarray(0, 100)).split('\0')[0];
        nextFileName = null;

        // Read size (12 bytes octal)
        const sizeStr = decoder.decode(header.subarray(124, 136)).split('\0')[0].trim();
        const size = parseInt(sizeStr, 8) || 0;

        // Read type flag
        const type = String.fromCharCode(header[156]);

        // Read mtime (12 bytes octal)
        const mtimeStr = decoder.decode(header.subarray(136, 148)).split('\0')[0].trim();
        const mtime = parseInt(mtimeStr, 8) || 0;

        // Check for ustar prefix
        const magic = decoder.decode(header.subarray(257, 263));
        if (magic.startsWith('ustar')) {
          const prefix = decoder.decode(header.subarray(345, 500)).split('\0')[0];
          if (prefix) {
            name = (prefix.endsWith('/') ? prefix : prefix + '/') + name;
          }
        }

        const dataOffset = offset + 512;
        const data = bytes.subarray(dataOffset, dataOffset + size);

        if (type === 'L') {
          // GNU Long Name extension
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

        // Move offset: 512 (header) + size padded to 512-byte blocks
        offset += 512 + Math.ceil(size / 512) * 512;
      } catch (err) {
        console.error('Tar parse error at offset', offset, err);
        break;
      }
    }
    return files;
  }

  // --- Tool Implementation ---

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xz',
      dropLabel: 'Drop a .xz or .tar.xz file here',
      binary: true,
      
      onInit: function(helpers) {
        // Load decompression library
        helpers.loadScript('https://cdn.jsdelivr.net/npm/xz-decompress@0.1.3/dist/xz-decompress.min.js');
      },

      onFile: async function(file, content, helpers) {
        helpers.showLoading('Loading decompression engine...');

        // B1: Robust ready check for CDN script
        if (typeof XZDecompressor === 'undefined') {
          try {
            await new Promise((resolve, reject) => {
              let attempts = 0;
              const check = setInterval(() => {
                if (typeof XZDecompressor !== 'undefined') {
                  clearInterval(check);
                  resolve();
                } else if (attempts++ > 100) {
                  clearInterval(check);
                  reject(new Error('Decompression engine took too long to load.'));
                }
              }, 100);
            });
          } catch (err) {
            helpers.showError('Engine Load Timeout', 'The decompression library failed to initialize. Please check your connection.');
            return;
          }
        }

        try {
          helpers.showLoading('Decompressing XZ archive...');
          
          // Use a small delay to allow UI to show loading state if file is huge
          await new Promise(r => setTimeout(r, 50));

          const uint8 = new Uint8Array(content);
          const decompressor = new XZDecompressor();
          const decompressed = decompressor.decompress(uint8);
          
          helpers.setState('decompressed', decompressed);

          // U2: Descriptive loading message
          helpers.showLoading('Analyzing contents...');

          // Detect if it's a TAR
          const decoder = new TextDecoder();
          // Check for ustar magic at offset 257
          const magic = decompressed.length > 262 ? decoder.decode(decompressed.subarray(257, 262)) : '';
          
          let files = [];
          if (magic === 'ustar') {
            files = parseTar(decompressed);
          } else {
            // Single file decompression
            const fileName = file.name.replace(/\.xz$/i, '') || 'decompressed_file';
            files = [{
              name: fileName,
              size: decompressed.length,
              mtime: new Date(file.lastModified),
              isDir: false,
              data: decompressed
            }];
          }

          if (files.length === 0) {
            helpers.showError('Empty Archive', 'The XZ file was decompressed successfully but contains no data or recognizable files.');
            return;
          }

          // Initial Sort: Dirs first, then name
          files.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          helpers.setState('files', files);
          helpers.setState('filteredFiles', files);
          helpers.setState('sortCol', 'name');
          helpers.setState('sortDir', 1);
          helpers.setState('searchQuery', '');

          renderApp(file, helpers);

        } catch (err) {
          console.error('[XZ] Error:', err);
          // U3: Friendly error message
          helpers.showError(
            'Could not open XZ file', 
            'This file may be corrupted, use an unsupported XZ variant, or exceed memory limits. ' + (err.message || '')
          );
        }
      },

      actions: [
        {
          label: '📋 Copy List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const files = helpers.getState().files;
            if (!files || files.length === 0) return;
            const list = files.map(f => `${f.isDir ? '[DIR] ' : '[FILE]'} ${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function(helpers) {
            const files = helpers.getState().files;
            if (!files || files.length === 0) return;
            const csv = 'Name,Type,Size,Modified\n' + 
              files.map(f => `"${f.name.replace(/"/g, '""')}",${f.isDir ? 'Directory' : 'File'},${f.size},"${f.mtime ? f.mtime.toISOString() : ''}"`).join('\n');
            helpers.download('archive-inventory.csv', csv, 'text/csv');
          }
        }
      ],
      infoHtml: '<strong>Security:</strong> All decompression happens locally in your browser. No data is sent to any server.'
    });
  };

  function renderApp(file, helpers) {
    const state = helpers.getState();
    const { files, filteredFiles, decompressed, sortCol, sortDir, searchQuery } = state;
    
    // U1: File info bar
    const infoBarHtml = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)} compressed</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">${formatSize(decompressed.length)} uncompressed</span>
        <span class="text-surface-300">|</span>
        <span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${files.length} items</span>
      </div>
    `;

    // Search and Header
    const controlsHtml = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div class="relative flex-1 max-w-md">
          <input 
            type="text" 
            id="xz-search" 
            placeholder="Search filenames or paths..." 
            value="${escapeHtml(searchQuery)}"
            class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
          >
          <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </span>
        </div>
      </div>
    `;

    // U7: Table UI
    const tableHtml = `
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
        <table class="min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="name">
                Name ${sortCol === 'name' ? (sortDir === 1 ? '▲' : '▼') : ''}
              </th>
              <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-24" data-sort="size">
                Size ${sortCol === 'size' ? (sortDir === 1 ? '▲' : '▼') : ''}
              </th>
              <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-44" data-sort="mtime">
                Modified ${sortCol === 'mtime' ? (sortDir === 1 ? '▲' : '▼') : ''}
              </th>
              <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-24">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            ${filteredFiles.length === 0 ? `
              <tr>
                <td colspan="4" class="px-4 py-20 text-center text-surface-400">
                  <div class="flex flex-col items-center gap-2">
                    <svg class="w-12 h-12 text-surface-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <p class="font-medium text-surface-600">No matching files found</p>
                    <p class="text-xs">Try a different search term or clear the filter.</p>
                  </div>
                </td>
              </tr>
            ` : filteredFiles.slice(0, 500).map((f, i) => `
              <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100">
                  <div class="flex items-center gap-3 overflow-hidden">
                    <span class="flex-shrink-0 text-lg">${f.isDir ? '📁' : getFileIcon(f.name)}</span>
                    <span class="truncate font-mono text-xs" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                  </div>
                </td>
                <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 text-right font-mono text-xs whitespace-nowrap">
                  ${f.isDir ? '-' : formatSize(f.size)}
                </td>
                <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 text-right text-xs whitespace-nowrap">
                  ${f.mtime ? f.mtime.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                </td>
                <td class="px-4 py-2.5 border-b border-surface-100 text-center">
                  ${f.isDir ? '' : `
                    <button class="dl-btn text-brand-600 hover:text-brand-700 font-semibold text-xs px-2.5 py-1.5 rounded-lg border border-brand-100 hover:bg-brand-50 hover:border-brand-200 transition-all" data-idx="${i}">
                      Extract
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
            ${filteredFiles.length > 500 ? `
              <tr>
                <td colspan="4" class="px-4 py-3 text-center text-surface-400 bg-surface-50 text-xs italic">
                  Showing first 500 results. Use search to find specific files.
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;

    helpers.render(`
      <div class="p-4 max-w-6xl mx-auto">
        ${infoBarHtml}
        ${controlsHtml}
        ${tableHtml}
      </div>
    `);

    // --- Event Listeners ---

    const renderEl = helpers.getRenderEl();

    // Search
    const searchInput = renderEl.querySelector('#xz-search');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      helpers.setState('searchQuery', query);
      filterAndSortFiles(helpers);
      renderApp(file, helpers);
      // Restore focus and cursor position
      const newSearch = helpers.getRenderEl().querySelector('#xz-search');
      newSearch.focus();
      newSearch.setSelectionRange(query.length, query.length);
    });

    // Sorting
    renderEl.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        let dir = 1;
        if (state.sortCol === col) dir = state.sortDir * -1;
        
        helpers.setState('sortCol', col);
        helpers.setState('sortDir', dir);
        
        filterAndSortFiles(helpers);
        renderApp(file, helpers);
      });
    });

    // Individual Download
    renderEl.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.idx);
        const entry = filteredFiles[idx];
        if (!entry || !entry.data) return;

        const blob = new Blob([entry.data], { type: 'application/octet-stream' });
        const parts = entry.name.split('/');
        const filename = parts[parts.length - 1] || 'extracted-file';
        helpers.download(filename, blob);
      });
    });
  }

  function filterAndSortFiles(helpers) {
    const { files, searchQuery, sortCol, sortDir } = helpers.getState();
    
    // Filter
    let filtered = files;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = files.filter(f => f.name.toLowerCase().includes(q));
    }

    // Sort
    filtered.sort((a, b) => {
      // Directories always come first
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;

      let valA = a[sortCol];
      let valB = b[sortCol];

      if (sortCol === 'name') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      } else if (sortCol === 'mtime') {
        valA = valA ? valA.getTime() : 0;
        valB = valB ? valB.getTime() : 0;
      }

      if (valA < valB) return -1 * sortDir;
      if (valA > valB) return 1 * sortDir;
      return 0;
    });

    helpers.setState('filteredFiles', filtered);
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = {
      'pdf': '📄',
      'doc': '📝', 'docx': '📝',
      'xls': '📊', 'xlsx': '📊',
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
      'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
      'mp4': '🎬', 'mov': '🎬', 'avi': '🎬', 'webm': '🎬',
      'zip': '📦', 'tar': '📦', 'gz': '📦', '7z': '📦', 'rar': '📦',
      'js': '📜', 'ts': '📜', 'py': '📜', 'c': '📜', 'cpp': '📜', 'h': '📜', 'java': '📜', 'go': '📜', 'rs': '📜',
      'json': '🔑', 'xml': '🔑', 'yaml': '🔑', 'yml': '🔑',
      'txt': '📄', 'md': '📄', 'log': '📄'
    };
    return map[ext] || '📄';
  }

})();
