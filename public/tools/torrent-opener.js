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
        // No external dependencies
      },
      onDestroy: function() {
        // No persistent resources to clean up
      },
      onFile: async function _onFileFn(file, content, helpers) {
        helpers.showLoading('Parsing torrent metadata...');
        
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

          helpers.showLoading('Calculating cryptographic info hash...');
          const infoHash = await calculateInfoHash(infoWrap.slice);
          
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

          if (files.length === 0) {
            throw new Error('No files found in torrent metadata');
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
            'The file may be corrupted, encrypted, or uses an unsupported bencode variant. Error: ' + e.message
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
          label: '📊 Export CSV',
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
      if (!state.files || !file) return;

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
            
            <!-- Main Content Area -->
            <div class="lg:col-span-2 space-y-8">
              
              <!-- Metadata Overview Card -->
              <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50/50 px-6 py-5 border-b border-surface-200">
                  <h2 class="text-xl font-bold text-surface-900 truncate" title="${esc(name)}">${esc(name)}</h2>
                </div>
                <div class="p-6">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                    <div class="space-y-6">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-2">Info Hash</div>
                        <!-- U8: Code Block -->
                        <div class="rounded-xl overflow-hidden border border-surface-200">
                          <pre class="p-4 text-xs font-mono bg-gray-950 text-brand-400 overflow-x-auto leading-relaxed select-all">${infoHash}</pre>
                        </div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Total Payload Size</div>
                        <div class="text-surface-900 font-extrabold text-2xl">${formatSize(totalSize)}</div>
                      </div>
                    </div>
                    
                    <div class="space-y-4">
                      <div class="flex justify-between items-center border-b border-surface-100 pb-3">
                        <span class="text-surface-500 font-medium">Date Created</span>
                        <span class="text-surface-800 font-semibold text-right">${creationDate || 'Unknown'}</span>
                      </div>
                      <div class="flex justify-between items-center border-b border-surface-100 pb-3">
                        <span class="text-surface-500 font-medium">Software</span>
                        <span class="text-surface-800 font-semibold truncate ml-4 text-right" title="${esc(createdBy)}">${esc(createdBy) || 'N/A'}</span>
                      </div>
                      <div class="flex justify-between items-center border-b border-surface-100 pb-3">
                        <span class="text-surface-500 font-medium">Structure</span>
                        <span class="text-surface-800 font-semibold text-right">${piecesCount.toLocaleString()} chunks @ ${formatSize(pieceLength)}</span>
                      </div>
                    </div>
                  </div>

                  ${comment ? `
                    <div class="mt-8 pt-6 border-t border-surface-100">
                      <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-2">Comment</div>
                      <div class="text-surface-600 italic leading-relaxed text-sm bg-surface-50 p-4 rounded-xl border border-surface-100">${esc(comment)}</div>
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Files Section -->
              <div>
                <!-- U10: Section Header with Count -->
                <div class="flex items-center justify-between mb-4 px-1">
                  <h3 class="font-bold text-surface-800 text-lg">File Contents</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-bold">${files.length} items</span>
                </div>
                
                <!-- Search Box -->
                <div class="mb-5 relative">
                  <input type="text" id="torrent-search" placeholder="Filter files by path or extension..." value="${esc(searchTerm)}" 
                    class="w-full px-4 py-3.5 pl-12 bg-white border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm">
                  <span class="absolute left-4 top-4 text-surface-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </span>
                </div>

                <!-- U7: Table Wrapper -->
                <div class="overflow-x-auto rounded-2xl border border-surface-200 bg-white shadow-sm">
                  <table class="min-w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th data-sort="path" class="sticky top-0 bg-white/95 backdrop-blur px-5 py-4 text-left font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors select-none group">
                          <div class="flex items-center gap-2">
                            Path
                            <span class="text-surface-300 group-hover:text-brand-500 transition-colors">${sortKey === 'path' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
                          </div>
                        </th>
                        <th data-sort="size" class="sticky top-0 bg-white/95 backdrop-blur px-5 py-4 text-right font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors w-40 select-none group">
                          <div class="flex items-center justify-end gap-2">
                            Size
                            <span class="text-surface-300 group-hover:text-brand-500 transition-colors">${sortKey === 'size' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${filteredFiles.length > 0 ? filteredFiles.slice(0, 1000).map(f => `
                        <tr class="even:bg-surface-50/50 hover:bg-brand-50/40 transition-colors">
                          <td class="px-5 py-4 text-surface-700 break-all font-medium leading-normal">${highlight(f.path, searchTerm)}</td>
                          <td class="px-5 py-4 text-right text-surface-500 font-mono whitespace-nowrap">${formatSize(f.size)}</td>
                        </tr>
                      `).join('') : `
                        <tr><td colspan="2" class="p-20 text-center text-surface-400 italic bg-surface-50/20">No matching files found</td></tr>
                      `}
                      ${filteredFiles.length > 1000 ? `
                        <tr><td colspan="2" class="p-4 text-center text-xs text-surface-500 font-semibold bg-surface-50/50 italic border-t border-surface-100 uppercase tracking-widest">Showing first 1,000 of ${filteredFiles.length.toLocaleString()} files</td></tr>
                      ` : ''}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Sidebar -->
            <div class="space-y-8">
              
              <!-- Trackers Section -->
              <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
                <div class="bg-surface-50/50 px-5 py-4 border-b border-surface-200 flex items-center justify-between">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Trackers</h3>
                  <span class="text-[10px] font-bold bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full">${trackers.length}</span>
                </div>
                <div class="p-5 space-y-3 max-h-[500px] overflow-y-auto bg-surface-50/10">
                  ${trackers.length > 0 ? trackers.map(tr => `
                    <!-- U9: Content Card -->
                    <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group cursor-default">
                      <div class="text-[11px] font-mono break-all text-surface-500 leading-relaxed group-hover:text-surface-900 transition-colors">${esc(tr)}</div>
                    </div>
                  `).join('') : '<div class="text-center text-surface-400 text-sm py-16 italic">No trackers found</div>'}
                </div>
              </div>

              <!-- Information Panel -->
              <div class="p-6 bg-gradient-to-br from-indigo-50/50 to-brand-50/50 rounded-2xl border border-brand-100 shadow-sm">
                <h4 class="font-bold text-brand-900 text-sm mb-3 flex items-center gap-2">
                  <svg class="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0114 0z"/></svg>
                  BitTorrent Metadata
                </h4>
                <p class="text-xs text-brand-800/80 leading-relaxed space-y-2">
                  The <strong class="text-brand-900">Info Hash</strong> is a unique SHA-1 fingerprint of the file metadata. It allows clients to verify data integrity and find peers across the global network via DHT.
                </p>
                <div class="mt-4 pt-4 border-t border-brand-100/50">
                  <p class="text-[10px] text-brand-600/70 font-medium italic">Parsed locally. Your data never leaves your browser.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      // B9: Namespace pollution avoidance - re-attach listeners
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

    // --- Bencode Decoder (Handles B2: Binary correctly) ---
    function decodeBencode(buffer) {
      let pos = 0;
      function parse() {
        if (pos >= buffer.length) throw new Error('Unexpected EOF');
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
          if (pos + len > buffer.length) throw new Error('Buffer overflow');
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
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
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
