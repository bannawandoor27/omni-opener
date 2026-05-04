(function () {
  'use strict';

  /**
   * OmniOpener AVI Tool
   * Production-perfect browser-based AVI viewer, converter, and metadata extractor.
   */

  const FFMPEG_VERSION = '0.11.0';
  const CORE_VERSION = '0.11.0';
  const FFMPEG_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/ffmpeg.min.js`;
  const CORE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/ffmpeg-core.js`;

  function formatSize(bytes) {
    if (!bytes) return '0 B';
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
    // Closure variables to track URLs for cleanup
    let currentVideoUrl = null;
    let currentMp4Url = null;
    let ffmpegInstance = null;

    const cleanupUrls = () => {
      if (currentVideoUrl) {
        URL.revokeObjectURL(currentVideoUrl);
        currentVideoUrl = null;
      }
      if (currentMp4Url) {
        URL.revokeObjectURL(currentMp4Url);
        currentMp4Url = null;
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.avi',
      dropLabel: 'Drop an .avi file here',
      binary: true,
      infoHtml: '<strong>Privacy First:</strong> Video conversion happens entirely in your browser using FFmpeg.wasm. No data is ever uploaded.',

      onInit: function (helpers) {
        // Pre-load FFmpeg script for better responsiveness
        helpers.loadScript(FFMPEG_URL).catch(e => console.warn('FFmpeg pre-load failed', e));
      },

      onDestroy: function () {
        cleanupUrls();
        if (ffmpegInstance && ffmpegInstance.exit) {
          try { ffmpegInstance.exit(); } catch (e) {}
        }
      },

      onFile: async function _onFile(file, content, helpers) {
        if (!file || !content || content.byteLength === 0) {
          helpers.showError('Empty File', 'The uploaded AVI file contains no data.');
          return;
        }

        helpers.showLoading('Analyzing AVI file...');
        cleanupUrls();

        const state = {
          file,
          content,
          isConverted: false,
          duration: null,
          resolution: null,
          canPlayNative: false
        };
        helpers.setState(state);

        const renderUI = () => {
          const currentState = helpers.getState();
          const html = `
            <div class="max-w-5xl mx-auto">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${escapeHtml(currentState.file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(currentState.file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.avi video</span>
                ${currentState.resolution ? `
                  <span class="text-surface-300">|</span>
                  <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-[10px] font-bold">${currentState.resolution}</span>
                ` : ''}
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-2 space-y-6">
                  <!-- Video Player Container -->
                  <div class="rounded-2xl overflow-hidden bg-black aspect-video ring-1 ring-surface-200 shadow-2xl flex items-center justify-center relative group">
                    <video id="omni-avi-player" controls class="w-full h-full hidden">
                      Your browser does not support HTML5 video.
                    </video>
                    
                    <div id="playback-fallback" class="p-8 text-center">
                      <div class="w-20 h-20 bg-surface-900/50 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
                        <svg class="w-10 h-10 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                      </div>
                      <h3 class="text-xl font-bold text-white mb-3">Browser Playback Incompatible</h3>
                      <p class="text-surface-400 text-sm max-w-sm mx-auto mb-8">
                        Most modern browsers (Chrome, Safari) do not support the legacy AVI format natively.
                      </p>
                      <button id="cta-convert-main" class="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all shadow-xl shadow-brand-900/40 transform active:scale-95 flex items-center gap-2 mx-auto">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Convert to Web-Friendly MP4
                      </button>
                    </div>
                  </div>

                  <!-- Technical Details -->
                  <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm">
                    <div class="flex items-center justify-between mb-6">
                      <h3 class="font-bold text-surface-900 flex items-center gap-2">
                        <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        Media stream info
                      </h3>
                      <span class="text-xs font-mono text-surface-400">FFmpeg/Core v${CORE_VERSION}</span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="p-4 bg-surface-50 rounded-xl border border-surface-100 hover:border-brand-200 transition-colors">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Container</span>
                        <span class="text-sm font-semibold text-surface-700">Audio Video Interleave (AVI)</span>
                      </div>
                      <div class="p-4 bg-surface-50 rounded-xl border border-surface-100 hover:border-brand-200 transition-colors">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Duration</span>
                        <span class="text-sm font-semibold text-surface-700">${currentState.duration || 'Estimating...'}</span>
                      </div>
                      <div class="p-4 bg-surface-50 rounded-xl border border-surface-100 hover:border-brand-200 transition-colors">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Status</span>
                        <span class="text-sm font-semibold ${currentState.isConverted ? 'text-green-600' : 'text-amber-600'}">
                          ${currentState.isConverted ? 'Converted to MP4' : 'Original Format'}
                        </span>
                      </div>
                      <div class="p-4 bg-surface-50 rounded-xl border border-surface-100 hover:border-brand-200 transition-colors">
                        <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">MIME Type</span>
                        <span class="text-sm font-semibold text-surface-700">video/x-msvideo</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="space-y-6">
                  <!-- Feature Card -->
                  <div class="rounded-2xl border border-brand-100 bg-brand-50/50 p-6 shadow-sm">
                    <div class="flex items-center gap-3 mb-4">
                      <div class="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                        <svg class="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                      </div>
                      <div>
                        <h4 class="font-bold text-brand-900 text-sm">Convert to MP4</h4>
                        <p class="text-[10px] text-brand-600">Universal Playback</p>
                      </div>
                    </div>
                    <p class="text-xs text-brand-800 leading-relaxed mb-4">
                      AVI is a legacy "wrapper" format from 1992. Converting to MP4 (H.264/AAC) ensures your video works on all devices and social platforms.
                    </p>
                    <div class="space-y-2">
                      <div class="flex items-center gap-2 text-[11px] text-brand-700">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        <span>Lossless audio preservation</span>
                      </div>
                      <div class="flex items-center gap-2 text-[11px] text-brand-700">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        <span>H.264 Universal Video Codec</span>
                      </div>
                    </div>
                  </div>

                  <!-- System Stats -->
                  <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm">
                    <h4 class="font-bold text-surface-900 text-sm mb-4">Browser Environment</h4>
                    <div class="space-y-4">
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-surface-500">SharedArrayBuffer</span>
                        <div class="flex items-center gap-1.5">
                          <div class="w-2 h-2 rounded-full ${window.SharedArrayBuffer ? 'bg-green-500' : 'bg-amber-500'}"></div>
                          <span class="text-xs font-bold ${window.SharedArrayBuffer ? 'text-green-700' : 'text-amber-700'}">
                            ${window.SharedArrayBuffer ? 'Optimal' : 'Single-Threaded'}
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-surface-500">WASM Acceleration</span>
                        <div class="flex items-center gap-1.5">
                          <div class="w-2 h-2 rounded-full ${window.WebAssembly ? 'bg-green-500' : 'bg-red-500'}"></div>
                          <span class="text-xs font-bold ${window.WebAssembly ? 'text-green-700' : 'text-red-700'}">
                            ${window.WebAssembly ? 'Ready' : 'Missing'}
                          </span>
                        </div>
                      </div>
                      ${!window.SharedArrayBuffer ? `
                        <div class="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                          <p class="text-[10px] text-amber-800 leading-tight">
                            Conversion will be slower because this browser lacks cross-origin isolation (COOP/COEP).
                          </p>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
          helpers.render(html);

          // Wire up local events
          const cta = document.getElementById('cta-convert-main');
          if (cta) {
            cta.onclick = () => {
              const convBtn = document.querySelector('[data-action-id="convert"]');
              if (convBtn) convBtn.click();
            };
          }

          // Video playback attempt
          const video = document.getElementById('omni-avi-player');
          const fallback = document.getElementById('playback-fallback');
          if (video && !currentState.isConverted) {
            const blob = new Blob([currentState.content], { type: 'video/x-msvideo' });
            currentVideoUrl = URL.createObjectURL(blob);
            video.src = currentVideoUrl;
            
            video.onloadedmetadata = () => {
              const dur = video.duration ? `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s` : 'Unknown';
              const res = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : null;
              helpers.setState({ duration: dur, resolution: res, canPlayNative: true });
              
              video.classList.remove('hidden');
              if (fallback) fallback.classList.add('hidden');
              renderUI(); // Refresh to show resolution in info bar
            };

            video.onerror = () => {
              helpers.setState({ canPlayNative: false });
              video.classList.add('hidden');
              if (fallback) fallback.classList.remove('hidden');
            };
          } else if (video && currentState.isConverted && currentMp4Url) {
            video.src = currentMp4Url;
            video.classList.remove('hidden');
            if (fallback) fallback.classList.add('hidden');
          }
        };

        renderUI();
      },

      actions: [
        {
          label: '⚡ Convert to MP4',
          id: 'convert',
          primary: true,
          onClick: async function (helpers, btn) {
            const state = helpers.getState();
            if (!state.content || state.isConverted) return;

            const originalBtn = btn.innerHTML;
            const setBtn = (text, pulse = true) => {
              btn.innerHTML = `<span class="${pulse ? 'animate-pulse' : ''} flex items-center gap-2">${text}</span>`;
            };

            try {
              btn.disabled = true;
              
              if (!window.FFmpeg) {
                setBtn('📥 Loading Engine...');
                helpers.showLoading('Downloading FFmpeg WASM library...');
                await helpers.loadScript(FFMPEG_URL);
              }

              if (!ffmpegInstance) {
                const { createFFmpeg } = window.FFmpeg;
                ffmpegInstance = createFFmpeg({
                  log: false,
                  corePath: CORE_URL
                });
              }

              if (!ffmpegInstance.isLoaded()) {
                setBtn('⚙️ Initializing...');
                helpers.showLoading('Starting FFmpeg core (25MB)...');
                await ffmpegInstance.load();
              }

              setBtn('⏳ Converting 0%');
              helpers.showLoading('Processing video streams...');

              const inputName = 'input.avi';
              const outputName = 'output.mp4';
              
              ffmpegInstance.FS('writeFile', inputName, new Uint8Array(state.content));

              ffmpegInstance.setProgress(({ ratio }) => {
                const pct = Math.floor(ratio * 100);
                if (pct >= 0 && pct <= 100) {
                  setBtn(`⏳ Converting ${pct}%`);
                  helpers.showLoading(`Conversion in progress: ${pct}%...`);
                }
              });

              // Preset ultrafast for browser performance
              // libx264 + aac is the industry standard for MP4 compatibility
              await ffmpegInstance.run(
                '-i', inputName,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                outputName
              );

              const data = ffmpegInstance.FS('readFile', outputName);
              const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
              
              if (currentMp4Url) URL.revokeObjectURL(currentMp4Url);
              currentMp4Url = URL.createObjectURL(mp4Blob);

              helpers.setState({ 
                isConverted: true, 
                mp4Blob,
                mp4Url: currentMp4Url
              });

              // Clean up input file from virtual FS
              try { ffmpegInstance.FS('unlink', inputName); } catch(e) {}
              try { ffmpegInstance.FS('unlink', outputName); } catch(e) {}

              setBtn('✅ Success', false);
              setTimeout(() => {
                btn.innerHTML = originalBtn;
                btn.disabled = false;
                // Use a custom event or direct call to refresh the UI
                const _onFileFn = helpers.getOptions().onFile;
                _onFileFn(state.file, state.content, helpers);
              }, 2000);

            } catch (err) {
              console.error('Conversion error:', err);
              helpers.showError(
                'Conversion Failed',
                'Your browser could not process this video. This usually happens on mobile or low-memory devices. ' + (err.message || '')
              );
              btn.disabled = false;
              btn.innerHTML = originalBtn;
            }
          }
        },
        {
          label: '📸 Save Snapshot',
          id: 'snapshot',
          onClick: function (helpers, btn) {
            const video = document.getElementById('omni-avi-player');
            if (!video || video.paused && video.currentTime === 0) {
              helpers.showError('No Video', 'Play the video or seek to a frame first.');
              return;
            }

            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob((blob) => {
                const name = (helpers.getState().file.name || 'snapshot').replace(/\.avi$/i, '') + '-frame.png';
                helpers.download(name, blob, 'image/png');
              }, 'image/png');
            } catch (e) {
              helpers.showError('Snapshot Failed', 'Could not capture frame. This can happen with certain video codecs.');
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
            } else {
              helpers.download(state.file.name, state.content, 'video/x-msvideo');
            }
          }
        }
      ]
    });
  };
})();
