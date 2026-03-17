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
            h.download(`${h.getState().fileName || 'midi'}.json`, JSON.stringify(midi, null, 2), 'application/json');
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
        h.showLoading('Deconstructing MIDI tracks...');

        const checkLibrary = () => {
          if (typeof Midi !== 'undefined') {
            processMidi(content, h);
          } else {
            h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.min.js', () => processMidi(content, h));
          }
        };

        // Ensure library is loaded before processing
        setTimeout(checkLibrary, 50);
      }
    });
  };

  function processMidi(arrayBuffer, h) {
    try {
      if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new Error('Invalid file data received.');
      }

      const midi = new Midi(arrayBuffer);
      h.setState('midiData', midi);
      
      if (!midi.tracks || midi.tracks.length === 0) {
        h.render(renderEmptyState());
        return;
      }

      renderMidi(midi, h);
    } catch (err) {
      console.error('[MidiOpener] Error:', err);
      h.showError(
        'Could not open MIDI file', 
        'The file may be corrupted, use an unsupported MIDI version, or is not a valid MIDI file. Try another file.'
      );
    }
  }

  function renderMidi(midi, h) {
    const fileName = h.getState().fileName;
    const fileSize = formatBytes(h.getState().fileSize);
    const duration = midi.duration.toFixed(2);
    const trackCount = midi.tracks.length;
    const bpm = midi.header.tempos[0] ? midi.header.tempos[0].bpm.toFixed(1) : '120';
    const timeSig = midi.header.timeSignatures[0] ? `${midi.header.timeSignatures[0].numerator}/${midi.header.timeSignatures[0].denominator}` : '4/4';

    let html = '<div class="p-6 max-w-6xl mx-auto">';

    // U1. File Info Bar
    html += `
    <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
      <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
      <span class="text-surface-300">|</span>
      <span>${fileSize}</span>
      <span class="text-surface-300">|</span>
      <span class="text-surface-500">MIDI Standard File</span>
    </div>`;

    // U7/U9. Summary Cards
    html += `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${renderSummaryCard('Total Duration', `${duration}s`, '⏱️')}
      ${renderSummaryCard('Track Count', trackCount, '🎹')}
      ${renderSummaryCard('Initial Tempo', `${bpm} BPM`, '🥁')}
      ${renderSummaryCard('Time Signature', timeSig, '🎼')}
    </div>`;

    // Global Search / Filter (Category Excellence)
    html += `
    <div class="mb-6">
      <div class="relative">
        <input type="text" id="track-search" placeholder="Filter tracks by name or instrument..." 
               class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-sm"
               oninput="window.filterMidiTracks(this.value)">
        <span class="absolute left-3 top-2.5 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </span>
      </div>
    </div>`;

    // U10. Section Header
    html += `
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-bold text-surface-900 text-lg">Tracks & Sequences</h3>
      <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-medium">${trackCount} Tracks</span>
    </div>`;

    // Track List
    html += '<div id="track-container" class="space-y-6">';
    midi.tracks.forEach((track, idx) => {
      html += renderTrack(track, idx);
    });
    html += '</div>';

    html += '</div>';

    h.render(html);

    // Attach search global
    window.filterMidiTracks = function(query) {
      const q = query.toLowerCase();
      const cards = document.querySelectorAll('.track-card');
      cards.forEach(card => {
        const text = card.getAttribute('data-search').toLowerCase();
        card.style.display = text.includes(q) ? 'block' : 'none';
      });
    };
  }

  function renderTrack(track, index) {
    const noteCount = track.notes ? track.notes.length : 0;
    const ccCount = track.controlChanges ? Object.keys(track.controlChanges).reduce((acc, key) => acc + track.controlChanges[key].length, 0) : 0;
    const instrument = track.instrument ? (track.instrument.name || track.instrument.family || 'Standard MIDI') : 'Standard MIDI';
    const trackName = track.name || `Track ${index + 1}`;
    
    // Searchable string
    const searchData = `${trackName} ${instrument} ${track.instrument?.family || ''}`.replace(/"/g, '&quot;');

    let html = `
    <div class="track-card rounded-xl border border-surface-200 bg-white overflow-hidden hover:shadow-md transition-shadow" data-search="${searchData}">
      <div class="px-5 py-4 bg-surface-50 border-b border-surface-200 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            ${index + 1}
          </div>
          <div>
            <h4 class="font-bold text-surface-900 leading-tight">${escapeHtml(trackName)}</h4>
            <p class="text-xs text-surface-500 font-medium uppercase tracking-wider">${escapeHtml(instrument)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${track.channel !== undefined ? `<span class="px-2.5 py-1 bg-white border border-surface-200 rounded-lg text-[10px] font-bold text-surface-600">CH ${track.channel}</span>` : ''}
          <span class="px-2.5 py-1 bg-brand-50 text-brand-700 rounded-lg text-[10px] font-bold">${noteCount} NOTES</span>
        </div>
      </div>

      <div class="p-5">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
          ${renderTrackStat('Instrument', instrument)}
          ${renderTrackStat('Duration', `${track.duration.toFixed(2)}s`)}
          ${renderTrackStat('Events', noteCount + ccCount)}
          ${renderTrackStat('Range', getNoteRange(track.notes))}
        </div>`;

    if (noteCount > 0) {
      // U7. Tables for Note Data
      html += `
      <div class="mt-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold text-surface-400 uppercase tracking-widest">Note Sequence Preview</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-100 bg-surface-50/50">
          <table class="min-w-full text-xs">
            <thead>
              <tr class="text-left border-b border-surface-200">
                <th class="px-4 py-2 font-semibold text-surface-600">Time</th>
                <th class="px-4 py-2 font-semibold text-surface-600">Note</th>
                <th class="px-4 py-2 font-semibold text-surface-600">Octave</th>
                <th class="px-4 py-2 font-semibold text-surface-600">Length</th>
                <th class="px-4 py-2 font-semibold text-surface-600">Velocity</th>
              </tr>
            </thead>
            <tbody class="font-mono">`;
      
      // Limit to first 10 notes to avoid DOM bloat
      track.notes.slice(0, 10).forEach(note => {
        html += `
              <tr class="border-b border-surface-100 last:border-0 hover:bg-brand-50/50 transition-colors">
                <td class="px-4 py-2 text-surface-500">${note.time.toFixed(3)}s</td>
                <td class="px-4 py-2 font-bold text-brand-600">${note.pitch} (${note.name})</td>
                <td class="px-4 py-2 text-surface-600">${note.octave}</td>
                <td class="px-4 py-2 text-surface-500">${note.duration.toFixed(3)}s</td>
                <td class="px-4 py-2">
                  <div class="flex items-center gap-2">
                    <div class="w-12 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                      <div class="h-full bg-brand-400" style="width: ${Math.round(note.velocity * 100)}%"></div>
                    </div>
                    <span class="text-[10px] text-surface-400">${note.velocity.toFixed(2)}</span>
                  </div>
                </td>
              </tr>`;
      });

      html += `
            </tbody>
          </table>
        </div>
        ${noteCount > 10 ? `<p class="text-center text-[10px] text-surface-400 mt-2 italic">Showing first 10 of ${noteCount} notes</p>` : ''}
      </div>`;
    } else {
      html += `
      <div class="py-8 text-center bg-surface-50 rounded-xl border border-dashed border-surface-200">
        <p class="text-sm text-surface-400 font-medium">No note data found in this track</p>
        <p class="text-[10px] text-surface-400 uppercase tracking-wider mt-1">Check control changes or meta events in JSON export</p>
      </div>`;
    }

    html += `
      </div>
    </div>`;
    return html;
  }

  function renderSummaryCard(label, value, icon) {
    return `
    <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm hover:border-brand-300 transition-all group">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] text-surface-400 font-bold uppercase tracking-widest">${label}</span>
        <span class="text-lg opacity-50 group-hover:opacity-100 transition-opacity">${icon}</span>
      </div>
      <p class="text-2xl font-black text-surface-900">${value}</p>
    </div>`;
  }

  function renderTrackStat(label, value) {
    return `
    <div>
      <p class="text-[10px] text-surface-400 font-bold uppercase tracking-widest mb-1">${label}</p>
      <p class="text-sm font-bold text-surface-800 truncate" title="${value}">${value}</p>
    </div>`;
  }

  function renderEmptyState() {
    return `
    <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-3xl border-2 border-dashed border-surface-200 mx-6 my-12">
      <div class="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center text-4xl mb-4">🎹</div>
      <h3 class="text-xl font-bold text-surface-900 mb-2">Empty MIDI File</h3>
      <p class="text-surface-500 max-w-sm">This MIDI file contains no tracks or notes. It might be a header-only file or corrupted.</p>
    </div>`;
  }

  function getNoteRange(notes) {
    if (!notes || notes.length === 0) return 'N/A';
    let min = 128, max = 0;
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
