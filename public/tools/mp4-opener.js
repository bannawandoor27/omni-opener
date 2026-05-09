(function() {
  /**
   * OmniOpener MP4 Tool
   * A production-perfect video viewer with frame capture and audio boosting.
   */
  window.initTool = function(toolConfig, mountEl) {
    // Closure variables for memory management and state
    let currentVideoUrl = null;
    let audioCtx = null;
    let gainNode = null;
    let sourceNode = null;

    /**
     * Helper to format bytes into human-readable strings
     */
    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Helper to format seconds into MM:SS or HH:MM:SS
     */
    function formatDuration(seconds) {
      if (!seconds || isNaN(seconds)) return '0:00';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp4',
      dropLabel: 'Drop an MP4 video here',
      binary: true,

      onInit: function(helpers) {
        // No external dependencies needed for native MP4
      },

      onDestroy: function(helpers) {
        // B5: Critical cleanup of Object URLs and Audio Context
        if (currentVideoUrl) {
          URL.revokeObjectURL(currentVideoUrl);
          currentVideoUrl = null;
        }
        if (audioCtx) {
          audioCtx.close().catch(() => {});
          audioCtx = null;
        }
      },

      onFile: function _onFileFn(file, content, helpers) {
        // U2 & U6: Immediate feedback
        helpers.showLoading('Optimizing video stream...');

        // B5: Revoke previous URL to prevent memory leaks
        if (currentVideoUrl) {
          URL.revokeObjectURL(currentVideoUrl);
          currentVideoUrl = null;
        }

        // B9: Reset audio nodes for new file
        if (audioCtx) {
          audioCtx.close().catch(() => {});
          audioCtx = null;
          gainNode = null;
          sourceNode = null;
        }

        // U5: Check for empty files
        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'This MP4 file contains no data.');
          return;
        }

        try {
          // B2: Ensure ArrayBuffer is converted to Blob for the video tag
          const blob = new Blob([content], { type: 'video/mp4' });
          currentVideoUrl = URL.createObjectURL(blob);

          const html = `
            <div class="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-brand-500"></div>
                  <span class="font-bold text-surface-900 truncate max-w-[200px] md:max-w-md">${file.name}</span>
                </div>
                <span class="text-surface-300">|</span>
                <span class="bg-surface-200/50 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-tight text-surface-500">${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500 italic">MPEG-4 Container</span>
              </div>

              <!-- Main Player UI -->
              <div class="space-y-6">
                <!-- Video Display -->
                <div class="relative aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 group">
                  <video id="omni-video-root" class="w-full h-full cursor-pointer" playsinline controls src="${currentVideoUrl}">
                    Your browser does not support the video tag.
                  </video>
                </div>

                <!-- Control Panels -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <!-- Playback Card -->
                  <div class="lg:col-span-2 rounded-2xl border border-surface-200 p-6 bg-white shadow-sm hover:shadow-md transition-all">
                    <div class="flex items-center justify-between mb-6">
                      <h3 class="font-bold text-surface-800 flex items-center gap-2">
                        <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        Performance & Audio
                      </h3>
                      <div class="flex gap-1 bg-surface-100 p-1 rounded-xl">
                        ${[0.5, 1, 1.5, 2].map(speed => `
                          <button class="speed-btn px-3 py-1 text-xs font-bold rounded-lg transition-all ${speed === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}" data-val="${speed}">${speed}x</button>
                        `).join('')}
                      </div>
                    </div>

                    <div class="space-y-6">
                      <!-- Volume Boost -->
                      <div>
                        <div class="flex justify-between items-end mb-2">
                          <label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Pre-amp Booster</label>
                          <span id="boost-val" class="text-xs font-mono font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">100%</span>
                        </div>
                        <input type="range" id="boost-slider" min="0" max="4" step="0.05" value="1" class="w-full accent-brand-500 h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer">
                        <div class="flex justify-between mt-1 text-[9px] text-surface-400 font-bold uppercase">
                          <span>Silence</span>
                          <span>Normal</span>
                          <span>2x</span>
                          <span>3x</span>
                          <span>Extreme (4x)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Info Card -->
                  <div class="rounded-2xl border border-surface-200 p-6 bg-surface-50/50 shadow-sm">
                    <h3 class="font-bold text-surface-800 mb-4 flex items-center gap-2 text-sm">
                      <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Stream Data
                    </h3>
                    <div class="space-y-4">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Dimensions</div>
                        <div id="meta-res" class="text-surface-900 font-mono text-sm">-- × --</div>
                      </div>
                      <div class="h-px bg-surface-200"></div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Duration</div>
                        <div id="meta-dur" class="text-surface-900 font-mono text-sm">--:--</div>
                      </div>
                      <div class="h-px bg-surface-200"></div>
                      <div class="flex items-center justify-between">
                        <div class="text-[10px] font-bold text-surface-400 uppercase">Aspect Ratio</div>
                        <div id="meta-ratio" class="text-xs font-bold text-surface-600 bg-white px-2 py-0.5 rounded border border-surface-200">--</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          // Component References
          const video = document.getElementById('omni-video-root');
          const boostSlider = document.getElementById('boost-slider');
          const boostVal = document.getElementById('boost-val');
          const metaRes = document.getElementById('meta-res');
          const metaDur = document.getElementById('meta-dur');
          const metaRatio = document.getElementById('meta-ratio');
          const speedBtns = document.querySelectorAll('.speed-btn');

          if (!video) return;

          // B9: Audio Context Setup on User Interaction
          const initAudio = () => {
            if (audioCtx) return;
            try {
              audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              sourceNode = audioCtx.createMediaElementSource(video);
              gainNode = audioCtx.createGain();
              sourceNode.connect(gainNode);
              gainNode.connect(audioCtx.destination);
            } catch (err) {
              console.warn('AudioContext failed:', err);
            }
          };

          // Update Metadata
          video.onloadedmetadata = () => {
            metaRes.textContent = `${video.videoWidth} × ${video.videoHeight}`;
            metaDur.textContent = formatDuration(video.duration);
            
            const gcd = (a, b) => b ? gcd(b, a % b) : a;
            const r = gcd(video.videoWidth, video.videoHeight);
            metaRatio.textContent = `${video.videoWidth/r}:${video.videoHeight/r}`;
          };

          // Playback Speed
          speedBtns.forEach(btn => {
            btn.onclick = () => {
              const val = parseFloat(btn.dataset.val);
              video.playbackRate = val;
              speedBtns.forEach(b => {
                b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
                b.classList.add('text-surface-500', 'hover:text-surface-700');
              });
              btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
              btn.classList.remove('text-surface-500', 'hover:text-surface-700');
            };
          });

          // Volume Booster Logic
          boostSlider.oninput = () => {
            initAudio();
            const val = parseFloat(boostSlider.value);
            boostVal.textContent = Math.round(val * 100) + '%';
            
            if (val > 1.0 && gainNode) {
              gainNode.gain.setTargetAtTime(val, audioCtx.currentTime, 0.01);
              video.volume = 1.0;
              boostVal.classList.add('bg-orange-50', 'text-orange-600');
              boostVal.classList.remove('bg-brand-50', 'text-brand-600');
            } else {
              if (gainNode) gainNode.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
              video.volume = Math.min(val, 1.0);
              boostVal.classList.remove('bg-orange-50', 'text-orange-600');
              boostVal.classList.add('bg-brand-50', 'text-brand-600');
            }
          };

        } catch (err) {
          console.error(err);
          helpers.showError('Rendering Error', 'We couldn\'t initialize the video player. The file may be corrupt or encoded in an unsupported format.');
        }
      },

      actions: [
        {
          label: '📸 Take Screenshot',
          id: 'snapshot',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-video-root');
            if (!video || video.readyState < 2) {
              helpers.showError('Ready State Error', 'Please wait for the video to load before taking a snapshot.');
              return;
            }

            try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              // B10: Use toBlob for corruption-free downloads
              canvas.toBlob((blob) => {
                const time = Math.floor(video.currentTime);
                const name = helpers.getFile().name.replace(/\.[^/.]+$/, "");
                helpers.download(`${name}-frame-${time}s.png`, blob, 'image/png');
              }, 'image/png', 1.0);
            } catch (err) {
              helpers.showError('Snapshot Failed', 'Could not capture frame. This often happens with hardware acceleration issues or corrupted frames.');
            }
          }
        },
        {
          label: '🔁 Loop: Off',
          id: 'loop-toggle',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-video-root');
            if (!video) return;
            video.loop = !video.loop;
            btn.innerHTML = video.loop ? '🔁 Loop: On' : '🔁 Loop: Off';
            btn.classList.toggle('bg-brand-100', video.loop);
            btn.classList.toggle('text-brand-800', video.loop);
          }
        },
        {
          label: '📥 Save Video',
          id: 'download',
          onClick: function(helpers) {
            const file = helpers.getFile();
            helpers.download(file.name, helpers.getContent(), 'video/mp4');
          }
        }
      ]
    });
  };
})();
