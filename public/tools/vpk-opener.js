(function () {
  'use strict';

  /**
   * VPK Opener for OmniOpener
   * A high-performance, browser-side Valve Pak archive explorer.
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
    if (bytes === 0) return '0 B';
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
    if (signature !== 0x55aa1234) throw new Error('Invalid VPK signature (expected 0x55aa1234)');

    const version = view.getUint32(4, true);
    const treeSize = view.getUint32(8, true);

    let headerSize = 12;
    if (version === 2) {
      headerSize = 28;
    } else if (version !== 1) {
      throw new Error('Unsupported VPK version: ' + version);
    }

    if (headerSize + treeSize > buffer.byteLength) {
      throw new Error('VPK index tree is truncated. Ensure you are opening the _dir.vpk index file.');
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
          offset += preloadBytes; // Skip preload data for now

          const displayPath = path === ' ' ? '' : path;
          const fullPath = (displayPath ? displayPath + '/' : '') + name + (ext ? '.' + ext : '');

          entries.push({
            name: name,
            ext: ext,
            path: displayPath,
            fullPath: fullPath,
            crc: crc.toString(16).padStart(8, '0'),
            length: entryLength + preloadBytes,
            archiveIndex: archiveIndex,
            entryOffset: entryOffset
          });

          if (terminator !== 0xFFFF) {
            // Note: Spec says 0xFFFF marks end of directory entry
          }
        }
      }
    }

    return entries;
  }

  function renderApp(helpers) {
    const state = helpers.getState();
    const entries = state.entries || [];
    const fileName = state.fileName || 'unknown.vpk';
    const fileSize = state.fileSize || 0;
    const searchTerm = (state.searchTerm || '').toLowerCase();
    const sortKey = state.sortKey || 'fullPath';
    const sortDesc = !!state.sortDesc;

    if (!entries.length && !searchTerm) {
      helpers.render(
        '<div class="flex flex-col items-center justify-center p-20 text-center">' +
          '<div class="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center text-4xl mb-6 text-surface-400">📦</div>' +
          '<h3 class="text-xl font-semibold text-surface-800">Empty VPK Archive</h3>' +
          '<p class="text-surface-500 max-w-sm mt-2">This archive contains no files or the format is unrecognized. Multi-part VPKs require the _dir.vpk file.</p>' +
        '</div>'
      );
      return;
    }

    // Filter
    const filtered = entries.filter(function(f) {
      return f.fullPath.toLowerCase().includes(searchTerm) || f.ext.toLowerCase().includes(searchTerm);
    });

    // Sort
    filtered.sort(function(a, b) {
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

    // Pagination/Limit for performance
    const LIMIT = 1000;
    const visibleEntries = filtered.slice(0, LIMIT);

    const html =
      '<div class="p-4 md:p-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">' +
        '<!-- U1: File Info Bar -->' +
        '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">' +
          '<span class="font-bold text-surface-900">' + escapeHtml(fileName) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span>' + formatSize(fileSize) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">VPK Archive</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span>' + entries.length.toLocaleString() + ' files</span>' +
        '</div>' +

        '<!-- Search and Controls -->' +
        '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">' +
          '<div>' +
            '<h2 class="text-2xl font-bold text-surface-900 tracking-tight">Archive Contents</h2>' +
            '<p class="text-sm text-surface-500 mt-1">Explore and filter files within the Valve Pak.</p>' +
          '</div>' +
          '<div class="relative max-w-md w-full">' +
            '<div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-surface-400">' +
              '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
            '</div>' +
            '<input type="text" id="vpk-search" placeholder="Search by name, path, or extension..." ' +
              'class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm" ' +
              'value="' + escapeHtml(state.searchTerm || '') + '">' +
          '</div>' +
        '</div>' +

        '<!-- U10: Section Header -->' +
        '<div class="flex items-center justify-between mb-3">' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-sm font-semibold text-surface-700">File List</span>' +
            '<span class="px-2 py-0.5 bg-surface-100 text-surface-600 rounded-full text-[11px] font-bold">' + 
              filtered.length.toLocaleString() + ' matches' + 
            '</span>' +
          '</div>' +
          (filtered.length > LIMIT ? 
            '<span class="text-[11px] text-amber-600 font-medium">Showing first ' + LIMIT + ' items</span>' : '') +
        '</div>' +

        '<!-- U7: Table Container -->' +
        '<div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">' +
          '<table class="min-w-full text-sm border-separate border-spacing-0">' +
            '<thead>' +
              '<tr class="bg-surface-50">' +
                renderSortHeader('fullPath', 'File Path', 'text-left pl-4', sortKey, sortDesc) +
                renderSortHeader('ext', 'Type', 'text-left w-24', sortKey, sortDesc) +
                renderSortHeader('length', 'Size', 'text-right w-28', sortKey, sortDesc) +
                renderSortHeader('archiveIndex', 'Arch', 'text-center w-20', sortKey, sortDesc) +
                renderSortHeader('crc', 'CRC32', 'text-center w-28 pr-4', sortKey, sortDesc) +
              '</tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-surface-100">' +
              (visibleEntries.length ? visibleEntries.map(function(f) {
                const isDir = f.archiveIndex === 0x7FFF;
                return '<tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">' +
                  '<td class="px-4 py-3 text-surface-800 font-mono text-[13px] break-all leading-relaxed">' +
                    escapeHtml(f.fullPath) +
                  '</td>' +
                  '<td class="px-4 py-3">' +
                    '<span class="inline-block px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded text-[10px] font-bold uppercase border border-surface-200 group-hover:bg-white group-hover:text-brand-600 group-hover:border-brand-200 transition-all">' +
                      escapeHtml(f.ext || 'none') +
                    '</span>' +
                  '</td>' +
                  '<td class="px-4 py-3 text-right text-surface-600 font-mono text-[12px]">' +
                    formatSize(f.length) +
                  '</td>' +
                  '<td class="px-4 py-3 text-center">' +
                    (isDir ? 
                      '<span class="bg-brand-600 text-white text-[9px] font-black px-1 rounded shadow-sm">DIR</span>' : 
                      '<span class="text-surface-400 font-mono text-[12px]">' + f.archiveIndex + '</span>') +
                  '</td>' +
                  '<td class="px-4 py-3 text-center pr-4 text-surface-400 font-mono text-[11px] uppercase tracking-tighter">' +
                    f.crc +
                  '</td>' +
                '</tr>';
              }).join('') : 
              '<tr><td colspan="5" class="py-12 text-center text-surface-400 italic">No files match your search criteria.</td></tr>') +
            '</tbody>' +
          '</table>' +
        '</div>' +

        (filtered.length > LIMIT ? 
          '<div class="mt-4 p-3 bg-surface-50 rounded-lg border border-dashed border-surface-300 text-center text-xs text-surface-500">' +
            'Display limit reached. Use the search box above to refine results and find specific files.' +
          '</div>' : '') +
      '</div>';

    helpers.render(html);

    // Event Wiring
    const searchInput = document.getElementById('vpk-search');
    if (searchInput) {
      searchInput.oninput = function(e) {
        helpers.setState({ searchTerm: e.target.value });
        renderApp(helpers);
      };
      if (state.searchTerm) {
        searchInput.focus();
        searchInput.setSelectionRange(state.searchTerm.length, state.searchTerm.length);
      }
    }

    helpers.getRenderEl().querySelectorAll('[data-sort]').forEach(function(el) {
      el.onclick = function() {
        const key = el.getAttribute('data-sort');
        const isCurrent = state.sortKey === key;
        helpers.setState({
          sortKey: key,
          sortDesc: isCurrent ? !state.sortDesc : false
        });
        renderApp(helpers);
      };
    });
  }

  function renderSortHeader(key, label, classes, currentKey, currentDesc) {
    const isCurrent = key === currentKey;
    const arrow = isCurrent ? 
      (currentDesc ? '<span class="ml-1 text-brand-600">↓</span>' : '<span class="ml-1 text-brand-600">↑</span>') : 
      '<span class="ml-1 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity">↕</span>';
    
    return '<th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group whitespace-nowrap ' + classes + '" data-sort="' + key + '">' +
        '<div class="flex items-center ' + (classes.includes('text-right') ? 'justify-end' : (classes.includes('text-center') ? 'justify-center' : '')) + '">' +
          label + arrow +
        '</div>' +
      '</th>';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vpk',
      dropLabel: 'Drop VPK file to explore',
      binary: true,
      onInit: function (helpers) {
        // No external libs needed
      },
      onFile: async function _onFileFn(file, content, helpers) {
        helpers.showLoading('Analyzing Valve Pak structure...');

        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Expected binary data');
          }

          // Small delay for UI smoothness
          await new Promise(r => setTimeout(r, 50));

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
        } catch (e) {
          console.error('[VPK] Error:', e);
          helpers.showError(
            'Could not open VPK file',
            'This might not be a valid Valve Pak archive, or it could be a multi-part file. Try opening the primary index file (usually ending in _dir.vpk).'
          );
        }
      },
      onDestroy: function (helpers) {
        // Clear state to free memory
        helpers.setState({ entries: null });
      },
      actions: [
        {
          label: '📋 Copy List',
          id: 'vpk-copy',
          onClick: function (helpers, btn) {
            const state = helpers.getState();
            const entries = state.entries || [];
            if (!entries.length) return;

            const text = entries.map(f => f.fullPath + ' (' + formatSize(f.length) + ')').join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Export CSV',
          id: 'vpk-csv',
          onClick: function (helpers) {
            const state = helpers.getState();
            const entries = state.entries || [];
            if (!entries.length) return;

            const header = 'File Path,Extension,Size (Bytes),CRC32,Archive Index\n';
            const rows = entries.map(f => 
              '"' + f.fullPath + '","' + (f.ext || '') + '",' + f.length + ',"' + f.crc + '",' + f.archiveIndex
            ).join('\n');
            
            helpers.download((state.fileName || 'vpk_index') + '.csv', header + rows, 'text/csv');
          }
        }
      ],
      infoHtml: '<div class="text-sm"><strong>Valve Pak (VPK) Viewer:</strong> Browse contents of Source Engine archives (Portal, Half-Life 2, CS:GO, Dota 2). Works entirely in your browser. Multi-part VPKs require loading the <code>_dir.vpk</code> file.</div>'
    });
  };

})();
