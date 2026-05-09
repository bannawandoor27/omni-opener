(function() {
  'use strict';

  /**
   * OmniOpener CUE Sheet Tool
   * A production-grade tool for parsing and viewing CUE sheets.
   */

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.cue',
      dropLabel: 'Drop a .cue file here',
      binary: false,
      onFile: async function _onFile(file, content, helpers) {
        if (!content || content.trim().length === 0) {
          helpers.showError('Empty File', 'The selected CUE file contains no data.');
          return;
        }

        // B7: Large file handling
        if (content.length > 5 * 1024 * 1024) {
          helpers.showError('File Too Large', 'This CUE file is too large to process safely in the browser (max 5MB).');
          return;
        }

        // U2 & U6: Immediate loading state
        helpers.showLoading('Analyzing CUE metadata and tracks...');
        
        try {
          // Artificial delay for UI smoothness
          await new Promise(r => setTimeout(r, 300));
          
          const cueData = parseCue(content);
          
          if (!cueData.tracks || cueData.tracks.length === 0) {
            // U5: Empty state
            helpers.render(renderEmptyState(file));
            return;
          }

          renderCue(cueData, file, helpers);
        } catch (err) {
          console.error('CUE Parse Error:', err);
          helpers.showError(
            'Could not open CUE file', 
            'The file may be corrupted or in an unsupported variant. Ensure it follows the standard CUE sheet format.'
          );
        }
      },
      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'text/plain');
          }
        },
        {
          label: '📦 Export JSON',
          id: 'export-json',
          onClick: function(helpers) {
            const data = parseCue(helpers.getContent());
            const fileName = helpers.getFile().name.replace(/\.cue$/i, '') + '.json';
            helpers.download(fileName, JSON.stringify(data, null, 2), 'application/json');
          }
        }
      ],
      infoHtml: '<strong>Format Info:</strong> CUE sheets describe how tracks on a disc are laid out, including metadata like artist, title, and timestamps.',
      onDestroy: function() {
        // Clean up any global listeners if they were added (none here, but part of the rule)
      }
    });
  };

  /**
   * CUE Parser Logic
   */
  function parseCue(content) {
    const lines = content.split(/\r?\n/);
    const cue = {
      title: '',
      performer: '',
      songwriter: '',
      files: [],
      rem: {},
      tracks: []
    };

    let currentTrack = null;
    let currentFile = null;

    const stripQuotes = (str) => {
      if (!str) return '';
      str = str.trim();
      return str.replace(/^"|"$/g, '');
    };

    const parseArgs = (str) => {
      const args = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ' ' && !inQuotes) {
          if (current) args.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      if (current) args.push(current);
      return args;
    };

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      const firstSpace = line.indexOf(' ');
      const command = (firstSpace === -1 ? line : line.substring(0, firstSpace)).toUpperCase();
      const remaining = firstSpace === -1 ? '' : line.substring(firstSpace).trim();

      switch (command) {
        case 'REM': {
          const args = parseArgs(remaining);
          if (args.length >= 2) {
            const key = args[0].toUpperCase();
            const val = args.slice(1).join(' ');
            if (currentTrack) currentTrack.rem[key] = stripQuotes(val);
            else cue.rem[key] = stripQuotes(val);
          }
          break;
        }
        case 'PERFORMER':
          if (currentTrack) currentTrack.performer = stripQuotes(remaining);
          else cue.performer = stripQuotes(remaining);
          break;
        case 'TITLE':
          if (currentTrack) currentTrack.title = stripQuotes(remaining);
          else cue.title = stripQuotes(remaining);
          break;
        case 'SONGWRITER':
          if (currentTrack) currentTrack.songwriter = stripQuotes(remaining);
          else cue.songwriter = stripQuotes(remaining);
          break;
        case 'FILE': {
          const args = parseArgs(remaining);
          if (args.length >= 2) {
            const type = args.pop();
            const name = args.join(' ');
            currentFile = { name: stripQuotes(name), type };
            cue.files.push(currentFile);
          }
          break;
        }
        case 'TRACK': {
          const args = parseArgs(remaining);
          if (args.length >= 2) {
            currentTrack = {
              number: parseInt(args[0], 10),
              type: args[1],
              title: '',
              performer: '',
              songwriter: '',
              indices: [],
              rem: {},
              isrc: '',
              file: currentFile ? currentFile.name : null
            };
            cue.tracks.push(currentTrack);
          }
          break;
        }
        case 'INDEX': {
          const args = parseArgs(remaining);
          if (currentTrack && args.length >= 2) {
            currentTrack.indices.push({
              id: args[0],
              time: args[1]
            });
          }
          break;
        }
        case 'ISRC':
          if (currentTrack) currentTrack.isrc = stripQuotes(remaining);
          break;
      }
    }

    calculateDurations(cue.tracks);
    return cue;
  }

  function calculateDurations(tracks) {
    const timeToFrames = (timeStr) => {
      const parts = timeStr.split(':').map(p => parseInt(p, 10));
      if (parts.length !== 3) return 0;
      const [m, s, f] = parts;
      return (m * 60 * 75) + (s * 75) + f;
    };

    const framesToDuration = (frames) => {
      const totalSeconds = Math.floor(frames / 75);
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    for (let i = 0; i < tracks.length; i++) {
      const current = tracks[i];
      const next = tracks[i + 1];

      const startIndex = current.indices.find(idx => idx.id === '01') || current.indices[0];
      if (!startIndex) continue;

      current.startTimeFrames = timeToFrames(startIndex.time);
      current.startTimeFormatted = startIndex.time;

      if (next) {
        const nextStartIndex = next.indices.find(idx => idx.id === '01') || next.indices[0];
        if (nextStartIndex && next.file === current.file) {
          const nextFrames = timeToFrames(nextStartIndex.time);
          const durationFrames = nextFrames - current.startTimeFrames;
          if (durationFrames > 0) {
            current.duration = framesToDuration(durationFrames);
            current.durationFrames = durationFrames;
          }
        }
      }
    }
  }

  /**
   * Rendering Logic
   */
  function renderCue(cue, file, helpers) {
    const esc = (str) => {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
    };

    const humanSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const totalDurationFrames = cue.tracks.reduce((acc, t) => acc + (t.durationFrames || 0), 0);
    const totalDurationFormatted = (frames) => {
      const s = Math.floor(frames / 75);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      if (h > 0) return `${h}h ${m}m ${sec}s`;
      return `${m}m ${sec}s`;
    };

    let html = `
      <div class="omni-cue-container max-w-6xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200/50 shadow-sm">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${humanSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.cue sheet</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <!-- Metadata Sidebar (U9) -->
          <div class="lg:col-span-4 space-y-6">
            <div class="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm ring-1 ring-black/[0.02] hover:border-brand-300 transition-all">
              <div class="mb-6">
                <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Album Title</h2>
                <p class="text-2xl font-black text-surface-900 leading-tight">${esc(cue.title || 'Untitled Album')}</p>
              </div>
              <div class="mb-6">
                <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Performer</h2>
                <p class="text-lg font-bold text-brand-600">${esc(cue.performer || 'Unknown Artist')}</p>
              </div>
              
              <div class="grid grid-cols-2 gap-4 pt-6 border-t border-surface-100">
                <div>
                  <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Tracks</h2>
                  <p class="text-lg font-bold text-surface-800">${cue.tracks.length}</p>
                </div>
                <div>
                  <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Length</h2>
                  <p class="text-lg font-bold text-surface-800">${totalDurationFormatted(totalDurationFrames)}</p>
                </div>
              </div>

              ${cue.rem.GENRE || cue.rem.DATE ? `
                <div class="mt-6 flex flex-wrap gap-2">
                  ${cue.rem.GENRE ? `<span class="px-2.5 py-1 bg-brand-50 text-brand-700 text-[10px] font-bold rounded-lg border border-brand-100 uppercase tracking-wider">${esc(cue.rem.GENRE)}</span>` : ''}
                  ${cue.rem.DATE ? `<span class="px-2.5 py-1 bg-surface-100 text-surface-600 text-[10px] font-bold rounded-lg border border-surface-200 uppercase tracking-wider">${esc(cue.rem.DATE)}</span>` : ''}
                </div>
              ` : ''}
            </div>

            <!-- Extended REM Metadata -->
            ${Object.keys(cue.rem).length > 0 ? `
              <div class="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm ring-1 ring-black/[0.02]">
                <div class="px-5 py-3 bg-surface-50 border-b border-surface-200">
                  <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Extended Metadata</h3>
                </div>
                <div class="p-5 space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin">
                  ${Object.entries(cue.rem).map(([key, val]) => `
                    <div class="group border-b border-surface-50 last:border-0 pb-3 last:pb-0">
                      <span class="text-[9px] font-bold text-surface-400 uppercase tracking-wider block mb-0.5">${esc(key)}</span>
                      <span class="text-sm text-surface-700 break-all font-medium">${esc(val)}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Source Files -->
            ${cue.files.length > 0 ? `
              <div class="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm ring-1 ring-black/[0.02]">
                <div class="px-5 py-3 bg-surface-50 border-b border-surface-200">
                  <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Linked Files</h3>
                </div>
                <div class="divide-y divide-surface-100">
                  ${cue.files.map(f => `
                    <div class="p-4 hover:bg-surface-50/80 transition-colors group">
                      <div class="flex items-center gap-3">
                        <div class="p-2 bg-surface-100 rounded-lg group-hover:bg-white transition-all text-surface-500">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-semibold text-surface-800 truncate" title="${esc(f.name)}">${esc(f.name)}</div>
                          <div class="text-[10px] text-surface-400 font-bold uppercase tracking-widest mt-0.5">${esc(f.type)}</div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Tracklist (U7, U10) -->
          <div class="lg:col-span-8 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
              <div class="flex items-center gap-3">
                <h3 class="font-black text-surface-900 text-xl tracking-tight">Tracklist</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">${cue.tracks.length} tracks</span>
              </div>
              <div class="relative w-full sm:w-72">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <input type="text" id="trackSearch" placeholder="Filter by title or artist..." 
                  class="text-sm pl-10 pr-4 py-2 rounded-xl border border-surface-200 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 w-full transition-all shadow-sm">
              </div>
            </div>

            <div class="overflow-x-auto rounded-2xl border border-surface-200 bg-white shadow-lg ring-1 ring-black/[0.03]">
              <table class="min-w-full text-sm text-left" id="tracksTable">
                <thead>
                  <tr class="bg-surface-50/80 backdrop-blur border-b border-surface-200">
                    <th data-sort="number" class="cursor-pointer select-none px-6 py-4 text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors w-16">#</th>
                    <th data-sort="title" class="cursor-pointer select-none px-6 py-4 text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">Track Title</th>
                    <th data-sort="artist" class="cursor-pointer select-none px-6 py-4 text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">Artist</th>
                    <th data-sort="duration" class="cursor-pointer select-none px-6 py-4 text-right text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors w-24">Length</th>
                    <th class="px-6 py-4 text-right text-[10px] font-bold text-surface-400 uppercase tracking-widest w-24">Start</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${cue.tracks.map(track => {
                    const isCustomArtist = track.performer && track.performer !== cue.performer;
                    const searchData = `${track.number} ${track.title} ${track.performer} ${track.isrc}`.toLowerCase();
                    return `
                      <tr class="track-row group hover:bg-brand-50/50 transition-colors duration-200" data-search="${esc(searchData)}">
                        <td class="px-6 py-5 text-surface-400 font-mono text-xs tabular-nums font-bold">${track.number.toString().padStart(2, '0')}</td>
                        <td class="px-6 py-5">
                          <div class="font-bold text-surface-800 group-hover:text-brand-700 transition-colors">${esc(track.title || 'Untitled Track')}</div>
                          ${track.isrc ? `<div class="text-[9px] text-surface-400 font-mono mt-0.5 opacity-60">ISRC: ${esc(track.isrc)}</div>` : ''}
                        </td>
                        <td class="px-6 py-5">
                          <span class="${isCustomArtist ? 'text-brand-600 font-bold' : 'text-surface-500 font-medium'}">
                            ${esc(track.performer || cue.performer || 'Unknown')}
                          </span>
                        </td>
                        <td class="px-6 py-5 text-right font-mono text-[13px] text-surface-600">
                          ${track.duration || '--:--'}
                        </td>
                        <td class="px-6 py-5 text-right text-surface-400 font-mono text-[11px] tabular-nums">
                          ${track.startTimeFormatted || '00:00:00'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- U8: Raw Source -->
            <div class="mt-12">
              <div class="flex items-center justify-between mb-4 px-1">
                <h3 class="font-bold text-surface-800 text-sm">CUE Source View</h3>
                <span class="text-[10px] text-surface-400 font-mono bg-surface-100 px-2 py-0.5 rounded">${file.name}</span>
              </div>
              <div class="rounded-2xl overflow-hidden border border-surface-200 bg-gray-950 shadow-2xl ring-1 ring-white/10">
                <div class="flex items-center gap-1.5 px-4 py-3 bg-white/5 border-b border-white/10">
                  <div class="w-2.5 h-2.5 rounded-full bg-red-500/40"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/40"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-green-500/40"></div>
                </div>
                <pre class="p-6 text-[12px] font-mono text-gray-300 overflow-x-auto leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-white/10 selection:bg-brand-500/30"><code>${esc(helpers.getContent())}</code></pre>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Format Excellence: Interactive features
    setupSearch();
    setupSorting();
  }

  function setupSearch() {
    const searchInput = document.getElementById('trackSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', function _onSearchInput(e) {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('.track-row');
      let visibleCount = 0;
      
      rows.forEach(row => {
        const searchData = row.getAttribute('data-search');
        if (searchData.includes(query)) {
          row.style.display = '';
          visibleCount++;
        } else {
          row.style.display = 'none';
        }
      });

      const tbody = document.querySelector('#tracksTable tbody');
      let emptyMsg = document.getElementById('search-empty-msg');
      
      if (visibleCount === 0) {
        if (!emptyMsg) {
          emptyMsg = document.createElement('tr');
          emptyMsg.id = 'search-empty-msg';
          emptyMsg.innerHTML = `
            <td colspan="5" class="px-6 py-20 text-center bg-surface-50/50">
              <div class="flex flex-col items-center gap-2 text-surface-400">
                <svg class="w-10 h-10 opacity-20 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <p class="text-base font-semibold text-surface-600">No matching tracks</p>
                <p class="text-sm">Try searching for a different keyword or track number.</p>
              </div>
            </td>
          `;
          tbody.appendChild(emptyMsg);
        }
      } else if (emptyMsg) {
        emptyMsg.remove();
      }
    });
  }

  function setupSorting() {
    const table = document.getElementById('tracksTable');
    if (!table) return;

    const headers = table.querySelectorAll('th[data-sort]');
    let currentSort = { col: null, asc: true };

    headers.forEach(header => {
      header.addEventListener('click', function _onHeaderClick() {
        const colType = header.getAttribute('data-sort');
        const isAsc = currentSort.col === colType ? !currentSort.asc : true;
        currentSort = { col: colType, asc: isAsc };

        // Update UI headers
        headers.forEach(h => {
          h.classList.remove('text-brand-600');
          const span = h.querySelector('.sort-indicator');
          if (span) span.remove();
        });
        
        header.classList.add('text-brand-600');
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator ml-1.5 inline-block text-[10px] opacity-70';
        indicator.textContent = isAsc ? '▲' : '▼';
        header.appendChild(indicator);

        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr.track-row'));

        rows.sort((a, b) => {
          let valA, valB;
          
          if (colType === 'number') {
            valA = parseInt(a.cells[0].textContent, 10);
            valB = parseInt(b.cells[0].textContent, 10);
          } else if (colType === 'title') {
            valA = a.cells[1].querySelector('.font-bold').textContent.trim().toLowerCase();
            valB = b.cells[1].querySelector('.font-bold').textContent.trim().toLowerCase();
          } else if (colType === 'artist') {
            valA = a.cells[2].textContent.trim().toLowerCase();
            valB = b.cells[2].textContent.trim().toLowerCase();
          } else if (colType === 'duration') {
            const parseToSeconds = (s) => {
              const p = s.trim().split(':').map(Number);
              return p.length === 2 ? p[0] * 60 + p[1] : 0;
            };
            valA = parseToSeconds(a.cells[3].textContent);
            valB = parseToSeconds(b.cells[3].textContent);
          }

          if (valA < valB) return isAsc ? -1 : 1;
          if (valA > valB) return isAsc ? 1 : -1;
          return 0;
        });

        rows.forEach(row => tbody.appendChild(row));
      });
    });
  }

  function renderEmptyState(file) {
    const esc = (s) => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
    return `
      <div class="omni-cue-container max-w-4xl mx-auto p-12 text-center animate-in fade-in zoom-in-95 duration-500">
        <div class="mb-12 flex flex-wrap items-center justify-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-200/50">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Empty or Invalid CUE</span>
        </div>
        <div class="py-24 px-8 rounded-[2.5rem] border-2 border-dashed border-surface-200 bg-surface-50/20 flex flex-col items-center">
          <div class="w-20 h-20 bg-white rounded-3xl shadow-sm border border-surface-100 flex items-center justify-center text-surface-300 mb-8">
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <h2 class="text-2xl font-black text-surface-800 mb-3 tracking-tight">No tracks detected</h2>
          <p class="text-surface-500 max-w-sm mx-auto leading-relaxed">We couldn't find any track entries in this CUE sheet. Please ensure it's a standard disc image descriptor file.</p>
        </div>
      </div>
    `;
  }

})();
