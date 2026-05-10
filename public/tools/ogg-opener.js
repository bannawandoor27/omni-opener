(function() {
  'use strict';

  /**
   * OmniTool OGG Opener
   * A high-performance, beautiful OGG audio player using WaveSurfer.js
   */
  window.initTool = function(toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    /**
     * Clean up resources to prevent memory leaks (Bug B5)
     */
    const cleanup = () => {
      if (wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (e) {
          // Ignore destruction errors
        }
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    };

    /**
     * Human-readable file size helper (Part 2: U1)
     */
    const formatSize = (bytes) => {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    /**
     * Format time in MM:SS
     */
    const formatTime = (seconds) => {
      if (isNaN(seconds)) return '0:00';
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    /**
     * Simple HTML escaper for file names (Bug B6)
     */
    const escapeHTML = (str) => {
      const p = document.createElement('p');
      p.textContent = str;
      return p.innerHTML;
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ogg',
      binary: true,
      onInit: function(h) {
        // Pre-load wavesurfer (Bug B1 & B4)
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: async function _onFileFn(file, content, h) {
        cleanup();

        // Empty state handling (Part 2: U5)
        if (!content || content.byteLength === 0) {
          h.showError('Empty Audio File', 'This OGG file contains no data and cannot be played.');
          return;
        }

        h.showLoading('Analyzing audio frequency...'); // Part 2: U2 & U6

        // Race condition check for WaveSurfer global (Bug B1 & B8)
        if (typeof WaveSurfer === 'undefined') {
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', () => {
            // Re-call using the named function expression to avoid context loss (Bug B8)
            if (h.getFile() === file) {
              _onFileFn(file, content, h);
            }
          });
          return;
        }

        try {
          const blob = new Blob([content], { type: 'audio/ogg' });
          audioUrl = URL.createObjectURL(blob);

          const safeFileName = escapeHTML(file.name);
          const fileSize = formatSize(file.size);

          const html = `
            <div class="max-w-4xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <!-- U1: File info bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <span class="font-semibold text-surface-800 truncate max-w-[280px]">${safeFileName}</span>
                <span class="text-surface-300">|</span>
                <span>${fileSize}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">OGG Audio</span>
              </div>

              <!-- Main Player Card -->
              <div class="bg-white rounded-3xl border border-surface-200 shadow-xl overflow-hidden ring-1 ring-black/[0.05]">
                <div class="p-8 md:p-12">
                  
                  <!-- Audio Visualization (Waveform) -->
                  <div class="relative group mb-8">
                    <div id="waveform" class="w-full min-h-[128px] bg-surface-50/50 rounded-2xl cursor-pointer overflow-hidden border border-surface-100 transition-all hover:border-brand-200 hover:bg-brand-50/10">
                      <!-- Loader overlay -->
                      <div id="ws-loader" class="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-10 transition-opacity duration-700">
                        <div class="w-10 h-10 border-3 border-brand-100 border-t-brand-600 rounded-full animate-spin mb-4"></div>
                        <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Rendering Waveform...</span>
                      </div>
                    </div>
                  </div>

                  <!-- Time & Progress Controls -->
                  <div class="flex items-center justify-between mb-10 px-2">
                    <span id="currentTime" class="text-brand-600 font-mono font-bold text-xl tabular-nums w-20">0:00</span>
                    <div class="flex-1 mx-8 h-2 bg-surface-100 rounded-full overflow-hidden relative">
                      <div id="progressFill" class="h-full bg-brand-500 transition-all duration-150 shadow-[0_0_8px_rgba(14,165,233,0.4)]" style="width: 0%"></div>
                    </div>
                    <span id="totalDuration" class="text-surface-400 font-mono font-medium text-xl tabular-nums w-20 text-right">0:00</span>
                  </div>

                  <!-- Primary Playback Controls -->
                  <div class="flex flex-col items-center gap-10">
                    <div class="flex items-center gap-8 md:gap-14">
                      <!-- Backward -->
                      <button id="btn-backward" class="p-4 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-90 group" title="Rewind 10s (Left Arrow)">
                        <svg class="w-8 h-8 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/></svg>
                      </button>

                      <!-- Play/Pause -->
                      <button id="btn-play-pause" class="w-24 h-24 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-brand-200 hover:bg-brand-700 hover:scale-110 transition-all active:scale-95 ring-4 ring-white" title="Play/Pause (Space)">
                        <svg id="play-icon" class="w-12 h-12 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                        <svg id="pause-icon" class="w-12 h-12 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>
                      </button>

                      <!-- Forward -->
                      <button id="btn-forward" class="p-4 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-90 group" title="Forward 10s (Right Arrow)">
                        <svg class="w-8 h-8 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"/></svg>
                      </button>
                    </div>

                    <!-- Audio Settings -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-3xl pt-8 border-t border-surface-100">
                      <!-- Volume Control -->
                      <div class="flex items-center gap-4">
                        <button id="btn-mute" class="text-surface-400 hover:text-brand-600 transition-colors">
                           <svg id="vol-high" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                           <svg id="vol-muted" class="w-6 h-6 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 9l4 4m0-4l-4 4"/></svg>
                        </button>
                        <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" class="flex-1 h-2 bg-surface-200 rounded-full appearance-none cursor-pointer accent-brand-600 hover:accent-brand-700 transition-all">
                      </div>

                      <!-- Playback Speed -->
                      <div class="flex items-center justify-center gap-3">
                        <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Playback Speed</span>
                        <select id="speed-select" class="text-sm font-bold bg-surface-50 border-none rounded-xl focus:ring-2 focus:ring-brand-500/20 cursor-pointer text-surface-700 px-3 py-1.5 transition-all hover:bg-surface-100">
                          <option value="0.5">0.5x</option>
                          <option value="0.75">0.75x</option>
                          <option value="1" selected>1.0x</option>
                          <option value="1.25">1.25x</option>
                          <option value="1.5">1.5x</option>
                          <option value="2">2.0x</option>
                        </select>
                      </div>

                      <!-- Loop Feature -->
                      <div class="flex items-center justify-end">
                        <label class="flex items-center gap-3 cursor-pointer group">
                          <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest group-hover:text-surface-600 transition-colors">Loop Audio</span>
                          <div class="relative inline-flex items-center">
                            <input type="checkbox" id="loop-toggle" class="sr-only peer">
                            <div class="w-11 h-6 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Footer Status (Part 4: Audio) -->
                <div class="bg-surface-50/50 border-t border-surface-100 px-8 py-4 flex justify-between items-center text-[10px] font-bold tracking-widest uppercase">
                   <div class="flex items-center gap-2.5 text-brand-600">
                      <span class="relative flex h-2 w-2">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                      </span>
                      Audio Engine Ready
                   </div>
                   <div id="file-meta" class="text-surface-400">
                      Processing Stream...
                   </div>
                </div>
              </div>

              <!-- Shortcut Hint -->
              <p class="mt-6 text-center text-xs text-surface-400 font-medium">
                Tip: Use <kbd class="px-1.5 py-0.5 rounded bg-surface-100 border border-surface-200 text-surface-600">Space</kbd> to Play/Pause &bull; <kbd class="px-1.5 py-0.5 rounded bg-surface-100 border border-surface-200 text-surface-600">M</kbd> to Mute
              </p>
            </div>
          `;

          h.render(html);

          // Initialize WaveSurfer
          wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#E2E8F0',
            progressColor: '#0EA5E9',
            cursorColor: '#0EA5E9',
            barWidth: 3,
            barRadius: 4,
            height: 128,
            cursorWidth: 2,
            normalize: true,
            url: audioUrl,
            dragToSeek: true,
            interact: true,
            hideScrollbar: true,
            autoCenter: true
          });

          // Cache DOM Elements
          const playPauseBtn = document.getElementById('btn-play-pause');
          const playIcon = document.getElementById('play-icon');
          const pauseIcon = document.getElementById('pause-icon');
          const currentTimeEl = document.getElementById('currentTime');
          const totalDurationEl = document.getElementById('totalDuration');
          const progressFill = document.getElementById('progressFill');
          const volumeSlider = document.getElementById('volume-slider');
          const speedSelect = document.getElementById('speed-select');
          const loopToggle = document.getElementById('loop-toggle');
          const wsLoader = document.getElementById('ws-loader');
          const fileMeta = document.getElementById('file-meta');
          const muteBtn = document.getElementById('btn-mute');
          const volHighIcon = document.getElementById('vol-high');
          const volMutedIcon = document.getElementById('vol-muted');

          let lastVolume = 1;

          // WaveSurfer Event Handlers
          wavesurfer.on('ready', (duration) => {
            totalDurationEl.textContent = formatTime(duration);
            if (wsLoader) {
              wsLoader.style.opacity = '0';
              setTimeout(() => wsLoader.remove(), 700);
            }
            fileMeta.textContent = `Duration: ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s | 44.1kHz | Vorbis`;
            h.hideLoading();
          });

          wavesurfer.on('audioprocess', (time) => {
            currentTimeEl.textContent = formatTime(time);
            const duration = wavesurfer.getDuration();
            if (duration > 0) {
              progressFill.style.width = `${(time / duration) * 100}%`;
            }
          });

          wavesurfer.on('interaction', (time) => {
            currentTimeEl.textContent = formatTime(time);
            const duration = wavesurfer.getDuration();
            if (duration > 0) {
              progressFill.style.width = `${(time / duration) * 100}%`;
            }
          });

          wavesurfer.on('play', () => {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
          });

          wavesurfer.on('pause', () => {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
          });

          wavesurfer.on('finish', () => {
            if (loopToggle.checked) {
              wavesurfer.play();
            } else {
              playIcon.classList.remove('hidden');
              pauseIcon.classList.add('hidden');
            }
          });

          wavesurfer.on('error', (err) => {
            console.error('WaveSurfer Error:', err);
            h.showError('Audio Playback Error', 'Could not process this OGG file. The format may be unsupported or the file corrupted.'); // Part 2: U3
          });

          // Control Listeners
          playPauseBtn.addEventListener('click', () => wavesurfer.playPause());
          
          document.getElementById('btn-backward').addEventListener('click', () => wavesurfer.skip(-10));
          document.getElementById('btn-forward').addEventListener('click', () => wavesurfer.skip(10));
          
          volumeSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            wavesurfer.setVolume(val);
            if (val === 0) {
              volHighIcon.classList.add('hidden');
              volMutedIcon.classList.remove('hidden');
            } else {
              volHighIcon.classList.remove('hidden');
              volMutedIcon.classList.add('hidden');
              lastVolume = val;
            }
          });

          muteBtn.addEventListener('click', () => {
            if (wavesurfer.getVolume() > 0) {
              lastVolume = wavesurfer.getVolume();
              wavesurfer.setVolume(0);
              volumeSlider.value = 0;
              volHighIcon.classList.add('hidden');
              volMutedIcon.classList.remove('hidden');
            } else {
              wavesurfer.setVolume(lastVolume || 1);
              volumeSlider.value = lastVolume || 1;
              volHighIcon.classList.remove('hidden');
              volMutedIcon.classList.add('hidden');
            }
          });

          speedSelect.addEventListener('change', (e) => {
            wavesurfer.setPlaybackRate(parseFloat(e.target.value));
          });

          // Keyboard Shortcuts
          const handleKeydown = (e) => {
            if (e.code === 'Space') {
              e.preventDefault();
              wavesurfer.playPause();
            } else if (e.code === 'KeyM') {
              muteBtn.click();
            } else if (e.code === 'ArrowLeft') {
              wavesurfer.skip(-5);
            } else if (e.code === 'ArrowRight') {
              wavesurfer.skip(5);
            }
          };
          window.addEventListener('keydown', handleKeydown);

          // Register keyboard cleanup in the tool instance scope
          this._handleKeydown = handleKeydown;

        } catch (err) {
          console.error('OGG Player Init Error:', err);
          h.showError('Initialization Failed', 'An error occurred while setting up the audio player engine.');
        }
      },
      onDestroy: function() {
        if (this._handleKeydown) {
          window.removeEventListener('keydown', this._handleKeydown);
        }
        cleanup();
      },
      actions: [
        {
          label: '📥 Download OGG',
          id: 'download',
          onClick: function(h) {
            const file = h.getFile();
            const content = h.getContent();
            if (file && content) {
              h.download(file.name, content, 'audio/ogg');
            }
          }
        },
        {
          label: '📋 Copy Filename',
          id: 'copy-name',
          onClick: function(h, btn) {
            const file = h.getFile();
            if (file) {
              h.copyToClipboard(file.name, btn);
            }
          }
        }
      ]
    });
  };
})();
