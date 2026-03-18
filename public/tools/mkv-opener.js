(function () {
  'use strict';

  /**
   * OmniOpener MKV Tool
   * A production-perfect browser-based MKV player and converter.
   */

  const FFMPEG_CONFIG = {
    version: '0.11.0',
    js: 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js',
    core: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
  };

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

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mkv',
      binary: true,
      dropLabel: 'Drop MKV video here',
      infoHtml: 'Secure browser-based video playback and conversion. No data is uploaded to any server.',

      onInit: function (helpers) {
        helpers.loadScript(FFMPEG_CONFIG.js);
      },

      onFile: async function (file, content, helpers) {
        if (!file || !content) return;

        // Cleanup previous URLs to prevent memory leaks
        const state = helpers.getState();
        if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);

        helpers.showLoading('Analyzing video container...');

        const blob = new Blob([content], { type: 'video/x-matroska' });
        const videoUrl = URL.createObjectURL(blob);

        helpers.setState({
          file,
          content,
          videoUrl,
          previewUrl: null,
          isConverted: false,
          meta: {
            duration: 'Calculating...',
            resolution: 'Analyzing...',
            codec: 'Detecting...'
          }
        });

        const renderUI = () => {
          const s = helpers.getState();
          const html = `
            <div class="max-w-6xl mx-auto pb-12">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${escape(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">Matroska Video (.mkv)</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <!-- Main Player Area -->
                <div class="lg:col-span-8 space-y-6">
                  <div class="relative group rounded-2xl overflow-hidden bg-black aspect-video ring-1 ring-surface-200 shadow-2xl flex items-center justify-center">
                    <video id="omni-video-player" class="w-full h-full cursor-pointer" controls playsinline>
                      <source src="${s.videoUrl}" type="video/x-matroska">
                      <source src="${s.videoUrl}" type="video/webm">
                    </video>
                    
                    <div id="playback-overlay" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-900/80 backdrop-blur-sm transition-opacity duration-300 hidden">
                      <div class="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-amber-500/20">
                        <svg class="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      </div>
                      <h3 class="text-xl font-bold text-white mb-2">Browser Playback Limited</h3>
                      <p class="text-surface-300 text-center max-w-sm px-6 mb-6">This MKV uses codecs (like H.265/HEVC or AC3) that your browser cannot play directly.</p>
                      <button id="overlay-convert-btn" class="px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold transition-all transform hover:scale-105 shadow-xl shadow-brand-600/20 flex items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Convert to Web-Friendly MP4
                      </button>
                    </div>
                  </div>

                  <!-- U10: Section Header -->
                  <div class="flex items-center justify-between mb-4 mt-8">
                    <h3 class="font-bold text-surface-800 text-lg">Media Properties</h3>
                    <span class="text-xs font-medium bg-surface-100 text-surface-600 px-3 py-1 rounded-full border border-surface-200 uppercase tracking-wider">Technical Info</span>
                  </div>

                  <!-- U7: Metadata Table -->
                  <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
                    <table class="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 bg-surface-50/50">Property</th>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 bg-surface-50/50">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr class="hover:bg-brand-50/30 transition-colors">
                          <td class="px-4 py-3 text-surface-500 font-medium border-b border-surface-100 w-1/3">Resolution</td>
                          <td id="td-resolution" class="px-4 py-3 text-surface-800 font-mono border-b border-surface-100">${escape(s.meta ? s.meta.resolution : "Analyzing...")}</td>
                        </tr>
                        <tr class="even:bg-surface-50/30 hover:bg-brand-50/30 transition-colors">
                          <td class="px-4 py-3 text-surface-500 font-medium border-b border-surface-100">Duration</td>
                          <td id="td-duration" class="px-4 py-3 text-surface-800 font-mono border-b border-surface-100">${escape(s.meta ? s.meta.duration : "Calculating...")}</td>
                        </tr>
                        <tr class="hover:bg-brand-50/30 transition-colors">
                          <td class="px-4 py-3 text-surface-500 font-medium border-b border-surface-100">Video Codec</td>
                          <td id="td-codec" class="px-4 py-3 text-surface-800 font-mono border-b border-surface-100">${escape(s.meta ? s.meta.codec : "Detecting...")}</td>
                        </tr>
                        <tr class="even:bg-surface-50/30 hover:bg-brand-50/30 transition-colors">
                          <td class="px-4 py-3 text-surface-500 font-medium border-b border-surface-100">MIME Type</td>
                          <td class="px-4 py-3 text-surface-800 font-mono border-b border-surface-100">video/x-matroska</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Sidebar Actions/Info -->
                <div class="lg:col-span-4 space-y-6">
                  <!-- Compatibility Card -->
                  <div class="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-6 shadow-sm">
                    <h4 class="font-bold text-brand-900 mb-3 flex items-center gap-2">
                      <svg class="w-5 h-5 text-brand-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"></path></svg>
                      Why won't it play?
                    </h4>
                    <p class="text-sm text-brand-800/80 leading-relaxed mb-4">
                      MKV is a "container" that can hold many types of video. Most browsers only support <strong>H.264</strong> and <strong>VP8/VP9</strong>. If yours uses HEVC (H.265) or AV1, it might not play without conversion.
                    </p>
                    <div class="space-y-3">
                      <div class="flex items-start gap-3 p-3 bg-white/60 rounded-xl border border-brand-100">
                        <div class="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 mt-0.5">
                          <svg class="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <div>
                          <p class="text-xs font-bold text-brand-900">High Compatibility</p>
                          <p class="text-[11px] text-brand-700">Conversion uses H.264/AAC for universal support.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Quick Stats -->
                  <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm">
                    <h4 class="font-bold text-surface-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                      Processing Info
                    </h4>
                    <div class="space-y-4">
                      <div>
                        <div class="flex justify-between text-xs mb-1.5">
                          <span class="text-surface-500 font-medium">Privacy Status</span>
                          <span class="text-green-600 font-bold flex items-center gap-1">
                            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 4.946-2.567 9.29-6.433 11.771a.75.75 0 01-.834 0C6.566 16.29 4 11.945 4 7c0-.68.056-1.35.166-2.001zm6.584 3.48a.75.75 0 011.06 0l3 3a.75.75 0 01-1.06 1.06L10 10.81l-1.25 1.25a.75.75 0 11-1.06-1.06l2.31-2.31z" clip-rule="evenodd"></path></svg>
                            Local
                          </span>
                        </div>
                        <p class="text-[11px] text-surface-400">Your file remains on your computer. All processing happens in-browser via WebAssembly.</p>
                      </div>
                      <div class="pt-4 border-t border-surface-100">
                        <div class="flex justify-between text-xs mb-1.5">
                          <span class="text-surface-500 font-medium">Browser Engine</span>
                          <span class="text-surface-800 font-mono">FFmpeg WASM</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
          helpers.render(html);

          // Setup video events
          const video = document.getElementById('omni-video-player');
          const overlay = document.getElementById('playback-overlay');
          const convertOverlayBtn = document.getElementById('overlay-convert-btn');

          if (video) {
            video.onloadedmetadata = () => {
              const dur = video.duration ? `${Math.floor(video.duration / 60)}m ${Math.floor(video.duration % 60)}s` : 'Unknown';
              const res = `${video.videoWidth} × ${video.videoHeight}`;
              
              helpers.setState({ 
                meta: { ...helpers.getState().meta, duration: dur, resolution: res }
              });

              document.getElementById('td-duration').textContent = dur;
              document.getElementById('td-resolution').textContent = res;
              helpers.showLoading(null);
            };

            video.onerror = () => {
              overlay.classList.remove('hidden');
              overlay.classList.add('flex');
              helpers.showLoading(null);
            };

            if (convertOverlayBtn) {
              convertOverlayBtn.onclick = () => {
                const actionBtn = document.getElementById('omni-action-convert');
                if (actionBtn) actionBtn.click();
              };
            }
          }
        };

        renderUI();
      },

      actions: [
        {
          label: '⚡ Convert to MP4',
          id: 'convert',
          onClick: async function (helpers, btn) {
            const state = helpers.getState();
            if (!state.content) return;

            const originalLabel = btn.innerHTML;
            
            try {
              if (typeof window.FFmpeg === 'undefined') {
                helpers.showLoading('Downloading processing engine...');
                await new Promise((resolve, reject) => {
                  helpers.loadScript(FFMPEG_CONFIG.js, () => {
                    if (typeof window.FFmpeg !== 'undefined') resolve();
                    else reject(new Error('Failed to load FFmpeg'));
                  });
                });
              }

              const { createFFmpeg } = window.FFmpeg;
              const ffmpeg = createFFmpeg({
                log: false,
                corePath: FFMPEG_CONFIG.core,
              });

              btn.disabled = true;
              btn.innerHTML = '<span class="animate-pulse">⌛ Preparing...</span>';
              
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
                  btn.innerHTML = `<span class="animate-pulse">⌛ ${pct}%</span>`;
                }
              });

              // Universal H.264/AAC conversion
              // Using ultrafast preset to minimize browser hang time, at cost of file size
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

              // Update state and UI
              helpers.setState({ 
                videoUrl: mp4Url, 
                mp4Blob, 
                isConverted: true 
              });
              
              const video = document.getElementById('omni-video-player');
              const overlay = document.getElementById('playback-overlay');
              if (video) {
                video.src = mp4Url;
                if (overlay) overlay.classList.add('hidden');
                video.play().catch(() => {});
              }

              btn.innerHTML = '✅ Done';
              helpers.showLoading(null);
              
              setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalLabel;
              }, 5000);

            } catch (err) {
              console.error('Conversion error:', err);
              helpers.showError('Conversion Failed', 'Your browser might have run out of memory or the file is corrupted. Try a smaller file.');
              btn.disabled = false;
              btn.innerHTML = originalLabel;
              helpers.showLoading(null);
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
                const name = `snapshot-${Date.now()}.png`;
                helpers.download(name, blob, 'image/png');
              }, 'image/png');
            } catch (e) {
              helpers.showError('Capture Error', 'Security restrictions may prevent capturing this video.');
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const s = helpers.getState();
            if (s.isConverted && s.mp4Blob) {
              const name = (s.file.name || 'video').replace(/\.[^/.]+$/, "") + '.mp4';
              helpers.download(name, s.mp4Blob, 'video/mp4');
            } else if (s.content) {
              helpers.download(s.file.name, s.content, 'video/x-matroska');
            }
          }
        }
      ]
    });
  };
})();
