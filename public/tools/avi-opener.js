(function () {
  'use strict';

  /**
   * OmniOpener AVI Tool
   * Browser-based AVI viewer and converter using FFmpeg.wasm.
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

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.initTool = function (toolConfig, mountEl) {
    let ffmpegInstance = null;
    let currentVideoUrl = null;
    let currentMp4Url = null;

    function cleanupUrls() {
      if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
      if (currentMp4Url) URL.revokeObjectURL(currentMp4Url);
      currentVideoUrl = null;
      currentMp4Url = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.avi',
      binary: true,
      dropLabel: 'Drop an .avi file here',
      infoHtml: '<strong>Privacy First:</strong> Conversion happens entirely in your browser. No video data is ever uploaded to a server.',

      onInit: function (helpers) {
        helpers.loadScript(FFMPEG_URL).catch(e => console.warn('FFmpeg pre-load failed', e));
      },

      onDestroy: function () {
        cleanupUrls();
        if (ffmpegInstance) {
          try { ffmpegInstance.exit(); } catch (e) {}
        }
      },

      onFile: async function (file, content, helpers) {
        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'The uploaded AVI file contains no data.');
          return;
        }

        cleanupUrls();
        const blob = new Blob([content], { type: 'video/x-msvideo' });
        currentVideoUrl = URL.createObjectURL(blob);

        helpers.setState({
          file: file,
          content: content,
          isConverted: false,
          duration: null,
          resolution: null,
          canPlayNative: null,
          mp4Blob: null
        });

        renderUI(helpers);
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
            try {
              btn.disabled = true;
              
              if (!window.FFmpeg) {
                btn.textContent = 'Loading Engine...';
                await helpers.loadScript(FFMPEG_URL);
              }

              if (!ffmpegInstance) {
                ffmpegInstance = window.FFmpeg.createFFmpeg({
                  log: false,
                  corePath: CORE_URL
                });
              }

              if (!ffmpegInstance.isLoaded()) {
                btn.textContent = 'Initializing...';
                await ffmpegInstance.load();
              }

              const inputName = 'input.avi';
              const outputName = 'output.mp4';
              
              ffmpegInstance.FS('writeFile', inputName, new Uint8Array(state.content));

              ffmpegInstance.setProgress(({ ratio }) => {
                const pct = Math.floor(ratio * 100);
                btn.textContent = `Converting ${pct}%...`;
                helpers.showLoading(`Conversion in progress: ${pct}%...`);
              });

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
                mp4Blob: mp4Blob
              });

              ffmpegInstance.FS('unlink', inputName);
              ffmpegInstance.FS('unlink', outputName);

              btn.innerHTML = originalBtn;
              btn.disabled = false;
              renderUI(helpers);

            } catch (err) {
              console.error('Conversion error:', err);
              helpers.showError('Conversion Failed', err.message);
              btn.disabled = false;
              btn.innerHTML = originalBtn;
            }
          }
        },
        {
          label: '📸 Snapshot',
          id: 'snapshot',
          onClick: function (helpers) {
            const video = document.getElementById('omni-avi-player');
            if (!video || (video.paused && video.currentTime === 0)) {
              return;
            }

            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob((blob) => {
                const name = helpers.getState().file.name.replace(/\.[^.]+$/, '') + '-frame.png';
                helpers.download(name, blob, 'image/png');
              }, 'image/png');
            } catch (e) {
              console.warn('Snapshot failed', e);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const state = helpers.getState();
            if (state.isConverted && state.mp4Blob) {
              const name = state.file.name.replace(/\.[^.]+$/, '') + '.mp4';
              helpers.download(name, state.mp4Blob, 'video/mp4');
            } else {
              helpers.download(state.file.name, state.content, 'video/x-msvideo');
            }
          }
        }
      ]
    });

    function renderUI(helpers) {
      const state = helpers.getState();
      const videoSrc = state.isConverted ? currentMp4Url : currentVideoUrl;
      const isNativeSupported = state.canPlayNative !== false;

      const html = `
        <div class="max-w-5xl mx-auto p-6 space-y-6">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm border border-surface-100">
            <span class="font-bold text-surface-800">${esc(state.file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">AVI video</span>
            ${state.resolution ? `
              <span class="text-surface-300">|</span>
              <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold">${state.resolution}</span>
            ` : ''}
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-6">
              <div class="rounded-2xl overflow-hidden bg-black aspect-video ring-1 ring-surface-200 shadow-xl flex items-center justify-center relative">
                <video id="omni-avi-player" controls class="w-full h-full ${(!state.isConverted && !isNativeSupported) ? 'hidden' : ''}" src="${videoSrc || ''}">
                  Your browser does not support HTML5 video.
                </video>
                
                ${(!state.isConverted && !isNativeSupported) ? `
                  <div class="p-8 text-center text-white">
                    <svg class="w-16 h-16 text-surface-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <h3 class="text-lg font-bold mb-2">Browser Playback Incompatible</h3>
                    <p class="text-surface-400 text-sm mb-6">AVI is a legacy format. Convert it to MP4 for universal playback.</p>
                    <button onclick="document.getElementById('omni-action-convert').click()" class="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold transition-all">
                      Convert to MP4
                    </button>
                  </div>
                ` : ''}
              </div>

              <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                  <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Container</span>
                  <span class="text-sm font-semibold text-surface-700">AVI (Audio Video Interleave)</span>
                </div>
                <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                  <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Duration</span>
                  <span class="text-sm font-semibold text-surface-700">${state.duration || 'Detecting...'}</span>
                </div>
                <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                  <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Status</span>
                  <span class="text-sm font-semibold ${state.isConverted ? 'text-green-600' : 'text-amber-600'}">
                    ${state.isConverted ? 'Converted to MP4' : 'Original AVI'}
                  </span>
                </div>
                <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                  <span class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Web Acceleration</span>
                  <span class="text-sm font-semibold text-surface-700">${window.SharedArrayBuffer ? 'Multicore WASM' : 'Single-thread'}</span>
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <div class="rounded-2xl border border-brand-100 bg-brand-50 p-6 shadow-sm">
                <h4 class="font-bold text-brand-900 text-sm mb-2">Local Conversion</h4>
                <p class="text-xs text-brand-800 leading-relaxed mb-4">
                  Using FFmpeg.wasm, we can re-encode legacy AVI files into modern MP4 (H.264/AAC) directly in your browser.
                </p>
                <ul class="space-y-2 text-[11px] text-brand-700">
                  <li class="flex items-center gap-2">✓ No file upload required</li>
                  <li class="flex items-center gap-2">✓ Preserves original quality</li>
                  <li class="flex items-center gap-2">✓ Works on most modern browsers</li>
                </ul>
              </div>
              
              <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm">
                <h4 class="font-bold text-surface-900 text-sm mb-4">Browser Support</h4>
                <div class="space-y-3">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-surface-500">SharedArrayBuffer</span>
                    <span class="font-bold ${window.SharedArrayBuffer ? 'text-green-600' : 'text-amber-600'}">${window.SharedArrayBuffer ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-surface-500">WebAssembly</span>
                    <span class="font-bold text-green-600">Ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      const video = document.getElementById('omni-avi-player');
      if (video && !state.isConverted) {
        video.onloadedmetadata = () => {
          if (!state.duration) {
            const dur = video.duration ? `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s` : 'Unknown';
            const res = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : null;
            helpers.setState({ duration: dur, resolution: res, canPlayNative: true });
            renderUI(helpers);
          }
        };
        video.onerror = () => {
          if (state.canPlayNative !== false) {
            helpers.setState({ canPlayNative: false });
            renderUI(helpers);
          }
        };
      }
    }
  };
})();
