(function() {
  'use strict';

  /**
   * OmniOpener BZ2 Tool
   * A production-grade .bz2 and .tar.bz2 explorer.
   */

  const CONFIG = {
    MAX_UI_FILES: 1000,
    PREVIEW_SIZE: 10 * 1024, // 10KB
    TEXT_EXTENSIONS: ['txt', 'md', 'json', 'xml', 'csv', 'log', 'js', 'css', 'html', 'py', 'sh', 'yml', 'yaml'],
    IMAGE_EXTENSIONS: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
  };

  // --- Utilities ---

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getFileExt(name) {
    return name.split('.').pop().toLowerCase();
  }

  /**
   * Robust TAR parser
   */
  function parseTar(bytes) {
    const files = [];
    let offset = 0;
    let nextFileName = null;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      
      // End of archive check
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
          if (prefix && !nextFileName) {
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
            data: isDir ? null : data,
            type: type
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

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.bz2',
      dropLabel: 'Drop a .bz2 or .tar.bz2 file',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/gh/antimatter15/bzip2.js@master/bzip2.js');
      },

      onFile: async function(file, content, helpers) {
        helpers.showLoading('Decompressing BZ2 archive...');

        // Verify script is loaded
        if (typeof bzip2 === 'undefined') {
          await new Promise(resolve => helpers.loadScript('https://cdn.jsdelivr.net/gh/antimatter15/bzip2.js@master/bzip2.js', resolve));
        }

        try {
          // bzip2.js works on a 'reader' created from Uint8Array
          const uint8 = new Uint8Array(content);
          const reader = bzip2.array(uint8);
          
          // Note: bzip2.simple returns a binary string. 
          // For large files, we might want to use a chunked approach, but bzip2.js is limited.
          const decompressedStr = bzip2.simple(reader);
          
          // Convert binary string to Uint8Array safely
          const decompressed = new Uint8Array(decompressedStr.length);
          for (let i = 0; i < decompressedStr.length; i++) {
            decompressed[i] = decompressedStr.charCodeAt(i) & 0xff;
          }

          helpers.setState('decompressed', decompressed);

          // Detect if it's a TAR
          const decoder = new TextDecoder();
          const magic = decoder.decode(decompressed.subarray(257, 262));
          let files = [];

          if (magic === 'ustar') {
            helpers.showLoading('Analyzing TAR contents...');
            files = parseTar(decompressed);
          } else {
            // Single file decompression
            const fileName = file.name.replace(/\.bz2$/i, '') || 'decompressed_file';
            files = [{
              name: fileName,
              size: decompressed.length,
              mtime: new Date(file.lastModified),
              isDir: false,
              data: decompressed
            }];
          }

          helpers.setState('files', files);
          helpers.setState('filteredFiles', files);
          helpers.setState('sortCol', 'name');
          helpers.setState('sortDir', 1);

          renderApp(file, helpers);

        } catch (err) {
          console.error('[BZ2] Error:', err);
          helpers.showError('Decompression Failed', 'The BZ2 file might be corrupted or use an unsupported compression feature.');
        }
      },

      actions: [
        {
          label: '📥 Download Decompressed',
          id: 'dl-raw',
          onClick: function(helpers) {
            const data = helpers.getState().decompressed;
            if (data) {
              const name = helpers.getFile().name.replace(/\.bz2$/i, '') || 'unpacked';
              helpers.download(name, data);
            }
          }
        },
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const files = helpers.getState().files;
            if (!files) return;
            const text = files.map(f => `${f.isDir ? '[DIR]' : '[FILE]'} ${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        }
      ]
    });
  };

  function renderApp(file, helpers) {
    const { files, filteredFiles, decompressed, sortCol, sortDir } = helpers.getState();

    if (!files || files.length === 0) {
      helpers.render(`
        <div class="text-center py-12">
          <div class="text-surface-400 mb-4">
            <svg class="w-16 h-16 mx-auto opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
          </div>
          <h3 class="text-lg font-medium text-surface-900">Archive is empty</h3>
          <p class="text-surface-500">This BZ2 file contains no valid data or files.</p>
        </div>
      `);
      return;
    }

    const html = `
      <div class="space-y-4">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)} (Compressed)</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(decompressed.length)} (Uncompressed)</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${files.length} items</span>
        </div>

        <!-- Search and Stats -->
        <div class="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div class="relative w-full sm:max-w-xs">
            <input type="text" id="bz2-search" placeholder="Search files..." 
              class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              value="${helpers.getState().searchQuery || ''}">
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-surface-500 uppercase tracking-wider">Sort by:</span>
            <select id="bz2-sort" class="text-xs border-none bg-transparent font-semibold text-brand-600 focus:ring-0 cursor-pointer">
              <option value="name" ${sortCol === 'name' ? 'selected' : ''}>Name</option>
              <option value="size" ${sortCol === 'size' ? 'selected' : ''}>Size</option>
              <option value="mtime" ${sortCol === 'mtime' ? 'selected' : ''}>Date</option>
            </select>
          </div>
        </div>

        <!-- U7: Table -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
          <table class="min-w-full text-sm text-left">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700">File Path</th>
                <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700 w-32 text-right">Size</th>
                <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700 w-48 text-right">Modified</th>
                <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700 w-32 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${filteredFiles.slice(0, CONFIG.MAX_UI_FILES).map((f, i) => `
                <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-3 font-mono text-xs text-surface-700 break-all">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">${f.isDir ? '📁' : '📄'}</span>
                      <span class="group-hover:text-brand-700 transition-colors">${escapeHtml(f.name)}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-surface-500 text-right whitespace-nowrap">
                    ${f.isDir ? '-' : formatSize(f.size)}
                  </td>
                  <td class="px-4 py-3 text-surface-500 text-right whitespace-nowrap">
                    ${f.mtime ? f.mtime.toLocaleString() : '-'}
                  </td>
                  <td class="px-4 py-3 text-center whitespace-nowrap">
                    ${f.isDir ? '' : `
                      <button class="dl-single-btn px-3 py-1 bg-white border border-surface-200 rounded shadow-sm hover:border-brand-300 hover:text-brand-600 transition-all text-xs font-medium" data-idx="${i}">
                        Download
                      </button>
                    `}
                  </td>
                </tr>
              `).join('')}
              ${filteredFiles.length > CONFIG.MAX_UI_FILES ? `
                <tr>
                  <td colspan="4" class="px-4 py-4 text-center text-surface-400 italic bg-surface-50">
                    Showing first ${CONFIG.MAX_UI_FILES} of ${filteredFiles.length} files. Use search to find others.
                  </td>
                </tr>
              ` : ''}
              ${filteredFiles.length === 0 ? `
                <tr>
                  <td colspan="4" class="px-4 py-12 text-center text-surface-400">
                    No files match your search criteria.
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    helpers.render(html);

    // --- Event Listeners ---

    const searchInput = helpers.getRenderEl().querySelector('#bz2-search');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      helpers.setState('searchQuery', query);
      const filtered = files.filter(f => f.name.toLowerCase().includes(query));
      helpers.setState('filteredFiles', filtered);
      renderApp(file, helpers);
      // Refocus search
      const newSearch = helpers.getRenderEl().querySelector('#bz2-search');
      newSearch.focus();
      newSearch.setSelectionRange(query.length, query.length);
    });

    const sortSelect = helpers.getRenderEl().querySelector('#bz2-sort');
    sortSelect.addEventListener('change', (e) => {
      const col = e.target.value;
      let dir = helpers.getState().sortDir;
      if (helpers.getState().sortCol === col) {
        dir *= -1;
      } else {
        dir = 1;
      }
      helpers.setState('sortCol', col);
      helpers.setState('sortDir', dir);
      
      const sorted = [...filteredFiles].sort((a, b) => {
        let valA = a[col];
        let valB = b[col];
        if (col === 'name') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
      helpers.setState('filteredFiles', sorted);
      renderApp(file, helpers);
    });

    helpers.getRenderEl().querySelectorAll('.dl-single-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        const f = filteredFiles[idx];
        if (f && f.data) {
          const name = f.name.split('/').pop() || 'file';
          helpers.download(name, f.data);
        }
      });
    });
  }

})();
