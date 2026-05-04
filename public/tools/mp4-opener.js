(function() {
  window.initTool = function(toolConfig, mountEl) {
    let videoUrl = null;
    let audioCtx = null;
    let gainNode = null;
    let source = null;

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp4',
      dropLabel: 'Drop an MP4 video here',
      binary: true,
      onInit: function(helpers) {
        // Initialization if needed
      },
      onDestroy: function(helpers) {
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }
        if (audioCtx) {
          audioCtx.close();
        }
      },
      onFile: function _onFile(file, content, helpers) {
        helpers.showLoading('Preparing video player...');

        // Cleanup previous state
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }

        try {
          const blob = new Blob([content], { type: 'video/mp4' });
          videoUrl = URL.createObjectURL(blob);

          const html = `
            <div class="p-4 md:p-8 max-w-5xl mx-auto">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <span class="font-semibold text-surface-800">${file.name}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">MPEG-4 Video</span>
              </div>

              <!-- Video Player Container -->
              <div class="relative group bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-surface-200 aspect-video flex items-center justify-center">
                <video id="omni-player" class="w-full h-full max-h-[70vh]" playsinline controls src="${videoUrl}">
                  <p class="text-white p-6 text-center">Your browser does not support the video tag or this specific MP4 codec.</p>
                </video>
              </div>

              <!-- Enhanced Controls Card -->
              <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                      <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      Playback Settings
                    </h3>
                  </div>
                  
                  <div class="space-y-4">
                    <div>
                      <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Speed Multiplier</label>
                      <div class="flex bg-surface-100 p-1 rounded-xl w-fit">
                        ${[0.5, 1, 1.5, 2, 3].map(s => `
                          <button class="speed-btn px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${s === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-800'}" data-speed="${s}">${s}x</button>
                        `).join('')}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                      <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                      Audio Booster
                    </h3>
                    <span class="vol-indicator text-xs font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">100%</span>
                  </div>
                  
                  <div class="space-y-2">
                    <input type="range" id="vol-boost" class="w-full accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer" min="0" max="3" step="0.05" value="1">
                    <div class="flex justify-between text-[10px] font-bold text-surface-400 uppercase">
                      <span>Mute</span>
                      <span>Normal</span>
                      <span>300% Boost</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Metadata Info -->
              <div class="mt-8 pt-6 border-t border-surface-100">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-semibold text-surface-800">Stream Information</h3>
                  <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">Native Decoder</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div class="p-3 bg-surface-50 rounded-lg">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Type</div>
                    <div class="text-surface-700 font-medium">Video/MP4</div>
                  </div>
                  <div class="p-3 bg-surface-50 rounded-lg">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Codec</div>
                    <div class="text-surface-700 font-medium" id="codec-info">H.264 / AAC</div>
                  </div>
                  <div class="p-3 bg-surface-50 rounded-lg">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Resolution</div>
                    <div class="text-surface-700 font-medium" id="res-info">Detecting...</div>
                  </div>
                  <div class="p-3 bg-surface-50 rounded-lg">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Security</div>
                    <div class="text-green-600 font-medium">Local Only</div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          // Setup Interaction
          const video = document.getElementById('omni-player');
          const volBoost = document.getElementById('vol-boost');
          const volInd = document.querySelector('.vol-indicator');
          const resInfo = document.getElementById('res-info');
          const speedBtns = document.querySelectorAll('.speed-btn');

          if (!video) return;

          video.onloadedmetadata = () => {
            resInfo.textContent = `${video.videoWidth} × ${video.videoHeight}`;
          };

          speedBtns.forEach(btn => {
            btn.onclick = () => {
              const speed = parseFloat(btn.dataset.speed);
              video.playbackRate = speed;
              speedBtns.forEach(b => {
                b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
                b.classList.add('text-surface-500', 'hover:text-surface-800');
              });
              btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
              btn.classList.remove('text-surface-500', 'hover:text-surface-800');
            };
          });

          volBoost.oninput = () => {
            const val = parseFloat(volBoost.value);
            volInd.textContent = Math.round(val * 100) + '%';
            
            if (val > 1.0) {
              if (!audioCtx) {
                try {
                  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                  source = audioCtx.createMediaElementSource(video);
                  gainNode = audioCtx.createGain();
                  source.connect(gainNode);
                  gainNode.connect(audioCtx.destination);
                } catch (e) {
                  console.error('AudioContext error:', e);
                }
              }
              if (gainNode) gainNode.gain.value = val;
              video.volume = 1.0;
            } else {
              if (gainNode) gainNode.gain.value = 1.0;
              video.volume = val;
            }
          };

        } catch (e) {
          helpers.showError('Playback Failed', 'This MP4 file might be corrupted or use an unsupported codec. Error: ' + e.message);
        }
      },
      actions: [
        {
          label: '📸 Capture Frame',
          id: 'capture',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-player');
            if (!video) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((blob) => {
              const timestamp = Math.floor(video.currentTime);
              helpers.download(`frame-${timestamp}s.png`, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '🔁 Loop Toggle',
          id: 'loop',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-player');
            if (!video) return;
            video.loop = !video.loop;
            btn.innerHTML = video.loop ? '🔁 Looping On' : '🔁 Loop Off';
            btn.classList.toggle('bg-brand-50', video.loop);
            btn.classList.toggle('text-brand-700', video.loop);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function(helpers, btn) {
            const file = helpers.getFile();
            const content = helpers.getContent();
            helpers.download(file.name, content, 'video/mp4');
          }
        }
      ]
    });
  };
})();
