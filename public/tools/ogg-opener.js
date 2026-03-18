(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    const cleanup = () => {
      if (wavesurfer) {
        wavesurfer.destroy();
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    };

    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatTime = (seconds) => {
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ogg',
      binary: true,
      onInit: function(h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: async function(file, content, h) {
        cleanup();
        
        if (!content || content.byteLength === 0) {
          h.showError('Empty File', 'The selected OGG file appears to be empty.');
          return;
        }

        h.showLoading('Generating waveform...');

        // Ensure wavesurfer is loaded
        if (typeof WaveSurfer === 'undefined') {
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', () => {
            // Re-trigger file processing once script is loaded
            if (h.getFile() === file) {
               this.onFile(file, content, h);
            }
          });
          return;
        }

        try {
          const blob = new Blob([content], { type: 'audio/ogg' });
          audioUrl = URL.createObjectURL(blob);

          const html = `
            <div class="max-w-5xl mx-auto p-4 md:p-8">
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800 truncate max-w-[200px] md:max-w-md">${file.name}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500 uppercase font-bold text-[10px] tracking-wider px-1.5 py-0.5 bg-surface-200/50 rounded">OGG</span>
              </div>

              <div class="bg-white rounded-3xl border border-surface-200 shadow-xl overflow-hidden transition-all">
                <div class="p-8 md:p-12 flex flex-col items-center">
                  <div id="waveform" class="w-full mb-8 min-h-[128px] bg-surface-50/50 rounded-2xl cursor-pointer relative overflow-hidden">
                    <div id="waveform-loader" class="absolute inset-0 flex items-center justify-center bg-surface-50/80 z-10 transition-opacity duration-300">
                      <div class="flex items-center gap-2 text-surface-400 animate-pulse">
                        <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24"><path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/></svg>
                        <span class="text-sm font-medium">Analyzing audio...</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between w-full max-w-sm mb-8 px-2 font-mono text-sm">
                    <span id="currentTime" class="text-brand-600 font-bold">0:00</span>
                    <div class="h-1 w-24 bg-surface-100 rounded-full mx-4 overflow-hidden">
                      <div id="progressFill" class="h-full bg-brand-500 transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <span id="totalDuration" class="text-surface-400">0:00</span>
                  </div>

                  <div class="flex items-center gap-6">
                    <button id="btn-back" class="p-3 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-95" title="Jump Back 5s">
                      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 3C17.15 3 21.08 6.03 22.47 10.22L20.1 11C19.05 7.69 16.05 5.33 12.5 5.33C9.42 5.33 6.78 7.03 5.39 9.53L8.5 12.64H0.5V4.64L3.42 7.56C5.17 4.78 8.12 3 12.5 3M11 10V18L17 14L11 10Z"/></button>
                    
                    <button id="btn-play-pause" class="w-20 h-20 bg-brand-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-200 hover:bg-brand-700 hover:shadow-brand-300 transition-all active:scale-90 group">
                      <svg id="play-icon" class="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                      <svg id="pause-icon" class="w-10 h-10 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M14,19H18V5H14M6,19H10V5H6V19Z"/></svg>
                    </button>

                    <button id="btn-forward" class="p-3 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-all active:scale-95" title="Jump Forward 5s">
                      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11.5 3C6.85 3 2.92 6.03 1.53 10.22L3.9 11C4.95 7.69 7.95 5.33 11.5 5.33C14.58 5.33 17.22 7.03 18.61 9.53L15.5 12.64H23.5V4.64L20.58 7.56C18.83 4.78 15.88 3 11.5 3M13 10V18L7 14L13 10Z"/></button>
                  </div>
                </div>

                <div class="bg-surface-50 border-t border-surface-100 px-8 py-4 flex flex-wrap justify-between items-center gap-4">
                  <div class="flex gap-4 text-[11px] font-bold text-surface-400 uppercase tracking-widest">
                    <div class="flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-green-500"></span>
                      Audio Engine Ready
                    </div>
                  </div>
                  <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 cursor-pointer group">
                      <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider group-hover:text-surface-600 transition-colors">Loop</span>
                      <input type="checkbox" id="loop-toggle" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                    </label>
                  </div>
                </div>
              </div>
            </div>
          `;

          h.render(html);
          
          wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#e2e8f0',
            progressColor: '#0ea5e9',
            cursorColor: '#0ea5e9',
            barWidth: 3,
            barRadius: 3,
            responsive: true,
            height: 128,
            cursorWidth: 2,
            normalize: true,
            url: audioUrl
          });

          const playPauseBtn = document.getElementById('btn-play-pause');
          const playIcon = document.getElementById('play-icon');
          const pauseIcon = document.getElementById('pause-icon');
          const currentTimeEl = document.getElementById('currentTime');
          const totalDurationEl = document.getElementById('totalDuration');
          const progressFill = document.getElementById('progressFill');
          const loader = document.getElementById('waveform-loader');

          wavesurfer.on('ready', (duration) => {
            totalDurationEl.textContent = formatTime(duration);
            if (loader) {
              loader.style.opacity = '0';
              setTimeout(() => loader.remove(), 300);
            }
          });

          wavesurfer.on('audioprocess', (time) => {
            currentTimeEl.textContent = formatTime(time);
            const duration = wavesurfer.getDuration();
            if (duration > 0) {
              const progress = (time / duration) * 100;
              progressFill.style.width = `${progress}%`;
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
            if (document.getElementById('loop-toggle').checked) {
              wavesurfer.play();
            }
          });

          playPauseBtn.addEventListener('click', () => wavesurfer.playPause());
          document.getElementById('btn-back').addEventListener('click', () => wavesurfer.skip(-5));
          document.getElementById('btn-forward').addEventListener('click', () => wavesurfer.skip(5));

        } catch (e) {
          console.error(e);
          h.showError('Playback Error', 'The browser could not decode this OGG file.');
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
          label: '📋 Copy Name',
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
