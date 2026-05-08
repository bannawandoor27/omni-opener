(function () {
  'use strict';

  /**
   * OmniOpener MKV Tool
   * A browser-based MKV player and converter using FFmpeg WASM.
   */

  const FFMPEG_JS = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js';
  const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mkv',
      binary: true,
      dropLabel: 'Drop MKV video here',
      infoHtml: '<strong>Privacy:</strong> Your video is processed entirely in your browser. No data is uploaded to any server.',

      onInit: function (helpers) {
        // Pre-load the FFmpeg script
        return helpers.loadScript(FFMPEG_JS);
      },

      onFile: function (file, content, helpers) {
        if (!file || !content) return;

        // Cleanup previous state/URLs
        cleanupState(helpers);

        helpers.showLoading('Preparing video...');

        const blob = new Blob([content], { type: 'video/x-matroska' });
        const videoUrl = URL.createObjectURL(blob);

        helpers.setState({
          videoUrl: videoUrl,
          mp4Url: null,
          mp4Blob: null,
          isConverted: false,
          content: content,
          meta: {
            duration: '---',
            resolution: '---'
          }
        });

        renderMKV(file, helpers);
      },

      actions: [
        {
          label: '⚡ Convert to MP4',
          id: 'convert',
          onClick: async function (helpers, btn) {
            const state = helpers.getState();
            const file = helpers.getFile();
            if (!state.content) return;

            const originalLabel = btn.innerHTML;
            
            try {
              helpers.showLoading('Initializing FFmpeg...');
              
              if (typeof FFmpeg === 'undefined') {
                await helpers.loadScript(FFMPEG_JS);
              }

              const { createFFmpeg } = FFmpeg;
              const ffmpeg = createFFmpeg({
                log: false,
                corePath: FFMPEG_CORE,
              });

              btn.disabled = true;
              btn.innerHTML = '⌛ Loading...';
              
              await ffmpeg.load();
              helpers.showLoading('Converting... This may take a minute.');
              
              const inputName = 'input.mkv';
              const outputName = 'output.mp4';
              ffmpeg.FS('writeFile', inputName, new Uint8Array(state.content));

              ffmpeg.setProgress(({ ratio }) => {
                const pct = Math.floor(ratio * 100);
                if (pct >= 0 && pct <= 100) {
                  helpers.showLoading(`Converting: ${pct}%...`);
                  btn.innerHTML = `⌛ ${pct}%`;
                }
              });

              // Convert to compatible H.264/AAC MP4
              await ffmpeg.run(
                '-i', inputName,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-c:a', 'aac',
                '-b:a', '128k',
                outputName
              );

              const data = ffmpeg.FS('readFile', outputName);
              const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
              const mp4Url = URL.createObjectURL(mp4Blob);

              // Cleanup before switching to MP4
              cleanupState(helpers);

              helpers.setState({
                videoUrl: mp4Url,
                mp4Url: mp4Url,
                mp4Blob: mp4Blob,
                isConverted: true
              });

              renderMKV(file, helpers);
              
              btn.innerHTML = '✅ Done';
              setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalLabel;
              }, 3000);
            } catch (err) {
              console.error(err);
              helpers.showError('Conversion Failed', 'The file might be too large or uses an unsupported codec for the browser FFmpeg engine.');
              btn.disabled = false;
              btn.innerHTML = originalLabel;
            }
          }
        },
        {
          label: '📸 Snapshot',
          id: 'snapshot',
          onClick: function (helpers) {
            const video = helpers.getRenderEl().querySelector('#omni-video-player');
            if (!video || video.readyState < 2) {
              helpers.showError('Capture Failed', 'Video must be loaded and playing.');
              return;
            }

            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob((blob) => {
                if (blob) {
                  helpers.download(`snapshot-${Date.now()}.png`, blob, 'image/png');
                }
              }, 'image/png');
            } catch (e) {
              helpers.showError('Security Error', 'Cannot capture frame from this source.');
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const s = helpers.getState();
            const file = helpers.getFile();
            if (s.isConverted && s.mp4Blob) {
              const name = file.name.replace(/\.[^/.]+$/, "") + '.mp4';
              helpers.download(name, s.mp4Blob, 'video/mp4');
            } else if (s.content) {
              helpers.download(file.name, s.content, 'video/x-matroska');
            }
          }
        }
      ]
    });
  };

  function cleanupState(helpers) {
    const state = helpers.getState();
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    if (state.mp4Url) URL.revokeObjectURL(state.mp4Url);
    if (state.audioCtx) {
      try { state.audioCtx.close(); } catch (e) {}
      state.audioCtx = null;
      state.gainNode = null;
    }
  }

  function renderMKV(file, helpers) {
    const s = helpers.getState();
    const renderEl = helpers.getRenderEl();
    
    const html = `
      <div class="max-w-6xl mx-auto p-4 lg:p-6">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          ${s.isConverted ? `
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">MP4 Converted</span>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-8 space-y-6">
            <div class="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-2xl ring-1 ring-white/10">
              <video id="omni-video-player" class="w-full h-full" controls playsinline src="${s.videoUrl}"></video>
              
              <div id="playback-overlay" class="absolute inset-0 z-10 hidden flex-col items-center justify-center bg-surface-900/95 backdrop-blur-md text-center p-8">
                <h3 class="text-white text-xl font-bold mb-2">Codec Not Supported</h3>
                <p class="text-surface-400 text-sm mb-6 max-w-sm">
                  MKV is a container. Your browser cannot play this specific video stream natively.
                </p>
                <button id="overlay-convert-trigger" class="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold transition-all">
                  Convert to Compatible MP4
                </button>
              </div>
            </div>

            <div class="bg-white rounded-2xl p-4 border border-surface-200 shadow-sm flex flex-wrap items-center justify-between gap-6">
               <div class="flex items-center gap-4">
                  <span class="text-[11px] font-bold text-surface-400 uppercase">Speed</span>
                  <div class="flex bg-surface-100 p-1 rounded-xl">
                    ${[0.5, 1, 1.5, 2].map(speed => `
                      <button class="speed-btn px-3 py-1 text-xs font-semibold rounded-lg transition-all ${speed === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500'}" data-speed="${speed}">${speed}x</button>
                    `).join('')}
                  </div>
                </div>
                
                <div class="flex items-center gap-4 flex-1 max-w-xs">
                  <span class="text-[11px] font-bold text-surface-400 uppercase">Volume Boost</span>
                  <input type="range" class="volume-slider flex-1 accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer" min="0" max="2" step="0.1" value="1">
                  <span class="volume-value text-xs font-mono font-bold text-surface-600 w-10 text-right">100%</span>
                </div>
            </div>
          </div>

          <div class="lg:col-span-4 space-y-6">
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-4 py-3 bg-surface-50 border-b border-surface-200">
                <h3 class="font-bold text-surface-800 text-sm uppercase">Technical Info</h3>
              </div>
              <div class="p-4">
                 <div class="overflow-hidden rounded-xl border border-surface-100">
                   <table class="min-w-full text-xs">
                     <tbody class="divide-y divide-surface-100">
                       <tr>
                         <td class="px-3 py-2.5 font-medium text-surface-500">Resolution</td>
                         <td id="info-res" class="px-3 py-2.5 text-right font-mono text-surface-900">${s.meta.resolution}</td>
                       </tr>
                       <tr>
                         <td class="px-3 py-2.5 font-medium text-surface-500">Duration</td>
                         <td id="info-dur" class="px-3 py-2.5 text-right font-mono text-surface-900">${s.meta.duration}</td>
                       </tr>
                       <tr>
                         <td class="px-3 py-2.5 font-medium text-surface-500">Format</td>
                         <td class="px-3 py-2.5 text-right text-surface-900">Matroska</td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    const video = renderEl.querySelector('#omni-video-player');
    const overlay = renderEl.querySelector('#playback-overlay');
    const convertTrigger = renderEl.querySelector('#overlay-convert-trigger');

    if (video) {
      video.onloadedmetadata = () => {
        const mins = Math.floor(video.duration / 60);
        const secs = Math.floor(video.duration % 60);
        const dur = isFinite(video.duration) ? `${mins}m ${secs}s` : 'Unknown';
        const res = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : 'Unknown';
        
        helpers.setState({ meta: { duration: dur, resolution: res } });
        
        const resEl = renderEl.querySelector('#info-res');
        const durEl = renderEl.querySelector('#info-dur');
        if (resEl) resEl.textContent = res;
        if (durEl) durEl.textContent = dur;
      };

      video.onerror = () => {
        if (!helpers.getState().isConverted) {
          overlay.classList.remove('hidden');
          overlay.classList.add('flex');
        }
      };

      if (convertTrigger) {
        convertTrigger.onclick = () => {
          document.getElementById('omni-action-convert')?.click();
        };
      }

      const speedBtns = renderEl.querySelectorAll('.speed-btn');
      speedBtns.forEach(btn => {
        btn.onclick = () => {
          video.playbackRate = parseFloat(btn.dataset.speed);
          speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600'));
          btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
        };
      });

      const volumeSlider = renderEl.querySelector('.volume-slider');
      const volumeValue = renderEl.querySelector('.volume-value');
      
      if (volumeSlider) {
        volumeSlider.oninput = () => {
          const vol = parseFloat(volumeSlider.value);
          video.volume = Math.min(1, vol);
          volumeValue.textContent = Math.round(vol * 100) + '%';
          
          if (vol > 1) {
            let state = helpers.getState();
            if (!state.gainNode) {
              try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioCtx.createMediaElementSource(video);
                const gainNode = audioCtx.createGain();
                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                helpers.setState({ audioCtx, gainNode });
                state = helpers.getState();
              } catch (e) {}
            }
            if (state.gainNode) state.gainNode.gain.value = vol;
          } else {
            const state = helpers.getState();
            if (state.gainNode) state.gainNode.gain.value = 1;
          }
        };
      }
    }
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
