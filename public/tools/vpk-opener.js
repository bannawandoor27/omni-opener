(function() {
  'use strict';

  // --- Helpers ---
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
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
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vpk',
      dropLabel: 'Drop a Valve Pak (.vpk) file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed
      },
      onFile: function _onFileFn(file, content, helpers) {
        helpers.showLoading('Parsing VPK archive tree...');

        // Use a slight delay to allow loading UI to show for large files
        setTimeout(function() {
          try {
            if (!(content instanceof ArrayBuffer)) {
              throw new Error('Invalid file content: expected ArrayBuffer');
            }

            const entries = parseVpk(content);
            
            // Calculate stats
            const extCounts = {};
            entries.forEach(f => {
              extCounts[f.ext] = (extCounts[f.ext] || 0) + 1;
            });

            helpers.setState({
              entries: entries,
              fileName: file.name,
              fileSize: file.size,
              searchTerm: '',
              sortKey: 'fullPath',
              sortDesc: false,
              extCounts: extCounts
            });
            
            renderApp(helpers);
          } catch (e) {
            console.error('[VPK] Parse Error:', e);
            helpers.showError('Could not open VPK file', 
              'This might be a corrupted file or an unsupported version. ' + e.message);
          }
        }, 50);
      },
      onDestroy: function(helpers) {
        // Cleanup if needed
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const { entries } = helpers.getState();
            if (!entries || entries.length === 0) return;
            
            helpers.showLoading('Preparing list...');
            setTimeout(() => {
              const text = entries.map(f => `${f.fullPath} (${formatSize(f.length)})`).join('\n');
              helpers.copyToClipboard(text, btn);
              helpers.hideLoading();
            }, 0);
          }
        },
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function(helpers) {
            const { entries, fileName } = helpers.getState();
            if (!entries || entries.length === 0) return;
            
            const header = 'Path,Extension,Size,CRC32,ArchiveIndex\n';
            const rows = entries.map(f => `"${f.fullPath}","${f.ext}",${f.length},${f.crc},${f.archiveIndex}`).join('\n');
            helpers.download(fileName + '.csv', header + rows, 'text/csv');
          }
        }
      ],
      infoHtml: '<strong>Valve Pak (VPK) Viewer:</strong> High-performance browser-based explorer for Source Engine archives. Support for V1 and V2 formats.'
    });
  };

  /**
   * VPK Parser
   * Format specs: https://developer.valvesoftware.com/wiki/VPK_File_Format
   */
  function parseVpk(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 12) throw new Error('File header too short');
    
    const signature = view.getUint32(0, true);
    if (signature !== 0x55aa1234) throw new Error('Invalid VPK signature');
    
    const version = view.getUint32(4, true);
    const treeSize = view.getUint32(8, true);
    
    let headerSize = 12;
    if (version === 2) {
      headerSize = 28; // Version 2 has extra fields
    } else if (version !== 1) {
      throw new Error('Unsupported VPK version: ' + version);
    }

    if (headerSize + treeSize > buffer.byteLength) {
      throw new Error('Tree size exceeds file length. Is this a multi-part VPK? Ensure you are opening the _dir.vpk file.');
    }

    const entries = [];
    const decoder = new TextDecoder('utf-8');
    let offset = headerSize;

    function readString() {
      const start = offset;
      while (offset < headerSize + treeSize && view.getUint8(offset) !== 0) {
        offset++;
      }
      if (offset >= headerSize + treeSize) return null;
      const str = decoder.decode(new Uint8Array(buffer, start, offset - start));
      offset++; // skip null
      return str;
    }

    // VPK Tree Structure:
    // Extension -> Path -> Filename -> Entry Metadata
    while (offset < headerSize + treeSize) {
      const ext = readString();
      if (!ext) break;

      while (true) {
        const path = readString();
        if (path === null) break;
        if (!path && path !== '') break;

        while (true) {
          const name = readString();
          if (name === null) break;
          if (!name && name !== '') break;

          if (offset + 18 > headerSize + treeSize) break;

          const crc = view.getUint32(offset, true);
          const preloadBytes = view.getUint16(offset + 4, true);
          const archiveIndex = view.getUint16(offset + 6, true);
          const entryOffset = view.getUint32(offset + 8, true);
          const entryLength = view.getUint32(offset + 12, true);
          const terminator = view.getUint16(offset + 16, true);
          
          offset += 18;
          
          // Skip preload data in the tree
          offset += preloadBytes;

          const displayPath = path === ' ' ? '' : path;
          const fullPath = (displayPath ? displayPath + '/' : '') + name + (ext ? '.' + ext : '');

          entries.push({
            name,
            ext,
            path: displayPath,
            fullPath,
            crc: crc.toString(16).padStart(8, '0'),
            length: entryLength + preloadBytes,
            archiveIndex: archiveIndex,
            entryOffset: entryOffset,
            preloadBytes: preloadBytes
          });

          if (terminator !== 0xFFFF) {
            // Standard VPK terminator
          }
        }
      }
    }

    return entries;
  }

  function renderApp(helpers) {
    const state = helpers.getState();
    const { entries, fileName, fileSize, searchTerm, sortKey, sortDesc, extCounts } = state;

    if (!entries || entries.length === 0) {
      helpers.render(`
        <div class="flex flex-col items-center justify-center p-20 text-center">
          <div class="text-6xl mb-4">📦</div>
          <h3 class="text-xl font-semibold text-surface-800">Empty VPK Archive</h3>
          <p class="text-surface-500 max-w-sm mt-2">This archive contains no files or could not be fully parsed.</p>
        </div>
      `);
      return;
    }

    const filtered = entries
      .filter(f => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return f.fullPath.toLowerCase().includes(s) || f.ext.toLowerCase().includes(s);
      })
      .sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];
        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        if (valA < valB) return sortDesc ? 1 : -1;
        if (valA > valB) return sortDesc ? -1 : 1;
        return 0;
      });

    const topExts = Object.entries(extCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const html = `
      <div class="space-y-4 animate-in fade-in duration-300">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${entries.length.toLocaleString()} entries</span>
          <span class="text-surface-300">|</span>
          <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium uppercase tracking-wider">VPK Archive</span>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
            <div class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Total Files</div>
            <div class="text-2xl font-bold text-surface-800">${entries.length.toLocaleString()}</div>
          </div>
          <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm md:col-span-3">
            <div class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-2">Popular Extensions</div>
            <div class="flex flex-wrap gap-2">
              ${topExts.map(([ext, count]) => `
                <span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-100 text-surface-700 border border-surface-200">
                  <span class="text-brand-600 font-bold mr-1.5">${ext || 'none'}</span>
                  <span class="text-surface-400">${count.toLocaleString()}</span>
                </span>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- U10: Section Header with Search -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div class="flex items-center gap-3">
            <h3 class="font-semibold text-surface-800 text-lg">File Browser</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-medium">
              ${filtered.length.toLocaleString()} matches
            </span>
          </div>
          
          <div class="relative w-full sm:w-72">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input type="text" id="vpk-search" 
              class="block w-full pl-10 pr-3 py-2 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 sm:text-sm transition-all" 
              placeholder="Search files..." 
              value="${escapeHtml(searchTerm)}">
          </div>
        </div>

        <!-- U7: Table Container -->
        <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
          <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table class="min-w-full text-sm divide-y divide-surface-200">
              <thead class="bg-surface-50 sticky top-0 z-10">
                <tr>
                  ${renderTh('fullPath', 'File Path', 'text-left', sortKey, sortDesc)}
                  ${renderTh('ext', 'Ext', 'text-left w-24', sortKey, sortDesc)}
                  ${renderTh('length', 'Size', 'text-right w-32', sortKey, sortDesc)}
                  ${renderTh('archiveIndex', 'Archive', 'text-center w-24', sortKey, sortDesc)}
                  ${renderTh('crc', 'CRC32', 'text-center w-32', sortKey, sortDesc)}
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${renderRows(filtered)}
              </tbody>
            </table>
          </div>
          ${filtered.length === 0 ? `
            <div class="py-12 text-center">
              <div class="text-surface-300 text-4xl mb-2">🔍</div>
              <p class="text-surface-500">No files match your search criteria.</p>
            </div>
          ` : ''}
          ${filtered.length > 1000 ? `
            <div class="bg-surface-50/50 px-4 py-3 text-center text-xs text-surface-500 border-t border-surface-100 italic">
              Showing first 1,000 matches. Use search to find specific files.
            </div>
          ` : ''}
        </div>
      </div>
    `;

    helpers.render(html);

    // Event listeners
    const searchInput = document.getElementById('vpk-search');
    if (searchInput) {
      searchInput.focus();
      // Move cursor to end
      const val = searchInput.value;
      searchInput.value = '';
      searchInput.value = val;
      
      searchInput.oninput = (e) => {
        helpers.setState({ searchTerm: e.target.value });
        renderApp(helpers);
      };
    }

    // Sorting handlers
    document.querySelectorAll('[data-sort]').forEach(th => {
      th.onclick = () => {
        const key = th.getAttribute('data-sort');
        const isCurrent = state.sortKey === key;
        helpers.setState({
          sortKey: key,
          sortDesc: isCurrent ? !state.sortDesc : false
        });
        renderApp(helpers);
      };
    });
  }

  function renderTh(key, label, classes, currentKey, currentDesc) {
    const isCurrent = key === currentKey;
    return `
      <th class="px-4 py-3 font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors ${classes}" data-sort="${key}">
        <div class="flex items-center gap-1 ${classes.includes('text-right') ? 'justify-end' : classes.includes('text-center') ? 'justify-center' : ''}">
          ${label}
          <span class="text-[10px] w-3">
            ${isCurrent ? (currentDesc ? '▼' : '▲') : '<span class="opacity-0 group-hover:opacity-100">↕</span>'}
          </span>
        </div>
      </th>
    `;
  }

  function renderRows(files) {
    const limit = 1000;
    const displayed = files.slice(0, limit);

    return displayed.map(f => `
      <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
        <td class="px-4 py-2.5 text-surface-700 font-mono text-[13px] break-all" title="${escapeHtml(f.fullPath)}">
          ${escapeHtml(f.fullPath)}
        </td>
        <td class="px-4 py-2.5 text-surface-500 font-mono text-xs">
          ${escapeHtml(f.ext || '-')}
        </td>
        <td class="px-4 py-2.5 text-surface-600 text-right font-mono text-xs">
          ${formatSize(f.length)}
        </td>
        <td class="px-4 py-2.5 text-surface-400 text-center font-mono text-xs">
          ${f.archiveIndex === 0x7FFF ? '<span class="text-brand-600 font-semibold">DIR</span>' : f.archiveIndex}
        </td>
        <td class="px-4 py-2.5 text-surface-400 text-center font-mono text-xs uppercase">
          ${f.crc}
        </td>
      </tr>
    `).join('');
  }

})();
