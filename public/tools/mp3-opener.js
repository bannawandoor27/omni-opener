/**
 * OmniOpener — MP3 Audio Toolkit
 * Uses OmniTool SDK. Provides waveform visualization, metadata extraction, and playback.
 */
(function () {
  'use strict';

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let analyzer = null;
    let animationId = null;
    let currentAudioUrl = null;

    function cleanup() {
      if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
      if (wavesurfer) { try { wavesurfer.destroy(); } catch(e) {} wavesurfer = null; }
      if (currentAudioUrl) { URL.revokeObjectURL(currentAudioUrl); currentAudioUrl = null; }
      analyzer = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp3',
      binary: true,
      infoHtml: '<strong>Privacy:</strong> This tool processes audio entirely in your browser using WaveSurfer.js and jsmediatags. No audio data is uploaded to any server.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const state = h.getState();
            const meta = state.metadata || {};
            const text = `Title: ${meta.title || h.getFile().name}\nArtist: ${meta.artist || 'Unknown'}\nAlbum: ${meta.album || 'Unknown'}`;
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📄 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const meta = h.getState().metadata || {};
            h.download('metadata.json', JSON.stringify(meta, null, 2), 'application/json');
          }
        },
        {
          label: '📥 Download MP3',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'audio/mpeg');
          }
        }
      ],

      onInit: function (h) {
        cleanup();
        h.loadScripts([
          'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'
        ]);
      },

      onFile: function _onFile(file, content, h) {
        if (typeof WaveSurfer === 'undefined' || typeof jsmediatags === 'undefined') {
          h.showLoading('Initializing audio engines...');
          setTimeout(function() { _onFile(file, content, h); }, 500);
          return;
        }

        if (!content || content.byteLength === 0) {
          h.showError('Empty File', 'This MP3 file contains no data and cannot be played.');
          return;
        }

        cleanup();

        const blob = new Blob([content], { type: 'audio/mpeg' });
        currentAudioUrl = URL.createObjectURL(blob);
        h.setState('metadata', { title: file.name, artist: 'Unknown Artist', album: '—' });

        h.render(`
          <div class="max-w-4xl mx-auto p-4">
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
              <span class="font-semibold text-surface-800">${esc(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatBytes(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">MP3 Audio</span>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div class="md:col-span-1 space-y-6">
                <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm aspect-square relative">
                   <div id="art-placeholder" class="absolute inset-0 flex flex-col items-center justify-center bg-surface-50 text-surface-300">
                      <span class="text-6xl mb-2">🎵</span>
                      <span class="text-xs font-medium uppercase tracking-widest">No Cover Art</span>
                   </div>
                   <div id="art-img" class="absolute inset-0 bg-cover bg-center hidden"></div>
                </div>

                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm space-y-3">
                  <div>
                    <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Title</h4>
                    <p id="meta-title" class="text-sm font-semibold text-surface-900 truncate">${esc(file.name)}</p>
                  </div>
                  <div>
                    <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Artist</h4>
                    <p id="meta-artist" class="text-sm text-surface-600 truncate">Unknown Artist</p>
                  </div>
                  <div>
                    <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Album</h4>
                    <p id="meta-album" class="text-sm text-surface-600 truncate">—</p>
                  </div>
                </div>
              </div>

              <div class="md:col-span-2 flex flex-col gap-6">
                <div class="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
                  <div class="flex items-center justify-between mb-6">
                    <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                      <span class="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></span>
                      Waveform Analysis
                    </h3>
                    <span id="time-display" class="font-mono text-sm font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">00:00 / 00:00</span>
                  </div>
                  
                  <div id="waveform-container" class="relative w-full h-32 bg-surface-50 rounded-xl overflow-hidden mb-6">
                     <canvas id="freq-canvas" class="absolute inset-0 w-full h-full opacity-20 pointer-events-none"></canvas>
                     <div id="ws-mount" class="relative z-10"></div>
                  </div>

                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                      <button id="play-pause" class="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg hover:bg-brand-700 transition-all focus:outline-none">
                        <span id="play-icon" class="text-2xl ml-1">▶</span>
                      </button>
                      
                      <div class="flex items-center gap-2">
                        <span class="text-xs">🔈</span>
                        <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" class="w-24 accent-brand-600 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                        <span class="text-xs">🔊</span>
                      </div>
                    </div>

                    <div class="flex items-center gap-1 bg-surface-100 p-1 rounded-lg border border-surface-200">
                      ${[1, 1.5, 2].map(rate => `
                        <button data-rate="${rate}" class="rate-btn px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${rate === 1 ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-800'}">
                          ${rate}x
                        </button>
                      `).join('')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `);

        wavesurfer = WaveSurfer.create({
          container: '#ws-mount',
          waveColor: '#94a3b8',
          progressColor: '#4f46e5',
          cursorColor: '#4f46e5',
          barWidth: 2,
          barGap: 3,
          barRadius: 4,
          height: 128,
          normalize: true,
          url: currentAudioUrl
        });

        const playBtn = document.getElementById('play-pause');
        const playIcon = document.getElementById('play-icon');
        const timeDisplay = document.getElementById('time-display');
        const volSlider = document.getElementById('volume-slider');
        const rateBtns = document.querySelectorAll('.rate-btn');

        wavesurfer.on('ready', () => {
          h.hideLoading();
          const duration = formatTime(wavesurfer.getDuration());
          timeDisplay.textContent = `00:00 / ${duration}`;
        });

        wavesurfer.on('audioprocess', () => {
          const current = formatTime(wavesurfer.getCurrentTime());
          const duration = formatTime(wavesurfer.getDuration());
          timeDisplay.textContent = `${current} / ${duration}`;
        });

        wavesurfer.on('play', () => {
          playIcon.textContent = '⏸';
          playIcon.classList.remove('ml-1');
          initVisualizer();
        });

        wavesurfer.on('pause', () => {
          playIcon.textContent = '▶';
          playIcon.classList.add('ml-1');
        });

        playBtn.onclick = () => wavesurfer.playPause();
        volSlider.oninput = (e) => wavesurfer.setVolume(e.target.value);

        rateBtns.forEach(btn => {
          btn.onclick = () => {
            wavesurfer.setPlaybackRate(parseFloat(btn.dataset.rate));
            rateBtns.forEach(b => b.classList.remove('bg-white', 'text-brand-600', 'shadow-sm'));
            btn.classList.add('bg-white', 'text-brand-600', 'shadow-sm');
          };
        });

        const initVisualizer = () => {
          if (analyzer) return;
          try {
            const audio = wavesurfer.getMediaElement();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaElementSource(audio);
            analyzer = audioCtx.createAnalyser();
            analyzer.fftSize = 256;
            source.connect(analyzer);
            analyzer.connect(audioCtx.destination);
            
            const canvas = document.getElementById('freq-canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            
            const draw = () => {
              animationId = requestAnimationFrame(draw);
              const dataArray = new Uint8Array(analyzer.frequencyBinCount);
              analyzer.getByteFrequencyData(dataArray);
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              const barWidth = (canvas.width / dataArray.length) * 2.5;
              let x = 0;
              for (let i = 0; i < dataArray.length; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                ctx.fillStyle = `rgba(79, 70, 229, ${(dataArray[i]/255) * 0.3})`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
              }
            };
            draw();
          } catch (e) { console.warn('Visualizer init failed', e); }
        };

        jsmediatags.read(blob, {
          onSuccess: function (tag) {
            const { title, artist, album, picture } = tag.tags;
            const meta = { title: title || file.name, artist: artist || 'Unknown Artist', album: album || '—' };
            h.setState('metadata', meta);
            
            if (title) document.getElementById('meta-title').textContent = title;
            if (artist) document.getElementById('meta-artist').textContent = artist;
            if (album) document.getElementById('meta-album').textContent = album;
            
            if (picture) {
              let base64String = "";
              for (let i = 0; i < picture.data.length; i++) base64String += String.fromCharCode(picture.data[i]);
              const url = "data:" + picture.format + ";base64," + window.btoa(base64String);
              const artImg = document.getElementById('art-img');
              artImg.style.backgroundImage = `url(${url})`;
              artImg.classList.remove('hidden');
              document.getElementById('art-placeholder').classList.add('hidden');
              h.setState('picture', url);
            }
          }
        });
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
