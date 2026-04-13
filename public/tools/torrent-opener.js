(function() {
  'use strict';

  /**
   * OmniOpener Torrent Opener
   * A high-performance, browser-native .torrent file parser and visualizer.
   */
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.torrent',
      dropLabel: 'Drop a .torrent file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed; uses native Crypto and TextDecoder
      },
      onFile: async function(file, content, helpers) {
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
          
          processAndRender(torrent, infoHash, file, helpers);

        } catch (e) {
          console.error('[TorrentOpener] Parse Error:', e);
          helpers.showError(
            'Could not open torrent file',
            'The file may be corrupted, encrypted, or use an unsupported variant. Error: ' + e.message
          );
        }
      },
      actions: [
        {
          label: '🧲 Copy Magnet Link',
          id: 'copy-magnet',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.magnetLink) {
              helpers.copyToClipboard(state.magnetLink, btn);
            } else {
              helpers.showError('Magnet link not available');
            }
          }
        },
        {
          label: '📋 Copy Info Hash',
          id: 'copy-hash',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.infoHash) {
              helpers.copyToClipboard(state.infoHash, btn);
            }
          }
        },
        {
          label: '📊 Download CSV List',
          id: 'dl-csv',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.files && state.files.length > 0) {
              const csv = 'Path,Size (Bytes)\n' + state.files.map(f => `"${f.path.replace(/"/g, '""')}",${f.size}`).join('\n');
              const fileName = (helpers.getFile()?.name || 'torrent').replace(/\.torrent$/i, '');
              helpers.download(fileName + '_files.csv', csv);
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Processing is done entirely in your browser. Your files never leave your device.'
    });
  };

  // ── Processing & Rendering ──────────────────────────────────────────
  function processAndRender(torrent, infoHash, file, helpers) {
    const info = torrent.info.value;
    const decoder = new TextDecoder('utf-8', { fatal: false });
    
    const getString = (obj, fallback = '') => {
      if (!obj || obj.type !== 'string') return fallback;
      try { return decoder.decode(obj.value); } catch(e) { return '(binary data)'; }
    };

    // Extract Basic Metadata
    const name = getString(info.name) || 'Unnamed Torrent';
    const comment = getString(torrent.comment);
    const createdBy = getString(torrent['created by']);
    const creationDate = (torrent['creation date'] && torrent['creation date'].type === 'integer') 
      ? new Date(torrent['creation date'].value * 1000).toLocaleString() 
      : null;
    const announce = getString(torrent.announce);
    const isPrivate = info.private && info.private.value === 1;
    
    // Extract Trackers
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

    // Extract Files
    let files = [];
    let totalSize = 0;
    if (info.files && info.files.type === 'list') {
      info.files.value.forEach(f => {
        if (f.type === 'dict' && f.value.path && f.value.length) {
          const pathParts = f.value.path.type === 'list' 
            ? f.value.path.value.map(p => getString(p)) 
            : [getString(f.value.path)];
          const size = (f.value.length.type === 'integer') ? f.value.length.value : 0;
          files.push({ path: pathParts.join('/'), size });
          totalSize += size;
        }
      });
    } else if (info.length && info.length.type === 'integer') {
      const size = info.length.value;
      files.push({ path: name, size });
      totalSize = size;
    }

    // Magnet Link Construction
    const magnetLink = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(name)}${announce ? '&tr=' + encodeURIComponent(announce) : ''}`;
    
    // Initial State
    helpers.setState({
      files,
      totalSize,
      infoHash,
      magnetLink,
      searchTerm: '',
      sortKey: 'size',
      sortOrder: 'desc'
    });

    const render = () => {
      const state = helpers.getState();
      const searchTerm = (state.searchTerm || '').toLowerCase();
      
      let filteredFiles = files.filter(f => f.path.toLowerCase().includes(searchTerm));
      
      // Sort
      filteredFiles.sort((a, b) => {
        const valA = a[state.sortKey];
        const valB = b[state.sortKey];
        const factor = state.sortOrder === 'asc' ? 1 : -1;
        if (typeof valA === 'string') return valA.localeCompare(valB) * factor;
        return (valA - valB) * factor;
      });

      const html = `
        <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.torrent file</span>
            <span class="ml-auto text-xs font-mono bg-surface-200 px-2 py-0.5 rounded text-surface-600">${infoHash.substring(0, 8)}...</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <!-- Left: Metadata & Files -->
            <div class="lg:col-span-2 space-y-6">
              
              <!-- Metadata Card -->
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50/50 px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Torrent Information</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isPrivate ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}">
                    ${isPrivate ? 'PRIVATE' : 'PUBLIC'}
                  </span>
                </div>
                <div class="p-5">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-4">
                      <div>
                        <label class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter block mb-1">Display Name</label>
                        <div class="text-sm font-semibold text-surface-900 break-all">${esc(name)}</div>
                      </div>
                      <div>
                        <label class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter block mb-1">Info Hash</label>
                        <div class="text-xs font-mono text-brand-600 break-all select-all p-2 bg-brand-50 rounded-lg border border-brand-100">${infoHash}</div>
                      </div>
                    </div>
                    <div class="space-y-3">
                      <div class="flex justify-between items-center py-1 border-b border-surface-100">
                        <span class="text-xs text-surface-500 font-medium uppercase">Total Size</span>
                        <span class="text-sm font-mono font-bold text-surface-800">${formatSize(totalSize)}</span>
                      </div>
                      <div class="flex justify-between items-center py-1 border-b border-surface-100">
                        <span class="text-xs text-surface-500 font-medium uppercase">Creation Date</span>
                        <span class="text-sm text-surface-700">${creationDate || 'Unknown'}</span>
                      </div>
                      <div class="flex justify-between items-center py-1 border-b border-surface-100">
                        <span class="text-xs text-surface-500 font-medium uppercase">Created By</span>
                        <span class="text-sm text-surface-700 truncate ml-4" title="${esc(createdBy)}">${esc(createdBy) || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                  ${comment ? `
                    <div class="mt-5 pt-4 border-t border-surface-100">
                      <label class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter block mb-1">Comment</label>
                      <p class="text-sm text-surface-600 leading-relaxed italic">${esc(comment)}</p>
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Files Section -->
              <div class="space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <!-- U10: Section Header with Count -->
                  <div class="flex items-center gap-3">
                    <h3 class="font-bold text-surface-800">Files</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-semibold">${files.length} items</span>
                  </div>
                  
                  <!-- ARCHIVES: Search Filter -->
                  <div class="relative w-full sm:w-64">
                    <input type="text" id="t-search" placeholder="Search by filename..." value="${esc(state.searchTerm)}"
                      class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm">
                    <div class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                  </div>
                </div>

                <!-- U7: Table with Sort -->
                <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
                  <table class="min-w-full text-sm border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group" onclick="window.tSort('path')">
                          <div class="flex items-center gap-1">
                            File Path
                            <span class="text-[10px] text-surface-400 group-hover:text-brand-500">${state.sortKey === 'path' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                          </div>
                        </th>
                        <th class="sticky top-0 bg-surface-50 px-4 py-3 text-right font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group w-32" onclick="window.tSort('size')">
                          <div class="flex items-center justify-end gap-1">
                            Size
                            <span class="text-[10px] text-surface-400 group-hover:text-brand-500">${state.sortKey === 'size' ? (state.sortOrder === 'asc' ? '▲' : '▼') : '↕'}</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${filteredFiles.length > 0 ? filteredFiles.slice(0, 500).map(f => `
                        <tr class="even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-3 text-surface-700 break-all font-medium leading-tight">${highlightSearch(f.path, searchTerm)}</td>
                          <td class="px-4 py-3 text-right text-surface-500 font-mono text-xs whitespace-nowrap">${formatSize(f.size)}</td>
                        </tr>
                      `).join('') : `
                        <tr>
                          <td colspan="2" class="px-4 py-16 text-center text-surface-400 italic bg-surface-50/30">
                            ${searchTerm ? 'No files match your search criteria' : 'This torrent appears to be empty'}
                          </td>
                        </tr>
                      `}
                      ${filteredFiles.length > 500 ? `
                        <tr>
                          <td colspan="2" class="px-4 py-4 bg-surface-50 text-center text-xs text-surface-500 font-medium">
                            Showing 500 of ${filteredFiles.length} files. Refine search to see more.
                          </td>
                        </tr>
                      ` : ''}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Right: Technical Details & Trackers -->
            <div class="space-y-6">
              
              <!-- Technical Info -->
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50/50 px-4 py-3 border-b border-surface-200">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Protocol Stats</h3>
                </div>
                <div class="p-4 space-y-4">
                  <div class="flex justify-between items-center py-1 border-b border-surface-50">
                    <span class="text-xs text-surface-500">Piece Count</span>
                    <span class="text-xs font-mono font-bold text-surface-900">${(info.pieces ? info.pieces.value.length / 20 : 0).toLocaleString()}</span>
                  </div>
                  <div class="flex justify-between items-center py-1 border-b border-surface-50">
                    <span class="text-xs text-surface-500">Piece Length</span>
                    <span class="text-xs font-mono font-bold text-surface-900">${formatSize(info['piece length'] ? info['piece length'].value : 0)}</span>
                  </div>
                  <div class="flex justify-between items-center py-1">
                    <span class="text-xs text-surface-500">Source</span>
                    <span class="text-xs text-surface-800 font-medium truncate ml-4" title="${esc(getString(torrent.source))}">${esc(getString(torrent.source)) || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <!-- Trackers Card -->
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
                <div class="bg-surface-50/50 px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Trackers</h3>
                  <span class="text-[10px] font-bold bg-surface-200 text-surface-600 px-2 py-0.5 rounded">${trackers.length}</span>
                </div>
                <div class="p-3 bg-surface-50/20 max-h-[400px] overflow-y-auto space-y-2">
                  ${trackers.length > 0 ? trackers.map(tr => `
                    <!-- U9: Content Card -->
                    <div class="p-3 bg-white rounded-xl border border-surface-200 text-[10px] font-mono text-surface-600 break-all leading-normal shadow-sm hover:border-brand-400 hover:shadow transition-all group">
                      <div class="text-brand-500 mb-1 opacity-50 group-hover:opacity-100">● Tracker URL</div>
                      ${esc(tr)}
                    </div>
                  `).join('') : `
                    <div class="py-12 text-center text-xs text-surface-400 italic">No trackers listed</div>
                  `}
                </div>
              </div>

              <!-- Guide -->
              <div class="p-5 bg-gradient-to-br from-brand-50 to-indigo-50 rounded-2xl border border-brand-100 shadow-sm">
                <h4 class="text-xs font-bold text-brand-900 uppercase mb-2 flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0114 0z"></path></svg>
                  Usage Note
                </h4>
                <p class="text-xs text-brand-700 leading-relaxed">
                  The magnet link contains the info hash and name, allowing any compatible BitTorrent client to retrieve piece metadata directly from the DHT network or trackers.
                </p>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      // Re-attach Search Event
      const searchInput = document.getElementById('t-search');
      if (searchInput) {
        searchInput.focus();
        // Maintain cursor at end
        const val = searchInput.value;
        searchInput.value = '';
        searchInput.value = val;

        searchInput.addEventListener('input', (e) => {
          helpers.setState('searchTerm', e.target.value);
          render();
        });
      }
    };

    // Sorting Helper on Window (cleanest for inline onclick)
    window.tSort = (key) => {
      const state = helpers.getState();
      const sortOrder = (state.sortKey === key && state.sortOrder === 'desc') ? 'asc' : 'desc';
      helpers.setState({ sortKey: key, sortOrder: sortOrder });
      render();
    };

    render();
  }

  // ── Bencode Decoder (Production Robust) ──────────────────────────
  function decodeBencode(buffer) {
    let pos = 0;
    const decoder = new TextDecoder('utf-8', { fatal: false });

    function parse() {
      if (pos >= buffer.length) throw new Error('Unexpected End of File');
      
      const charCode = buffer[pos];
      const start = pos;
      let value;

      if (charCode === 105) { // 'i' -> integer
        pos++;
        const end = buffer.indexOf(101, pos);
        if (end === -1) throw new Error('Unterminated integer');
        const intStr = decoder.decode(buffer.subarray(pos, end));
        value = parseInt(intStr, 10);
        pos = end + 1;
        return { type: 'integer', value, slice: buffer.subarray(start, pos) };
      } 
      
      if (charCode === 108) { // 'l' -> list
        pos++;
        value = [];
        while (pos < buffer.length && buffer[pos] !== 101) {
          value.push(parse());
        }
        if (pos >= buffer.length) throw new Error('Unterminated list');
        pos++;
        return { type: 'list', value, slice: buffer.subarray(start, pos) };
      } 
      
      if (charCode === 100) { // 'd' -> dictionary
        pos++;
        value = {};
        while (pos < buffer.length && buffer[pos] !== 101) {
          const keyObj = parse();
          if (keyObj.type !== 'string') throw new Error('Dict keys must be strings');
          const key = decoder.decode(keyObj.value);
          value[key] = parse();
        }
        if (pos >= buffer.length) throw new Error('Unterminated dictionary');
        pos++;
        return { type: 'dict', value, slice: buffer.subarray(start, pos) };
      } 
      
      if (charCode >= 48 && charCode <= 57) { // 0-9 -> string
        const colon = buffer.indexOf(58, pos);
        if (colon === -1) throw new Error('Invalid string length prefix');
        const length = parseInt(decoder.decode(buffer.subarray(pos, colon)), 10);
        pos = colon + 1;
        if (pos + length > buffer.length) throw new Error('Buffer overflow reading string');
        value = buffer.subarray(pos, pos + length);
        pos += length;
        return { type: 'string', value, slice: buffer.subarray(start, pos) };
      }

      throw new Error(`Invalid bencode byte: ${charCode} at ${pos}`);
    }

    return parse();
  }

  // ── Crypto ──────────────────────────────────────────────────────────
  async function calculateInfoHash(infoBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', infoBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ── Utilities ───────────────────────────────────────────────────────
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
  }

  function esc(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  function highlightSearch(text, search) {
    const escapedText = esc(text);
    if (!search) return escapedText;
    try {
      const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      return escapedText.replace(regex, '<mark class="bg-brand-100 text-brand-900 rounded-sm font-bold">$1</mark>');
    } catch(e) {
      return escapedText;
    }
  }

})();
