(function() {
  /**
   * OmniOpener MP4 Tool
   * A production-perfect video viewer with frame-accurate controls and audio boosting.
   */
  window.initTool = function(toolConfig, mountEl) {
    // Closure variables for memory management and state
    let currentVideoUrl = null;
    let audioCtx = null;
    let gainNode = null;
    let sourceNode = null;
    let screenshots = [];
    let snapshotHook = null;

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

    /**
     * Escape HTML helper
     */
    function esc(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp4',
      dropLabel: 'Drop an MP4 video here',
      binary: true,

      onInit: function(helpers) {
        // No external dependencies needed for native MP4
      },

      onDestroy: function() {
        // B5: Critical cleanup of Object URLs and Audio Context
        if (currentVideoUrl) {
          URL.revokeObjectURL(currentVideoUrl);
          currentVideoUrl = null;
        }
        if (audioCtx) {
          audioCtx.close().catch(() => {});
          audioCtx = null;
        }
        snapshotHook = null;
      },

      onFile: function _onFileFn(file, content, helpers) {
        // U2 & U6: Immediate feedback
        helpers.showLoading('Preparing media stream...');

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
        
        screenshots = [];
        snapshotHook = null;

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
            <div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-200 shadow-sm">
                <span class="font-semibold text-surface-800 truncate max-w-[240px]">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">MP4 Video</span>
              </div>

              <!-- Main Player UI -->
              <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                <!-- Left: Video & Controls -->
                <div class="lg:col-span-3 space-y-6">
                  <div class="relative group aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                    <video id="omni-video-root" class="w-full h-full" playsinline controls src="${currentVideoUrl}">
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  <!-- Action Panel -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
                      <div class="flex items-center justify-between mb-4">
                        <h3 class="font-semibold text-surface-800 text-sm">Playback Controls</h3>
                        <div class="flex gap-1 bg-surface-100 p-1 rounded-lg">
                          ${[0.5, 1, 1.5, 2].map(speed => `
                            <button class="speed-btn px-2 py-0.5 text-xs font-bold rounded-md transition-all ${speed === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}" data-val="${speed}">${speed}x</button>
                          `).join('')}
                        </div>
                      </div>
                      
                      <div class="space-y-4">
                        <!-- Volume Boost -->
                        <div>
                          <div class="flex justify-between items-center mb-1">
                            <label class="text-[11px] font-bold text-surface-400 uppercase tracking-wider">Audio Gain Boost</label>
                            <span id="boost-val" class="text-xs font-mono font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">100%</span>
                          </div>
                          <input type="range" id="boost-slider" min="0" max="4" step="0.05" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-500">
                          <div class="flex justify-between mt-1 text-[9px] text-surface-400 font-medium">
                            <span>0%</span>
                            <span>100% (Normal)</span>
                            <span>400% (Max)</span>
                          </div>
                        </div>

                        <!-- Frame Stepper -->
                        <div class="flex items-center gap-2 pt-2">
                          <button id="btn-prev-frame" class="flex-1 py-2 bg-surface-50 hover:bg-surface-100 text-surface-700 text-xs font-semibold rounded-lg border border-surface-200 transition-colors">
                            -0.1s
                          </button>
                          <button id="btn-next-frame" class="flex-1 py-2 bg-surface-50 hover:bg-surface-100 text-surface-700 text-xs font-semibold rounded-lg border border-surface-200 transition-colors">
                            +0.1s
                          </button>
                          <button id="btn-pip" class="flex-1 py-2 bg-surface-50 hover:bg-surface-100 text-surface-700 text-xs font-semibold rounded-lg border border-surface-200 transition-colors">
                            PiP Mode
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
                      <h3 class="font-semibold text-surface-800 text-sm mb-4">Metadata Explorer</h3>
                      <div class="space-y-3">
                        <div class="flex justify-between items-center py-2 border-b border-surface-50">
                          <span class="text-xs text-surface-500">Resolution</span>
                          <span id="meta-res" class="text-xs font-mono font-bold text-surface-800">Loading...</span>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b border-surface-50">
                          <span class="text-xs text-surface-500">Duration</span>
                          <span id="meta-dur" class="text-xs font-mono font-bold text-surface-800">Loading...</span>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b border-surface-50">
                          <span class="text-xs text-surface-500">Aspect Ratio</span>
                          <span id="meta-ratio" class="text-xs font-mono font-bold text-surface-800">Loading...</span>
                        </div>
                        <div class="flex justify-between items-center py-2">
                          <span class="text-xs text-surface-500">Estimated Bitrate</span>
                          <span id="meta-bitrate" class="text-xs font-mono font-bold text-surface-800">Calculating...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Right: Snapshot Gallery -->
                <div class="lg:col-span-1 flex flex-col h-full">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800 text-sm">Snapshots</h3>
                    <span id="snapshot-count" class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">0</span>
                  </div>
                  <div id="snapshot-gallery" class="flex-1 min-h-[200px] rounded-xl border border-surface-200 bg-surface-50/50 p-3 overflow-y-auto space-y-3">
                    <div class="h-full flex flex-col items-center justify-center text-center p-4 text-surface-400 space-y-2">
                      <svg class="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                      <p class="text-[11px] font-medium leading-tight">Frames captured via the "Take Screenshot" button will appear here</p>
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
          const metaBitrate = document.getElementById('meta-bitrate');
          const speedBtns = document.querySelectorAll('.speed-btn');
          const btnPrev = document.getElementById('btn-prev-frame');
          const btnNext = document.getElementById('btn-next-frame');
          const btnPip = document.getElementById('btn-pip');
          const gallery = document.getElementById('snapshot-gallery');
          const snapCount = document.getElementById('snapshot-count');

          if (!video) return;

          // B9: Audio Context Setup on User Interaction
          const initAudio = () => {
            if (audioCtx) return;
            try {
              const AudioContext = window.AudioContext || window.webkitAudioContext;
              if (!AudioContext) return;
              audioCtx = new AudioContext();
              sourceNode = audioCtx.createMediaElementSource(video);
              gainNode = audioCtx.createGain();
              sourceNode.connect(gainNode);
              gainNode.connect(audioCtx.destination);
            } catch (err) {
              console.warn('AudioContext failed:', err);
            }
          };

          // Metadata extraction
          video.onloadedmetadata = () => {
            metaRes.textContent = `${video.videoWidth} × ${video.videoHeight}`;
            metaDur.textContent = formatDuration(video.duration);
            
            const gcd = (a, b) => b ? gcd(b, a % b) : a;
            const r = gcd(video.videoWidth, video.videoHeight);
            metaRatio.textContent = `${video.videoWidth/r}:${video.videoHeight/r}`;

            // Rough bitrate estimate
            if (video.duration > 0) {
              const bitrateKbps = Math.round((file.size * 8) / (video.duration * 1024));
              metaBitrate.textContent = `~${bitrateKbps.toLocaleString()} kbps`;
            } else {
              metaBitrate.textContent = 'Unknown';
            }
          };

          // Handle PiP
          if (!document.pictureInPictureEnabled) {
            btnPip.style.display = 'none';
          }
          btnPip.onclick = () => {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture().catch(console.error);
            } else {
              video.requestPictureInPicture().catch(console.error);
            }
          };

          // Frame Stepper
          btnPrev.onclick = () => { video.currentTime = Math.max(0, video.currentTime - 0.1); };
          btnNext.onclick = () => { video.currentTime = Math.min(video.duration, video.currentTime + 0.1); };

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
              boostVal.classList.add('text-orange-600', 'bg-orange-50');
              boostVal.classList.remove('text-brand-600', 'bg-brand-50');
            } else {
              if (gainNode) gainNode.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
              video.volume = Math.min(val, 1.0);
              boostVal.classList.remove('text-orange-600', 'bg-orange-50');
              boostVal.classList.add('text-brand-600', 'bg-brand-50');
            }
          };

          // Hook for screenshot action to update gallery
          snapshotHook = function(blob, timestamp) {
            const url = URL.createObjectURL(blob);
            screenshots.push(url);
            
            if (screenshots.length === 1) gallery.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'group relative rounded-lg border border-surface-200 bg-white overflow-hidden shadow-sm hover:border-brand-300 transition-all animate-in zoom-in-95 duration-200';
            card.innerHTML = `
              <img src="${url}" class="w-full h-auto bg-black">
              <div class="p-2 flex items-center justify-between">
                <span class="text-[10px] font-mono font-bold text-surface-500">At ${formatDuration(timestamp)}</span>
                <button class="dl-shot text-brand-600 hover:text-brand-700 p-1" title="Download Image">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </button>
              </div>
            `;
            
            card.querySelector('.dl-shot').onclick = (e) => {
              e.stopPropagation();
              helpers.download(`${esc(file.name).replace(/\.[^/.]+$/, "")}-frame-${Math.floor(timestamp)}s.png`, blob, 'image/png');
            };
            
            gallery.insertBefore(card, gallery.firstChild);
            snapCount.textContent = screenshots.length;
          };

        } catch (err) {
          console.error(err);
          helpers.showError('Initialization Failed', 'We couldn\'t start the video player. This device might not support the MP4 variant or hardware acceleration is disabled.');
        }
      },

      actions: [
        {
          label: '📸 Take Screenshot',
          id: 'snapshot',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-video-root');
            if (!video || video.readyState < 2) {
              helpers.showError('Not Ready', 'Wait for the video to load before taking a snapshot.');
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
                if (snapshotHook) {
                  snapshotHook(blob, video.currentTime);
                } else {
                  const time = Math.floor(video.currentTime);
                  const name = helpers.getFile().name.replace(/\.[^/.]+$/, "");
                  helpers.download(`${name}-frame-${time}s.png`, blob, 'image/png');
                }
              }, 'image/png', 0.9);
            } catch (err) {
              helpers.showError('Snapshot Failed', 'Could not capture frame. This can happen with protected content or GPU acceleration bugs.');
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
