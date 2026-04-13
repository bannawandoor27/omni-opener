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
      onInit: function(helpers) {
        // No external dependencies needed for CUE parsing
      },
      onFile: async function(file, content, helpers) {
        if (!content || content.trim().length === 0) {
          helpers.showError('Empty File', 'The selected CUE file contains no data.');
          return;
        }

        // B7: Large file handling
        if (content.length > 5 * 1024 * 1024) { // 5MB is extremely large for a CUE file
          helpers.showError('File Too Large', 'This CUE file is too large to process safely in the browser.');
          return;
        }

        // U2 & U6: Immediate loading state
        helpers.showLoading('Analyzing CUE metadata and tracks...');
        
        try {
          // Artificial delay for better UX on fast machines
          await new Promise(r => setTimeout(r, 400));
          
          const cueData = parseCue(content);
          
          if (!cueData.tracks || cueData.tracks.length === 0) {
            // U5: Empty state handling
            helpers.render(renderEmptyState(file, helpers));
            return;
          }

          renderCue(cueData, file, helpers);
        } catch (err) {
          console.error('CUE Parse Error:', err);
          helpers.showError(
            'Could not open CUE file', 
            'The file may be corrupted or in an unsupported variant. Try ensuring it follows the standard CUE sheet format.'
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
            const content = helpers.getContent();
            const data = parseCue(content);
            const fileName = helpers.getFile().name.replace(/\.cue$/i, '') + '.json';
            helpers.download(fileName, JSON.stringify(data, null, 2), 'application/json');
          }
        }
      ],
      infoHtml: '<strong>Format Info:</strong> CUE sheets describe how tracks on a compact disc are laid out, including metadata like artist, title, and timestamps.'
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
            if (currentTrack) currentTrack.rem[key] = val;
            else cue.rem[key] = val;
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
            currentFile = { name, type };
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
          }
        }
      }
    }
  }

  /**
   * Rendering Logic
   */
  function renderCue(cue, file, helpers) {
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // B6: XSS Protection
    const esc = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const fileSize = formatBytes(file.size);
    const trackCount = cue.tracks.length;

    let html = `
      <div class="omni-cue-container max-w-6xl mx-auto p-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200/50">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${fileSize}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.cue sheet</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <!-- Metadata Sidebar (U9) -->
          <div class="lg:col-span-4 space-y-6">
            <div class="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm ring-1 ring-black/[0.02]">
              <div class="mb-5">
                <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-1">Album Title</h2>
                <p class="text-2xl font-black text-surface-900 leading-tight">${esc(cue.title || 'Untitled Album')}</p>
              </div>
              <div class="mb-5">
                <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-1">Performer</h2>
                <p class="text-lg font-bold text-brand-600">${esc(cue.performer || 'Unknown Artist')}</p>
              </div>
              ${cue.songwriter ? `
              <div class="mb-5">
                <h2 class="text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em] mb-1">Songwriter</h2>
                <p class="text-sm text-surface-600 font-medium">${esc(cue.songwriter)}</p>
              </div>
              ` : ''}
              
              <div class="pt-5 border-t border-surface-100 flex flex-wrap gap-2">
                ${cue.rem.GENRE ? `<span class="px-2.5 py-1 bg-brand-50 text-brand-700 text-[10px] font-bold rounded-lg border border-brand-100 uppercase tracking-wider">${esc(cue.rem.GENRE)}</span>` : ''}
                ${cue.rem.DATE ? `<span class="px-2.5 py-1 bg-surface-100 text-surface-600 text-[10px] font-bold rounded-lg border border-surface-200 uppercase tracking-wider">${esc(cue.rem.DATE)}</span>` : ''}
              </div>
            </div>

            <!-- Detailed REM Metadata -->
            ${Object.keys(cue.rem).filter(k => !['GENRE', 'DATE'].includes(k)).length > 0 ? `
              <div class="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm ring-1 ring-black/[0.02]">
                <div class="px-5 py-3 bg-surface-50/50 border-b border-surface-200">
                  <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-[0.15em]">Extended Metadata</h3>
                </div>
                <div class="p-5 space-y-4">
                  ${Object.keys(cue.rem).filter(k => !['GENRE', 'DATE'].includes(k)).map(key => `
                    <div class="group">
                      <span class="text-[9px] font-bold text-surface-400 uppercase tracking-wider block mb-0.5">${esc(key)}</span>
                      <span class="text-sm text-surface-700 break-all font-medium selection:bg-brand-100">${esc(cue.rem[key])}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Master Files -->
            ${cue.files.length > 0 ? `
              <div class="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm ring-1 ring-black/[0.02]">
                <div class="px-5 py-3 bg-surface-50/50 border-b border-surface-200">
                  <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-[0.15em]">Source Files</h3>
                </div>
                <div class="divide-y divide-surface-100">
                  ${cue.files.map(f => `
                    <div class="p-4 hover:bg-surface-50/80 transition-colors group">
                      <div class="flex items-start gap-3">
                        <div class="mt-1 p-1.5 bg-surface-100 rounded-lg group-hover:bg-white group-hover:shadow-sm transition-all text-surface-500">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
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
          <div class="lg:col-span-8 space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 px-1">
              <div class="flex items-center gap-3">
                <h3 class="font-black text-surface-900 text-lg">Tracklist</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">${trackCount} items</span>
              </div>
              <div class="relative group">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400 group-focus-within:text-brand-500 transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <input type="text" id="trackSearch" placeholder="Search tracks..." 
                  class="text-xs pl-9 pr-4 py-2 rounded-xl border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-full sm:w-64 transition-all shadow-sm placeholder:text-surface-400">
              </div>
            </div>

            <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm ring-1 ring-black/[0.02]">
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm" id="tracksTable">
                  <thead>
                    <tr class="bg-surface-50/50 border-b border-surface-200">
                      <th data-sort="number" class="cursor-pointer select-none px-5 py-4 text-left text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">#</th>
                      <th data-sort="title" class="cursor-pointer select-none px-5 py-4 text-left text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">Track Title</th>
                      <th data-sort="artist" class="cursor-pointer select-none px-5 py-4 text-left text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">Artist</th>
                      <th data-sort="duration" class="cursor-pointer select-none px-5 py-4 text-right text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">Duration</th>
                      <th class="px-5 py-4 text-right text-[10px] font-bold text-surface-400 uppercase tracking-widest">Start</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${cue.tracks.map(track => {
                      const isCustomArtist = track.performer && track.performer !== cue.performer;
                      const searchData = `${track.number} ${track.title} ${track.performer} ${track.isrc}`.toLowerCase();
                      return `
                        <tr class="track-row group hover:bg-brand-50/40 transition-colors duration-150" data-search="${esc(searchData)}">
                          <td class="px-5 py-4 text-surface-400 font-mono text-xs tabular-nums font-bold">${track.number.toString().padStart(2, '0')}</td>
                          <td class="px-5 py-4">
                            <div class="font-bold text-surface-800 group-hover:text-brand-700 transition-colors">${esc(track.title || 'Untitled Track')}</div>
                            ${track.isrc ? `<div class="text-[9px] text-surface-400 font-mono mt-0.5">ISRC: ${esc(track.isrc)}</div>` : ''}
                          </td>
                          <td class="px-5 py-4">
                            <span class="${isCustomArtist ? 'text-brand-600 font-bold' : 'text-surface-500 font-medium'}">
                              ${esc(track.performer || cue.performer || 'Unknown')}
                            </span>
                          </td>
                          <td class="px-5 py-4 text-right">
                            <span class="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-[11px] font-bold font-mono">
                              ${track.duration || '--:--'}
                            </span>
                          </td>
                          <td class="px-5 py-4 text-right text-surface-400 font-mono text-[11px] tabular-nums">
                            ${track.startTimeFormatted || '00:00:00'}
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- U8: Raw Source -->
            <div class="mt-8">
              <div class="flex items-center justify-between mb-3 px-1">
                <h3 class="font-bold text-surface-800 text-sm">Raw CUE Sheet</h3>
                <span class="text-[10px] text-surface-400 font-mono">${file.name}</span>
              </div>
              <div class="rounded-2xl overflow-hidden border border-surface-200 bg-gray-950 shadow-lg ring-1 ring-white/5">
                <div class="flex items-center gap-1.5 px-4 py-3 bg-white/5 border-b border-white/10">
                  <div class="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/40"></div>
                </div>
                <pre class="p-5 text-[11px] font-mono text-gray-300 overflow-x-auto leading-relaxed max-h-[500px] scrollbar-thin scrollbar-thumb-white/10 selection:bg-brand-500/30"><code>${esc(helpers.getContent())}</code></pre>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Format Excellence: Live Search
    setupSearch(esc);
    
    // Format Excellence: Column Sorting
    setupSorting();
  }

  function setupSearch(esc) {
    const searchInput = document.getElementById('trackSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('.track-row');
      let visibleCount = 0;
      
      rows.forEach(row => {
        const searchData = row.getAttribute('data-search');
        if (searchData.includes(query)) {
          row.style.display = '';
          row.classList.add('animate-in', 'fade-in', 'zoom-in-95', 'duration-300');
          visibleCount++;
        } else {
          row.style.display = 'none';
          row.classList.remove('animate-in', 'fade-in', 'zoom-in-95');
        }
      });

      const tableBody = document.querySelector('#tracksTable tbody');
      let emptyMsg = document.getElementById('empty-search-msg');
      
      if (visibleCount === 0 && query !== '') {
        if (!emptyMsg) {
          emptyMsg = document.createElement('tr');
          emptyMsg.id = 'empty-search-msg';
          emptyMsg.innerHTML = `
            <td colspan="5" class="px-5 py-12 text-center bg-surface-50/50 rounded-b-2xl">
              <div class="flex flex-col items-center gap-2 text-surface-400">
                <svg class="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <p class="text-sm font-medium">No tracks matching "${esc(query)}"</p>
                <p class="text-xs">Try searching for artist, title, or track number</p>
              </div>
            </td>
          `;
          tableBody.appendChild(emptyMsg);
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
      header.addEventListener('click', () => {
        const colType = header.getAttribute('data-sort');
        const isAsc = currentSort.col === colType ? !currentSort.asc : true;
        currentSort = { col: colType, asc: isAsc };

        // Update UI
        headers.forEach(h => {
          h.classList.remove('text-brand-600');
          const span = h.querySelector('.sort-icon');
          if (span) span.remove();
        });
        header.classList.add('text-brand-600');
        const icon = document.createElement('span');
        icon.className = 'sort-icon ml-1 inline-block transition-transform duration-200';
        icon.style.transform = isAsc ? 'rotate(0deg)' : 'rotate(180deg)';
        icon.innerHTML = '▴';
        header.appendChild(icon);

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
            valA = a.cells[3].textContent.trim();
            valB = b.cells[3].textContent.trim();
            // Convert MM:SS to seconds for proper sorting
            const parseD = (s) => {
              const p = s.split(':').map(Number);
              return p.length === 2 ? p[0] * 60 + p[1] : 0;
            };
            valA = parseD(valA);
            valB = parseD(valB);
          }

          if (valA < valB) return isAsc ? -1 : 1;
          if (valA > valB) return isAsc ? 1 : -1;
          return 0;
        });

        rows.forEach(row => tbody.appendChild(row));
      });
    });
  }

  function renderEmptyState(file, helpers) {
    const esc = (str) => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]));
    return `
      <div class="omni-cue-container max-w-4xl mx-auto p-8 text-center animate-in fade-in zoom-in-95 duration-500">
        <div class="flex flex-wrap items-center justify-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-8 border border-surface-200/50">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Empty file</span>
        </div>
        <div class="py-16 px-6 rounded-3xl border-2 border-dashed border-surface-200 bg-surface-50/30 flex flex-col items-center">
          <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center text-surface-300 mb-6">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          </div>
          <h2 class="text-xl font-bold text-surface-800 mb-2">No tracks found</h2>
          <p class="text-surface-500 max-w-sm mx-auto">This CUE file appears to be valid but doesn't contain any TRACK entries or recognized metadata.</p>
        </div>
      </div>
    `;
  }

})();
