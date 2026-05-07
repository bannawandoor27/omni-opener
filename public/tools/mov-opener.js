(function() {
  /**
   * OmniOpener .MOV Tool
   * A production-perfect browser-based QuickTime video player using native <video>.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  window.initTool = function(toolConfig, mountEl) {
    // B9: Use closure variables instead of window globals
    let videoUrl = null;
    let audioCtx = null;
    let gainNode = null;
    let sourceNode = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mov,.qt',
      dropLabel: 'Drop a .mov file here',
      binary: true, // B2: Binary format

      onInit: function(helpers) {
        // Native <video> doesn't require external CDNs usually.
      },

      onFile: function _onFileFn(file, content, helpers) {
        // U6/U2: Immediate feedback with descriptive message
        helpers.showLoading('Preparing video viewport...');

        // B5: Revoke previous URL to prevent memory leaks
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
          videoUrl = null;
        }

        // B9: Clean up audio context on new file load
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close();
          audioCtx = null;
          gainNode = null;
          sourceNode = null;
        }

        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'The selected MOV file contains no data.');
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
                <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${sizeStr}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.mov file</span>
              </div>

              <!-- Main Player Area -->
              <div class="bg-black rounded-2xl overflow-hidden shadow-2xl border border-surface-200 relative group aspect-video flex items-center justify-center">
                <video id="omni-player" class="max-w-full max-h-full block" controls crossorigin="anonymous" playsinline>
                  <source src="${videoUrl}" type="video/quicktime">
                  <source src="${videoUrl}" type="video/mp4">
                  <div class="p-12 text-center text-white">
                    <div class="text-5xl mb-6">📽️</div>
                    <div class="text-xl font-semibold mb-3">Codec Unsupported</div>
                    <p class="text-surface-400 text-sm max-w-md mx-auto leading-relaxed">
                      Your browser cannot decode this specific MOV variant (possibly ProRes or HEVC). 
                      Try downloading it to view in a professional player like VLC.
                    </p>
                  </div>
                </video>
              </div>

              <!-- Metadata & Controls (U10) -->
              <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Metadata Card -->
                <div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm transition-all hover:border-brand-200">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 text-sm uppercase tracking-wider">Stream Details</h3>
                    <span id="meta-status" class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">PARSING...</span>
                  </div>
                  
                  <div class="grid grid-cols-2 gap-3">
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Resolution</span>
                      <span id="meta-res" class="text-sm font-semibold text-surface-700">--</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Duration</span>
                      <span id="meta-dur" class="text-sm font-semibold text-surface-700">--</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Aspect Ratio</span>
                      <span id="meta-ratio" class="text-sm font-semibold text-surface-700">--</span>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <span class="text-[10px] font-black text-surface-400 uppercase block mb-1">Modified</span>
                      <span class="text-sm font-semibold text-surface-700">${new Date(file.lastModified).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <!-- Playback Enhancements Card -->
                <div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm transition-all hover:border-brand-200">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 text-sm uppercase tracking-wider">Playback Tools</h3>
                    <span class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">WEB AUDIO</span>
                  </div>
                  
                  <div class="space-y-4">
                    <div>
                      <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-2 block">Playback Speed</label>
                      <div class="flex bg-surface-100 p-1 rounded-lg w-fit">
                        ${[0.5, 1, 1.5, 2].map(s => `
                          <button class="speed-btn px-3 py-1 text-xs font-bold rounded-md transition-all ${s === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-800'}" data-speed="${s}">${s}x</button>
                        `).join('')}
                      </div>
                    </div>

                    <div>
                      <div class="flex justify-between items-center mb-1">
                        <label class="text-[10px] font-black text-surface-400 uppercase tracking-widest block">Volume Boost</label>
                        <span id="boost-val" class="text-[10px] font-mono font-bold text-brand-600">100%</span>
                      </div>
                      <input type="range" id="vol-boost" min="0" max="3" step="0.1" value="1" 
                        class="w-full accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                      <p class="mt-1.5 text-[10px] text-surface-400 italic leading-tight">Gain control via AudioContext for quiet recordings.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);

          // B8: Use a named function to avoid 'this' context issues in timeouts/callbacks
          setTimeout(function _initDOM() {
            const video = document.getElementById('omni-player');
            if (!video) return;

            // U2/U6: Metadata handling
            video.onloadedmetadata = function() {
              const w = video.videoWidth;
              const h = video.videoHeight;
              const d = video.duration;
              
              document.getElementById('meta-res').textContent = w ? `${w} × ${h}` : 'Unknown';
              document.getElementById('meta-dur').textContent = d ? `${Math.floor(d / 60)}:${Math.floor(d % 60).toString().padStart(2, '0')}` : 'Live';
              document.getElementById('meta-ratio').textContent = w ? (w / h).toFixed(2) + ':1' : '--';
              document.getElementById('meta-status').textContent = 'LOADED';
              document.getElementById('meta-status').className = 'text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold';
            };

            // Speed controls
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

            // B9: Audio Context closure implementation
            const booster = document.getElementById('vol-boost');
            const boostVal = document.getElementById('boost-val');
            
            booster.oninput = function() {
              const val = parseFloat(this.value);
              boostVal.textContent = Math.round(val * 100) + '%';
              
              if (val > 1.0) {
                if (!audioCtx) {
                  try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    sourceNode = audioCtx.createMediaElementSource(video);
                    gainNode = audioCtx.createGain();
                    sourceNode.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                  } catch (e) {
                    console.warn('AudioContext initialization failed:', e);
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
            
            // Try autoplay muted (UX standard for video previews)
            video.muted = true;
            video.play().catch(() => {});
          }, 50);

        } catch (err) {
          // U3: Friendly error message
          helpers.showError('Playback Failed', 'This .mov file could not be loaded. It may be corrupted or use a codec restricted by your browser.');
        }
      },

      // B5: Critical cleanup hook
      onDestroy: function() {
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
          label: '📸 Save Frame',
          id: 'snapshot',
          onClick: function(helpers) {
            const video = document.getElementById('omni-player');
            if (!video || !video.videoWidth) return;
            
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // B10: canvas.toBlob for safe download
            canvas.toBlob(function(blob) {
              const time = Math.floor(video.currentTime);
              const name = helpers.getFile().name.replace(/\.[^/.]+$/, "");
              helpers.download(`${name}_snapshot_${time}s.png`, blob, 'image/png');
            }, 'image/png');
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
