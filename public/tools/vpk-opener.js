(function () {
  'use strict';

  /**
   * VPK Opener for OmniOpener
   * Production-grade Valve Pak archive explorer.
   */

  function escapeHtml(str) {
    if (!str) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, function (m) { return map[m]; });
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * VPK Parser Implementation
   * Spec: https://developer.valvesoftware.com/wiki/VPK_File_Format
   */
  function parseVpk(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 12) throw new Error('File too small to be a VPK');

    const signature = view.getUint32(0, true);
    if (signature !== 0x55aa1234) throw new Error('Invalid VPK signature');

    const version = view.getUint32(4, true);
    const treeSize = view.getUint32(8, true);

    let headerSize = 12;
    if (version === 2) {
      headerSize = 28;
    } else if (version !== 1) {
      throw new Error('Unsupported VPK version: ' + version);
    }

    if (headerSize + treeSize > buffer.byteLength) {
      throw new Error('VPK index tree is truncated. Ensure you are opening the _dir.vpk file.');
    }

    const entries = [];
    const decoder = new TextDecoder('utf-8');
    let offset = headerSize;

    const readString = () => {
      const start = offset;
      while (offset < headerSize + treeSize && view.getUint8(offset) !== 0) {
        offset++;
      }
      if (offset >= headerSize + treeSize) return null;
      const str = decoder.decode(new Uint8Array(buffer, start, offset - start));
      offset++; // skip null terminator
      return str;
    };

    while (offset < headerSize + treeSize) {
      const ext = readString();
      if (!ext) break;

      while (true) {
        const path = readString();
        if (path === null || path === '') break;

        while (true) {
          const name = readString();
          if (name === null || name === '') break;

          if (offset + 18 > headerSize + treeSize) break;

          const crc = view.getUint32(offset, true);
          const preloadBytes = view.getUint16(offset + 4, true);
          const archiveIndex = view.getUint16(offset + 6, true);
          const entryOffset = view.getUint32(offset + 8, true);
          const entryLength = view.getUint32(offset + 12, true);
          const terminator = view.getUint16(offset + 16, true);

          offset += 18;
          offset += preloadBytes; // Skip preload data

          const displayPath = path === ' ' ? '' : path;
          const fullPath = (displayPath ? displayPath + '/' : '') + name + (ext ? '.' + ext : '');

          entries.push({
            name,
            ext,
            path: displayPath,
            fullPath,
            crc: crc.toString(16).padStart(8, '0'),
            length: entryLength + preloadBytes,
            archiveIndex,
            entryOffset
          });

          if (terminator === 0xFFFF) {
            // End of directory entries
          }
        }
      }
    }

    return entries;
  }

  function renderApp(helpers) {
    const state = helpers.getState();
    const entries = state.entries || [];
    const fileName = state.fileName || '';
    const fileSize = state.fileSize || 0;
    const searchTerm = (state.searchTerm || '').toLowerCase();
    const sortKey = state.sortKey || 'fullPath';
    const sortDesc = !!state.sortDesc;

    if (!entries.length && !searchTerm) {
      helpers.render(
        '<div class="flex flex-col items-center justify-center p-12 text-center">' +
          '<div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center text-3xl mb-4">📦</div>' +
          '<h3 class="text-lg font-semibold text-surface-800">No entries found</h3>' +
          '<p class="text-surface-500 max-w-xs mt-1">This VPK archive appears to be empty or uses an unsupported index format.</p>' +
        '</div>'
      );
      return;
    }

    const filtered = entries.filter(f => 
      f.fullPath.toLowerCase().includes(searchTerm) || 
      f.ext.toLowerCase().includes(searchTerm)
    );

    filtered.sort((a, b) => {
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

    const LIMIT = 500;
    const visible = filtered.slice(0, LIMIT);

    const html = `
      <div class="animate-in fade-in duration-300">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.vpk file</span>
        </div>

        <!-- Search box (Archive excellence) -->
        <div class="mb-6">
          <div class="relative">
            <input type="text" id="vpk-search-input" 
              class="w-full px-4 py-3 pl-10 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              placeholder="Filter files by name, path or extension..."
              value="${escapeHtml(state.searchTerm || '')}">
            <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          </div>
        </div>

        <!-- U10: Section Header -->
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Archive Entries</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length.toLocaleString()} items</span>
        </div>

        <!-- U7: Table -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr>
                ${renderHeader('fullPath', 'Path', 'text-left', sortKey, sortDesc)}
                ${renderHeader('ext', 'Ext', 'text-left w-20', sortKey, sortDesc)}
                ${renderHeader('length', 'Size', 'text-right w-24', sortKey, sortDesc)}
                ${renderHeader('archiveIndex', 'Arch', 'text-center w-20', sortKey, sortDesc)}
                ${renderHeader('crc', 'CRC32', 'text-right w-24 pr-4', sortKey, sortDesc)}
              </tr>
            </thead>
            <tbody>
              ${visible.length ? visible.map(f => `
                <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 font-mono text-[13px] break-all leading-tight">
                    ${escapeHtml(f.fullPath)}
                  </td>
                  <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100">
                    <span class="px-1.5 py-0.5 bg-surface-100 rounded text-[10px] font-bold uppercase text-surface-600">${escapeHtml(f.ext || '')}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-600 border-b border-surface-100 font-mono">
                    ${formatSize(f.length)}
                  </td>
                  <td class="px-4 py-2.5 text-center text-surface-400 border-b border-surface-100 font-mono text-xs">
                    ${f.archiveIndex === 0x7FFF ? '<span class="text-brand-600 font-bold">DIR</span>' : f.archiveIndex}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-400 border-b border-surface-100 pr-4 font-mono text-[11px] uppercase">
                    ${f.crc}
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="5" class="px-4 py-12 text-center text-surface-400 italic bg-surface-50/50">
                    No matching files found in archive
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        ${filtered.length > LIMIT ? `
          <div class="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-100 text-center">
            <p class="text-xs text-amber-700 font-medium">
              Showing first ${LIMIT} of ${filtered.length.toLocaleString()} matches. Refine your search to find specific files.
            </p>
          </div>
        ` : ''}
      </div>
    `;

    helpers.render(html);

    // Re-wire search
    const input = document.getElementById('vpk-search-input');
    if (input) {
      input.oninput = function (e) {
        helpers.setState({ searchTerm: e.target.value });
        renderApp(helpers);
      };
      if (state.searchTerm) {
        input.focus();
        input.setSelectionRange(state.searchTerm.length, state.searchTerm.length);
      }
    }

    // Re-wire sort
    helpers.getRenderEl().querySelectorAll('[data-sort]').forEach(el => {
      el.onclick = function () {
        const key = el.dataset.sort;
        helpers.setState({
          sortKey: key,
          sortDesc: state.sortKey === key ? !state.sortDesc : false
        });
        renderApp(helpers);
      };
    });
  }

  function renderHeader(key, label, classes, currentKey, currentDesc) {
    const isCurrent = key === currentKey;
    const arrow = isCurrent ? (currentDesc ? ' ▼' : ' ▲') : '';
    return `
      <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors ${classes}" data-sort="${key}">
        ${label}${arrow}
      </th>
    `;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vpk',
      dropLabel: 'Drop .vpk file to explore',
      binary: true,
      onInit: function (helpers) {
        // Core parser is self-contained
      },
      onFile: async function _onFileFn(file, content, helpers) {
        helpers.showLoading('Parsing VPK Index Tree...');
        
        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Invalid file content: Expected ArrayBuffer');
          }

          // Delay for UI feedback
          await new Promise(r => setTimeout(r, 100));

          const entries = parseVpk(content);
          
          helpers.setState({
            entries: entries,
            fileName: file.name,
            fileSize: file.size,
            searchTerm: '',
            sortKey: 'fullPath',
            sortDesc: false
          });

          renderApp(helpers);
        } catch (err) {
          console.error('[VPK] Parse Error:', err);
          helpers.showError(
            'Could not open VPK file',
            'This might be a corrupted archive or a multi-part file. For multi-part VPKs, ensure you are opening the _dir.vpk file.'
          );
        }
      },
      onDestroy: function (helpers) {
        helpers.setState({ entries: null });
      },
      actions: [
        {
          label: '📋 Copy Paths',
          id: 'vpk-copy',
          onClick: function (helpers, btn) {
            const { entries } = helpers.getState();
            if (!entries || !entries.length) return;
            const text = entries.map(f => f.fullPath).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download CSV',
          id: 'vpk-csv',
          onClick: function (helpers) {
            const { entries, fileName } = helpers.getState();
            if (!entries || !entries.length) return;
            
            const csvRows = [
              'Path,Extension,Size,ArchiveIndex,CRC32',
              ...entries.map(f => `"${f.fullPath}","${f.ext}",${f.length},${f.archiveIndex},${f.crc}`)
            ];
            
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            helpers.download((fileName || 'archive') + '.csv', blob, 'text/csv');
          }
        }
      ],
      infoHtml: `
        <div class="space-y-2">
          <p><strong>Valve Pak (VPK)</strong> is an uncompressed archive format used by games on the Source Engine (Portal, Half-Life, Dota 2, CS:GO) to store assets.</p>
          <p class="text-xs text-surface-500">Note: This tool reads the index tree from the <code>_dir.vpk</code> file. It does not currently support extracting raw asset data from multi-part chunks.</p>
        </div>
      `
    });
  };
})();
