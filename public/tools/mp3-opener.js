/**
 * OmniOpener — MP3 Audio Toolkit
 * Uses OmniTool SDK. Provides waveform visualization, metadata extraction, and playback.
 */
(function () {
  'use strict';

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let analyzer = null;
    let animationId = null;
    let currentAudioUrl = null;
    let currentArtUrl = null;

    function cleanup() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      if (wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (e) {}
        wavesurfer = null;
      }
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = null;
      }
      if (currentArtUrl) {
        URL.revokeObjectURL(currentArtUrl);
        currentArtUrl = null;
      }
      analyzer = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp3',
      binary: true,
      infoHtml: '<strong>Privacy:</strong> Your audio is processed entirely in your browser. Metadata extraction and waveform rendering happen locally.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const state = h.getState();
            const meta = state.metadata || {};
            const text = Object.entries(meta)
              .filter(([k, v]) => typeof v === 'string' || typeof v === 'number')
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
              .join('\n');
            h.copyToClipboard(text || 'No metadata found', btn);
          }
        },
        {
          label: '📄 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const meta = h.getState().metadata || {};
            const cleanMeta = { ...meta };
            delete cleanMeta.picture; // Don't export binary/data-url picture in JSON
            h.download(`${h.getFile().name}.metadata.json`, JSON.stringify(cleanMeta, null, 2), 'application/json');
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'audio/mpeg');
          }
        }
      ],

      onInit: function (h) {
        cleanup();
        return h.loadScripts([
          'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'
        ]);
      },

      onFile: function (file, content, h) {
        h.showLoading('Preparing audio engine...');
        
        h.loadScripts([
          'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'
        ]).then(() => {
          if (!content || content.byteLength === 0) {
            h.showError('Empty Audio File', 'This file contains no data.');
            return;
          }

          cleanup();

          const blob = new Blob([content], { type: 'audio/mpeg' });
          currentAudioUrl = URL.createObjectURL(blob);
          
          h.setState('metadata', { title: file.name, artist: 'Unknown Artist', album: 'Unknown Album' });

          h.render(`
            <div class="max-w-5xl mx-auto p-4 md:p-6">
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.mp3 audio</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div class="lg:col-span-4 space-y-6">
                  <div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm aspect-square relative group">
                     <div id="art-placeholder" class="absolute inset-0 flex flex-col items-center justify-center bg-surface-50 text-surface-300 transition-opacity">
                        <svg class="w-16 h-16 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                        <span class="text-[10px] font-bold uppercase tracking-widest opacity-40">No Artwork</span>
                     </div>
                     <div id="art-img" class="absolute inset-0 bg-cover bg-center hidden transform transition-transform group-hover:scale-105 duration-700"></div>
                  </div>

                  <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm space-y-4">
                    <div>
                      <label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Title</label>
                      <p id="meta-title" class="text-sm font-semibold text-surface-900 leading-tight">${esc(file.name)}</p>
                    </div>
                    <div>
                      <label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Artist</label>
                      <p id="meta-artist" class="text-sm text-surface-600 leading-tight">Unknown Artist</p>
                    </div>
                    <div>
                      <label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1 block">Album</label>
                      <p id="meta-album" class="text-sm text-surface-600 leading-tight">Unknown Album</p>
                    </div>
                  </div>
                </div>

                <div class="lg:col-span-8 space-y-6">
                  <div class="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
                    <div class="flex items-center justify-between mb-8">
                      <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center">
                          <svg class="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                        </div>
                        <div>
                          <h3 class="font-bold text-surface-900 leading-none mb-1">Audio Player</h3>
                          <p class="text-xs text-surface-500">Interactive Waveform</p>
                        </div>
                      </div>
                      <span id="time-display" class="font-mono text-sm font-bold text-brand-600 bg-brand-50 px-4 py-1.5 rounded-full border border-brand-100 shadow-sm">00:00 / 00:00</span>
                    </div>
                    
                    <div id="waveform-outer" class="relative w-full h-40 bg-surface-50 rounded-2xl overflow-hidden mb-8 border border-surface-100 shadow-inner group">
                       <canvas id="freq-canvas" class="absolute inset-0 w-full h-full opacity-30 pointer-events-none transition-opacity group-hover:opacity-50"></canvas>
                       <div id="ws-mount" class="relative z-10 h-full"></div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-6">
                      <div class="flex items-center gap-6">
                        <button id="play-pause" class="w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-xl hover:bg-brand-700 hover:scale-105 active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-brand-200">
                          <span id="play-icon" class="text-2xl ml-1">
                            <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                          </span>
                        </button>
                        
                        <div class="flex items-center gap-3 bg-surface-50 px-4 py-2 rounded-2xl border border-surface-100">
                          <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                          <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" class="w-24 accent-brand-600 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                        </div>
                      </div>

                      <div class="flex items-center gap-1 bg-surface-50 p-1.5 rounded-xl border border-surface-200 shadow-sm">
                        ${[0.5, 1, 1.5, 2].map(rate => `
                          <button data-rate="${rate}" class="rate-btn px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${rate === 1 ? 'bg-white text-brand-600 shadow-sm border border-surface-100' : 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'}">
                            ${rate}x
                          </button>
                        `).join('')}
                      </div>
                    </div>
                  </div>

                  <div class="space-y-3">
                    <div class="flex items-center justify-between px-1">
                      <h3 class="font-bold text-surface-800">Extended Metadata</h3>
                      <span id="meta-count" class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">0 Tags</span>
                    </div>
                    <div class="overflow-hidden rounded-2xl border border-surface-200 shadow-sm bg-white">
                      <table class="min-w-full text-sm">
                        <thead class="bg-surface-50 border-b border-surface-200">
                          <tr>
                            <th class="px-5 py-3 text-left font-bold text-surface-500 uppercase tracking-wider text-[10px]">Property</th>
                            <th class="px-5 py-3 text-left font-bold text-surface-500 uppercase tracking-wider text-[10px]">Value</th>
                          </tr>
                        </thead>
                        <tbody id="meta-tbody" class="divide-y divide-surface-100">
                          <tr><td colspan="2" class="px-5 py-8 text-center text-surface-400 italic">Extracting tags...</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `);

          wavesurfer = WaveSurfer.create({
            container: '#ws-mount',
            waveColor: '#cbd5e1',
            progressColor: '#4f46e5',
            cursorColor: '#4f46e5',
            barWidth: 2,
            barGap: 3,
            barRadius: 4,
            height: 160,
            normalize: true,
            url: currentAudioUrl,
            interact: true,
            cursorWidth: 1
          });

          const playBtn = document.getElementById('play-pause');
          const playIcon = document.getElementById('play-icon');
          const timeDisplay = document.getElementById('time-display');
          const volSlider = document.getElementById('volume-slider');
          const rateBtns = document.querySelectorAll('.rate-btn');

          wavesurfer.on('ready', () => {
            const duration = formatTime(wavesurfer.getDuration());
            timeDisplay.textContent = `00:00 / ${duration}`;
          });

          wavesurfer.on('audioprocess', () => {
            const current = formatTime(wavesurfer.getCurrentTime());
            const duration = formatTime(wavesurfer.getDuration());
            timeDisplay.textContent = `${current} / ${duration}`;
          });

          wavesurfer.on('play', () => {
            playIcon.innerHTML = `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`;
            initVisualizer();
          });

          wavesurfer.on('pause', () => {
            playIcon.innerHTML = `<svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>`;
          });

          playBtn.onclick = () => wavesurfer.playPause();
          volSlider.oninput = (e) => wavesurfer.setVolume(e.target.value);

          rateBtns.forEach(btn => {
            btn.onclick = () => {
              const rate = parseFloat(btn.dataset.rate);
              wavesurfer.setPlaybackRate(rate);
              rateBtns.forEach(b => b.className = b.className.replace('bg-white text-brand-600 shadow-sm border border-surface-100', 'text-surface-500 hover:text-surface-800 hover:bg-surface-100'));
              btn.className = btn.className.replace('text-surface-500 hover:text-surface-800 hover:bg-surface-100', 'bg-white text-brand-600 shadow-sm border border-surface-100');
            };
          });

          const initVisualizer = () => {
            if (analyzer) return;
            try {
              const audio = wavesurfer.getMediaElement();
              const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              const source = audioCtx.createMediaElementSource(audio);
              analyzer = audioCtx.createAnalyser();
              analyzer.fftSize = 128;
              source.connect(analyzer);
              analyzer.connect(audioCtx.destination);
              
              const canvas = document.getElementById('freq-canvas');
              const ctx = canvas.getContext('2d');
              
              const draw = () => {
                animationId = requestAnimationFrame(draw);
                const bufferLength = analyzer.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyzer.getByteFrequencyData(dataArray);

                canvas.width = canvas.offsetWidth * devicePixelRatio;
                canvas.height = canvas.offsetHeight * devicePixelRatio;
                ctx.scale(devicePixelRatio, devicePixelRatio);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const barWidth = (canvas.offsetWidth / bufferLength) * 2.5;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                  const barHeight = (dataArray[i] / 255) * canvas.offsetHeight;
                  const opacity = (dataArray[i] / 255) * 0.5;
                  ctx.fillStyle = `rgba(79, 70, 229, ${opacity})`;
                  ctx.fillRect(x, canvas.offsetHeight - barHeight, barWidth, barHeight);
                  x += barWidth + 2;
                }
              };
              draw();
            } catch (e) { console.warn('Visualizer failed', e); }
          };

          jsmediatags.read(blob, {
            onSuccess: function (tag) {
              const { title, artist, album, picture, year, track, genre } = tag.tags;
              const meta = { 
                title: title || file.name, 
                artist: artist || 'Unknown Artist', 
                album: album || 'Unknown Album',
                year: year || '—',
                track: track || '—',
                genre: genre || '—'
              };
              
              h.setState('metadata', meta);
              if (title) document.getElementById('meta-title').textContent = title;
              if (artist) document.getElementById('meta-artist').textContent = artist;
              if (album) document.getElementById('meta-album').textContent = album;
              
              if (picture) {
                const { data, format } = picture;
                const uint8 = new Uint8Array(data);
                const artBlob = new Blob([uint8], { type: format });
                currentArtUrl = URL.createObjectURL(artBlob);
                const artImg = document.getElementById('art-img');
                artImg.style.backgroundImage = `url(${currentArtUrl})`;
                artImg.classList.remove('hidden');
                document.getElementById('art-placeholder').classList.add('hidden');
              }

              const tbody = document.getElementById('meta-tbody');
              const entries = Object.entries(tag.tags).filter(([k, v]) => k !== 'picture' && v && (typeof v === 'string' || typeof v === 'number'));
              if (entries.length > 0) {
                document.getElementById('meta-count').textContent = `${entries.length} Tags`;
                tbody.innerHTML = entries.map(([k, v]) => `
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-5 py-3 font-semibold text-surface-600 border-b border-surface-100 capitalize">${esc(k.replace(/_/g, ' '))}</td>
                    <td class="px-5 py-3 text-surface-800 border-b border-surface-100">${esc(String(v))}</td>
                  </tr>
                `).join('');
              } else {
                tbody.innerHTML = `<tr><td colspan="2" class="px-5 py-8 text-center text-surface-400 italic">No additional tags.</td></tr>`;
              }
            },
            onError: function (error) {
              document.getElementById('meta-tbody').innerHTML = `<tr><td colspan="2" class="px-5 py-8 text-center text-surface-400">Could not extract ID3 tags.</td></tr>`;
            }
          });
        }).catch(err => {
          h.showError('Dependency Error', 'Failed to load audio processing libraries.');
        });
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
