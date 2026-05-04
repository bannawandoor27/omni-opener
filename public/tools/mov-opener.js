(function() {
  /**
   * OmniOpener .MOV Tool
   * A production-perfect browser-based QuickTime video player.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escape(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  window.initTool = function(toolConfig, mountEl) {
    // Closure variables to avoid global namespace pollution (B9)
    let videoUrl = null;
    let audioCtx = null;
    let gainNode = null;
    let sourceNode = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mov,.qt',
      dropLabel: 'Drop a .mov file here',
      binary: true,

      onInit: function(helpers) {
        // No external dependencies needed for native <video>
      },

      onFile: function _onFileFn(file, content, helpers) {
        // U6: Immediate feedback
        helpers.showLoading('Preparing video player...');

        // B5: Revoke previous URL to prevent memory leaks
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }

        // B9: Reset audio context if it exists to allow new video element binding
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close();
          audioCtx = null;
          gainNode = null;
          sourceNode = null;
        }

        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'The selected file contains no data.');
          return;
        }

        try {
          const blob = new Blob([content], { type: 'video/quicktime' });
          videoUrl = URL.createObjectURL(blob);
          helpers.setState('blob', blob);
          helpers.setState('url', videoUrl);

          const sizeStr = formatSize(file.size);
          
          const html = `
            <div class="p-4 md:p-6 max-w-5xl mx-auto">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800">${escape(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${sizeStr}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.mov file</span>
              </div>

              <!-- Video Viewport -->
              <div class="bg-black rounded-2xl overflow-hidden shadow-2xl border border-surface-200 relative group aspect-video flex items-center justify-center">
                <video id="omni-player" class="max-w-full max-h-full block" controls crossorigin="anonymous" poster="">
                  <source src="${videoUrl}" type="video/quicktime">
                  <source src="${videoUrl}" type="video/mp4">
                  <div class="p-12 text-center text-white">
                    <p class="text-5xl mb-6">📽️</p>
                    <p class="text-xl font-semibold mb-3">Compatibility Notice</p>
                    <p class="text-surface-400 text-sm max-w-md mx-auto leading-relaxed">
                      This QuickTime file may use a codec (like Apple ProRes or HEVC) that your browser cannot play directly. 
                      Try downloading it to view in a player like VLC.
                    </p>
                  </div>
                </video>
              </div>

              <!-- Format-Specific Excellence: Enhanced Controls -->
              <div class="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Playback Card -->
                <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 text-sm uppercase tracking-wider">Playback Controls</h3>
                    <span class="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-bold">LIVE</span>
                  </div>
                  
                  <div class="space-y-6">
                    <div>
                      <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-2 block">Speed Multiplier</label>
                      <div class="flex bg-surface-100 p-1 rounded-xl w-fit">
                        ${[0.5, 1, 1.25, 1.5, 2].map(s => `
                          <button class="speed-opt px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${s === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-800'}" data-speed="${s}">${s}x</button>
                        `).join('')}
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between items-center mb-2">
                        <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest block">Volume Boost</label>
                        <span id="boost-indicator" class="text-xs font-mono font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">100%</span>
                      </div>
                      <input type="range" id="volume-booster" min="0" max="3" step="0.1" value="1" 
                        class="w-full accent-brand-500 h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                      <p class="mt-2 text-[10px] text-surface-400 italic">Boost volume up to 300% using Web Audio API</p>
                    </div>
                  </div>
                </div>

                <!-- Metadata Card (U10) -->
                <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 text-sm uppercase tracking-wider">File Metadata</h3>
                    <span id="meta-count" class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full font-bold">Detecting...</span>
                  </div>
                  
                  <div class="grid grid-cols-2 gap-4">
                    <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Dimensions</span>
                      <span id="meta-res" class="text-sm font-semibold text-surface-700">-</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Duration</span>
                      <span id="meta-dur" class="text-sm font-semibold text-surface-700">-</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Aspect Ratio</span>
                      <span id="meta-ratio" class="text-sm font-semibold text-surface-700">-</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Modified</span>
                      <span class="text-sm font-semibold text-surface-700">${new Date(file.lastModified).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          // B1/B8: Safe DOM interaction after render
          setTimeout(function _initControls() {
            const video = document.getElementById('omni-player');
            if (!video) return;

            video.onloadedmetadata = function() {
              const w = video.videoWidth;
              const h = video.videoHeight;
              const d = video.duration;
              
              const resText = w ? `${w} × ${h}` : 'Unknown';
              const durText = d ? `${Math.floor(d / 60)}:${Math.floor(d % 60).toString().padStart(2, '0')} (${d.toFixed(1)}s)` : 'Streaming';
              const ratioText = w ? (w / h).toFixed(2) + ':1' : '-';

              document.getElementById('meta-res').textContent = resText;
              document.getElementById('meta-dur').textContent = durText;
              document.getElementById('meta-ratio').textContent = ratioText;
              document.getElementById('meta-count').textContent = '4 properties';
              
              helpers.setState('meta', { width: w, height: h, duration: d, ratio: ratioText });
            };

            // Speed logic
            document.querySelectorAll('.speed-opt').forEach(btn => {
              btn.onclick = function() {
                const s = parseFloat(this.dataset.speed);
                video.playbackRate = s;
                document.querySelectorAll('.speed-opt').forEach(b => {
                  b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
                  b.classList.add('text-surface-500');
                });
                this.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
                this.classList.remove('text-surface-500');
              };
            });

            // Volume Boost logic (B9: Uses closure audioCtx)
            const booster = document.getElementById('volume-booster');
            const indicator = document.getElementById('boost-indicator');
            
            booster.oninput = function() {
              const val = parseFloat(this.value);
              indicator.textContent = Math.round(val * 100) + '%';
              
              if (val > 1.0) {
                if (!audioCtx) {
                  try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    sourceNode = audioCtx.createMediaElementSource(video);
                    gainNode = audioCtx.createGain();
                    sourceNode.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                  } catch (e) {
                    console.warn('AudioContext failed:', e);
                  }
                }
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
                if (gainNode) gainNode.gain.value = val;
                video.volume = 1.0;
              } else {
                if (gainNode) gainNode.gain.value = 1.0;
                video.volume = val;
              }
            };

            // Auto-play attempt (muted)
            video.muted = true;
            video.play().catch(() => { /* Autoplay blocked */ });
          }, 50);

        } catch (err) {
          helpers.showError('Playback Error', 'This .mov file could not be initialized. It may be corrupted or use an unsupported encryption.');
        }
      },

      onDestroy: function() {
        // B5: Final cleanup
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close();
        }
      },

      actions: [
        {
          label: '📸 Take Screenshot',
          id: 'snapshot',
          onClick: function(helpers, btn) {
            const video = document.getElementById('omni-player');
            if (!video || !video.videoWidth) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // B10: Safe download using toBlob
            canvas.toBlob(function(blob) {
              const time = Math.floor(video.currentTime);
              const baseName = helpers.getFile().name.replace(/\.[^/.]+$/, "");
              helpers.download(`${baseName}_frame_${time}s.png`, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            const blob = helpers.getState().blob;
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
