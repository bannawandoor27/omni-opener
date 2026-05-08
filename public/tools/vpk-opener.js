(function () {
  'use strict';

  /**
   * VPK Opener for OmniOpener
   * A high-performance Valve Pak (.vpk) archive explorer.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
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
   * VPK Parser
   * Spec: https://developer.valvesoftware.com/wiki/VPK_File_Format
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
      headerSize = 28; 
    } else if (version !== 1) {
      throw new Error('Unsupported VPK version: ' + version);
    }

    if (headerSize + treeSize > buffer.byteLength) {
      throw new Error('Tree size exceeds file length. This might be a multi-part archive; ensure you open the _dir.vpk file.');
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

    while (offset < headerSize + treeSize) {
      const ext = readString();
      if (ext === null || ext === '') break;

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
            name: name,
            ext: ext,
            path: displayPath,
            fullPath: fullPath,
            crc: crc.toString(16).padStart(8, '0'),
            length: entryLength + preloadBytes,
            archiveIndex: archiveIndex,
            entryOffset: entryOffset,
            preloadBytes: preloadBytes
          });

          if (terminator !== 0xFFFF) { /* end of directory entry */ }
        }
      }
    }

    return entries;
  }

  function renderApp(helpers) {
    const state = helpers.getState();
    const entries = state.entries || [];
    const fileName = state.fileName;
    const fileSize = state.fileSize;
    const searchTerm = (state.searchTerm || '').toLowerCase();
    const sortKey = state.sortKey || 'fullPath';
    const sortDesc = !!state.sortDesc;
    const extCounts = state.extCounts || {};

    if (!entries.length) {
      helpers.render(
        '<div class="flex flex-col items-center justify-center p-20 text-center">' +
          '<div class="text-6xl mb-4">📦</div>' +
          '<h3 class="text-xl font-semibold text-surface-800">Empty VPK Archive</h3>' +
          '<p class="text-surface-500 max-w-sm mt-2">This archive contains no files or the format is unrecognized.</p>' +
        '</div>'
      );
      return;
    }

    // Filter and Sort
    const filtered = entries.filter(function (f) {
      if (!searchTerm) return true;
      return f.fullPath.toLowerCase().includes(searchTerm) || 
             f.ext.toLowerCase().includes(searchTerm);
    });

    filtered.sort(function (a, b) {
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

    const topExts = Object.keys(extCounts)
      .map(function (k) { return [k, extCounts[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 6);

    const html =
      '<div class="animate-in fade-in duration-500 p-4 max-w-6xl mx-auto">' +
        '<!-- U1: File Info Bar -->' +
        '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">' +
          '<span class="font-semibold text-surface-800">' + escapeHtml(fileName) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span>' + formatSize(fileSize) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span class="text-surface-500">.vpk archive</span>' +
        '</div>' +

        '<!-- U9: Stats Grid -->' +
        '<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">' +
          '<div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm">' +
            '<div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Total Entries</div>' +
            '<div class="text-3xl font-bold text-brand-600">' + entries.length.toLocaleString() + '</div>' +
          '</div>' +
          '<div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm md:col-span-3">' +
            '<div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Dominant Extensions</div>' +
            '<div class="flex flex-wrap gap-2">' +
              topExts.map(function (pair) {
                return '<div class="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-50 text-surface-700 border border-surface-100 hover:border-brand-200 transition-colors">' +
                  '<span class="text-brand-600 font-bold mr-2">.' + escapeHtml(pair[0] || '?') + '</span>' +
                  '<span class="text-surface-400 font-mono">' + pair[1].toLocaleString() + '</span>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- U10: Section Header with Search -->' +
        '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">' +
          '<div class="flex items-center gap-3">' +
            '<h3 class="font-bold text-lg text-surface-800">Archive Contents</h3>' +
            '<span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-semibold">' +
              filtered.length.toLocaleString() + ' visible' +
            '</span>' +
          '</div>' +
          '<div class="relative group">' +
            '<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400 group-focus-within:text-brand-500 transition-colors">' +
              '<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>' +
            '</div>' +
            '<input type="text" id="vpk-search-input" ' +
              'class="block w-full md:w-80 pl-10 pr-4 py-2.5 border border-surface-200 rounded-xl bg-white text-surface-800 placeholder-surface-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 sm:text-sm transition-all shadow-sm" ' +
              'placeholder="Filter by filename or path..." ' +
              'value="' + escapeHtml(state.searchTerm) + '">' +
          '</div>' +
        '</div>' +

        '<!-- U7: Table Container -->' +
        '<div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-xl">' +
          '<div class="overflow-x-auto max-h-[650px] custom-scrollbar">' +
            '<table class="min-w-full text-sm border-separate border-spacing-0">' +
              '<thead>' +
                '<tr>' +
                  renderTh('fullPath', 'File Path', 'text-left pl-6', sortKey, sortDesc) +
                  renderTh('ext', 'Type', 'text-left w-24', sortKey, sortDesc) +
                  renderTh('length', 'Size', 'text-right w-32', sortKey, sortDesc) +
                  renderTh('archiveIndex', 'Archive', 'text-center w-28', sortKey, sortDesc) +
                  renderTh('crc', 'CRC32', 'text-center w-32 pr-6', sortKey, sortDesc) +
                '</tr>' +
              '</thead>' +
              '<tbody class="divide-y divide-surface-100">' +
                renderRows(filtered) +
              '</tbody>' +
            '</table>' +
          '</div>' +
          
          (!filtered.length ?
            '<div class="py-20 text-center bg-surface-50/50">' +
              '<div class="text-surface-200 text-6xl mb-4">🔍</div>' +
              '<p class="text-surface-500 font-medium text-lg">No matching files found</p>' +
              '<button id="vpk-reset-search" class="mt-4 px-4 py-2 bg-white border border-surface-200 rounded-lg text-brand-600 hover:bg-brand-50 hover:border-brand-200 transition-all text-sm font-bold shadow-sm">Clear Search Filter</button>' +
            '</div>' : '') +

          (filtered.length > 1000 ?
            '<div class="bg-brand-50/80 backdrop-blur-sm px-4 py-3 text-center text-xs text-brand-700 border-t border-brand-100 font-semibold">' +
              'Virtualizing view: Showing first 1,000 matches. Refine your search to see more.' +
            '</div>' : '') +
        '</div>' +
      '</div>';

    helpers.render(html);

    // Event Wiring
    const searchInput = document.getElementById('vpk-search-input');
    if (searchInput) {
      searchInput.oninput = function (e) {
        helpers.setState({ searchTerm: e.target.value });
        renderApp(helpers);
      };
      if (state.searchTerm) searchInput.focus();
    }

    const resetBtn = document.getElementById('vpk-reset-search');
    if (resetBtn) {
      resetBtn.onclick = function() {
        helpers.setState({ searchTerm: '' });
        renderApp(helpers);
      };
    }

    helpers.getRenderEl().querySelectorAll('[data-sort]').forEach(function (th) {
      th.onclick = function () {
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
    const arrow = isCurrent ? 
      (currentDesc ? '<span class="ml-1.5 text-brand-500">↓</span>' : '<span class="ml-1.5 text-brand-500">↑</span>') : 
      '<span class="ml-1.5 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity">↕</span>';
    
    return '<th class="sticky top-0 z-20 bg-surface-50/95 backdrop-blur px-4 py-4 font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group whitespace-nowrap ' + classes + '" data-sort="' + key + '">' +
        '<div class="flex items-center ' + (classes.includes('text-right') ? 'justify-end' : (classes.includes('text-center') ? 'justify-center' : '')) + '">' +
          label + arrow +
        '</div>' +
      '</th>';
  }

  function renderRows(files) {
    const limit = 1000;
    const items = files.slice(0, limit);

    return items.map(function (f) {
      const isDir = f.archiveIndex === 0x7FFF;
      return '<tr class="even:bg-surface-50/40 hover:bg-brand-50/60 transition-colors group">' +
        '<td class="px-6 py-3.5 text-surface-700 font-mono text-[13px] break-all leading-relaxed">' +
          escapeHtml(f.fullPath) +
        '</td>' +
        '<td class="px-4 py-3.5 text-surface-500 font-bold uppercase text-[11px] tracking-wider">' +
          '<span class="px-2 py-0.5 rounded bg-surface-100 border border-surface-200 group-hover:bg-brand-100 group-hover:border-brand-200 group-hover:text-brand-700 transition-colors">' + 
            escapeHtml(f.ext || 'none') + 
          '</span>' +
        '</td>' +
        '<td class="px-4 py-3.5 text-surface-600 text-right font-mono text-[13px] font-medium">' +
          formatSize(f.length) +
        '</td>' +
        '<td class="px-4 py-3.5 text-center">' +
          (isDir ? 
            '<span class="text-[10px] font-black bg-brand-600 text-white px-1.5 py-0.5 rounded shadow-sm">DIR</span>' : 
            '<span class="text-surface-400 font-mono text-[13px]">' + f.archiveIndex + '</span>') +
        '</td>' +
        '<td class="px-6 py-3.5 text-surface-400 text-center font-mono text-[11px] uppercase tracking-widest">' +
          f.crc +
        '</td>' +
      '</tr>';
    }).join('');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vpk',
      dropLabel: 'Drop a Valve Pak (.vpk) file here',
      binary: true,
      onInit: function (helpers) {
        // No external dependencies needed
      },
      onFile: async function _onFileFn(file, content, helpers) {
        helpers.showLoading('Parsing VPK tree hierarchy...');

        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Invalid input format');
          }

          // Small yield for UX loading feedback
          await new Promise(function(r) { setTimeout(r, 60); });

          const entries = parseVpk(content);

          const extCounts = {};
          entries.forEach(function (f) {
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
          console.error('[VPK] Parser Exception:', e);
          helpers.showError(
            'Failed to parse VPK',
            'This file may be a multi-part archive component (e.g. pak01_001.vpk). Please open the primary index file, usually ending in _dir.vpk.'
          );
        }
      },
      onDestroy: function (helpers) {
        // Clean state
        helpers.setState({ entries: null });
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'vpk-copy',
          onClick: function (helpers, btn) {
            const state = helpers.getState();
            const entries = state.entries || [];
            if (!entries.length) return;

            const text = entries.map(function (f) {
              return f.fullPath + ' \t(' + formatSize(f.length) + ')';
            }).join('\n');
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

            const header = 'Path,Extension,Size_Bytes,CRC32,Archive_Index\n';
            const rows = entries.map(function (f) {
              return '"' + f.fullPath + '","' + f.ext + '",' + f.length + ',"' + f.crc + '",' + f.archiveIndex;
            }).join('\n');
            helpers.download((state.fileName || 'vpk_export') + '.csv', header + rows, 'text/csv');
          }
        }
      ],
      infoHtml: '<div class="text-sm"><strong>Valve Pak (VPK) Viewer:</strong> High-performance browser-side analyzer for Source Engine archives. Support for V1 and V2 formats. Safe, private, and fast.</div>'
    });
  };

})();
