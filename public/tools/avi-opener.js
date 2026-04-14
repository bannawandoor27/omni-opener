(function () {
  'use strict';

  /**
   * OmniOpener AVI Tool
   * A production-perfect browser-based AVI viewer and converter.
   */

  const FFMPEG_VERSION = '0.11.0';
  const CORE_VERSION = '0.11.0';
  const FFMPEG_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/ffmpeg.min.js`;
  const CORE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/ffmpeg-core.js`;

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avi',
      dropLabel: 'Drop an .avi file here',
      binary: true,
      infoHtml: '<strong>Privacy First:</strong> Video conversion happens entirely in your browser. No data is ever uploaded.',

      onInit: function (helpers) {
        helpers.loadScript(FFMPEG_URL);
      },

      onFile: async function (file, content, helpers) {
        if (!file || !content) return;

        helpers.showLoading('Initializing AVI viewer...');
        
        // Clean up previous URLs to prevent memory leaks
        const prevState = helpers.getState();
        if (prevState.videoUrl) URL.revokeObjectURL(prevState.videoUrl);
        if (prevState.mp4Url) URL.revokeObjectURL(prevState.mp4Url);

        helpers.setState({
          file,
          content,
          videoUrl: null,
          mp4Url: null,
          isConverted: false,
          duration: null,
          dimensions: null
        });

        const fileInfoBar = `
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.avi video file</span>
          </div>
        `;

        const renderBase = () => {
          const html = `
            <div class="max-w-5xl mx-auto">
              ${fileInfoBar}
              
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-6">
                  <div id="video-container" class="rounded-2xl overflow-hidden bg-black aspect-video ring-1 ring-surface-200 shadow-xl flex flex-col items-center justify-center relative">
                    <video id="main-player" controls class="w-full h-full hidden">
                      Your browser does not support the video tag.
                    </video>
              <div class="mt-4 flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-50 rounded-xl border border-surface-200 shadow-sm">
                <div class="flex items-center gap-3">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Speed</span>
                  <div class="flex bg-surface-200 p-1 rounded-lg">
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="0.5">0.5x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium bg-white shadow-sm rounded transition-colors" data-speed="1">1x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="1.5">1.5x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="2">2x</button>
                  </div>
                </div>
                <div class="flex items-center gap-3 flex-1 max-w-xs">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Volume</span>
                  <input type="range" class="volume-slider flex-1 accent-brand-500 h-1.5 bg-surface-300 rounded-lg appearance-none cursor-pointer" min="0" max="2" step="0.1" value="1">
                  <span class="volume-value text-xs font-mono text-surface-600 min-w-[4ch]">100%</span>
                </div>
              </div>

                    <div id="playback-notice" class="p-8 text-center">
                      <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </div>
                      <h3 class="text-lg font-semibold text-white mb-2">Native Playback Check</h3>
                      <p class="text-surface-400 text-sm max-w-xs mx-auto">Most browsers don't support AVI natively. We are checking if yours can...</p>
                    </div>
                  </div>

                  <div class="rounded-xl border border-surface-200 p-6 bg-white shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                        <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Technical Details
                      </h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase mb-1">Container</span>
                        <span class="text-sm font-medium text-surface-700">Audio Video Interleave (.avi)</span>
                      </div>
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase mb-1">MIME Type</span>
                        <span class="text-sm font-medium text-surface-700">video/x-msvideo</span>
                      </div>
                      <div id="meta-resolution" class="p-3 bg-surface-50 rounded-lg border border-surface-100 hidden">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase mb-1">Resolution</span>
                        <span id="val-resolution" class="text-sm font-medium text-surface-700">-</span>
                      </div>
                      <div id="meta-duration" class="p-3 bg-surface-50 rounded-lg border border-surface-100 hidden">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase mb-1">Duration</span>
                        <span id="val-duration" class="text-sm font-medium text-surface-700">-</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="space-y-6">
                  <div class="rounded-xl border border-brand-100 bg-brand-50/50 p-5">
                    <h4 class="font-bold text-brand-900 text-sm mb-2 flex items-center gap-2">
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"></path></svg>
                      Optimization Required
                    </h4>
                    <p class="text-xs text-brand-800 leading-relaxed mb-4">
                      AVI is a legacy format. For the best experience, convert it to MP4. This allows:
                    </p>
                    <ul class="text-[11px] space-y-2 text-brand-700">
                      <li class="flex items-center gap-2"><svg class="w-3 h-3 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Universal browser playback</li>
                      <li class="flex items-center gap-2"><svg class="w-3 h-3 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Better compression (H.264 + AAC)</li>
                      <li class="flex items-center gap-2"><svg class="w-3 h-3 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 100% Client-side processing</li>
                    </ul>
                  </div>

                  <div class="rounded-xl border border-surface-200 p-5 bg-white">
                    <h4 class="font-bold text-surface-800 text-sm mb-3">Browser Capabilities</h4>
                    <div class="space-y-3">
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-surface-500">SharedArrayBuffer</span>
                        <span class="${!!window.SharedArrayBuffer ? 'text-green-600 font-bold' : 'text-amber-600 font-bold'}">
                          ${!!window.SharedArrayBuffer ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div class="flex items-center justify-between text-xs">
                        <span class="text-surface-500">WebAssembly</span>
                        <span class="${!!window.WebAssembly ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}">
                          ${!!window.WebAssembly ? 'Enabled' : 'Missing'}
                        </span>
                      </div>
                    </div>
                    ${!window.SharedArrayBuffer ? `
                      <p class="mt-3 text-[10px] text-surface-400 italic">Note: Single-threaded mode will be used, which is slower.</p>
                    ` : ''}
                  </div>
                </div>
              </div>
            </div>
          `;
          helpers.render(html);
    // Media Controls Logic
    setTimeout(() => {
      const video = document.querySelector('video') || document.getElementById('main-player') || document.getElementById('omni-video-player') || document.getElementById('webm-player');
      const speedBtns = document.querySelectorAll('.speed-btn');
      const volumeSlider = document.querySelector('.volume-slider');
      const volumeValue = document.querySelector('.volume-value');
      
      if (!video) return;

      speedBtns.forEach(btn => {
        btn.onclick = () => {
          const speed = parseFloat(btn.dataset.speed);
          video.playbackRate = speed;
          speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm'));
          btn.classList.add('bg-white', 'shadow-sm');
        };
      });

      if (volumeSlider) {
        let audioCtx, source, gainNode;
        volumeSlider.oninput = () => {
          const vol = parseFloat(volumeSlider.value);
          volumeValue.textContent = Math.round(vol * 100) + '%';
          
          if (vol > 1.0) {
            if (!audioCtx) {
              try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                source = audioCtx.createMediaElementSource(video);
                gainNode = audioCtx.createGain();
                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);
              } catch (e) { console.warn("Web Audio API not supported or already initialized", e); }
            }
            if (gainNode) gainNode.gain.value = vol;
            video.volume = 1.0;
          } else {
            if (gainNode) gainNode.gain.value = 1.0;
            video.volume = vol;
          }
        };
      }
    }, 1000);

        };

        renderBase();

        // Attempt playback
        const video = document.getElementById('main-player');
        const notice = document.getElementById('playback-notice');
        const blob = new Blob([content], { type: 'video/x-msvideo' });
        const videoUrl = URL.createObjectURL(blob);
        helpers.setState({ videoUrl });

        if (video) {
          video.src = videoUrl;
          video.onloadedmetadata = () => {
            const duration = video.duration ? `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s` : 'Unknown';
            const resolution = `${video.videoWidth} × ${video.videoHeight}`;
            
            document.getElementById('meta-resolution').classList.remove('hidden');
            document.getElementById('meta-duration').classList.remove('hidden');
            document.getElementById('val-resolution').textContent = resolution;
            document.getElementById('val-duration').textContent = duration;
            
            helpers.setState({ duration, dimensions: resolution });

            // If it loaded, it might be playable (e.g. Chrome with certain extensions or Edge)
            video.classList.remove('hidden');
            notice.classList.add('hidden');
          };

          video.onerror = () => {
            notice.innerHTML = `
              <div class="p-6">
                <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg class="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-lg font-semibold text-white mb-2">Incompatible Format</h3>
                <p class="text-surface-400 text-sm mb-6">This AVI file cannot be played directly in your browser.</p>
                <button id="cta-convert" class="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-brand-900/20">
                  ⚡ Convert to Playable MP4
                </button>
              </div>
            `;
            const cta = document.getElementById('cta-convert');
            if (cta) {
              cta.onclick = () => {
                const convertBtn = document.querySelector('[data-action-id="convert"]');
                if (convertBtn) convertBtn.click();
              };
            }
          };
        }
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
              type: file.type,
              lastModified: new Date(file.lastModified).toISOString(),
              ...(state.meta || {}),
              ...(state.manifest ? { version: state.manifest.version } : {})
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

            const originalBtnText = btn.innerHTML;
            
            const cleanup = () => {
              btn.innerHTML = originalBtnText;
              btn.disabled = false;
            };

            try {
              // Ensure dependency is loaded
              if (!window.FFmpeg) {
                helpers.showLoading('Downloading FFmpeg engine...');
                await helpers.loadScript(FFMPEG_URL);
              }

              const { createFFmpeg } = window.FFmpeg;
              const ffmpeg = createFFmpeg({
                log: false,
                corePath: CORE_URL
              });

              btn.disabled = true;
              btn.innerHTML = '<span class="animate-pulse">⌛ Initializing...</span>';
              
              helpers.showLoading('Loading FFmpeg Core (25MB)... This only happens once.');
              await ffmpeg.load();

              helpers.showLoading('Converting AVI to MP4... Your browser may become sluggish.');
              btn.innerHTML = '<span class="animate-pulse">⌛ Converting...</span>';

              const inputName = 'input.avi';
              const outputName = 'output.mp4';
              
              ffmpeg.FS('writeFile', inputName, new Uint8Array(state.content));

              // Progress tracking
              ffmpeg.setProgress(({ ratio }) => {
                const pct = Math.floor(ratio * 100);
                if (pct >= 0 && pct <= 100) {
                  helpers.showLoading(`Converting: ${pct}% complete...`);
                  btn.innerHTML = `<span class="animate-pulse">⌛ ${pct}% Done</span>`;
                }
              });

              // Run conversion: libx264 + aac for maximum compatibility
              // preset ultrafast to keep it quick for browser use
              await ffmpeg.run('-i', inputName, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-b:a', '128k', outputName);

              const data = ffmpeg.FS('readFile', outputName);
              const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
              const mp4Url = URL.createObjectURL(mp4Blob);

              // Update player
              const video = document.getElementById('main-player');
              const notice = document.getElementById('playback-notice');
              if (video && notice) {
                video.src = mp4Url;
                video.classList.remove('hidden');
                notice.classList.add('hidden');
                video.play().catch(e => console.warn('Autoplay prevented', e));
              }

              helpers.setState({ mp4Url, mp4Blob, isConverted: true });

              btn.innerHTML = '✅ Converted';
              renderBase();
              const restoredVideo = document.getElementById('main-player');
              if (restoredVideo) {
                restoredVideo.src = mp4Url;
                restoredVideo.classList.remove('hidden');
                const restoredNotice = document.getElementById('playback-notice');
                if (restoredNotice) restoredNotice.classList.add('hidden');
              }

              setTimeout(cleanup, 3000);

            } catch (err) {
              console.error('Conversion error:', err);
              helpers.showError(
                'Conversion Failed', 
                'The browser was unable to process this video. This is usually due to memory limits or security restrictions (COOP/COEP). ' + err.message
              );
              cleanup();
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const state = helpers.getState();
            if (state.isConverted && state.mp4Blob) {
              const name = (state.file.name || 'video').replace(/\.avi$/i, '') + '.mp4';
              helpers.download(name, state.mp4Blob, 'video/mp4');
            } else if (state.content) {
              helpers.download(state.file.name, state.content, 'video/x-msvideo');
            }
          }
        }
      ]
    });
  };
})();
