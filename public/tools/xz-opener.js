/**
 * OmniOpener — XZ Opener Tool
 * A high-performance browser-based explorer for .xz and .tar.xz archives.
 */
(function() {
  'use strict';

  // --- Utility: Formatters & Sanitizers ---
  
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
   * Robust TAR parser for POSIX/ustar formats.
   * Handles GNU Long Name extensions.
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
        let name = nextFileName || decoder.decode(header.subarray(0, 100)).replace(/\0/g, '').trim();
        nextFileName = null;

        // Read size (12 bytes octal)
        const sizeStr = decoder.decode(header.subarray(124, 136)).replace(/\0/g, '').trim();
        const size = parseInt(sizeStr, 8) || 0;

        // Read type flag
        const type = String.fromCharCode(header[156]);

        // Read mtime (12 bytes octal)
        const mtimeStr = decoder.decode(header.subarray(136, 148)).replace(/\0/g, '').trim();
        const mtime = parseInt(mtimeStr, 8) || 0;

        // Check for ustar prefix
        const magic = decoder.decode(header.subarray(257, 263));
        if (magic.startsWith('ustar')) {
          const prefix = decoder.decode(header.subarray(345, 500)).replace(/\0/g, '').trim();
          if (prefix) {
            name = (prefix.endsWith('/') ? prefix : prefix + '/') + name;
          }
        }

        const dataOffset = offset + 512;
        const data = bytes.subarray(dataOffset, dataOffset + size);

        if (type === 'L') {
          // GNU Long Name extension
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
      } catch (err) {
        console.error('[XZ] Tar parse error:', err);
        break;
      }
    }
    return files;
  }

  // --- Tool Logic ---

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xz',
      dropLabel: 'Drop a .xz or .tar.xz file here',
      binary: true,
      
      onInit: function(helpers) {
        // B4: Load library
        helpers.loadScript('https://cdn.jsdelivr.net/npm/xz-decompress@0.1.3/dist/xz-decompress.min.js');
      },

      onFile: async function(file, content, helpers) {
        // B1: Race condition check for CDN script
        if (typeof XZDecompressor === 'undefined') {
          helpers.showLoading('Initializing decompression engine...');
          await new Promise((resolve) => {
            const check = setInterval(() => {
              if (typeof XZDecompressor !== 'undefined') {
                clearInterval(check);
                resolve();
              }
            }, 50);
            setTimeout(() => { clearInterval(check); resolve(); }, 5000);
          });
        }

        if (typeof XZDecompressor === 'undefined') {
          helpers.showError('Engine Load Failure', 'The decompression library could not be loaded. Please check your internet connection.');
          return;
        }

        try {
          // U6: Loading state
          helpers.showLoading('Decompressing XZ archive...');
          
          // B2: Content is ArrayBuffer (binary:true)
          const uint8 = new Uint8Array(content);
          const decompressor = new XZDecompressor();
          const decompressed = decompressor.decompress(uint8);
          
          if (!decompressed || decompressed.length === 0) {
            throw new Error('Decompression resulted in empty output.');
          }

          helpers.showLoading('Analyzing contents...');

          // Detect if it's a TAR or a single file
          const decoder = new TextDecoder();
          // TAR magic 'ustar' is at offset 257
          const magic = decompressed.length > 262 ? decoder.decode(decompressed.subarray(257, 262)) : '';
          
          let files = [];
          if (magic === 'ustar') {
            files = parseTar(decompressed);
          } else {
            // Single file decompression (usually file.name minus .xz)
            const baseName = file.name.replace(/\.xz$/i, '') || 'decompressed_content';
            files = [{
              name: baseName,
              size: decompressed.length,
              mtime: new Date(file.lastModified),
              isDir: false,
              data: decompressed
            }];
          }

          if (files.length === 0) {
            helpers.showError('Empty Archive', 'No files were found inside the decompressed XZ container.');
            return;
          }

          // Initial sort: Directories first, then alphabetical
          files.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          // State setup
          helpers.setState('originalFile', file);
          helpers.setState('decompressedSize', decompressed.length);
          helpers.setState('allFiles', files);
          helpers.setState('searchQuery', '');
          helpers.setState('sortCol', 'name');
          helpers.setState('sortDir', 1);
          helpers.setState('previewFile', null);

          applyFiltersAndSort(helpers);
          renderApp(helpers);

        } catch (err) {
          console.error('[XZ] Error:', err);
          // U3: Friendly error message
          helpers.showError(
            'Could not decompress file',
            'This file might be corrupted, password-protected (unsupported), or use an incompatible compression profile. ' + (err.message || '')
          );
        }
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const files = helpers.getState().allFiles;
            if (!files) return;
            const text = files.map(f => `${f.isDir ? '[DIR]' : '[FILE]'} ${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Inventory',
          id: 'dl-inventory',
          onClick: function(helpers) {
            const files = helpers.getState().allFiles;
            if (!files) return;
            const csv = 'Name,Type,Size,Modified\n' + 
              files.map(f => `"${f.name.replace(/"/g, '""')}",${f.isDir ? 'DIR' : 'FILE'},${f.size},"${f.mtime ? f.mtime.toISOString() : ''}"`).join('\n');
            helpers.download('archive-inventory.csv', csv, 'text/csv');
          }
        }
      ]
    });
  };

  function applyFiltersAndSort(helpers) {
    const state = helpers.getState();
    const { allFiles, searchQuery, sortCol, sortDir } = state;

    let filtered = allFiles;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = allFiles.filter(f => f.name.toLowerCase().includes(q));
    }

    filtered.sort((a, b) => {
      // Dirs first
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

  function renderApp(helpers) {
    const state = helpers.getState();
    if (state.previewFile) {
      renderPreview(helpers);
      return;
    }

    const { originalFile, decompressedSize, allFiles, filteredFiles, searchQuery, sortCol, sortDir } = state;

    // U1: File info bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
        <span class="font-semibold text-surface-800">${escapeHtml(originalFile.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(originalFile.size)} compressed</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(decompressedSize)} uncompressed</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">${allFiles.length} items</span>
      </div>
    `;

    // U10: Section header & Search (ARCHIVES requirement)
    const controls = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div class="flex items-center gap-3">
          <h3 class="font-semibold text-surface-800">Archive Contents</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredFiles.length} entries</span>
        </div>
        <div class="relative w-full md:w-64">
          <input 
            type="text" 
            id="search-input" 
            placeholder="Filter files..." 
            value="${escapeHtml(searchQuery)}"
            class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
          >
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </span>
        </div>
      </div>
    `;

    // U7: Table
    const sortIndicator = (col) => sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
    
    const table = `
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
        <table class="min-w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors" data-sort="name">
                Name${sortIndicator('name')}
              </th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors" data-sort="size">
                Size${sortIndicator('size')}
              </th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors" data-sort="mtime">
                Date${sortIndicator('mtime')}
              </th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            ${filteredFiles.length === 0 ? `
              <tr>
                <td colspan="4" class="px-4 py-12 text-center text-surface-400">
                  No files match your search.
                </td>
              </tr>
            ` : filteredFiles.slice(0, 500).map((f, i) => `
              <tr class="even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors group">
                <td class="px-4 py-3 text-surface-700 border-b border-surface-100 font-medium">
                  <div class="flex items-center gap-2">
                    <span class="text-lg">${f.isDir ? '📁' : '📄'}</span>
                    <span class="truncate max-w-xs md:max-w-md" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
                  </div>
                </td>
                <td class="px-4 py-3 text-surface-500 border-b border-surface-100 text-right font-mono text-xs">
                  ${f.isDir ? '-' : formatSize(f.size)}
                </td>
                <td class="px-4 py-3 text-surface-500 border-b border-surface-100 text-right text-xs whitespace-nowrap">
                  ${f.mtime ? f.mtime.toLocaleDateString() : '-'}
                </td>
                <td class="px-4 py-3 border-b border-surface-100 text-center">
                  <div class="flex items-center justify-center gap-2">
                    ${!f.isDir ? `
                      <button class="view-btn text-brand-600 hover:text-brand-700 font-semibold p-1" data-idx="${i}" title="Preview">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                      </button>
                      <button class="dl-btn text-brand-600 hover:text-brand-700 font-semibold p-1" data-idx="${i}" title="Download">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
            ${filteredFiles.length > 500 ? `
              <tr>
                <td colspan="4" class="px-4 py-3 text-center text-surface-400 bg-surface-50 text-xs italic">
                  Truncated: showing first 500 items. Use search to find specific files.
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;

    helpers.render(`
      <div class="max-w-6xl mx-auto p-4 md:p-6">
        ${infoBar}
        ${controls}
        ${table}
      </div>
    `);

    attachListeners(helpers);
  }

  function renderPreview(helpers) {
    const file = helpers.getState().previewFile;
    const isText = isTextFile(file.name);
    
    let contentHtml = '';
    if (isText && file.size < 1024 * 1024 * 2) { // 2MB limit for preview
      const text = new TextDecoder().decode(file.data);
      // U8: Code block
      contentHtml = `
        <div class="rounded-xl overflow-hidden border border-surface-200">
          <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[60vh]">${escapeHtml(text)}</pre>
        </div>
      `;
    } else {
      contentHtml = `
        <div class="flex flex-col items-center justify-center py-20 bg-surface-50 rounded-xl border border-dashed border-surface-200">
          <span class="text-4xl mb-4">📄</span>
          <p class="text-surface-600 font-medium">Preview not available for this file type or size</p>
          <p class="text-surface-400 text-sm mb-6">File size: ${formatSize(file.size)}</p>
          <button id="preview-dl-btn" class="px-6 py-2 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-700 transition-colors">
            Download File
          </button>
        </div>
      `;
    }

    helpers.render(`
      <div class="max-w-6xl mx-auto p-4 md:p-6">
        <button id="back-btn" class="flex items-center gap-2 text-surface-500 hover:text-brand-600 transition-colors mb-6 font-medium">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back to list
        </button>

        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-bold text-surface-900 truncate max-w-md">${escapeHtml(file.name)}</h2>
            <p class="text-sm text-surface-500">${formatSize(file.size)} • Last modified: ${file.mtime ? file.mtime.toLocaleString() : 'N/A'}</p>
          </div>
          <button id="preview-dl-action" class="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Download">
             <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          </button>
        </div>

        ${contentHtml}
      </div>
    `);

    document.getElementById('back-btn').onclick = () => {
      helpers.setState('previewFile', null);
      renderApp(helpers);
    };

    const dlBtn = document.getElementById('preview-dl-btn');
    const dlAction = document.getElementById('preview-dl-action');
    const triggerDl = () => helpers.download(file.name.split('/').pop(), new Blob([file.data]));
    if (dlBtn) dlBtn.onclick = triggerDl;
    if (dlAction) dlAction.onclick = triggerDl;
  }

  function attachListeners(helpers) {
    const root = helpers.getRenderEl();
    
    // Search
    const search = root.querySelector('#search-input');
    if (search) {
      search.addEventListener('input', (e) => {
        helpers.setState('searchQuery', e.target.value);
        applyFiltersAndSort(helpers);
        renderApp(helpers);
        const newSearch = root.querySelector('#search-input');
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(e.target.value.length, e.target.value.length);
        }
      });
    }

    // Sort
    root.querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        const state = helpers.getState();
        if (state.sortCol === col) {
          helpers.setState('sortDir', state.sortDir * -1);
        } else {
          helpers.setState('sortCol', col);
          helpers.setState('sortDir', 1);
        }
        applyFiltersAndSort(helpers);
        renderApp(helpers);
      };
    });

    // Actions
    root.querySelectorAll('.view-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = btn.dataset.idx;
        const file = helpers.getState().filteredFiles[idx];
        helpers.setState('previewFile', file);
        renderApp(helpers);
      };
    });

    root.querySelectorAll('.dl-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = btn.dataset.idx;
        const file = helpers.getState().filteredFiles[idx];
        helpers.download(file.name.split('/').pop(), new Blob([file.data]));
      };
    });
  }

  function isTextFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    const textExts = ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'sh', 'log', 'yaml', 'yml', 'ini', 'csv'];
    return textExts.includes(ext);
  }

})();
