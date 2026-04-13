(function() {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
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
      dropLabel: 'Drop a .vpk file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed for basic VPK parsing
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing VPK tree...');
        
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Parsing may be slow. Continue?')) {
            helpers.reset();
            return;
          }
        }

        try {
          const files = parseVpk(content);
          helpers.setState({
            files: files,
            fileName: file.name,
            fileSize: file.size,
            searchTerm: ''
          });
          renderApp(helpers);
        } catch (e) {
          helpers.showError('Could not parse VPK file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (!state.files) return;
            const text = state.files.map(f => f.fullPath + ' (' + formatSize(f.length) + ')').join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download File List',
          id: 'dl-list',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (!state.files) return;
            const text = state.files.map(f => f.fullPath + '\t' + f.length + '\t' + f.crc).join('\n');
            helpers.download(state.fileName + '.files.txt', text);
          }
        }
      ],
      infoHtml: '<strong>Valve Pak (VPK) Viewer:</strong> Browse the contents of Source Engine archives. 100% client-side.'
    });
  };

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

    const files = [];
    const decoder = new TextDecoder('utf-8');
    let offset = headerSize;

    function readString() {
      const start = offset;
      while (offset < buffer.byteLength && view.getUint8(offset) !== 0) {
        offset++;
      }
      const str = decoder.decode(new Uint8Array(buffer, start, offset - start));
      offset++; // skip null
      return str;
    }

    while (offset < headerSize + treeSize) {
      const ext = readString();
      if (!ext) break;

      while (true) {
        const path = readString();
        if (!path) break;

        while (true) {
          const name = readString();
          if (!name) break;

          const crc = view.getUint32(offset, true);
          const preloadBytes = view.getUint16(offset + 4, true);
          const archiveIndex = view.getUint16(offset + 6, true);
          const entryOffset = view.getUint32(offset + 8, true);
          const entryLength = view.getUint32(offset + 12, true);
          const terminator = view.getUint16(offset + 16, true);
          
          if (terminator !== 0xFFFF) {
            // Some VPKs might have different alignments or structures, but 0xFFFF is standard
          }
          
          offset += 18;
          offset += preloadBytes;

          files.push({
            name: name,
            ext: ext,
            path: path,
            fullPath: (path === ' ' ? '' : path + '/') + name + '.' + ext,
            crc: crc.toString(16).padStart(8, '0'),
            length: entryLength,
            archiveIndex: archiveIndex,
            entryOffset: entryOffset,
            preloadBytes: preloadBytes
          });
        }
      }
    }

    return files;
  }

  function renderApp(helpers) {
    const state = helpers.getState();
    const files = state.files || [];

    const renderHtml = `
      <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
        <!-- Header -->
        <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">📦</span>
            <div class="space-y-0.5">
              <h3 class="text-sm font-bold text-surface-900 truncate max-w-md">${escapeHtml(state.fileName)}</h3>
              <p class="text-[10px] text-surface-400 font-bold uppercase tracking-wider">${formatSize(state.fileSize)} • ${files.length.toLocaleString()} Files</p>
            </div>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="shrink-0 px-4 py-2 border-b border-surface-100 bg-surface-50/30 flex gap-2">
          <div class="relative flex-1 max-w-sm">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs">🔍</span>
            <input type="text" id="vpk-search" value="${escapeHtml(state.searchTerm)}" placeholder="Search files by name or path..." class="w-full pl-9 pr-4 py-1.5 text-xs border border-surface-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20 bg-white">
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-auto">
          <table class="w-full text-xs text-left border-collapse min-w-max">
            <thead class="sticky top-0 z-20 bg-surface-50 shadow-sm">
              <tr>
                <th class="px-4 py-3 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider">File Path</th>
                <th class="px-4 py-3 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider">Size</th>
                <th class="px-4 py-3 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider">CRC32</th>
                <th class="px-4 py-3 border-b border-surface-200 text-surface-700 font-bold uppercase tracking-wider">Archive</th>
              </tr>
            </thead>
            <tbody id="vpk-body">
              ${renderRows(helpers)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    helpers.render(renderHtml);

    const searchInput = document.getElementById('vpk-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        helpers.setState('searchTerm', e.target.value);
        document.getElementById('vpk-body').innerHTML = renderRows(helpers);
      };
    }
  }

  function renderRows(helpers) {
    const state = helpers.getState();
    let files = state.files || [];
    const term = (state.searchTerm || '').toLowerCase();

    if (term) {
      files = files.filter(f => f.fullPath.toLowerCase().includes(term));
    }

    if (files.length === 0) {
      return `<tr><td colspan="4" class="p-12 text-center text-surface-400 italic">No files found.</td></tr>`;
    }

    const limit = 1000;
    const displayed = files.slice(0, limit);

    return displayed.map(f => `
      <tr class="hover:bg-surface-50 border-b border-surface-50 transition-colors">
        <td class="px-4 py-2 text-surface-600 font-mono truncate max-w-xl" title="${escapeHtml(f.fullPath)}">${escapeHtml(f.fullPath)}</td>
        <td class="px-4 py-2 text-surface-500 font-mono">${formatSize(f.length)}</td>
        <td class="px-4 py-2 text-surface-400 font-mono">${f.crc}</td>
        <td class="px-4 py-2 text-surface-400 font-mono">${f.archiveIndex === 0x7FFF ? 'Internal' : f.archiveIndex}</td>
      </tr>
    `).join('') + (files.length > limit ? `<tr><td colspan="4" class="p-4 text-center text-surface-400 italic bg-surface-50/20">Showing first 1,000 files (out of ${files.length.toLocaleString()}).</td></tr>` : '');
  }

})();
