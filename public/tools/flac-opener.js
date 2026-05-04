(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    function cleanup() {
      if (wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (e) {
          console.error('Error destroying WaveSurfer:', e);
        }
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    }

    function formatTime(seconds) {
      if (isNaN(seconds)) return '0:00';
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return minutes + ':' + (remainingSeconds < 10 ? '0' : '') + remainingSeconds;
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.flac',
      binary: true,
      infoHtml: '<strong>FLAC Opener:</strong> High-fidelity local audio playback with waveform analysis. No data leaves your browser.',
      onInit: function (h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: function _onFileFn(file, content, h) {
        cleanup();

        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Loading audio engine...');
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', function () {
            _onFileFn(file, content, h);
          });
          return;
        }

        h.showLoading('Preparing high-fidelity audio...');

        try {
          const blob = new Blob([content], { type: 'audio/flac' });
          audioUrl = URL.createObjectURL(blob);
        } catch (e) {
          h.showError('Memory Error', 'Failed to create audio blob. The file might be too large for your browser.');
          return;
        }

        const fileInfoBar = 
          '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">' +
            '<span class="font-semibold text-surface-800">' + h.escapeHtml(file.name) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span>' + formatSize(file.size) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span class="text-surface-500">.flac file</span>' +
          '</div>';

        h.render(
          '<div class="p-6">' +
            fileInfoBar +
            '<div class="rounded-xl border border-surface-200 bg-white overflow-hidden shadow-sm">' +
              '<div id="waveform" class="w-full bg-surface-50" style="min-height:128px;"></div>' +
              '<div class="px-6 py-4 bg-white border-t border-surface-100">' +
                '<div class="flex flex-col md:flex-row items-center justify-between gap-6">' +
                  '<div class="flex items-center gap-4">' +
                    '<button id="btn-play" class="w-12 h-12 flex items-center justify-center bg-brand-600 text-white rounded-full hover:bg-brand-700 transition-all shadow-md hover:scale-105 active:scale-95">' +
                      '<svg id="play-icon" class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
                      '<svg id="pause-icon" class="w-6 h-6 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' +
                    '</button>' +
                    '<div class="flex flex-col">' +
                      '<span id="time-display" class="font-mono text-lg font-bold text-surface-800">0:00 / 0:00</span>' +
                      '<span class="text-xs text-surface-500 uppercase tracking-wider font-semibold">FLAC Lossless</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="flex flex-wrap items-center justify-center gap-4">' +
                    '<div class="flex flex-col items-center gap-1">' +
                      '<span class="text-[10px] font-bold text-surface-400 uppercase">Playback Speed</span>' +
                      '<div class="flex bg-surface-100 p-1 rounded-lg">' +
                        '<button data-rate="0.5" class="speed-btn px-3 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white">0.5×</button>' +
                        '<button data-rate="1" class="speed-btn px-3 py-1 rounded-md text-xs font-medium transition-colors bg-white shadow-sm text-brand-600">1.0×</button>' +
                        '<button data-rate="1.5" class="speed-btn px-3 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white">1.5×</button>' +
                        '<button data-rate="2" class="speed-btn px-3 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white">2.0×</button>' +
                      '</div>' +
                    '</div>' +
                    '<div class="flex flex-col items-center gap-1">' +
                      '<span class="text-[10px] font-bold text-surface-400 uppercase">Volume</span>' +
                      '<input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" class="w-24 accent-brand-600">' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="mt-6 flex flex-wrap gap-3 justify-center">' +
              '<button id="btn-copy-meta" class="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">' +
                '<span>📋 Copy Metadata</span>' +
              '</button>' +
              '<button id="btn-download" class="flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:bg-surface-50 transition-colors">' +
                '<span>📥 Download FLAC</span>' +
              '</button>' +
            '</div>' +
          '</div>'
        );

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#d1d5db',
          progressColor: '#4f46e5',
          cursorColor: '#4f46e5',
          cursorWidth: 2,
          barWidth: 2,
          barGap: 3,
          barRadius: 3,
          height: 128,
          normalize: true,
          url: audioUrl
        });

        const btnPlay = document.getElementById('btn-play');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const timeDisplay = document.getElementById('time-display');
        const volumeSlider = document.getElementById('volume-slider');

        wavesurfer.on('ready', function (duration) {
          timeDisplay.textContent = '0:00 / ' + formatTime(duration);
        });

        wavesurfer.on('audioprocess', function (time) {
          timeDisplay.textContent = formatTime(time) + ' / ' + formatTime(wavesurfer.getDuration());
        });

        wavesurfer.on('interaction', function () {
          timeDisplay.textContent = formatTime(wavesurfer.getCurrentTime()) + ' / ' + formatTime(wavesurfer.getDuration());
        });

        wavesurfer.on('play', function () {
          playIcon.classList.add('hidden');
          pauseIcon.classList.remove('hidden');
        });

        wavesurfer.on('pause', function () {
          playIcon.classList.remove('hidden');
          pauseIcon.classList.add('hidden');
        });

        wavesurfer.on('error', function (e) {
          h.showError('Playback Error', 'Could not decode this FLAC file. It may be corrupted or use an unsupported bit depth/sample rate.');
          console.error(e);
        });

        btnPlay.onclick = function () {
          wavesurfer.playPause();
        };

        volumeSlider.oninput = function (e) {
          wavesurfer.setVolume(parseFloat(e.target.value));
        };

        document.querySelectorAll('.speed-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const rate = parseFloat(btn.getAttribute('data-rate'));
            wavesurfer.setPlaybackRate(rate);
            document.querySelectorAll('.speed-btn').forEach(function (b) {
              b.className = 'speed-btn px-3 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white';
            });
            btn.className = 'speed-btn px-3 py-1 rounded-md text-xs font-medium transition-colors bg-white shadow-sm text-brand-600';
          });
        });

        document.getElementById('btn-copy-meta').onclick = function (e) {
          const meta = 'File: ' + file.name + '\n' +
            'Size: ' + formatSize(file.size) + '\n' +
            'Type: Audio (FLAC Lossless)\n' +
            'Duration: ' + formatTime(wavesurfer.getDuration());
          h.copyToClipboard(meta, e.target);
        };

        document.getElementById('btn-download').onclick = function () {
          h.download(file.name, content, 'audio/flac');
        };
      },
      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
