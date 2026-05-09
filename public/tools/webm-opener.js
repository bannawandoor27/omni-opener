(function() {
  window.initTool = function(toolConfig, mountEl) {
    let _videoUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.webm',
      dropLabel: 'Drop a .webm file here',
      binary: true,
      onInit: function(helpers) {
        // Native browser support for WebM is sufficient
      },
      onFile: function _onFile(file, content, helpers) {
        helpers.showLoading('Preparing video player...');

        function formatSize(bytes) {
          if (bytes === 0) return '0 B';
          const k = 1024;
          const sizes = ['B', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        try {
          // Cleanup previous object URL
          if (_videoUrl) {
            URL.revokeObjectURL(_videoUrl);
            _videoUrl = null;
          }

          const blob = new Blob([content], { type: 'video/webm' });
          _videoUrl = URL.createObjectURL(blob);
          
          helpers.setState('videoBlob', blob);
          helpers.setState('fileName', file.name);

          const html = `
            <div class="max-w-5xl mx-auto">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
                <span class="font-semibold text-surface-800">${file.name}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.webm video</span>
              </div>

              <div class="bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 aspect-video flex items-center justify-center relative group">
                <video id="omni-webm-player" controls class="w-full h-full max-h-[75vh] outline-none">
                  <source src="${_videoUrl}" type="video/webm">
                  <div class="p-12 text-center text-white">
                    <p class="text-xl font-semibold mb-2">Unsupported Encoding</p>
                    <p class="text-sm opacity-60">Your browser cannot play this specific WebM variant.</p>
                  </div>
                </video>
              </div>

              <!-- Video Metadata & Controls -->
              <div class="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-6">
                  <!-- Custom Controls Card -->
                  <div class="p-5 bg-white border border-surface-200 rounded-xl shadow-sm">
                    <div class="flex items-center justify-between mb-4">
                      <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                        Playback Enhancements
                      </h3>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-8">
                      <div class="space-y-2">
                        <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider block">Playback Speed</span>
                        <div class="flex bg-surface-100 p-1 rounded-lg border border-surface-200">
                          ${[0.5, 1, 1.5, 2].map(s => `<button class="speed-btn px-3 py-1 text-xs font-medium rounded transition-all ${s === 1 ? 'bg-white shadow-sm text-brand-600' : 'hover:bg-white/50 text-surface-600'}" data-speed="${s}">${s}x</button>`).join('')}
                        </div>
                      </div>

                      <div class="flex-1 min-w-[200px] space-y-2">
                        <div class="flex justify-between items-center">
                          <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Volume Boost</span>
                          <span id="volume-val" class="text-xs font-mono text-brand-600 font-bold">100%</span>
                        </div>
                        <input type="range" id="volume-boost" class="w-full accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer" min="0" max="3" step="0.1" value="1">
                        <p class="text-[10px] text-surface-400">Boost audio up to 300% (experimental)</p>
                      </div>
                    </div>
                  </div>

                  <!-- Details Card -->
                  <div class="p-5 bg-white border border-surface-200 rounded-xl shadow-sm">
                    <h3 class="font-semibold text-surface-800 mb-4">Video Information</h3>
                    <div id="video-meta-grid" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Resolution</div>
                        <div id="meta-res" class="text-sm font-medium text-surface-700">—</div>
                      </div>
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Duration</div>
                        <div id="meta-dur" class="text-sm font-medium text-surface-700">—</div>
                      </div>
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">MIME Type</div>
                        <div class="text-sm font-medium text-surface-700 truncate">video/webm</div>
                      </div>
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Status</div>
                        <div id="meta-status" class="text-sm font-medium text-emerald-600 flex items-center gap-1">
                          <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                          Loading
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="space-y-4">
                  <div class="p-5 bg-brand-50 border border-brand-100 rounded-xl">
                    <h3 class="font-bold text-brand-900 text-sm mb-2">Why WebM?</h3>
                    <p class="text-xs text-brand-800/80 leading-relaxed">
                      WebM is an open, royalty-free media file format designed for the web. It uses VP8/VP9 for video and Vorbis/Opus for audio. 
                      It is optimized for high-quality video delivery across different devices and bandwidths.
                    </p>
                  </div>
                  
                  <div class="p-5 bg-surface-900 rounded-xl text-white">
                    <h3 class="font-bold text-white/90 text-sm mb-2">Privacy Guaranteed</h3>
                    <p class="text-xs text-white/60 leading-relaxed">
                      This player is entirely client-side. The video stream is processed in your browser memory and never touches our servers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          // Logic for video metadata and controls
          const video = document.getElementById('omni-webm-player');
          if (!video) return;

          video.onloadedmetadata = () => {
            const resEl = document.getElementById('meta-res');
            const durEl = document.getElementById('meta-dur');
            const statusEl = document.getElementById('meta-status');
            
            if (resEl) resEl.textContent = `${video.videoWidth} × ${video.videoHeight}`;
            if (durEl) {
              const mins = Math.floor(video.duration / 60);
              const secs = Math.floor(video.duration % 60);
              durEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            if (statusEl) {
              statusEl.className = 'text-sm font-medium text-brand-600 flex items-center gap-1';
              statusEl.innerHTML = '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg> Ready';
            }

            helpers.setState('meta', {
              width: video.videoWidth,
              height: video.videoHeight,
              duration: video.duration
            });
          };

          video.onerror = () => {
            const statusEl = document.getElementById('meta-status');
            if (statusEl) {
              statusEl.className = 'text-sm font-medium text-red-600';
              statusEl.textContent = 'Playback Error';
            }
          };

          // Speed Controls
          const speedBtns = document.querySelectorAll('.speed-btn');
          speedBtns.forEach(btn => {
            btn.onclick = () => {
              const speed = parseFloat(btn.dataset.speed);
              video.playbackRate = speed;
              speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600'));
              speedBtns.forEach(b => b.classList.add('text-surface-600', 'hover:bg-white/50'));
              btn.classList.remove('text-surface-600', 'hover:bg-white/50');
              btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
            };
          });

          // Volume Boost (using Web Audio API)
          const volumeInput = document.getElementById('volume-boost');
          const volumeVal = document.getElementById('volume-val');
          let audioCtx, source, gainNode;

          if (volumeInput) {
            volumeInput.oninput = () => {
              const vol = parseFloat(volumeInput.value);
              volumeVal.textContent = Math.round(vol * 100) + '%';
              
              if (vol > 1.0) {
                if (!audioCtx) {
                  try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    source = audioCtx.createMediaElementSource(video);
                    gainNode = audioCtx.createGain();
                    source.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                  } catch (e) {
                    console.error("Audio Context Error:", e);
                  }
                }
                if (gainNode) gainNode.gain.value = vol;
                video.volume = 1.0;
              } else {
                if (gainNode) gainNode.gain.value = 1.0;
                video.volume = vol;
              }
            };
          }

        } catch (err) {
          helpers.showError('Could not initialize video player', 'The WebM file might be corrupted or in an unsupported format. Error: ' + err.message);
        }
      },
      actions: [
        {
          label: '📸 Capture Frame',
          id: 'capture-frame',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-webm-player');
            if (!video || video.readyState < 2) {
              helpers.showError('Capture Failed', 'Video must be playing or loaded to capture a frame.');
              return;
            }
            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              
              canvas.toBlob((blob) => {
                const timestamp = Math.floor(video.currentTime);
                const name = helpers.getState().fileName.replace('.webm', '') + `-frame-${timestamp}s.png`;
                helpers.download(name, blob, 'image/png');
              }, 'image/png');
            } catch (e) {
              helpers.showError('Capture Failed', 'Could not extract frame: ' + e.message);
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function(helpers, btn) {
            const meta = helpers.getState().meta || {};
            const file = helpers.getFile();
            const data = {
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: new Date(file.lastModified).toISOString(),
              ...meta
            };
            helpers.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download-file',
          onClick: function(helpers) {
            const blob = helpers.getState().videoBlob;
            const name = helpers.getState().fileName;
            if (blob && name) {
              helpers.download(name, blob, 'video/webm');
            }
          }
        }
      ],
      onDestroy: function() {
        if (_videoUrl) {
          URL.revokeObjectURL(_videoUrl);
          _videoUrl = null;
        }
      }
    });
  };
})();
