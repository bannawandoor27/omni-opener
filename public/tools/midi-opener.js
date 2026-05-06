/**
 * OmniOpener — MIDI Toolkit
 * Professional MIDI analyzer with track breakdown and timing visualization.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
          label: '📄 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const state = h.getState();
            const file = h.getFile();
            if (state.midiJson && file) {
              const name = file.name.replace(/\.[^/.]+$/, "") + '.json';
              h.download(name, JSON.stringify(state.midiJson, null, 2), 'application/json');
            }
          }
        },
        {
          label: '📋 Copy Data',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.midiJson) {
              h.copyToClipboard(JSON.stringify(state.midiJson, null, 2), btn);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof Midi === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.js');
        }
      },

      onDestroy: function() {
        // Clean up logic if any future additions require it (e.g. blobs)
      },

      onFile: function _onFile(file, content, h) {
        if (typeof Midi === 'undefined') {
          h.showLoading('Initializing MIDI engine...');
          setTimeout(function () { _onFile(file, content, h); }, 200);
          return;
        }

        h.showLoading('Parsing MIDI structure...');
        
        // Ensure content is ArrayBuffer (binary:true handles this)
        if (!(content instanceof ArrayBuffer)) {
          h.showError('Invalid File Content', 'The file content was not loaded as binary data.');
          return;
        }

        try {
          const midi = new Midi(content);
          const midiJson = midi.toJSON();
          h.setState('midiJson', midiJson);
          h.setState('searchTerm', '');

          const renderContent = () => {
            const state = h.getState();
            const searchTerm = (state.searchTerm || '').toLowerCase();
            
            const header = midi.header;
            const tempo = header.tempos[0] ? Math.round(header.tempos[0].bpm) : 120;
            const signature = header.timeSignatures[0] ? `${header.timeSignatures[0].timeSignature[0]}/${header.timeSignatures[0].timeSignature[1]}` : '4/4';
            
            const filteredTracks = midi.tracks.filter(track => {
              const name = (track.name || '').toLowerCase();
              const inst = (track.instrument.name || '').toLowerCase();
              return name.includes(searchTerm) || inst.includes(searchTerm);
            });

            const fileInfoBar = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">MIDI ${header.format} File</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-md text-xs font-medium">${midi.duration.toFixed(1)}s</span>
              </div>
            `;

            const summaryPanel = `
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-[10px] uppercase font-bold text-surface-400 mb-1">Tempo</div>
                  <div class="text-lg font-bold text-surface-800">${tempo} <span class="text-xs font-normal text-surface-400">BPM</span></div>
                </div>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-[10px] uppercase font-bold text-surface-400 mb-1">Signature</div>
                  <div class="text-lg font-bold text-surface-800">${signature}</div>
                </div>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-[10px] uppercase font-bold text-surface-400 mb-1">Resolution</div>
                  <div class="text-lg font-bold text-surface-800">${header.ppq} <span class="text-xs font-normal text-surface-400">PPQ</span></div>
                </div>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-[10px] uppercase font-bold text-surface-400 mb-1">Tracks</div>
                  <div class="text-lg font-bold text-surface-800">${midi.tracks.length}</div>
                </div>
              </div>
            `;

            const searchBar = `
              <div class="flex items-center justify-between mb-4 gap-4">
                <div class="relative flex-1">
                  <input type="text" id="track-search" placeholder="Search tracks or instruments..." 
                    class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                    value="${escapeHtml(state.searchTerm || '')}">
                  <div class="absolute left-3 top-2.5 text-surface-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </div>
                </div>
                <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1.5 rounded-full font-bold whitespace-nowrap">
                  ${filteredTracks.length} / ${midi.tracks.length} Tracks
                </span>
              </div>
            `;

            let tracksHtml = filteredTracks.length > 0 ? filteredTracks.map((track, i) => {
              const noteCount = track.notes.length;
              const duration = track.duration.toFixed(2);
              const instrument = track.instrument.name || 'Unknown Instrument';
              
              return `
                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white mb-4">
                  <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 font-bold">
                        ${track.channel + 1}
                      </div>
                      <div>
                        <h4 class="font-bold text-surface-800 leading-tight">${escapeHtml(track.name || 'Track ' + (i + 1))}</h4>
                        <div class="text-xs text-surface-500">${escapeHtml(instrument)}</div>
                      </div>
                    </div>
                    <div class="text-right">
                      <div class="text-xs font-mono font-bold text-surface-400 uppercase">Track ${i + 1}</div>
                      <div class="text-[10px] text-surface-400 font-medium">Channel ${track.channel}</div>
                    </div>
                  </div>
                  
                  <div class="grid grid-cols-3 gap-4 border-t border-surface-50 pt-4">
                    <div>
                      <div class="text-[10px] uppercase font-bold text-surface-400 mb-0.5">Notes</div>
                      <div class="text-sm font-semibold text-surface-700">${noteCount.toLocaleString()}</div>
                    </div>
                    <div>
                      <div class="text-[10px] uppercase font-bold text-surface-400 mb-0.5">Range</div>
                      <div class="text-sm font-semibold text-surface-700">${noteCount > 0 ? `${track.notes[0].name} — ${track.notes[track.notes.length - 1].name}` : 'N/A'}</div>
                    </div>
                    <div>
                      <div class="text-[10px] uppercase font-bold text-surface-400 mb-0.5">Length</div>
                      <div class="text-sm font-semibold text-surface-700">${duration}s</div>
                    </div>
                  </div>

                  ${noteCount > 0 ? `
                  <div class="mt-4 bg-surface-50 rounded-lg p-2 flex gap-0.5 h-3 overflow-hidden">
                    ${track.notes.slice(0, 100).map(n => `
                      <div class="flex-1 bg-brand-400/30 rounded-full h-full" style="opacity: ${0.3 + (n.velocity * 0.7)};"></div>
                    `).join('')}
                    ${noteCount > 100 ? `<div class="w-4 flex items-center justify-center text-[8px] text-surface-300">...</div>` : ''}
                  </div>
                  ` : ''}
                </div>
              `;
            }).join('') : `
              <div class="py-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                <div class="text-surface-400 mb-2">
                  <svg class="w-12 h-12 mx-auto opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div class="text-surface-600 font-medium">${midi.tracks.length === 0 ? 'This MIDI file contains no tracks.' : 'No tracks match your search filters.'}</div>
                <button class="mt-4 text-brand-600 font-bold text-sm hover:underline" id="clear-search">Clear search</button>
              </div>
            `;

            h.render(`
              <div class="p-4 md:p-8 bg-surface-50/20 min-h-full font-sans">
                ${fileInfoBar}
                ${summaryPanel}
                ${searchBar}
                <div class="space-y-2">
                  ${tracksHtml}
                </div>
              </div>
            `);

            // Attach event listeners after render
            const searchInput = document.getElementById('track-search');
            if (searchInput) {
              searchInput.addEventListener('input', (e) => {
                h.setState('searchTerm', e.target.value);
                renderContent();
                // Maintain focus
                const input = document.getElementById('track-search');
                if (input) {
                  input.focus();
                  input.setSelectionRange(input.value.length, input.value.length);
                }
              });
            }

            const clearBtn = document.getElementById('clear-search');
            if (clearBtn) {
              clearBtn.addEventListener('click', () => {
                h.setState('searchTerm', '');
                renderContent();
              });
            }
          };

          renderContent();

        } catch (err) {
          console.error(err);
          h.showError('Analysis Failed', 'Unable to parse this MIDI file. Ensure it is a valid Standard MIDI File (SMF). Details: ' + err.message);
        }
      }
    });
  };
})();
