(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    /**
     * Clean up resources to prevent memory leaks
     */
    const cleanup = () => {
      if (wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (e) {
          console.warn('WaveSurfer destroy error:', e);
        }
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    };

    /**
     * Human-readable file size
     */
    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    /**
     * Format time in MM:SS
     */
    const formatTime = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ogg',
      binary: true,
      onInit: function(h) {
        // Pre-load wavesurfer
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: async function _onFile(file, content, h) {
        cleanup();

        if (!content || content.byteLength === 0) {
          h.showError('Empty File', 'The selected OGG file has no content and cannot be played.');
          return;
        }

        h.showLoading('Preparing audio engine...');

        // Ensure WaveSurfer is available (Bug B1 & B4)
        if (typeof WaveSurfer === 'undefined') {
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', () => {
            // Self-reference check (Bug B8)
            if (h.getFile() === file) {
              _onFile(file, content, h);
            }
          });
          return;
        }

        try {
          const blob = new Blob([content], { type: 'audio/ogg' });
          audioUrl = URL.createObjectURL(blob);

          const html = `
            <div class="max-w-4xl mx-auto p-4 md:p-6">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <span class="font-semibold text-surface-800 truncate max-w-[240px]">${file.name}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.ogg audio</span>
              </div>

              <!-- Main Player Card -->
              <div class="bg-white rounded-2xl border border-surface-200 shadow-xl overflow-hidden">
                <div class="p-6 md:p-10">
                  <!-- Waveform Section -->
                  <div class="relative group">
                    <div id="waveform" class="w-full mb-6 min-h-[128px] bg-surface-50/30 rounded-xl cursor-pointer overflow-hidden border border-surface-100 transition-colors hover:border-brand-200">
                      <!-- Loader overlay for internal wavesurfer loading -->
                      <div id="ws-loader" class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 transition-opacity duration-500">
                        <div class="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-3"></div>
                        <span class="text-xs font-medium text-surface-500 tracking-wide uppercase">Analyzing Frequency...</span>
                      </div>
                    </div>
                  </div>

                  <!-- Time & Progress -->
                  <div class="flex items-center justify-between mb-8 px-1">
                    <span id="currentTime" class="text-brand-600 font-mono font-bold text-lg w-16">0:00</span>
                    <div class="flex-1 mx-6 h-1.5 bg-surface-100 rounded-full overflow-hidden relative">
                      <div id="progressFill" class="h-full bg-brand-500 transition-all duration-150" style="width: 0%"></div>
                    </div>
                    <span id="totalDuration" class="text-surface-400 font-mono font-medium text-lg w-16 text-right">0:00</span>
                  </div>

                  <!-- Primary Controls -->
                  <div class="flex flex-col items-center gap-8">
                    <div class="flex items-center gap-6 md:gap-10">
                      <button id="btn-backward" class="p-3 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-90" title="Back 5s">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"/></svg>
                      </button>

                      <button id="btn-play-pause" class="w-20 h-20 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-100 hover:bg-brand-700 hover:scale-105 transition-all active:scale-95 group">
                        <svg id="play-icon" class="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                        <svg id="pause-icon" class="w-10 h-10 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>
                      </button>

                      <button id="btn-forward" class="p-3 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-90" title="Forward 5s">
                        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"/></svg>
                      </button>
                    </div>

                    <!-- Secondary Controls -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-2xl pt-6 border-t border-surface-100">
                      <!-- Volume -->
                      <div class="flex items-center gap-3">
                        <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                        <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" class="flex-1 h-1.5 bg-surface-200 rounded-full appearance-none cursor-pointer accent-brand-600">
                      </div>

                      <!-- Speed -->
                      <div class="flex items-center justify-center gap-2">
                        <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Speed</span>
                        <select id="speed-select" class="text-sm font-semibold bg-surface-50 border-none rounded-lg focus:ring-0 cursor-pointer text-surface-700">
                          <option value="0.5">0.5x</option>
                          <option value="0.75">0.75x</option>
                          <option value="1" selected>1.0x</option>
                          <option value="1.25">1.25x</option>
                          <option value="1.5">1.5x</option>
                          <option value="2">2.0x</option>
                        </select>
                      </div>

                      <!-- Loop -->
                      <div class="flex items-center justify-end">
                        <label class="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" id="loop-toggle" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer">
                          <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest group-hover:text-surface-600 transition-colors">Loop Audio</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Footer Status -->
                <div class="bg-surface-50/50 border-t border-surface-100 px-6 py-3 flex justify-between items-center">
                   <div class="flex items-center gap-2 text-[10px] font-bold text-surface-400 uppercase tracking-widest">
                      <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      Decoding Engine Active
                   </div>
                   <div id="file-meta" class="text-[10px] font-medium text-surface-400 italic">
                      Sampling OGG Stream...
                   </div>
                </div>
              </div>
            </div>
          `;

          h.render(html);

          wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#CBD5E1',
            progressColor: '#0EA5E9',
            cursorColor: '#0EA5E9',
            barWidth: 3,
            barRadius: 4,
            height: 128,
            cursorWidth: 2,
            normalize: true,
            url: audioUrl,
            dragToSeek: true
          });

          // Elements
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

          // WaveSurfer Events
          wavesurfer.on('ready', (duration) => {
            totalDurationEl.textContent = formatTime(duration);
            if (wsLoader) {
              wsLoader.style.opacity = '0';
              setTimeout(() => wsLoader.remove(), 500);
            }
            fileMeta.textContent = `Duration: ${Math.round(duration)}s | OGG Vorbis`;
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
            console.error('WaveSurfer error:', err);
            h.showError('Audio Error', 'Could not process the audio file. It might be corrupted or use an unsupported codec.');
          });

          // Controls
          playPauseBtn.addEventListener('click', () => wavesurfer.playPause());
          document.getElementById('btn-backward').addEventListener('click', () => wavesurfer.skip(-5));
          document.getElementById('btn-forward').addEventListener('click', () => wavesurfer.skip(5));
          
          volumeSlider.addEventListener('input', (e) => {
            wavesurfer.setVolume(parseFloat(e.target.value));
          });

          speedSelect.addEventListener('change', (e) => {
            wavesurfer.setPlaybackRate(parseFloat(e.target.value));
          });

        } catch (err) {
          console.error('Initialization error:', err);
          h.showError('Critical Error', 'An unexpected error occurred while initializing the OGG player.');
        }
      },
      onDestroy: function() {
        cleanup();
      },
      actions: [
        {
          label: '📥 Download',
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
