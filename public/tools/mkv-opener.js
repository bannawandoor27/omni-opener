(function () {
  'use strict';

  /**
   * OmniOpener MKV Tool
   * A production-perfect browser-based MKV player and converter using FFmpeg WASM.
   */

  const FFMPEG_CONFIG = {
    js: 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js',
    core: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mkv',
      binary: true,
      dropLabel: 'Drop MKV video here',
      infoHtml: '<strong>Privacy:</strong> Your video is processed entirely in your browser using FFmpeg WASM. No data is uploaded to any server.',

      onInit: function (helpers) {
        // Preload FFmpeg script
        helpers.loadScript(FFMPEG_CONFIG.js);
      },

      onFile: function (file, content, helpers) {
        if (!file || !content) return;

        // Cleanup previous URLs to prevent memory leaks
        const state = helpers.getState();
        if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
        if (state.mp4Blob && state.videoUrl) URL.revokeObjectURL(state.videoUrl);

        helpers.showLoading('Analyzing video container...');

        const blob = new Blob([content], { type: 'video/x-matroska' });
        const videoUrl = URL.createObjectURL(blob);

        helpers.setState({
          videoUrl,
          isConverted: false,
          mp4Blob: null,
          meta: {
            duration: 'Calculating...',
            resolution: 'Analyzing...',
            codec: 'Detecting...'
          }
        });

        renderMKV(helpers);
      },

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-metadata',
          onClick: function (helpers, btn) {
            const file = helpers.getFile();
            const state = helpers.getState();
            const metadata = {
              filename: file.name,
              size: file.size,
              type: 'video/x-matroska',
              ...(state.meta || {})
            };
            helpers.copyToClipboard(JSON.stringify(metadata, null, 2), btn);
          }
        },
        {
          label: '⚡ Convert to MP4',
          id: 'convert',
          onClick: async function (helpers, btn) {
            const state = helpers.getState();
            if (!state.content) return;
            const originalLabel = btn.textContent;

            try {
              if (typeof FFmpeg === 'undefined') {
                helpers.showLoading('Downloading engine...');
                await helpers.loadScript(FFMPEG_CONFIG.js);
              }

              const { createFFmpeg } = FFmpeg;
              const ffmpeg = createFFmpeg({
                log: false,
                corePath: FFMPEG_CONFIG.core,
              });

              btn.disabled = true;
              btn.textContent = '⌛ Preparing...';
              helpers.showLoading('Loading FFmpeg (25MB)...');
              
              await ffmpeg.load();
              helpers.showLoading('Converting video... This may take several minutes.');
              
              const inputName = 'input.mkv';
              const outputName = 'output.mp4';
              ffmpeg.FS('writeFile', inputName, new Uint8Array(state.content));

              ffmpeg.setProgress(({ ratio }) => {
                const pct = Math.floor(ratio * 100);
                if (pct >= 0 && pct <= 100) {
                  helpers.showLoading(`Converting: ${pct}% complete...`);
                  btn.textContent = `⌛ ${pct}%`;
                }
              });

              // Universal H.264/AAC conversion
              // Using ultrafast preset for browser responsiveness
              await ffmpeg.run(
                '-i', inputName,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '26',
                '-c:a', 'aac',
                '-b:a', '128k',
                outputName
              );

              const data = ffmpeg.FS('readFile', outputName);
              const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
              const mp4Url = URL.createObjectURL(mp4Blob);

              helpers.setState({
                videoUrl: mp4Url,
                mp4Blob: mp4Blob,
                isConverted: true
              });

              renderMKV(helpers);
              
              btn.textContent = '✅ Done';
              setTimeout(() => {
                btn.disabled = false;
                btn.textContent = originalLabel;
              }, 3000);
            } catch (err) {
              console.error('Conversion error:', err);
              helpers.showError('Conversion Failed', 'Your browser might have run out of memory or the file is unsupported.');
              btn.disabled = false;
              btn.textContent = originalLabel;
            }
          }
        },
        {
          label: '📸 Take Screenshot',
          id: 'snapshot',
          onClick: function (helpers) {
            const video = document.getElementById('omni-video-player');
            if (!video || video.readyState < 2) {
              helpers.showError('Cannot capture', 'Please wait for the video to load.');
              return;
            }

            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob((blob) => {
                helpers.download(`snapshot-${Date.now()}.png`, blob, 'image/png');
              }, 'image/png');
            } catch (e) {
              helpers.showError('Capture Issue', 'Security restrictions may prevent capturing this video.');
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const s = helpers.getState();
            if (s.isConverted && s.mp4Blob) {
              const name = s.file.name.replace(/\.[^/.]+$/, "") + '.mp4';
              helpers.download(name, s.mp4Blob, 'video/mp4');
            } else if (s.content) {
              helpers.download(s.file.name, s.content, 'video/x-matroska');
            }
          }
        }
      ]
    });
  };

  function renderMKV(helpers) {
    const s = helpers.getState();
    const file = helpers.getFile();
    
    const html = `
      <div class="p-6 max-w-5xl mx-auto space-y-6">
        <!-- File Header -->
        <div class="flex items-center justify-between bg-surface-50 p-4 rounded-xl border border-surface-200">
          <div class="truncate">
            <h2 class="text-lg font-bold text-surface-900 truncate">${escape(file.name)}</h2>
            <p class="text-xs text-surface-500 font-medium">${formatSize(file.size)} • Matroska Video (.mkv)</p>
          </div>
          ${s.isConverted ? '<span class="px-3 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full border border-green-200 uppercase tracking-wider">Converted to MP4</span>' : ''}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Player Column -->
          <div class="lg:col-span-2 space-y-6">
            <div class="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-2xl ring-1 ring-surface-200 flex items-center justify-center">
              <video id="omni-video-player" class="w-full h-full cursor-pointer" controls playsinline src="${s.videoUrl}"></video>
              
              <!-- Playback Error Overlay -->
              <div id="playback-overlay" class="absolute inset-0 z-10 hidden flex-col items-center justify-center bg-surface-900/90 backdrop-blur-sm text-center p-8">
                <div class="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-amber-500/20">
                  <svg class="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-white text-xl font-bold mb-2">Codec Not Supported</h3>
                <p class="text-surface-400 text-sm mb-6 max-w-xs">Your browser cannot play this MKV directly because of its video or audio codec (e.g., HEVC or AC3).</p>
                <button id="overlay-convert-btn" class="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-600/20">
                  Convert to Web-Friendly MP4
                </button>
              </div>
            </div>

            <!-- Custom Controls -->
            <div class="bg-surface-50 rounded-xl p-4 border border-surface-200 flex flex-wrap items-center gap-6 shadow-sm">
               <div class="flex items-center gap-3">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Playback Speed</span>
                  <div class="flex bg-surface-200 p-1 rounded-lg">
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="0.5">0.5x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium bg-white shadow-sm rounded transition-colors" data-speed="1">1x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="1.5">1.5x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="2">2x</button>
                  </div>
                </div>
                <div class="flex items-center gap-3 flex-1">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Volume Boost</span>
                  <input type="range" class="volume-slider flex-1 accent-brand-500 h-1.5 bg-surface-300 rounded-lg appearance-none cursor-pointer" min="0" max="2" step="0.1" value="1">
                  <span class="volume-value text-xs font-mono text-surface-600 min-w-[4ch]">100%</span>
                </div>
            </div>
          </div>

          <!-- Sidebar Info Column -->
          <div class="space-y-6">
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-4 py-3 bg-surface-50 border-b border-surface-200">
                <h4 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Media Technical Data</h4>
              </div>
              <div class="p-4 space-y-4">
                <div class="flex justify-between items-center pb-3 border-b border-surface-100">
                  <span class="text-xs text-surface-500 font-medium">Resolution</span>
                  <span id="td-resolution" class="text-xs font-mono text-surface-900 bg-surface-100 px-2 py-0.5 rounded">${escape(s.meta.resolution)}</span>
                </div>
                <div class="flex justify-between items-center pb-3 border-b border-surface-100">
                  <span class="text-xs text-surface-500 font-medium">Duration</span>
                  <span id="td-duration" class="text-xs font-mono text-surface-900 bg-surface-100 px-2 py-0.5 rounded">${escape(s.meta.duration)}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-xs text-surface-500 font-medium">Video Codec</span>
                  <span id="td-codec" class="text-xs font-mono text-surface-900 bg-surface-100 px-2 py-0.5 rounded">${escape(s.meta.codec)}</span>
                </div>
              </div>
            </div>

            <div class="p-5 bg-brand-50 rounded-2xl border border-brand-100 shadow-sm">
              <h4 class="text-brand-900 font-bold text-sm mb-2 flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                MKV Playback Tip
              </h4>
              <p class="text-brand-800 text-xs leading-relaxed opacity-80">
                Matroska (MKV) is a container. If it won't play, it likely contains HEVC/H.265 video. Converting to MP4 uses the universal H.264 codec for guaranteed playback.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Setup Video Element Behavior
    const video = document.getElementById('omni-video-player');
    const overlay = document.getElementById('playback-overlay');
    const convertBtn = document.getElementById('overlay-convert-btn');

    if (video) {
      video.onloadedmetadata = () => {
        const dur = video.duration ? `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s` : 'Unknown';
        const res = `${video.videoWidth} × ${video.videoHeight}`;
        
        helpers.setState({
          meta: { ...helpers.getState().meta, duration: dur, resolution: res }
        });
        
        const resEl = document.getElementById('td-resolution');
        const durEl = document.getElementById('td-duration');
        if (resEl) resEl.textContent = res;
        if (durEl) durEl.textContent = dur;
      };

      // Show conversion overlay if video fails to play
      video.onerror = () => {
        if (!helpers.getState().isConverted) {
          overlay.classList.remove('hidden');
          overlay.classList.add('flex');
        }
      };

      if (convertBtn) {
        convertBtn.onclick = () => {
          document.getElementById('omni-action-convert')?.click();
        };
      }

      // Playback Speed Controls
      const speedBtns = document.querySelectorAll('.speed-btn');
      speedBtns.forEach(btn => {
        btn.onclick = () => {
          video.playbackRate = parseFloat(btn.dataset.speed);
          speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm'));
          btn.classList.add('bg-white', 'shadow-sm');
        };
      });

      // Volume & Web Audio Boost
      const volumeSlider = document.querySelector('.volume-slider');
      const volumeValue = document.querySelector('.volume-value');
      if (volumeSlider) {
        volumeSlider.oninput = () => {
          const vol = parseFloat(volumeSlider.value);
          video.volume = Math.min(1, vol);
          volumeValue.textContent = Math.round(vol * 100) + '%';
          
          if (vol > 1) {
            if (!helpers._gainNode) {
              try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioCtx.createMediaElementSource(video);
                helpers._gainNode = audioCtx.createGain();
                source.connect(helpers._gainNode);
                helpers._gainNode.connect(audioCtx.destination);
              } catch (e) { console.warn('Web Audio not supported'); }
            }
            if (helpers._gainNode) helpers._gainNode.gain.value = vol;
          } else if (helpers._gainNode) {
            helpers._gainNode.gain.value = 1;
          }
        };
      }
    }
  }

  // Formatting Utilities
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
