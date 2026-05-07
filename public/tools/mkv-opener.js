(function () {
  'use strict';

  /**
   * OmniOpener MKV Tool
   * A production-perfect browser-based MKV player and converter using FFmpeg WASM.
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
        // Pre-warm the script load
        helpers.loadScript(FFMPEG_JS);
      },

      onDestroy: function (helpers) {
        const state = helpers.getState();
        if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
        if (state.mp4Url) URL.revokeObjectURL(state.mp4Url);
        if (state.gainNode && state.audioCtx) {
          try { state.audioCtx.close(); } catch (e) {}
        }
      },

      onFile: function _onFile(file, content, helpers) {
        if (!file || !content) return;

        // Cleanup previous URLs
        const prevState = helpers.getState();
        if (prevState.videoUrl) URL.revokeObjectURL(prevState.videoUrl);
        if (prevState.mp4Url) URL.revokeObjectURL(prevState.mp4Url);
        if (prevState.audioCtx) {
          try { prevState.audioCtx.close(); } catch (e) {}
        }

        helpers.showLoading('Preparing video container...');

        const blob = new Blob([content], { type: 'video/x-matroska' });
        const videoUrl = URL.createObjectURL(blob);

        helpers.setState({
          videoUrl: videoUrl,
          mp4Url: null,
          mp4Blob: null,
          isConverted: false,
          content: content, // Keep for conversion
          meta: {
            duration: '---',
            resolution: '---',
            codec: 'Detecting...'
          }
        });

        renderMKV(file, content, helpers);
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
              helpers.showLoading('Initializing FFmpeg engine...');
              
              if (typeof FFmpeg === 'undefined') {
                await helpers.loadScript(FFMPEG_JS);
              }

              const { createFFmpeg } = FFmpeg;
              const ffmpeg = createFFmpeg({
                log: false,
                corePath: FFMPEG_CORE,
              });

              btn.disabled = true;
              btn.innerHTML = '<span class="flex items-center gap-2">⌛ Loading...</span>';
              
              await ffmpeg.load();
              helpers.showLoading('Starting conversion... This takes a while.');
              
              const inputName = 'input.mkv';
              const outputName = 'output.mp4';
              ffmpeg.FS('writeFile', inputName, new Uint8Array(state.content));

              ffmpeg.setProgress(({ ratio }) => {
                const pct = Math.floor(ratio * 100);
                if (pct >= 0 && pct <= 100) {
                  helpers.showLoading(`Converting: ${pct}% complete...`);
                  btn.innerHTML = `<span class="flex items-center gap-2">⌛ ${pct}%</span>`;
                }
              });

              // Universal H.264/AAC conversion
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

              helpers.setState({
                videoUrl: mp4Url, // Point player to new URL
                mp4Url: mp4Url,
                mp4Blob: mp4Blob,
                isConverted: true
              });

              renderMKV(file, state.content, helpers);
              
              btn.innerHTML = '✅ Converted';
              setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalLabel;
              }, 3000);
            } catch (err) {
              console.error(err);
              helpers.showError('Conversion Failed', 'The conversion could not be completed. The file may be too large for browser memory or use an unsupported codec.');
              btn.disabled = false;
              btn.innerHTML = originalLabel;
            }
          }
        },
        {
          label: '📸 Capture',
          id: 'snapshot',
          onClick: function (helpers) {
            const video = document.getElementById('omni-video-player');
            if (!video || video.readyState < 2) {
              helpers.showError('Capture Failed', 'Please play the video first so frames are loaded.');
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
                } else {
                  helpers.showError('Capture Failed', 'Could not generate image blob.');
                }
              }, 'image/png');
            } catch (e) {
              helpers.showError('Security Error', 'Browser security prevents capturing frames from this video source.');
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

  function renderMKV(file, content, helpers) {
    const s = helpers.getState();
    
    const html = `
      <div class="max-w-6xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${escape(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Matroska Video Container</span>
          ${s.isConverted ? `
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">MP4 Converted</span>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-8 space-y-6">
            <!-- Video Player -->
            <div class="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-2xl ring-1 ring-white/10 group">
              <video id="omni-video-player" class="w-full h-full" controls playsinline src="${s.videoUrl}"></video>
              
              <!-- Codec Error Overlay -->
              <div id="playback-overlay" class="absolute inset-0 z-10 hidden flex-col items-center justify-center bg-surface-900/95 backdrop-blur-md text-center p-8 transition-opacity duration-300">
                <div class="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 border border-amber-500/30">
                  <svg class="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-white text-xl font-bold mb-2">Codec Not Supported</h3>
                <p class="text-surface-400 text-sm mb-6 max-w-sm leading-relaxed">
                  MKV is a container. Your browser cannot play the specific video or audio stream inside (likely HEVC or AC3).
                </p>
                <button id="overlay-convert-trigger" class="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold transition-all shadow-lg shadow-brand-600/20 active:scale-95">
                  Convert to Compatible MP4
                </button>
              </div>
            </div>

            <!-- Enhancement Controls -->
            <div class="bg-white rounded-2xl p-4 border border-surface-200 shadow-sm flex flex-wrap items-center justify-between gap-6">
               <div class="flex items-center gap-4">
                  <span class="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Speed</span>
                  <div class="flex bg-surface-100 p-1 rounded-xl border border-surface-200">
                    ${[0.5, 1, 1.5, 2].map(speed => `
                      <button class="speed-btn px-3 py-1 text-xs font-semibold rounded-lg transition-all ${speed === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-800'}" data-speed="${speed}">${speed}x</button>
                    `).join('')}
                  </div>
                </div>
                
                <div class="flex items-center gap-4 flex-1 max-w-xs">
                  <span class="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Volume Boost</span>
                  <input type="range" class="volume-slider flex-1 accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer" min="0" max="2" step="0.1" value="1">
                  <span class="volume-value text-xs font-mono font-bold text-surface-600 w-10 text-right">100%</span>
                </div>
            </div>
          </div>

          <!-- Technical Sidebar -->
          <div class="lg:col-span-4 space-y-6">
            <!-- U10: Section Header -->
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
                <h3 class="font-bold text-surface-800 text-sm uppercase tracking-wider">Technical Info</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">MKV</span>
              </div>
              <div class="p-4">
                 <!-- U7: Technical Table -->
                 <div class="overflow-hidden rounded-xl border border-surface-100">
                   <table class="min-w-full text-xs">
                     <tbody class="divide-y divide-surface-100">
                       <tr class="hover:bg-surface-50 transition-colors">
                         <td class="px-3 py-2.5 font-medium text-surface-500">Resolution</td>
                         <td id="info-res" class="px-3 py-2.5 text-right font-mono text-surface-900">${s.meta.resolution}</td>
                       </tr>
                       <tr class="hover:bg-surface-50 transition-colors">
                         <td class="px-3 py-2.5 font-medium text-surface-500">Duration</td>
                         <td id="info-dur" class="px-3 py-2.5 text-right font-mono text-surface-900">${s.meta.duration}</td>
                       </tr>
                       <tr class="hover:bg-surface-50 transition-colors">
                         <td class="px-3 py-2.5 font-medium text-surface-500">Format</td>
                         <td class="px-3 py-2.5 text-right text-surface-900">Matroska Video</td>
                       </tr>
                       <tr class="hover:bg-surface-50 transition-colors">
                         <td class="px-3 py-2.5 font-medium text-surface-500">Status</td>
                         <td class="px-3 py-2.5 text-right">
                           <span class="px-2 py-0.5 ${s.isConverted ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'} rounded-full font-bold text-[10px]">
                             ${s.isConverted ? 'OPTIMIZED' : 'ORIGINAL'}
                           </span>
                         </td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>

            <!-- Contextual Help -->
            <div class="p-5 bg-brand-50/50 rounded-2xl border border-brand-100">
              <div class="flex items-center gap-2 mb-2 text-brand-800">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                <h4 class="font-bold text-sm">Browser Compatibility</h4>
              </div>
              <p class="text-brand-700/80 text-xs leading-relaxed">
                MKV is a "container" that can hold many types of video. Most browsers only support H.264 video. If yours contains H.265 (HEVC), use the <strong>Convert</strong> tool to make it playable.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    const video = document.getElementById('omni-video-player');
    const overlay = document.getElementById('playback-overlay');
    const convertTrigger = document.getElementById('overlay-convert-trigger');

    if (video) {
      video.onloadedmetadata = () => {
        const mins = Math.floor(video.duration / 60);
        const secs = Math.floor(video.duration % 60);
        const dur = isFinite(video.duration) ? `${mins}m ${secs}s` : 'Unknown';
        const res = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : 'Unknown';
        
        // Update state but also DOM directly for speed
        const state = helpers.getState();
        state.meta.duration = dur;
        state.meta.resolution = res;
        
        const resEl = document.getElementById('info-res');
        const durEl = document.getElementById('info-dur');
        if (resEl) resEl.textContent = res;
        if (durEl) durEl.textContent = dur;
      };

      // B9: Handle playback error (codec mismatch)
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

      // Speed Buttons
      const speedBtns = document.querySelectorAll('.speed-btn');
      speedBtns.forEach(btn => {
        btn.onclick = () => {
          const speed = parseFloat(btn.dataset.speed);
          video.playbackRate = speed;
          speedBtns.forEach(b => {
            b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
            b.classList.add('text-surface-500');
          });
          btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
          btn.classList.remove('text-surface-500');
        };
      });

      // B9: Volume Boost with AudioContext
      const volumeSlider = document.querySelector('.volume-slider');
      const volumeValue = document.querySelector('.volume-value');
      
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
              } catch (e) {
                console.warn('Web Audio boost failed', e);
              }
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
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escape(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }
})();
