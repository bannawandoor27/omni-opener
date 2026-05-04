/**
 * OmniOpener — MIDI Toolkit
 * Uses OmniTool SDK and @tonejs/midi.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mid,.midi',
      binary: true,
      infoHtml: '<strong>MIDI Toolkit:</strong> Professional MIDI analyzer with track breakdown, note visualization, and timing info. 100% private and browser-based.',
      
      actions: [
        {
          label: '📥 Download MIDI',
          id: 'dl-midi',
          onClick: function (h) {
            const content = h.getContent();
            const file = h.getFile();
            if (content && file) h.download(file.name, content, 'audio/midi');
          }
        },
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.midiJson) {
              h.copyToClipboard(JSON.stringify(state.midiJson, null, 2), btn);
            }
          }
        },
        {
          label: '📄 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const state = h.getState();
            const file = h.getFile();
            if (state.midiJson && file) {
              h.download(file.name.replace(/\.midi?$/i, '') + '.json', JSON.stringify(state.midiJson, null, 2), 'application/json');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof Midi === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.js');
        }
      },

      onFile: function _onFile(file, content, h) {
        if (typeof Midi === 'undefined') {
          h.showLoading('Loading MIDI engine...');
          setTimeout(function () { _onFile(file, content, h); }, 500);
          return;
        }

        h.showLoading('Analyzing MIDI data...');
        try {
          const midi = new Midi(content);
          h.setState('midiJson', midi.toJSON());
          
          const header = midi.header;
          const tempo = header.tempos[0] ? Math.round(header.tempos[0].bpm) : 120;
          const signature = header.timeSignatures[0] ? `${header.timeSignatures[0].timeSignature[0]}/${header.timeSignatures[0].timeSignature[1]}` : '4/4';

          let tracksHtml = midi.tracks.map((track, i) => `
            <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden mb-4">
              <div class="bg-surface-50 px-4 py-2 border-b border-surface-100 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-brand-500"></span>
                  <span class="text-[11px] font-bold text-surface-700 uppercase">Track ${i + 1}: ${escapeHtml(track.name || 'Instrument')}</span>
                </div>
                <span class="text-[10px] font-mono text-surface-400 font-bold">${track.notes.length} Notes</span>
              </div>
              <div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                <div>
                  <div class="text-surface-400 font-bold uppercase mb-0.5">Instrument</div>
                  <div class="text-surface-700 truncate font-medium">${escapeHtml(track.instrument.name)}</div>
                </div>
                <div>
                  <div class="text-surface-400 font-bold uppercase mb-0.5">Channel</div>
                  <div class="text-surface-700 font-medium">${track.channel}</div>
                </div>
                <div>
                  <div class="text-surface-400 font-bold uppercase mb-0.5">Note Range</div>
                  <div class="text-surface-700 font-medium">${track.notes.length > 0 ? `${track.notes[0].name} — ${track.notes[track.notes.length - 1].name}` : 'N/A'}</div>
                </div>
                <div>
                  <div class="text-surface-400 font-bold uppercase mb-0.5">Duration</div>
                  <div class="text-surface-700 font-medium">${track.duration.toFixed(2)}s</div>
                </div>
              </div>
            </div>
          `).join('');

          h.render(`
            <div class="p-6 bg-surface-50/30 font-sans">
              <div class="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h3 class="text-xl font-black text-surface-900 tracking-tight">${escapeHtml(file.name)}</h3>
                  <div class="flex items-center gap-3 text-[10px] font-bold text-surface-400 uppercase mt-2">
                    <span class="bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded">${escapeHtml(header.name || 'Standard MIDI')}</span>
                    <span>•</span>
                    <span class="text-brand-600">${midi.duration.toFixed(1)}s Length</span>
                    <span>•</span>
                    <span>BPM: ${tempo}</span>
                    <span>•</span>
                    <span>Sig: ${signature}</span>
                  </div>
                </div>
              </div>
              <div class="space-y-4">
                ${tracksHtml}
              </div>
            </div>
          `);

        } catch (err) {
          h.showError('Analysis Failed', 'Unable to parse this MIDI file. Ensure it is a valid Standard MIDI File (SMF). ' + err.message);
        }
      }
    });
  };
})();
