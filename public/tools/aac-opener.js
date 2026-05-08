(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    function cleanup() {
      if (wavesurfer) {
        try { wavesurfer.destroy(); } catch (e) {}
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    }

    function formatTime(seconds) {
      if (isNaN(seconds)) return '0:00';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.aac,.m4a,.mp3,.wav,.ogg,.flac,.m4b,.opus',
      binary: true,
      infoHtml: '<strong>Audio Opener:</strong> Private, browser-based audio player with waveform visualization. Supports AAC, MP3, WAV, and more.',
      
      actions: [
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            const file = h.getFile();
            const content = h.getContent();
            if (file && content) {
              h.download(file.name, content, file.type || 'audio/aac');
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const file = h.getFile();
            if (!file) return;
            let meta = `File: ${file.name}\nSize: ${formatSize(file.size)}\nType: ${file.type || 'audio/aac'}`;
            if (wavesurfer) {
              meta += `\nDuration: ${formatTime(wavesurfer.getDuration())}`;
            }
            h.copyToClipboard(meta, btn);
          }
        }
      ],

      onInit: function (h) {
        return h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },

      onFile: function _onFileFn(file, content, h) {
        cleanup();
        
        if (!content || content.byteLength === 0) {
          h.render('<div class="p-8 text-center text-surface-500">This audio file appears to be empty.</div>');
          return;
        }

        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Loading audio engine...');
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js')
            .then(() => _onFileFn(file, content, h))
            .catch(() => h.showError('Engine Load Failed', 'Could not load the WaveSurfer library. Please check your internet connection.'));
          return;
        }

        h.showLoading('Analyzing audio waveform...');

        const ext = file.name.split('.').pop().toLowerCase();
        const mimeMap = {
          'm4a': 'audio/mp4',
          'm4b': 'audio/mp4',
          'mp3': 'audio/mpeg',
          'wav': 'audio/wav',
          'ogg': 'audio/ogg',
          'flac': 'audio/flac',
          'opus': 'audio/ogg; codecs=opus',
          'aac': 'audio/aac'
        };
        const mimeType = mimeMap[ext] || file.type || 'audio/aac';
        const blob = new Blob([content], { type: mimeType });
        audioUrl = URL.createObjectURL(blob);

        const safeName = file.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const extensionDisplay = ext.toUpperCase() || 'AUDIO';

        h.render(`
          <div class="p-4 md:p-8">
            <!-- U1. File info bar -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
              <span class="font-semibold text-surface-800">${safeName}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.${extensionDisplay} file</span>
              <span class="ml-auto font-mono text-xs bg-surface-200 px-2 py-0.5 rounded text-surface-700" id="duration-display">0:00 / 0:00</span>
            </div>

            <div class="space-y-8">
              <!-- Waveform Container -->
              <div class="relative group">
                <div id="waveform" class="w-full bg-surface-50 rounded-2xl overflow-hidden border border-surface-200 shadow-inner min-h-[128px]"></div>
                <div id="hover-time" class="absolute top-0 left-0 pointer-events-none bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 transition-opacity">0:00</div>
              </div>

              <!-- Controls -->
              <div class="flex flex-col items-center gap-8">
                <div class="flex items-center gap-6">
                  <button id="btn-backward" class="p-3 text-surface-400 hover:text-brand-600 transition-colors" title="Backward 5s">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"></path></svg>
                  </button>
                  
                  <button id="btn-play" class="w-20 h-20 flex items-center justify-center bg-brand-600 text-white rounded-full hover:bg-brand-700 transition-all shadow-xl active:scale-95 ring-8 ring-brand-50">
                    <svg class="w-10 h-10 ml-1" id="play-svg" fill="currentColor" viewBox="0 0 24 24">
                      <path id="play-icon" d="M8 5v14l11-7z"/>
                    </svg>
                  </button>

                  <button id="btn-forward" class="p-3 text-surface-400 hover:text-brand-600 transition-colors" title="Forward 5s">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"></path></svg>
                  </button>
                </div>

                <div class="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6 bg-surface-50 p-6 rounded-2xl border border-surface-100 shadow-sm">
                  <!-- Speed Control -->
                  <div class="space-y-3">
                    <div class="flex justify-between items-center px-1">
                      <label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Playback Speed</label>
                      <span id="speed-val" class="text-xs font-bold text-brand-600">1.0x</span>
                    </div>
                    <div class="flex gap-1 bg-white p-1 rounded-xl border border-surface-200">
                      ${['0.5', '1.0', '1.5', '2.0'].map(rate => `
                        <button data-rate="${rate}" class="speed-btn flex-1 py-2 text-xs font-bold rounded-lg transition-all ${rate === '1.0' ? 'bg-brand-600 text-white shadow-sm' : 'hover:bg-surface-50 text-surface-600'}">${rate}x</button>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Volume Control -->
                  <div class="space-y-3">
                    <div class="flex justify-between items-center px-1">
                      <label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Volume</label>
                      <span id="vol-val" class="text-xs font-bold text-brand-600">100%</span>
                    </div>
                    <div class="flex items-center h-[42px] px-3 bg-white rounded-xl border border-surface-200">
                      <input type="range" id="vol-range" min="0" max="1" step="0.01" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `);

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#cbd5e1',
          progressColor: '#4f46e5',
          cursorColor: '#4f46e5',
          cursorWidth: 2,
          barWidth: 3,
          barGap: 3,
          barRadius: 4,
          responsive: true,
          height: 128,
          normalize: true,
          url: audioUrl
        });

        const playBtn = document.getElementById('btn-play');
        const playIcon = document.getElementById('play-icon');
        const playSvg = document.getElementById('play-svg');
        const durationDisplay = document.getElementById('duration-display');
        const speedVal = document.getElementById('speed-val');
        const volVal = document.getElementById('vol-val');
        const volRange = document.getElementById('vol-range');
        const hoverTime = document.getElementById('hover-time');
        const waveContainer = document.getElementById('waveform');

        const updateTimeDisplay = () => {
          const current = formatTime(wavesurfer.getCurrentTime());
          const total = formatTime(wavesurfer.getDuration());
          durationDisplay.textContent = `${current} / ${total}`;
        };

        playBtn.onclick = () => wavesurfer.playPause();

        document.getElementById('btn-backward').onclick = () => wavesurfer.skip(-5);
        document.getElementById('btn-forward').onclick = () => wavesurfer.skip(5);

        wavesurfer.on('play', () => {
          playIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
          playSvg.classList.remove('ml-1');
        });
        
        wavesurfer.on('pause', () => {
          playIcon.setAttribute('d', 'M8 5v14l11-7z');
          playSvg.classList.add('ml-1');
        });

        wavesurfer.on('timeupdate', updateTimeDisplay);
        wavesurfer.on('ready', () => {
          h.hideLoading();
          updateTimeDisplay();
        });

        wavesurfer.on('error', (e) => {
          h.showError('Playback Error', 'Could not decode this audio file. It may be corrupted or in an unsupported format.');
        });

        document.querySelectorAll('.speed-btn').forEach(btn => {
          btn.onclick = () => {
            const rate = parseFloat(btn.dataset.rate);
            wavesurfer.setPlaybackRate(rate);
            speedVal.textContent = rate.toFixed(1) + 'x';
            document.querySelectorAll('.speed-btn').forEach(b => {
              b.classList.remove('bg-brand-600', 'text-white', 'shadow-sm');
              b.classList.add('hover:bg-surface-50', 'text-surface-600');
            });
            btn.classList.add('bg-brand-600', 'text-white', 'shadow-sm');
            btn.classList.remove('hover:bg-surface-50', 'text-surface-600');
          };
        });

        volRange.oninput = (e) => {
          const val = parseFloat(e.target.value);
          wavesurfer.setVolume(val);
          volVal.textContent = Math.round(val * 100) + '%';
        };

        waveContainer.onmousemove = (e) => {
          const rect = waveContainer.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const duration = wavesurfer.getDuration();
          if (duration) {
            const time = (x / rect.width) * duration;
            hoverTime.textContent = formatTime(time);
            hoverTime.style.left = `${x}px`;
            hoverTime.classList.add('opacity-100');
          }
        };

        waveContainer.onmouseleave = () => {
          hoverTime.classList.remove('opacity-100');
        };
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
