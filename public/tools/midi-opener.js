(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.mid,.midi',
      dropLabel: 'Drop a MIDI file to analyze',
      infoHtml: '<strong>Secure Analysis:</strong> MIDI parsing is performed locally in your browser. No musical data is transmitted to our servers.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const midi = h.getState().midiData;
            if (!midi) return;
            h.copyToClipboard(JSON.stringify(midi, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'download-json',
          onClick: function (h) {
            const midi = h.getState().midiData;
            if (!midi) return;
            const fileName = (h.getState().fileName || 'midi').replace(/\.[^/.]+$/, "");
            h.download(`${fileName}.json`, JSON.stringify(midi, null, 2), 'application/json');
          }
        }
      ],

      onInit: function (h) {
        if (typeof Midi === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.setState('fileName', file.name);
        h.setState('fileSize', file.size);
        h.showLoading('Analyzing MIDI structure and sequences...');

        const ensureLibrary = (callback) => {
          if (typeof Midi !== 'undefined') {
            callback();
          } else {
            h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.min.js', callback);
          }
        };

        ensureLibrary(() => {
          try {
            if (!(content instanceof ArrayBuffer)) {
              throw new Error('Invalid file data format');
            }
            const midi = new Midi(content);
            h.setState('midiData', midi);
            renderMidi(midi, h);
          } catch (err) {
            console.error('[MidiOpener] Parse error:', err);
            h.showError(
              'Could not open MIDI file',
              'The file may be corrupted or in an unsupported format. Ensure it is a valid Standard MIDI File (SMF).'
            );
          }
        });
      }
    });
  };

  function renderMidi(midi, h) {
    const fileName = h.getState().fileName;
    const fileSize = formatBytes(h.getState().fileSize);
    const duration = midi.duration.toFixed(2);
    const trackCount = midi.tracks.length;
    const bpm = midi.header.tempos[0] ? midi.header.tempos[0].bpm.toFixed(1) : '120';
    const timeSig = midi.header.timeSignatures[0] ? `${midi.header.timeSignatures[0].numerator}/${midi.header.timeSignatures[0].denominator}` : '4/4';
    const keySig = midi.header.keySignatures[0] ? `${midi.header.keySignatures[0].key} ${midi.header.keySignatures[0].scale}` : 'N/A';

    let html = `<div class="p-6 max-w-6xl mx-auto">`;

    // U1. File Info Bar
    html += `
    <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
      <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
      <span class="text-surface-300">|</span>
      <span>${fileSize}</span>
      <span class="text-surface-300">|</span>
      <span class="text-surface-500">.midi file</span>
    </div>`;

    if (!midi.tracks || midi.tracks.length === 0) {
      html += renderEmptyState();
      html += `</div>`;
      h.render(html);
      return;
    }

    // U9. Summary Cards
    html += `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${renderSummaryCard('Duration', `${duration}s`, '⏱️')}
      ${renderSummaryCard('Tracks', trackCount, '🎹')}
      ${renderSummaryCard('Tempo', `${bpm} BPM`, '🥁')}
      ${renderSummaryCard('Time Sig', timeSig, '🎼')}
    </div>`;

    // Category Excellence: Search/Filter
    html += `
    <div class="mb-8 bg-white p-4 rounded-2xl border border-surface-200 shadow-sm">
      <div class="flex flex-col md:flex-row gap-4 items-center">
        <div class="relative flex-1 w-full">
          <input type="text" id="track-filter" placeholder="Filter tracks by name, instrument, or channel..." 
                 class="w-full pl-10 pr-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-sm"
                 oninput="window.filterMidiTracks(this.value)">
          <span class="absolute left-3 top-3 text-surface-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </span>
        </div>
        <div class="flex items-center gap-2 text-xs font-bold text-surface-400 uppercase tracking-widest bg-surface-50 px-3 py-2 rounded-lg border border-surface-100">
          <span>Key:</span>
          <span class="text-surface-800">${keySig}</span>
        </div>
      </div>
    </div>`;

    // U10. Section Header
    html += `
    <div class="flex items-center justify-between mb-4 px-1">
      <h3 class="font-bold text-surface-800 text-lg">Track List</h3>
      <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-semibold">${trackCount} Tracks Found</span>
    </div>`;

    // Track Cards
    html += `<div id="track-list" class="space-y-6">`;
    midi.tracks.forEach((track, idx) => {
      html += renderTrackCard(track, idx, midi.duration);
    });
    html += `</div>`;

    html += `</div>`;

    h.render(html);

    // Global filtering function
    window.filterMidiTracks = function(query) {
      const q = query.toLowerCase();
      const cards = document.querySelectorAll('.track-card');
      let visibleCount = 0;
      cards.forEach(card => {
        const text = card.getAttribute('data-search').toLowerCase();
        const visible = text.includes(q);
        card.style.display = visible ? 'block' : 'none';
        if (visible) visibleCount++;
      });
      
      const countLabel = document.querySelector('#visible-track-count');
      if (countLabel) countLabel.textContent = `${visibleCount} visible`;
    };
  }

  function renderTrackCard(track, index, totalDuration) {
    const trackName = track.name || `Track ${index + 1}`;
    const instrument = track.instrument ? (track.instrument.name || track.instrument.family || 'Generic Instrument') : 'Unassigned';
    const noteCount = track.notes ? track.notes.length : 0;
    const channel = track.channel !== undefined ? track.channel : 'N/A';
    
    // Search metadata
    const searchData = `${trackName} ${instrument} channel ${channel} ${track.instrument?.family || ''}`.replace(/"/g, '&quot;');

    let html = `
    <div class="track-card rounded-2xl border border-surface-200 bg-white overflow-hidden hover:shadow-lg transition-all" data-search="${searchData}">
      <!-- Header -->
      <div class="px-6 py-4 bg-surface-50/50 border-b border-surface-100 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl bg-brand-500 text-white flex items-center justify-center font-bold shadow-md">
            ${index + 1}
          </div>
          <div>
            <h4 class="font-bold text-surface-900 leading-tight">${escapeHtml(trackName)}</h4>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-[10px] text-surface-500 font-bold uppercase tracking-wider">${escapeHtml(instrument)}</span>
              <span class="text-surface-300">•</span>
              <span class="text-[10px] text-surface-400 font-bold">CH ${channel}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="px-3 py-1 bg-brand-50 text-brand-700 rounded-full text-[10px] font-bold border border-brand-100">${noteCount} NOTES</span>
        </div>
      </div>

      <div class="p-6">
        <!-- Piano Roll Visualization -->
        ${renderPianoRoll(track, totalDuration)}

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-8">
          ${renderTrackStat('Instrument Family', track.instrument?.family || 'N/A')}
          ${renderTrackStat('Track Duration', `${track.duration.toFixed(2)}s`)}
          ${renderTrackStat('Pitch Range', getNoteRange(track.notes))}
          ${renderTrackStat('Control Changes', track.controlChanges ? Object.keys(track.controlChanges).length : 0)}
        </div>`;

    if (noteCount > 0) {
      // U7. Data Table
      html += `
      <div class="mt-8">
        <div class="flex items-center justify-between mb-3 px-1">
          <h5 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Note Sequence Preview</h5>
          <span class="text-[10px] text-surface-400 italic">Showing first 10 notes</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50/80">
                <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Time</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Note</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Length</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Velocity</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">`;
      
      track.notes.slice(0, 10).forEach(note => {
        html += `
              <tr class="hover:bg-brand-50 transition-colors">
                <td class="px-4 py-2.5 font-mono text-surface-600">${note.time.toFixed(3)}s</td>
                <td class="px-4 py-2.5 font-bold text-surface-800">${note.name} <span class="text-surface-400 font-normal text-xs">(MIDI ${note.midi})</span></td>
                <td class="px-4 py-2.5 text-surface-600">${note.duration.toFixed(3)}s</td>
                <td class="px-4 py-2.5">
                  <div class="flex items-center gap-3">
                    <div class="flex-1 min-w-[60px] h-1.5 bg-surface-100 rounded-full overflow-hidden">
                      <div class="h-full bg-brand-500" style="width: ${Math.round(note.velocity * 100)}%"></div>
                    </div>
                    <span class="text-xs font-mono text-surface-400">${note.velocity.toFixed(2)}</span>
                  </div>
                </td>
              </tr>`;
      });

      html += `
            </tbody>
          </table>
        </div>
      </div>`;
    } else {
      html += `
      <div class="mt-6 py-10 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
        <p class="text-sm text-surface-500 font-medium">No note events recorded on this track</p>
        <p class="text-[10px] text-surface-400 uppercase tracking-widest mt-1">Possibly used for metadata or control changes</p>
      </div>`;
    }

    html += `
      </div>
    </div>`;
    return html;
  }

  function renderPianoRoll(track, totalDuration) {
    if (!track.notes || track.notes.length === 0) return '';
    
    // Find note range for vertical scaling
    let minMidi = 127, maxMidi = 0;
    track.notes.forEach(n => {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    });

    const range = Math.max(12, (maxMidi - minMidi) + 4);
    const startMidi = minMidi - 2;

    return `
    <div class="relative w-full h-24 bg-surface-950 rounded-xl overflow-hidden shadow-inner group">
      <div class="absolute inset-0 opacity-10 pointer-events-none" style="background-image: linear-gradient(#333 1px, transparent 1px); background-size: 100% 8px;"></div>
      <svg class="w-full h-full" viewBox="0 0 1000 100" preserveAspectRatio="none">
        ${track.notes.map(note => {
          const x = (note.time / totalDuration) * 1000;
          const w = (note.duration / totalDuration) * 1000;
          const y = 100 - (((note.midi - startMidi) / range) * 100);
          const h = 4;
          const opacity = 0.3 + (note.velocity * 0.7);
          return `<rect x="${x}" y="${y}" width="${Math.max(1, w)}" height="${h}" rx="1" fill="currentColor" class="text-brand-400" fill-opacity="${opacity}" />`;
        }).join('')}
      </svg>
      <div class="absolute bottom-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span class="text-[9px] font-bold text-white/40 uppercase tracking-tighter">Piano Roll Preview</span>
      </div>
    </div>`;
  }

  function renderSummaryCard(label, value, icon) {
    return `
    <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm hover:border-brand-400 transition-all group">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] text-surface-400 font-bold uppercase tracking-widest">${label}</span>
        <span class="text-lg opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300">${icon}</span>
      </div>
      <p class="text-2xl font-black text-surface-900 tracking-tight">${value}</p>
    </div>`;
  }

  function renderTrackStat(label, value) {
    return `
    <div>
      <p class="text-[10px] text-surface-400 font-bold uppercase tracking-widest mb-1">${label}</p>
      <p class="text-sm font-bold text-surface-700 truncate" title="${value}">${value}</p>
    </div>`;
  }

  function renderEmptyState() {
    return `
    <div class="flex flex-col items-center justify-center p-16 text-center bg-surface-50 rounded-3xl border-2 border-dashed border-surface-200 my-12">
      <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center text-4xl mb-6 shadow-sm">🎼</div>
      <h3 class="text-xl font-bold text-surface-900 mb-2">No Music Data Found</h3>
      <p class="text-surface-500 max-w-sm">This MIDI file appears to be empty or contains only metadata. Try uploading a MIDI file with active sequences.</p>
    </div>`;
  }

  function getNoteRange(notes) {
    if (!notes || notes.length === 0) return 'None';
    let min = 127, max = 0;
    notes.forEach(n => {
      if (n.midi < min) min = n.midi;
      if (n.midi > max) max = n.midi;
    });
    return `${min} - ${max}`;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
