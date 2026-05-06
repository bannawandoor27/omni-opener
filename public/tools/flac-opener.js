(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    function cleanup() {
      if (wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (e) {}
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    }

    function formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return mins + ':' + secs.toString().padStart(2, '0');
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
      infoHtml: 'Professional-grade FLAC analyzer and player. Experience lossless audio with real-time waveform visualization and playback control.',
      onInit: function (h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: function _onFileFn(file, content, h) {
        cleanup();

        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Initializing Audio Engine...');
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', function () {
            _onFileFn(file, content, h);
          });
          return;
        }

        if (!content || content.byteLength === 0) {
          h.render('<div class="flex flex-col items-center justify-center p-12 text-surface-500 bg-surface-50 rounded-xl border-2 border-dashed border-surface-200"><span class="text-4xl mb-4">📭</span><p class="font-medium">This FLAC file appears to be empty.</p></div>');
          return;
        }

        h.showLoading('Decoding Lossless Audio...');

        try {
          const blob = new Blob([content], { type: 'audio/flac' });
          audioUrl = URL.createObjectURL(blob);
        } catch (e) {
          h.showError('Memory Limit Reached', 'This FLAC file is too large to be processed in your browser memory. Try a smaller file.');
          return;
        }

        const infoBar = 
          '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
            '<span class="font-semibold text-surface-800">' + h.escapeHtml(file.name) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span>' + formatSize(file.size) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-wider">Lossless FLAC</span>' +
          '</div>';

        h.render(
          '<div class="max-w-4xl mx-auto">' +
            infoBar +
            '<div class="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">' +
              '<div id="waveform" class="w-full bg-surface-50 relative group" style="min-height: 160px;">' +
                '<div id="hover-time" class="absolute top-2 left-2 px-2 py-1 bg-black/60 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">0:00</div>' +
              '</div>' +
              '<div class="px-6 py-5 border-t border-surface-100">' +
                '<div class="flex flex-col lg:flex-row items-center justify-between gap-6">' +
                  '<div class="flex items-center gap-5">' +
                    '<button id="play-btn" class="w-14 h-14 flex items-center justify-center bg-brand-600 text-white rounded-full hover:bg-brand-700 shadow-lg transition-all hover:scale-105 active:scale-95 group">' +
                      '<svg id="svg-play" class="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
                      '<svg id="svg-pause" class="w-7 h-7 hidden" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' +
                    '</button>' +
                    '<div>' +
                      '<div id="time-display" class="font-mono text-2xl font-bold text-surface-900 tracking-tight">0:00 <span class="text-surface-300">/</span> 0:00</div>' +
                      '<div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mt-0.5">High Resolution Playback</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="flex flex-wrap items-center justify-center gap-8">' +
                    '<div class="flex flex-col gap-2">' +
                      '<span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest text-center">Speed Control</span>' +
                      '<div class="flex bg-surface-100 p-1 rounded-xl" id="speed-controls">' +
                        '<button data-rate="0.5" class="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white transition-all">0.5×</button>' +
                        '<button data-rate="1" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white shadow-sm text-brand-600 transition-all">1.0×</button>' +
                        '<button data-rate="1.5" class="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white transition-all">1.5×</button>' +
                        '<button data-rate="2" class="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white transition-all">2.0×</button>' +
                      '</div>' +
                    '</div>' +
                    '<div class="flex flex-col gap-2">' +
                      '<div class="flex items-center justify-between">' +
                        '<span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Volume</span>' +
                        '<span id="vol-val" class="text-[10px] font-mono text-surface-500">100%</span>' +
                      '</div>' +
                      '<input type="range" id="vol-slider" min="0" max="1" step="0.05" value="1" class="w-32 accent-brand-600 cursor-pointer">' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="mt-8 flex flex-wrap items-center justify-center gap-4">' +
              '<button id="meta-btn" class="flex items-center gap-2 px-5 py-2.5 bg-white border border-surface-200 rounded-xl text-sm font-semibold text-surface-700 hover:border-brand-300 hover:bg-brand-50 transition-all">' +
                '<span>📋 Copy Metadata</span>' +
              '</button>' +
              '<button id="dl-btn" class="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 shadow-md transition-all">' +
                '<span>📥 Download Lossless</span>' +
              '</button>' +
            '</div>' +
          '</div>'
        );

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#e2e8f0',
          progressColor: '#4f46e5',
          cursorColor: '#4f46e5',
          cursorWidth: 2,
          barWidth: 2,
          barGap: 2,
          barRadius: 4,
          height: 160,
          normalize: true,
          url: audioUrl,
          interact: true,
          hideScrollbar: true
        });

        const playBtn = document.getElementById('play-btn');
        const svgPlay = document.getElementById('svg-play');
        const svgPause = document.getElementById('svg-pause');
        const timeDisplay = document.getElementById('time-display');
        const volSlider = document.getElementById('vol-slider');
        const volVal = document.getElementById('vol-val');
        const hoverTime = document.getElementById('hover-time');

        wavesurfer.on('ready', function (duration) {
          timeDisplay.innerHTML = '0:00 <span class="text-surface-300">/</span> ' + formatTime(duration);
        });

        wavesurfer.on('audioprocess', function (time) {
          timeDisplay.innerHTML = formatTime(time) + ' <span class="text-surface-300">/</span> ' + formatTime(wavesurfer.getDuration());
        });

        wavesurfer.on('interaction', function () {
          timeDisplay.innerHTML = formatTime(wavesurfer.getCurrentTime()) + ' <span class="text-surface-300">/</span> ' + formatTime(wavesurfer.getDuration());
        });

        wavesurfer.on('play', function () {
          svgPlay.classList.add('hidden');
          svgPause.classList.remove('hidden');
        });

        wavesurfer.on('pause', function () {
          svgPlay.classList.remove('hidden');
          svgPause.classList.add('hidden');
        });

        wavesurfer.on('error', function (err) {
          console.error('WaveSurfer Error:', err);
          h.showError('Decoding Failed', 'The audio engine could not decode this FLAC file. It might be corrupted or use an unsupported compression level.');
        });

        const waveformEl = document.getElementById('waveform');
        waveformEl.addEventListener('mousemove', function (e) {
          const rect = waveformEl.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const duration = wavesurfer.getDuration();
          if (duration) {
            const time = (x / rect.width) * duration;
            hoverTime.textContent = formatTime(time);
            hoverTime.style.left = x + 'px';
          }
        });

        playBtn.onclick = function () {
          wavesurfer.playPause();
        };

        volSlider.oninput = function (e) {
          const val = parseFloat(e.target.value);
          wavesurfer.setVolume(val);
          volVal.textContent = Math.round(val * 100) + '%';
        };

        document.getElementById('speed-controls').onclick = function (e) {
          const btn = e.target.closest('button');
          if (!btn) return;
          const rate = parseFloat(btn.dataset.rate);
          wavesurfer.setPlaybackRate(rate);
          
          btn.parentNode.querySelectorAll('button').forEach(function (b) {
            b.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white transition-all';
          });
          btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white shadow-sm text-brand-600 transition-all';
        };

        document.getElementById('meta-btn').onclick = function (e) {
          const meta = [
            'File: ' + file.name,
            'Size: ' + formatSize(file.size),
            'Format: Free Lossless Audio Codec (FLAC)',
            'Duration: ' + formatTime(wavesurfer.getDuration())
          ].join('\n');
          h.copyToClipboard(meta, e.target);
        };

        document.getElementById('dl-btn').onclick = function () {
          h.download(file.name, content, 'audio/flac');
        };
      },
      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
