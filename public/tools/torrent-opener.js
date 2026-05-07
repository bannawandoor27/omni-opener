(function() {
  'use strict';

  /**
   * OmniOpener Torrent Opener
   * A high-performance, browser-native .torrent file parser and visualizer.
   */
  window.initTool = function(toolConfig, mountEl) {
    const decoder = new TextDecoder('utf-8', { fatal: false });

    OmniTool.create(mountEl, toolConfig, {
      accept: '.torrent',
      dropLabel: 'Drop a .torrent file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed
      },
      onDestroy: function() {
        // No persistent resources to clean up
      },
      onFile: async function _onFileFn(file, content, helpers) {
        helpers.showLoading('Analyzing torrent structure...');
        
        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Expected binary content for torrent parsing');
          }

          const buffer = new Uint8Array(content);
          const decoded = decodeBencode(buffer);
          
          if (!decoded || decoded.type !== 'dict') {
            throw new Error('Invalid torrent: Root must be a dictionary');
          }

          const torrent = decoded.value;
          const infoWrap = torrent.info;
          
          if (!infoWrap || infoWrap.type !== 'dict') {
            throw new Error('Invalid torrent: Missing "info" dictionary');
          }

          helpers.showLoading('Computing info hash...');
          const infoHash = await calculateInfoHash(infoWrap.slice);
          
          // Metadata extraction
          const info = infoWrap.value;
          const name = getString(info.name) || 'Unnamed Torrent';
          const announce = getString(torrent.announce);
          const comment = getString(torrent.comment);
          const createdBy = getString(torrent['created by']);
          const creationDate = (torrent['creation date'] && torrent['creation date'].type === 'integer') 
            ? new Date(torrent['creation date'].value * 1000).toLocaleString() 
            : null;

          // Trackers extraction
          let trackers = [];
          if (announce) trackers.push(announce);
          if (torrent['announce-list'] && torrent['announce-list'].type === 'list') {
            torrent['announce-list'].value.forEach(list => {
              if (list.type === 'list') {
                list.value.forEach(tr => {
                  const url = getString(tr);
                  if (url && !trackers.includes(url)) trackers.push(url);
                });
              }
            });
          }

          // Files extraction
          let files = [];
          let totalSize = 0;
          if (info.files && info.files.type === 'list') {
            files = info.files.value.map(f => {
              const pathParts = f.value.path?.value.map(p => getString(p)) || [];
              const size = f.value.length?.value || 0;
              totalSize += size;
              return { path: pathParts.join('/'), size };
            });
          } else if (info.length) {
            const size = info.length.value;
            totalSize = size;
            files = [{ path: name, size }];
          }

          const magnetLink = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${trackers.slice(0, 5).map(tr => '&tr=' + encodeURIComponent(tr)).join('')}`;

          helpers.setState({
            name,
            infoHash,
            magnetLink,
            files,
            totalSize,
            trackers,
            comment,
            createdBy,
            creationDate,
            pieceLength: info['piece length']?.value || 0,
            piecesCount: info.pieces ? info.pieces.value.length / 20 : 0,
            searchTerm: '',
            sortKey: 'size',
            sortOrder: 'desc',
            isSearching: false
          });

          draw(helpers, mountEl);

        } catch (e) {
          console.error('[TorrentOpener] Parse Error:', e);
          helpers.showError(
            'Could not open torrent file',
            'The file may be corrupted or in an unsupported format. Error: ' + e.message
          );
        }
      },
      actions: [
        {
          label: '🧲 Copy Magnet Link',
          id: 'copy-magnet',
          onClick: function(h, btn) {
            const s = h.getState();
            if (s.magnetLink) h.copyToClipboard(s.magnetLink, btn);
          }
        },
        {
          label: '📋 Copy Info Hash',
          id: 'copy-hash',
          onClick: function(h, btn) {
            const s = h.getState();
            if (s.infoHash) h.copyToClipboard(s.infoHash, btn);
          }
        },
        {
          label: '📊 Export File List',
          id: 'dl-csv',
          onClick: function(h) {
            const s = h.getState();
            if (s.files && s.files.length > 0) {
              const csv = 'Path,Size (Bytes)\n' + s.files.map(f => `"${f.path.replace(/"/g, '""')}",${f.size}`).join('\n');
              const fileName = (h.getFile()?.name || 'torrent').replace(/\.torrent$/i, '');
              h.download(fileName + '_files.csv', csv);
            }
          }
        }
      ]
    });

    function getString(obj) {
      if (!obj || obj.type !== 'string') return '';
      return decoder.decode(obj.value);
    }

    function draw(helpers, mountEl) {
      const state = helpers.getState();
      const file = helpers.getFile();
      if (!state.files) return;

      const { name, infoHash, totalSize, files, trackers, searchTerm, sortKey, sortOrder, comment, createdBy, creationDate, pieceLength, piecesCount } = state;

      const filteredFiles = files.filter(f => f.path.toLowerCase().includes(searchTerm.toLowerCase()));
      filteredFiles.sort((a, b) => {
        const valA = a[sortKey], valB = b[sortKey];
        const res = typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
        return sortOrder === 'asc' ? res : -res;
      });

      const html = `
        <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.torrent file</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <!-- Left: Metadata & Files -->
            <div class="lg:col-span-2 space-y-8">
              
              <!-- Summary Card -->
              <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50/50 px-6 py-4 border-b border-surface-200">
                  <h2 class="text-xl font-bold text-surface-900 truncate" title="${esc(name)}">${esc(name)}</h2>
                </div>
                <div class="p-6">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    <div class="space-y-4">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Info Hash</div>
                        <div class="font-mono text-xs bg-brand-50 text-brand-700 p-3 rounded-xl border border-brand-100 break-all select-all">${infoHash}</div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Total Content Size</div>
                        <div class="text-surface-800 font-semibold text-lg">${formatSize(totalSize)}</div>
                      </div>
                    </div>
                    <div class="space-y-4">
                      <div class="flex justify-between border-b border-surface-100 pb-2">
                        <span class="text-surface-500 font-medium">Creation Date</span>
                        <span class="text-surface-800 font-semibold text-right">${creationDate || 'Unknown'}</span>
                      </div>
                      <div class="flex justify-between border-b border-surface-100 pb-2">
                        <span class="text-surface-500 font-medium">Created By</span>
                        <span class="text-surface-800 font-semibold truncate ml-4 text-right" title="${esc(createdBy)}">${esc(createdBy) || 'N/A'}</span>
                      </div>
                      <div class="flex justify-between border-b border-surface-100 pb-2">
                        <span class="text-surface-500 font-medium">Pieces</span>
                        <span class="text-surface-800 font-semibold text-right">${piecesCount.toLocaleString()} × ${formatSize(pieceLength)}</span>
                      </div>
                    </div>
                  </div>
                  ${comment ? `
                    <div class="mt-6 pt-4 border-t border-surface-100">
                      <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Comment</div>
                      <div class="text-surface-600 italic leading-relaxed text-sm">${esc(comment)}</div>
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Files Section -->
              <div>
                <div class="flex items-center justify-between mb-4">
                  <!-- U10: Section Header with Count -->
                  <h3 class="font-bold text-surface-800 text-lg">Files</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-bold">${files.length} items</span>
                </div>
                
                <div class="mb-4 relative">
                  <input type="text" id="torrent-search" placeholder="Search files by path..." value="${esc(searchTerm)}" 
                    class="w-full px-4 py-3 pl-11 bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm">
                  <span class="absolute left-4 top-3.5 text-surface-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </span>
                </div>

                <!-- U7: Table -->
                <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr>
                        <th data-sort="path" class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors select-none">
                          <div class="flex items-center gap-1">
                            File Path
                            <span class="text-surface-400">${sortKey === 'path' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
                          </div>
                        </th>
                        <th data-sort="size" class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors w-32 select-none">
                          <div class="flex items-center justify-end gap-1">
                            Size
                            <span class="text-surface-400">${sortKey === 'size' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${filteredFiles.length > 0 ? filteredFiles.slice(0, 500).map(f => `
                        <tr class="even:bg-surface-50 hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-3 text-surface-700 break-all font-medium leading-tight">${highlight(f.path, searchTerm)}</td>
                          <td class="px-4 py-3 text-right text-surface-500 font-mono whitespace-nowrap">${formatSize(f.size)}</td>
                        </tr>
                      `).join('') : `
                        <tr><td colspan="2" class="p-16 text-center text-surface-400 italic bg-surface-50/30">No files found matching your search</td></tr>
                      `}
                      ${filteredFiles.length > 500 ? `
                        <tr><td colspan="2" class="p-4 text-center text-xs text-surface-500 font-medium bg-surface-50/50 italic border-t border-surface-100">Showing first 500 of ${filteredFiles.length} files.</td></tr>
                      ` : ''}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Right: Trackers & Sidebar -->
            <div class="space-y-8">
              
              <!-- Trackers Card -->
              <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
                <div class="bg-surface-50/50 px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Trackers</h3>
                  <span class="text-[10px] font-bold bg-surface-200 text-surface-600 px-2 py-0.5 rounded-full">${trackers.length}</span>
                </div>
                <div class="p-4 space-y-3 max-h-[600px] overflow-y-auto bg-surface-50/10">
                  ${trackers.length > 0 ? trackers.map(tr => `
                    <!-- U9: Content Card -->
                    <div class="rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                      <div class="text-[10px] font-mono break-all text-surface-500 leading-relaxed group-hover:text-surface-900 transition-colors">${esc(tr)}</div>
                    </div>
                  `).join('') : '<div class="text-center text-surface-400 text-sm py-12 italic">No trackers listed</div>'}
                </div>
              </div>

              <!-- Technical Tip -->
              <div class="p-6 bg-gradient-to-br from-brand-50 to-indigo-50 rounded-2xl border border-brand-100 shadow-sm">
                <h4 class="font-bold text-brand-900 text-sm mb-2 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0114 0z"/></svg>
                  Client Info
                </h4>
                <p class="text-xs text-brand-700 leading-relaxed">
                  A .torrent file contains metadata about files and trackers. The Info Hash is a unique SHA-1 identifier for the data itself, used by BitTorrent clients to find peers via DHT or PEX.
                </p>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      // Re-attach listeners (B9 compliance)
      const searchInput = mountEl.querySelector('#torrent-search');
      if (searchInput) {
        if (state.isSearching) {
          searchInput.focus();
          searchInput.setSelectionRange(searchTerm.length, searchTerm.length);
        }
        searchInput.addEventListener('input', (e) => {
          helpers.setState({ searchTerm: e.target.value, isSearching: true });
          draw(helpers, mountEl);
        });
        searchInput.addEventListener('blur', () => {
          helpers.setState({ isSearching: false });
        });
      }

      mountEl.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.sort;
          const order = (sortKey === key && sortOrder === 'asc') ? 'desc' : 'asc';
          helpers.setState({ sortKey: key, sortOrder: order, isSearching: false });
          draw(helpers, mountEl);
        });
      });
    }

    // --- Core Torrent Utilities ---
    
    function decodeBencode(buffer) {
      let pos = 0;
      function parse() {
        if (pos >= buffer.length) throw new Error('Unexpected End of Buffer');
        const start = pos;
        const char = buffer[pos];

        if (char === 105) { // 'i' -> integer
          pos++;
          const end = buffer.indexOf(101, pos);
          if (end === -1) throw new Error('Unterminated integer');
          const val = parseInt(decoder.decode(buffer.subarray(pos, end)), 10);
          pos = end + 1;
          return { type: 'integer', value: val, slice: buffer.subarray(start, pos) };
        }
        if (char === 108) { // 'l' -> list
          pos++;
          const val = [];
          while (pos < buffer.length && buffer[pos] !== 101) val.push(parse());
          if (pos >= buffer.length) throw new Error('Unterminated list');
          pos++;
          return { type: 'list', value: val, slice: buffer.subarray(start, pos) };
        }
        if (char === 100) { // 'd' -> dictionary
          pos++;
          const val = {};
          while (pos < buffer.length && buffer[pos] !== 101) {
            const keyObj = parse();
            if (keyObj.type !== 'string') throw new Error('Dictionary keys must be strings');
            const key = decoder.decode(keyObj.value);
            val[key] = parse();
          }
          if (pos >= buffer.length) throw new Error('Unterminated dictionary');
          pos++;
          return { type: 'dict', value: val, slice: buffer.subarray(start, pos) };
        }
        if (char >= 48 && char <= 57) { // 0-9 -> string
          const colon = buffer.indexOf(58, pos);
          if (colon === -1) throw new Error('Invalid string length prefix');
          const len = parseInt(decoder.decode(buffer.subarray(pos, colon)), 10);
          pos = colon + 1;
          if (pos + len > buffer.length) throw new Error('Buffer overflow while reading string');
          const val = buffer.subarray(pos, pos + len);
          pos += len;
          return { type: 'string', value: val, slice: buffer.subarray(start, pos) };
        }
        throw new Error('Invalid bencode byte: ' + char);
      }
      return parse();
    }

    async function calculateInfoHash(infoBuffer) {
      const hash = await crypto.subtle.digest('SHA-1', infoBuffer);
      return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    function highlight(text, search) {
      if (!search) return esc(text);
      const lt = text.toLowerCase(), ls = search.toLowerCase();
      let res = '', last = 0, idx = lt.indexOf(ls);
      while (idx !== -1) {
        res += esc(text.substring(last, idx));
        res += '<mark class="bg-brand-100 text-brand-900 px-0.5 rounded font-bold">' + esc(text.substring(idx, idx + search.length)) + '</mark>';
        last = idx + search.length;
        idx = lt.indexOf(ls, last);
      }
      return res + esc(text.substring(last));
    }
  };
})();
