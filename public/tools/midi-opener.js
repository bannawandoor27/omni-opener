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
      infoHtml: '<strong>MIDI Toolkit:</strong> Professional MIDI analyzer with track breakdown, note visualization, and timing info.',
      
      onInit: async function (h) {
        try {
          const mod = await import('https://esm.sh/@tonejs/midi@2.0.28');
          window.Midi = mod.Midi;
        } catch (e) {
          h.showError('Dependency Error', e.message);
        }
      },

      onFile: function (file, content, h) {
        if (typeof Midi === 'undefined') {
          h.showLoading('Loading MIDI engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Analyzing tracks...');
        try {
          const midi = new Midi(content);
          
          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex justify-between items-center">
                 <div>
                    <h3 class="text-lg font-bold text-surface-900">${escapeHtml(file.name)}</h3>
                    <div class="flex gap-3 text-[10px] font-bold text-surface-400 uppercase mt-1">
                       <span>${midi.header.name || 'Untitled'}</span>
                       <span>•</span>
                       <span>${midi.duration.toFixed(1)}s Duration</span>
                       <span>•</span>
                       <span>BPM: ${midi.header.tempos[0] ? Math.round(midi.header.tempos[0].bpm) : 120}</span>
                    </div>
                 </div>
                 <button id="btn-dl" class="px-3 py-1.5 bg-brand-600 text-white rounded-lg font-bold text-xs">📥 Download</button>
              </div>
              <div class="flex-1 overflow-auto p-6 space-y-6 bg-surface-50/30">
                 ${midi.tracks.map((track, i) => `
                   <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                      <div class="bg-surface-50 px-4 py-2 border-b border-surface-100 flex items-center justify-between">
                         <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-brand-500"></span>
                            <span class="text-[11px] font-bold text-surface-700 uppercase">Track ${i+1}: ${escapeHtml(track.name || 'Instrument')}</span>
                         </div>
                         <span class="text-[10px] font-mono text-surface-400">${track.notes.length} Notes</span>
                      </div>
                      <div class="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px]">
                         <div>
                            <div class="text-surface-400 font-bold uppercase mb-0.5">Instrument</div>
                            <div class="text-surface-700 truncate">${escapeHtml(track.instrument.name)}</div>
                         </div>
                         <div>
                            <div class="text-surface-400 font-bold uppercase mb-0.5">Channel</div>
                            <div class="text-surface-700">${track.channel}</div>
                         </div>
                         <div>
                            <div class="text-surface-400 font-bold uppercase mb-0.5">Note Range</div>
                            <div class="text-surface-700">${track.notes.length > 0 ? `${track.notes[0].name} — ${track.notes[track.notes.length-1].name}` : 'N/A'}</div>
                         </div>
                      </div>
                   </div>
                 `).join('')}
              </div>
            </div>
          `);

          document.getElementById('btn-dl').onclick = () => h.download(file.name, content);

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to parse this MIDI file.</div>`);
        }
      }
    });
  };
})();
