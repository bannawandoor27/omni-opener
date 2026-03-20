/**
 * OmniOpener — MP3 Audio Toolkit
 * Uses OmniTool SDK, WaveSurfer.js, and jsmediatags.
 */
(function () {
  'use strict';

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let analyzer = null;
    let animationId = null;
    let loopEnabled = false;
    let loopRegion = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp3',
      binary: true,
      infoHtml: '<strong>Audio Toolkit:</strong> High-fidelity playback with waveform visualization, real-time frequency analyzer, metadata extraction, and looping.',
      
      onInit: function (h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.min.js');
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js');
      },

      onFile: function (file, content, h) {
        if (typeof WaveSurfer === 'undefined' || typeof jsmediatags === 'undefined' || typeof WaveSurfer.Regions === 'undefined') {
          h.showLoading('Loading audio engines...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        const blob = new Blob([content], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        
        h.render(`
          <div class="flex flex-col h-[75vh] border border-surface-200 rounded-2xl overflow-hidden bg-white shadow-lg">
            <!-- Top Section: Metadata & Visualizer -->
            <div class="flex-1 flex flex-col md:flex-row p-6 gap-6 items-center bg-gradient-to-br from-surface-50 to-white relative overflow-hidden">
              <canvas id="visualizer" class="absolute inset-0 w-full h-full opacity-10 pointer-events-none"></canvas>
              
              <!-- Cover Art -->
              <div id="audio-cover" class="w-40 h-40 rounded-2xl bg-surface-200 shadow-xl flex items-center justify-center overflow-hidden shrink-0 group relative z-10">
                <span class="text-6xl group-hover:scale-110 transition-transform duration-500">🎵</span>
                <div id="cover-img" class="absolute inset-0 bg-cover bg-center hidden"></div>
              </div>

              <!-- Metadata -->
              <div class="flex-1 text-center md:text-left z-10">
                <h2 id="audio-title" class="text-2xl font-bold text-surface-900 truncate mb-1">${file.name}</h2>
                <p id="audio-artist" class="text-lg text-surface-500 mb-4">Unknown Artist</p>
                <div class="flex flex-wrap gap-2 justify-center md:justify-start">
                  <span id="audio-album" class="px-3 py-1 bg-brand-50 text-brand-700 text-xs font-bold rounded-full border border-brand-100 hidden"></span>
                  <span class="px-3 py-1 bg-surface-100 text-surface-600 text-xs font-bold rounded-full border border-surface-200 capitalize">${file.size > 1024*1024 ? (file.size/(1024*1024)).toFixed(1) + ' MB' : (file.size/1024).toFixed(1) + ' KB'}</span>
                </div>
              </div>
            </div>

            <!-- Bottom Section: Controls & Waveform -->
            <div class="shrink-0 p-6 bg-white border-t border-surface-100">
              <div id="waveform" class="w-full mb-4"></div>
              
              <div class="flex flex-col gap-4">
                <!-- Main Controls -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-4">
                    <button id="btn-play" class="w-12 h-12 flex items-center justify-center bg-brand-600 text-white rounded-full hover:bg-brand-700 hover:scale-105 transition-all shadow-md">
                      <span id="play-icon" class="text-xl">▶</span>
                    </button>
                    <div class="flex flex-col">
                      <span id="curr-time" class="text-sm font-mono font-bold text-surface-900">0:00</span>
                      <span id="total-time" class="text-[10px] font-mono text-surface-400">0:00</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-4">
                    <div class="flex items-center bg-surface-50 rounded-lg p-1 border border-surface-200">
                      <button id="btn-loop" class="px-3 py-1 text-xs font-bold text-surface-400 hover:text-surface-600 transition-colors">🔁 Loop Off</button>
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="text-[10px] font-bold text-surface-400 uppercase mr-2">Speed</span>
                      ${[0.5, 1, 1.5, 2].map(s => `
                        <button onclick="window.ws.setPlaybackRate(${s}); this.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('bg-brand-600', 'text-white')); this.classList.add('bg-brand-600', 'text-white')" class="px-2 py-1 text-[10px] font-bold rounded border border-surface-200 hover:border-brand-300 transition-colors ${s === 1 ? 'bg-brand-600 text-white' : 'text-surface-600'}">${s}x</button>
                      `).join('')}
                    </div>
                  </div>
                </div>

                <!-- Secondary Actions -->
                <div class="flex items-center justify-between border-t border-surface-50 pt-4">
                  <div class="flex items-center gap-4">
                     <div class="flex items-center gap-2">
                        <span class="text-xs">🔈</span>
                        <input type="range" id="volume" min="0" max="1" step="0.1" value="1" class="w-20 accent-brand-500">
                        <span class="text-xs">🔊</span>
                     </div>
                  </div>
                  <div class="flex gap-2">
                    <button id="btn-copy-info" class="px-3 py-1.5 text-xs font-bold text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">📋 Copy Info</button>
                    <button id="btn-download" class="px-3 py-1.5 text-xs font-bold bg-surface-900 text-white rounded-lg hover:bg-black transition-colors">📥 Download</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `);

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#e2e8f0',
          progressColor: '#4f46e5',
          cursorColor: '#4f46e5',
          barWidth: 2,
          barRadius: 3,
          cursorWidth: 1,
          height: 60,
          url: url
        });

        const wsRegions = wavesurfer.registerPlugin(WaveSurfer.Regions.create());

        window.ws = wavesurfer;

        const canvas = document.getElementById('visualizer');
        const ctx = canvas.getContext('2d');
        const playBtn = document.getElementById('btn-play');
        const playIcon = document.getElementById('play-icon');
        const currTime = document.getElementById('curr-time');
        const totalTime = document.getElementById('total-time');
        const volumeInput = document.getElementById('volume');
        const loopBtn = document.getElementById('btn-loop');

        // Visualizer Setup
        function initVisualizer() {
          const audioContext = wavesurfer.getWrapper().querySelector('audio') ? new AudioContext() : null;
          if (!audioContext) return;
          const source = audioContext.createMediaElementSource(wavesurfer.getWrapper().querySelector('audio'));
          analyzer = audioContext.createAnalyser();
          source.connect(analyzer);
          analyzer.connect(audioContext.destination);
          analyzer.fftSize = 256;
          drawVisualizer();
        }

        function drawVisualizer() {
          if (!analyzer) return;
          animationId = requestAnimationFrame(drawVisualizer);
          const bufferLength = analyzer.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          analyzer.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = (canvas.width / bufferLength) * 2.5;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * canvas.height;
            ctx.fillStyle = `rgba(79, 70, 229, ${dataArray[i] / 255})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
          }
        }

        wavesurfer.on('ready', () => {
          totalTime.textContent = formatTime(wavesurfer.getDuration());
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
        });

        playBtn.onclick = () => {
          if (!analyzer) initVisualizer();
          wavesurfer.playPause();
        };
        
        wavesurfer.on('play', () => playIcon.textContent = '⏸');
        wavesurfer.on('pause', () => playIcon.textContent = '▶');
        wavesurfer.on('audioprocess', () => {
          currTime.textContent = formatTime(wavesurfer.getCurrentTime());
          if (loopEnabled && loopRegion) {
            if (wavesurfer.getCurrentTime() >= loopRegion.end) {
              wavesurfer.setTime(loopRegion.start);
            }
          }
        });
        
        volumeInput.oninput = (e) => wavesurfer.setVolume(e.target.value);

        loopBtn.onclick = () => {
          loopEnabled = !loopEnabled;
          if (loopEnabled) {
            loopBtn.textContent = '🔁 Loop On';
            loopBtn.classList.remove('text-surface-400');
            loopBtn.classList.add('text-brand-600');
            
            // Create a region for looping if none exists
            if (!loopRegion) {
              loopRegion = wsRegions.addRegion({
                start: wavesurfer.getCurrentTime(),
                end: Math.min(wavesurfer.getCurrentTime() + 5, wavesurfer.getDuration()),
                color: 'rgba(79, 70, 229, 0.1)',
                drag: true,
                resize: true
              });
            }
          } else {
            loopBtn.textContent = '🔁 Loop Off';
            loopBtn.classList.remove('text-brand-600');
            loopBtn.classList.add('text-surface-400');
            if (loopRegion) {
              loopRegion.remove();
              loopRegion = null;
            }
          }
        };

        // Metadata Extraction
        jsmediatags.read(blob, {
          onSuccess: function(tag) {
            const tags = tag.tags;
            if (tags.title) document.getElementById('audio-title').textContent = tags.title;
            if (tags.artist) document.getElementById('audio-artist').textContent = tags.artist;
            if (tags.album) {
              const albumEl = document.getElementById('audio-album');
              albumEl.textContent = tags.album;
              albumEl.classList.remove('hidden');
            }
            
            if (tags.picture) {
              const { data, format } = tags.picture;
              let base64String = "";
              for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
              const base64 = "data:" + format + ";base64," + window.btoa(base64String);
              const coverImg = document.getElementById('cover-img');
              coverImg.style.backgroundImage = `url(${base64})`;
              coverImg.classList.remove('hidden');
              document.querySelector('#audio-cover span').classList.add('hidden');
            }
          }
        });

        document.getElementById('btn-copy-info').onclick = (e) => {
          const title = document.getElementById('audio-title').textContent;
          const artist = document.getElementById('audio-artist').textContent;
          h.copyToClipboard(`${title} by ${artist}`, e.target);
        };

        document.getElementById('btn-download').onclick = () => {
          h.download(file.name, content, 'audio/mpeg');
        };
      },
      onDestroy: function() {
        if (animationId) cancelAnimationFrame(animationId);
        if (wavesurfer) wavesurfer.destroy();
      }
    });
  };
})();

