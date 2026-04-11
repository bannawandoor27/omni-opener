(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.torrent',
      dropLabel: 'Drop a .torrent file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies required
      },
      onFile: async function(file, content, helpers) {
        helpers.showLoading('Analyzing torrent structure...');
        
        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Expected ArrayBuffer for torrent parsing');
          }

          const buffer = new Uint8Array(content);
          const decoded = decodeBencode(buffer);
          
          if (!decoded || decoded.type !== 'dict') {
            throw new Error('Invalid torrent file: Root must be a dictionary');
          }

          const torrent = decoded.value;
          const infoWrap = torrent.info;
          
          if (!infoWrap || infoWrap.type !== 'dict') {
            throw new Error('Invalid torrent file: Missing "info" dictionary');
          }

          helpers.showLoading('Calculating info hash...');
          const infoHash = await calculateInfoHash(infoWrap.slice);
          
          renderTorrent(torrent, infoHash, file, helpers);

        } catch(e) {
          console.error('[TorrentOpener] Error:', e);
          helpers.showError(
            'Could not open torrent file', 
            'The file may be corrupted, encrypted, or use an unsupported bencode variant. Error: ' + e.message
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
              helpers.showError('No magnet link available');
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
          label: '📥 Download File List', 
          id: 'dl-list', 
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.fileListText) {
              const fileName = (helpers.getFile()?.name || 'torrent').replace(/\.torrent$/i, '');
              helpers.download(fileName + '_files.txt', state.fileListText);
            }
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> All processing is done locally in your browser. Your torrent files and their contents are never uploaded to any server.'
    });
  };

  // ── Bencode Decoder (Robust Implementation) ──────────────────────────
  function decodeBencode(buffer) {
    let pos = 0;
    const decoder = new TextDecoder('utf-8', { fatal: false });

    function parse() {
      if (pos >= buffer.length) throw new Error('Unexpected EOF');
      
      const start = pos;
      const charCode = buffer[pos];
      let type, value;

      if (charCode === 105) { // 'i' for integer
        pos++;
        let eIdx = pos;
        while (eIdx < buffer.length && buffer[eIdx] !== 101) eIdx++;
        if (eIdx === buffer.length) throw new Error('Unterminated integer');
        
        const intStr = decoder.decode(buffer.slice(pos, eIdx));
        value = parseInt(intStr, 10);
        if (isNaN(value)) throw new Error('Invalid integer: ' + intStr);
        
        pos = eIdx + 1;
        type = 'integer';
      } else if (charCode === 108) { // 'l' for list
        pos++;
        value = [];
        while (pos < buffer.length && buffer[pos] !== 101) {
          value.push(parse());
        }
        if (pos >= buffer.length) throw new Error('Unterminated list');
        pos++;
        type = 'list';
      } else if (charCode === 100) { // 'd' for dictionary
        pos++;
        value = {};
        while (pos < buffer.length && buffer[pos] !== 101) {
          const k = parse();
          if (k.type !== 'string') throw new Error('Dictionary keys must be strings');
          
          // Keys are always strings in bencode, but we store them as decoded strings
          const key = decoder.decode(k.value);
          value[key] = parse();
        }
        if (pos >= buffer.length) throw new Error('Unterminated dictionary');
        pos++;
        type = 'dict';
      } else if (charCode >= 48 && charCode <= 57) { // 0-9 for string length
        let colonIdx = pos;
        while (colonIdx < buffer.length && buffer[colonIdx] !== 58) colonIdx++;
        if (colonIdx === buffer.length) throw new Error('Invalid string length prefix');
        
        const lenStr = decoder.decode(buffer.slice(pos, colonIdx));
        const len = parseInt(lenStr, 10);
        if (isNaN(len)) throw new Error('Invalid string length: ' + lenStr);
        
        pos = colonIdx + 1;
        if (pos + len > buffer.length) throw new Error('String length exceeds buffer');
        
        value = buffer.slice(pos, pos + len);
        pos += len;
        type = 'string';
      } else {
        throw new Error('Unexpected byte ' + charCode + ' at position ' + pos);
      }

      return { type, value, slice: buffer.slice(start, pos) };
    }

    try {
      return parse();
    } catch (err) {
      console.error('Bencode parse error:', err);
      return null;
    }
  }

  // ── Info Hash Calculation ───────────────────────────────────────────
  async function calculateInfoHash(infoBuffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', infoBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── Render Logic ────────────────────────────────────────────────────
  function renderTorrent(torrent, infoHash, file, helpers) {
    const info = torrent.info.value;
    const decoder = new TextDecoder('utf-8', { fatal: false });
    
    function getString(obj, fallback = '') {
      if (!obj || obj.type !== 'string') return fallback;
      try {
        return decoder.decode(obj.value);
      } catch(e) {
        return '(binary data)';
      }
    }

    const torrentName = getString(info.name) || 'Unknown Torrent';
    const comment = getString(torrent.comment);
    const createdBy = getString(torrent['created by']);
    const creationDate = (torrent['creation date'] && torrent['creation date'].type === 'integer') 
      ? new Date(torrent['creation date'].value * 1000).toLocaleString() 
      : null;
    const announce = getString(torrent.announce);
    
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
      files.push({ path: torrentName, size });
      totalSize = size;
    }

    // Prepare State
    const magnetLink = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(torrentName)}${announce ? '&tr=' + encodeURIComponent(announce) : ''}`;
    helpers.setState('magnetLink', magnetLink);
    helpers.setState('infoHash', infoHash);
    helpers.setState('fileListText', files.map(f => `${formatSize(f.size).padStart(12)}  ${f.path}`).join('\n'));

    // Sorting files by size descending by default
    files.sort((a, b) => b.size - a.size);

    const renderView = () => {
      const state = helpers.getState();
      const searchTerm = (state.searchTerm || '').toLowerCase();
      const filteredFiles = files.filter(f => f.path.toLowerCase().includes(searchTerm));

      const html = `
        <div class="p-4 md:p-6 max-w-6xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.torrent archive</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Column: Summary and Files -->
            <div class="lg:col-span-2 space-y-6">
              
              <!-- Torrent Summary Card -->
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                  <h3 class="font-bold text-surface-700 text-xs uppercase tracking-wider">Torrent Summary</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${info.private && info.private.value === 1 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                    ${info.private && info.private.value === 1 ? 'PRIVATE' : 'PUBLIC'}
                  </span>
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="space-y-3">
                    <div class="flex flex-col">
                      <span class="text-[10px] font-bold text-surface-400 uppercase">Display Name</span>
                      <span class="text-sm font-semibold text-surface-900 break-all">${esc(torrentName)}</span>
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[10px] font-bold text-surface-400 uppercase">Info Hash</span>
                      <span class="text-xs font-mono text-brand-600 break-all select-all">${infoHash}</span>
                    </div>
                  </div>
                  <div class="space-y-3">
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] font-bold text-surface-400 uppercase">Total Size</span>
                      <span class="text-sm font-mono font-bold text-surface-700">${formatSize(totalSize)}</span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] font-bold text-surface-400 uppercase">Created On</span>
                      <span class="text-sm text-surface-600">${creationDate || 'Unknown'}</span>
                    </div>
                    ${createdBy ? `
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] font-bold text-surface-400 uppercase">Created By</span>
                      <span class="text-sm text-surface-600 truncate ml-4" title="${esc(createdBy)}">${esc(createdBy)}</span>
                    </div>` : ''}
                  </div>
                  ${comment ? `
                  <div class="md:col-span-2 pt-3 border-t border-surface-100">
                    <span class="text-[10px] font-bold text-surface-400 uppercase block mb-1">Comment</span>
                    <p class="text-sm text-surface-600 leading-relaxed italic">${esc(comment)}</p>
                  </div>` : ''}
                </div>
              </div>

              <!-- Files Section -->
              <div class="space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <h3 class="font-semibold text-surface-800">Contents</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${files.length} items</span>
                  </div>
                  
                  <!-- Search Filter -->
                  <div class="relative min-w-[240px]">
                    <input type="text" 
                      id="torrent-search" 
                      placeholder="Filter files by name..." 
                      value="${esc(state.searchTerm || '')}"
                      class="w-full pl-9 pr-4 py-1.5 text-sm bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                    >
                    <div class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                  </div>
                </div>

                <!-- U7: Table -->
                <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr class="bg-surface-50 border-b border-surface-200">
                        <th class="px-4 py-3 text-left font-semibold text-surface-700">File Path</th>
                        <th class="px-4 py-3 text-right font-semibold text-surface-700 w-32">Size</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${filteredFiles.length > 0 ? filteredFiles.slice(0, 500).map(f => `
                        <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                          <td class="px-4 py-2.5 text-surface-700 break-all font-medium group-hover:text-brand-700" title="${esc(f.path)}">
                            ${highlightSearch(f.path, searchTerm)}
                          </td>
                          <td class="px-4 py-2.5 text-right text-surface-500 font-mono text-xs whitespace-nowrap">
                            ${formatSize(f.size)}
                          </td>
                        </tr>
                      `).join('') : `
                        <tr>
                          <td colspan="2" class="px-4 py-12 text-center text-surface-400 italic">
                            ${searchTerm ? 'No files match your search' : 'No files found in this torrent'}
                          </td>
                        </tr>
                      `}
                      ${filteredFiles.length > 500 ? `
                        <tr class="bg-surface-50">
                          <td colspan="2" class="px-4 py-3 text-center text-surface-500 text-xs font-medium">
                            Showing first 500 of ${filteredFiles.length} files. Use the search box to find specific entries.
                          </td>
                        </tr>
                      ` : ''}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Right Column: Technical and Trackers -->
            <div class="space-y-6">
              <!-- Technical Specs Card -->
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50 px-4 py-3 border-b border-surface-200">
                  <h3 class="font-bold text-surface-700 text-xs uppercase tracking-wider">Technical Details</h3>
                </div>
                <div class="p-4 space-y-4">
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-surface-500">Piece Count</span>
                    <span class="text-xs font-mono font-bold text-surface-900">${(info.pieces ? info.pieces.value.length / 20 : 0).toLocaleString()}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-surface-500">Piece Size</span>
                    <span class="text-xs font-mono text-surface-900">${formatSize(info['piece length'] ? info['piece length'].value : 0)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-surface-500">Source</span>
                    <span class="text-xs text-surface-700 italic">${getString(torrent.source, 'N/A')}</span>
                  </div>
                </div>
              </div>

              <!-- Trackers Card -->
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                  <h3 class="font-bold text-surface-700 text-xs uppercase tracking-wider">Trackers</h3>
                  <span class="text-[10px] bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded font-mono">${trackers.length}</span>
                </div>
                <div class="p-3 space-y-2 overflow-y-auto bg-surface-50/30">
                  ${trackers.length > 0 ? trackers.map(tr => `
                    <!-- U9: Content Card for Trackers -->
                    <div class="p-2.5 bg-white rounded-lg border border-surface-200 text-[10px] text-surface-600 font-mono break-all leading-tight shadow-sm hover:border-brand-300 transition-colors">
                      ${esc(tr)}
                    </div>
                  `).join('') : `
                    <div class="p-8 text-center">
                      <span class="text-xs text-surface-400 italic">No trackers found</span>
                    </div>
                  `}
                </div>
              </div>

              <!-- Action Help -->
              <div class="p-4 rounded-xl bg-brand-50 border border-brand-100">
                <h4 class="text-xs font-bold text-brand-800 uppercase mb-2">Pro Tip</h4>
                <p class="text-xs text-brand-700 leading-relaxed">
                  Use the <strong>Magnet Link</strong> to quickly start your download in any BitTorrent client without downloading the file list manually.
                </p>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      // Attach Search Listener
      const searchInput = document.getElementById('torrent-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          helpers.setState('searchTerm', e.target.value);
          renderView();
        });
        // Refocus and maintain cursor position after render
        if (helpers.getState().searchTerm) {
          searchInput.focus();
          searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        }
      }
    };

    renderView();
  }

  // ── Utilities ───────────────────────────────────────────────────────
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightSearch(text, search) {
    const escapedText = esc(text);
    if (!search) return escapedText;
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedSearch})`, 'gi');
    return escapedText.replace(regex, '<mark class="bg-brand-100 text-brand-900 rounded px-0.5 font-bold">$1</mark>');
  }

})();
