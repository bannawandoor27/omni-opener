(function () {
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
    return String(str).replace(/[&<>"']/g, function (m) { return map[m]; });
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vpk',
      dropLabel: 'Drop a Valve Pak (.vpk) file here',
      binary: true,
      onInit: function (helpers) {
        // VPK parsing is handled by local logic
      },
      onFile: async function _onFile(file, content, helpers) {
        helpers.showLoading('Parsing VPK archive tree...');

        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Invalid file content: expected ArrayBuffer');
          }

          // Small delay to ensure the loading message is visible
          await new Promise(resolve => setTimeout(resolve, 50));

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
          console.error('[VPK] Parse Error:', e);
          helpers.showError(
            'Could not open VPK file',
            'The file may be corrupted, an unsupported version, or a multi-part archive piece. If it is multi-part, ensure you open the _dir.vpk file.'
          );
        }
      },
      onDestroy: function (helpers) {
        // Clean up if needed
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (helpers, btn) {
            const state = helpers.getState();
            const entries = state.entries;
            if (!entries || entries.length === 0) return;

            const text = entries.map(function (f) {
              return f.fullPath + ' (' + formatSize(f.length) + ')';
            }).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download CSV',
          id: 'dl-csv',
          onClick: function (helpers) {
            const state = helpers.getState();
            const entries = state.entries;
            const fileName = state.fileName;
            if (!entries || entries.length === 0) return;

            const header = 'Path,Extension,Size,CRC32,ArchiveIndex\n';
            const rows = entries.map(function (f) {
              return '"' + f.fullPath + '","' + f.ext + '",' + f.length + ',"' + f.crc + '",' + f.archiveIndex;
            }).join('\n');
            helpers.download(fileName + '.csv', header + rows, 'text/csv');
          }
        }
      ],
      infoHtml: '<strong>Valve Pak (VPK) Viewer:</strong> High-performance browser-based explorer for Source Engine archives. Support for V1 and V2 formats. Processing is done entirely in your browser.'
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
      headerSize = 28; 
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
    const sortKey = state.sortKey;
    const sortDesc = state.sortDesc;
    const extCounts = state.extCounts || {};

    if (entries.length === 0) {
      helpers.render(
        '<div class="flex flex-col items-center justify-center p-20 text-center">' +
          '<div class="text-6xl mb-4">📦</div>' +
          '<h3 class="text-xl font-semibold text-surface-800">Empty VPK Archive</h3>' +
          '<p class="text-surface-500 max-w-sm mt-2">This archive contains no files or could not be fully parsed.</p>' +
        '</div>'
      );
      return;
    }

    const filtered = entries
      .filter(function (f) {
        if (!searchTerm) return true;
        return f.fullPath.toLowerCase().indexOf(searchTerm) !== -1 || 
               f.ext.toLowerCase().indexOf(searchTerm) !== -1;
      })
      .sort(function (a, b) {
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
      .slice(0, 5);

    const html =
      '<div class="animate-in fade-in duration-300 p-4">' +
        '<!-- File Info Bar -->' +
        '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
          '<span class="font-semibold text-surface-800">' + escapeHtml(fileName) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span>' + formatSize(fileSize) + '</span>' +
          '<span class="text-surface-300">|</span>' +
          '<span class="text-surface-500">.vpk file</span>' +
        '</div>' +

        '<!-- Stats Grid -->' +
        '<div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">' +
          '<div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">' +
            '<div class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Total Files</div>' +
            '<div class="text-2xl font-bold text-surface-800">' + entries.length.toLocaleString() + '</div>' +
          '</div>' +
          '<div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm md:col-span-3">' +
            '<div class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-2">Common Formats</div>' +
            '<div class="flex flex-wrap gap-2">' +
              topExts.map(function (pair) {
                return '<span class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-100 text-surface-700 border border-surface-200">' +
                  '<span class="text-brand-600 font-bold mr-1.5">' + escapeHtml(pair[0] || 'none') + '</span>' +
                  '<span class="text-surface-400">' + pair[1].toLocaleString() + '</span>' +
                '</span>';
              }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<!-- Controls -->' +
        '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">' +
          '<div class="flex items-center gap-3">' +
            '<h3 class="font-semibold text-surface-800">Archive Entries</h3>' +
            '<span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">' +
              filtered.length.toLocaleString() + ' files' +
            '</span>' +
          '</div>' +
          '<div class="relative w-full sm:w-72">' +
            '<input type="text" id="vpk-search" ' +
              'class="block w-full px-4 py-2 border border-surface-200 rounded-xl bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 sm:text-sm transition-all" ' +
              'placeholder="Filter files by name or ext..." ' +
              'value="' + escapeHtml(state.searchTerm) + '">' +
          '</div>' +
        '</div>' +

        '<!-- Table Wrapper -->' +
        '<div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">' +
          '<div class="overflow-x-auto max-h-[600px]">' +
            '<table class="min-w-full text-sm">' +
              '<thead>' +
                '<tr class="bg-surface-50/80 backdrop-blur sticky top-0 z-10">' +
                  renderTh('fullPath', 'File Path', 'text-left', sortKey, sortDesc) +
                  renderTh('ext', 'Type', 'text-left w-24', sortKey, sortDesc) +
                  renderTh('length', 'Size', 'text-right w-32', sortKey, sortDesc) +
                  renderTh('archiveIndex', 'Archive', 'text-center w-24', sortKey, sortDesc) +
                  renderTh('crc', 'CRC32', 'text-center w-32', sortKey, sortDesc) +
                '</tr>' +
              '</thead>' +
              '<tbody class="divide-y divide-surface-100">' +
                renderRows(filtered) +
              '</tbody>' +
            '</table>' +
          '</div>' +
          (filtered.length === 0 ?
            '<div class="py-16 text-center">' +
              '<div class="text-surface-300 text-5xl mb-3">🔍</div>' +
              '<p class="text-surface-500 font-medium">No files matching "' + escapeHtml(state.searchTerm) + '"</p>' +
              '<button id="clear-search" class="mt-3 text-brand-600 hover:text-brand-700 text-sm font-semibold">Clear search filter</button>' +
            '</div>' : '') +
          (filtered.length > 1000 ?
            '<div class="bg-surface-50 px-4 py-3 text-center text-xs text-surface-500 border-t border-surface-200 font-medium">' +
              'Showing first 1,000 matches. Use the search box to find specific entries.' +
            '</div>' : '') +
        '</div>' +
      '</div>';

    helpers.render(html);

    // Re-attach event listeners
    const searchInput = document.getElementById('vpk-search');
    if (searchInput) {
      searchInput.oninput = function (e) {
        helpers.setState({ searchTerm: e.target.value });
        renderApp(helpers);
      };
      if (state.searchTerm) searchInput.focus();
    }

    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
      clearBtn.onclick = function() {
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
    const arrow = isCurrent ? (currentDesc ? ' <span class="text-brand-500">▼</span>' : ' <span class="text-brand-500">▲</span>') : '';
    return '<th class="px-4 py-3 font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors whitespace-nowrap ' + classes + '" data-sort="' + key + '">' +
        label + arrow +
      '</th>';
  }

  function renderRows(files) {
    const limit = 1000;
    const displayed = files.slice(0, limit);

    return displayed.map(function (f) {
      return '<tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">' +
        '<td class="px-4 py-3 text-surface-700 font-mono text-[13px] break-all">' +
          escapeHtml(f.fullPath) +
        '</td>' +
        '<td class="px-4 py-3 text-surface-500 font-medium">' +
          escapeHtml(f.ext || '-') +
        '</td>' +
        '<td class="px-4 py-3 text-surface-600 text-right font-mono text-xs">' +
          formatSize(f.length) +
        '</td>' +
        '<td class="px-4 py-3 text-surface-400 text-center font-mono text-xs">' +
          (f.archiveIndex === 0x7FFF ? '<span class="text-brand-600 font-bold">DIR</span>' : f.archiveIndex) +
        '</td>' +
        '<td class="px-4 py-3 text-surface-400 text-center font-mono text-xs uppercase tracking-tight">' +
          f.crc +
        '</td>' +
      '</tr>';
    }).join('');
  }

})();
