(function() {
  /**
   * OmniOpener .MOV Tool
   * A production-perfect browser-based QuickTime video player using native <video> and Web Audio API.
   */

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  };

  window.initTool = function(toolConfig, mountEl) {
    let videoUrl = null;
    let audioCtx = null;
    let gainNode = null;
    let sourceNode = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mov,.qt',
      dropLabel: 'Drop a QuickTime .mov file here',
      binary: true,

      onInit: function(helpers) {
        // No external dependencies needed for native video
      },

      onFile: function _onFileFn(file, content, helpers) {
        // U6: Immediate feedback
        helpers.showLoading('Preparing video viewport...');

        // B5: Memory leak prevention - revoke previous URL
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }

        // B9: Clean up audio context
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
          audioCtx = null;
          gainNode = null;
          sourceNode = null;
        }

        // U5: Empty state handling
        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'The selected MOV file contains no data.');
          return;
        }

        try {
          const blob = new Blob([content], { type: 'video/quicktime' });
          videoUrl = URL.createObjectURL(blob);
          helpers.setState('blob', blob);

          const sizeStr = formatSize(file.size);
          
          const html = `
            <div class="p-4 md:p-6 max-w-5xl mx-auto animate-in fade-in duration-500">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200 shadow-sm">
                <span class="font-bold text-surface-900">${escapeHTML(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${sizeStr}</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-tight">QuickTime Video</span>
              </div>

              <!-- Main Player Area -->
              <div class="bg-black rounded-2xl overflow-hidden shadow-2xl border border-surface-200 relative group aspect-video flex items-center justify-center ring-1 ring-white/10">
                <video id="omni-player" class="max-w-full max-h-full block w-full h-full bg-black" controls crossorigin="anonymous" playsinline preload="metadata">
                  <source src="${videoUrl}" type="video/quicktime">
                  <source src="${videoUrl}" type="video/mp4">
                  <div class="p-12 text-center text-white">
                    <div class="text-5xl mb-6">📽️</div>
                    <div class="text-xl font-semibold mb-3">Codec Unsupported</div>
                    <p class="text-surface-400 text-sm max-w-md mx-auto leading-relaxed">
                      Your browser cannot decode this specific MOV variant (possibly ProRes, HEVC, or legacy 32-bit codec).
                    </p>
                  </div>
                </video>
              </div>

              <!-- Metadata & Controls (U10) -->
              <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Metadata Card (U9) -->
                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all group">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Stream Intelligence</h3>
                    <span id="meta-status" class="text-[10px] bg-surface-100 text-surface-500 px-2 py-0.5 rounded-full font-bold transition-colors">WAITING</span>
                  </div>
                  
                  <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100 group-hover:bg-brand-50/30 transition-colors">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Canvas Size</span>
                      <span id="meta-res" class="text-sm font-semibold text-surface-700">--</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100 group-hover:bg-brand-50/30 transition-colors">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Duration</span>
                      <span id="meta-dur" class="text-sm font-semibold text-surface-700">--</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100 group-hover:bg-brand-50/30 transition-colors">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Native Ratio</span>
                      <span id="meta-ratio" class="text-sm font-semibold text-surface-700">--</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100 group-hover:bg-brand-50/30 transition-colors">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Modified</span>
                      <span class="text-sm font-semibold text-surface-700">${new Date(file.lastModified).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <!-- Playback Enhancements Card (U9) -->
                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all group">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Post-Processing</h3>
                    <span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold animate-pulse">LIVE AUDIO</span>
                  </div>
                  
                  <div class="space-y-5">
                    <div>
                      <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-3 block">Playback Speed</label>
                      <div class="flex bg-surface-100 p-1 rounded-xl w-full justify-between">
                        ${[0.5, 1, 1.25, 1.5, 2].map(s => `
                          <button class="speed-btn flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${s === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-800'}" data-speed="${s}">${s}x</button>
                        `).join('')}
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between items-center mb-2">
                        <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest block">Volume Master Boost</label>
                        <span id="boost-val" class="text-[10px] font-mono font-bold text-brand-600 px-2 py-0.5 bg-brand-50 rounded">100%</span>
                      </div>
                      <input type="range" id="vol-boost" min="0" max="4" step="0.1" value="1" 
                        class="w-full accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                      <div class="flex justify-between mt-1 px-0.5">
                        <span class="text-[9px] font-bold text-surface-300 uppercase">Mute</span>
                        <span class="text-[9px] font-bold text-surface-300 uppercase">Normal</span>
                        <span class="text-[9px] font-bold text-red-300 uppercase">400% Peak</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          // B8: Use named function for safer context in timeouts
          setTimeout(function _initDOM() {
            const video = document.getElementById('omni-player');
            if (!video) return;

            // Handle metadata loading
            video.onloadedmetadata = function() {
              const w = video.videoWidth;
              const h = video.videoHeight;
              const d = video.duration;
              
              document.getElementById('meta-res').textContent = w ? `${w} × ${h}px` : 'Unknown';
              document.getElementById('meta-dur').textContent = (d && d !== Infinity) ? `${Math.floor(d / 60)}:${Math.floor(d % 60).toString().padStart(2, '0')}` : 'Live/Unknown';
              document.getElementById('meta-ratio').textContent = w ? (w / h).toFixed(2) + ':1' : '--';
              
              const status = document.getElementById('meta-status');
              status.textContent = 'HARDWARE DECODED';
              status.className = 'text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold';
            };

            video.onerror = function() {
              const status = document.getElementById('meta-status');
              if (status) {
                status.textContent = 'DECODE ERROR';
                status.className = 'text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold';
              }
            };

            // Speed control implementation
            const speedBtns = document.querySelectorAll('.speed-btn');
            speedBtns.forEach(btn => {
              btn.onclick = function() {
                const s = parseFloat(this.dataset.speed);
                video.playbackRate = s;
                speedBtns.forEach(b => {
                  b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
                  b.classList.add('text-surface-500');
                });
                this.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
                this.classList.remove('text-surface-500');
              };
            });

            // B9: Audio Context closure implementation for volume boost
            const booster = document.getElementById('vol-boost');
            const boostVal = document.getElementById('boost-val');
            
            booster.oninput = function() {
              const val = parseFloat(this.value);
              boostVal.textContent = Math.round(val * 100) + '%';
              
              // Only initialize AudioContext if boosting above 100% or if we need precise gain
              if (val > 1.0) {
                if (!audioCtx) {
                  try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    sourceNode = audioCtx.createMediaElementSource(video);
                    gainNode = audioCtx.createGain();
                    sourceNode.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                  } catch (e) {
                    console.warn('Web Audio API not supported or blocked:', e);
                  }
                }
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
                if (gainNode) gainNode.gain.value = val;
                video.volume = 1.0; // Keep native volume at max when boosting via gain node
              } else {
                // Use native volume for 0-100%
                if (gainNode) gainNode.gain.value = 1.0;
                video.volume = val;
              }
            };
            
            // Interaction hint: play muted on load if possible
            video.muted = true;
            video.play().catch(() => {
              // Autoplay might be blocked, that's fine
            });
          }, 100);

        } catch (err) {
          helpers.showError('Playback Failed', 'This .mov file could not be loaded. Browser support for MOV depends on the underlying video codec (e.g. H.264 is fine, ProRes often is not).');
        }
      },

      // B5: Critical cleanup
      onDestroy: function() {
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {});
        }
      },

      actions: [
        {
          label: '📸 Capture Frame',
          id: 'snapshot',
          onClick: function(helpers) {
            const video = document.getElementById('omni-player');
            if (!video || !video.videoWidth) {
              helpers.showError('Capture Failed', 'Video must be loaded and playing to capture a frame.');
              return;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // B10: canvas.toBlob for safe download
            canvas.toBlob(function(blob) {
              const time = Math.floor(video.currentTime);
              const originalName = helpers.getFile().name.replace(/\.[^/.]+$/, "");
              helpers.download(`${originalName}_frame_${time}s.png`, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📺 Pop-out Player',
          id: 'pip',
          onClick: function(helpers) {
            const video = document.getElementById('omni-player');
            if (!video) return;
            
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture().catch(() => {});
            } else if (video.requestPictureInPicture) {
              video.requestPictureInPicture().catch(err => {
                helpers.showError('PiP Failed', 'Picture-in-Picture is not supported or was blocked.');
              });
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function(helpers) {
            const blob = helpers.getState('blob');
            const file = helpers.getFile();
            if (blob && file) {
              helpers.download(file.name, blob);
            }
          }
        }
      ]
    });
  };
})();
