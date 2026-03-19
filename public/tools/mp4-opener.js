(function() {
  window.initTool = function(toolConfig, mountEl) {
    function formatSize(b) {
      return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp4',
      dropLabel: 'Drop a .mp4 file here',
      binary: true,
      onInit: function(helpers) {
        // MP4 is natively supported by modern browsers
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing mp4...');
        
        try {
          // Revoke previous URL to prevent memory leaks
          const currentState = helpers.getState();
          if (currentState.videoUrl) {
            URL.revokeObjectURL(currentState.videoUrl);
          }

          const blob = new Blob([content], { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          helpers.setState('videoUrl', url);

          const isLarge = file.size > 20 * 1024 * 1024;
          const warningHtml = isLarge ? `
            <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-start gap-3">
              <span class="text-lg leading-none">⚠️</span>
              <div>
                <p class="font-semibold">Large video file</p>
                <p>This file is ${formatSize(file.size)}. High-resolution playback may be intensive for your browser.</p>
              </div>
            </div>
          ` : '';

          const html = `
            <div class="p-6 max-w-4xl mx-auto">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
                <span class="font-medium truncate">${file.name}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
              </div>

              ${warningHtml}

              <div class="bg-black rounded-xl overflow-hidden shadow-xl ring-1 ring-surface-200 aspect-video flex items-center justify-center">
                <video controls class="w-full h-full" src="${url}">
                  <p class="text-white p-4 text-center">Your browser does not support the video tag or this specific MP4 codec.</p>
                </video>
              <div class="mt-4 flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-50 rounded-xl border border-surface-200 shadow-sm">
                <div class="flex items-center gap-3">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Speed</span>
                  <div class="flex bg-surface-200 p-1 rounded-lg">
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="0.5">0.5x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium bg-white shadow-sm rounded transition-colors" data-speed="1">1x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="1.5">1.5x</button>
                    <button class="speed-btn px-2 py-1 text-xs font-medium rounded hover:bg-white transition-colors" data-speed="2">2x</button>
                  </div>
                </div>
                <div class="flex items-center gap-3 flex-1 max-w-xs">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Volume</span>
                  <input type="range" class="volume-slider flex-1 accent-brand-500 h-1.5 bg-surface-300 rounded-lg appearance-none cursor-pointer" min="0" max="2" step="0.1" value="1">
                  <span class="volume-value text-xs font-mono text-surface-600 min-w-[4ch]">100%</span>
                </div>
              </div>

              </div>

              <div class="mt-4 flex flex-col gap-2">
                <div class="flex items-center justify-between text-xs text-surface-400 px-1">
                  <span>Format: MPEG-4 Video</span>
                  <span>Privacy Protected: 100% Client-Side</span>
                </div>
              </div>
            </div>
          `;
          
          helpers.render(html);
    // Media Controls Logic
    setTimeout(() => {
      const video = document.querySelector('video') || document.getElementById('main-player') || document.getElementById('omni-video-player') || document.getElementById('webm-player');
      const speedBtns = document.querySelectorAll('.speed-btn');
      const volumeSlider = document.querySelector('.volume-slider');
      const volumeValue = document.querySelector('.volume-value');
      
      if (!video) return;

      speedBtns.forEach(btn => {
        btn.onclick = () => {
          const speed = parseFloat(btn.dataset.speed);
          video.playbackRate = speed;
          speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm'));
          btn.classList.add('bg-white', 'shadow-sm');
        };
      });

      if (volumeSlider) {
        let audioCtx, source, gainNode;
        volumeSlider.oninput = () => {
          const vol = parseFloat(volumeSlider.value);
          volumeValue.textContent = Math.round(vol * 100) + '%';
          
          if (vol > 1.0) {
            if (!audioCtx) {
              try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                source = audioCtx.createMediaElementSource(video);
                gainNode = audioCtx.createGain();
                source.connect(gainNode);
                gainNode.connect(audioCtx.destination);
              } catch (e) { console.warn("Web Audio API not supported or already initialized", e); }
            }
            if (gainNode) gainNode.gain.value = vol;
            video.volume = 1.0;
          } else {
            if (gainNode) gainNode.gain.value = 1.0;
            video.volume = vol;
          }
        };
      }
    }, 1000);

        } catch(e) {
          helpers.showError('Could not parse mp4 file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-metadata',
          onClick: function (helpers, btn) {
            const file = helpers.getFile();
            const state = helpers.getState();
            const metadata = {
              filename: file.name,
              size: file.size,
              type: file.type,
              lastModified: new Date(file.lastModified).toISOString(),
              ...(state.meta || {}),
              ...(state.manifest ? { version: state.manifest.version } : {})
            };
            helpers.copyToClipboard(JSON.stringify(metadata, null, 2), btn);
          }
        },
        { 
          label: '📋 Copy Filename', 
          id: 'copy-name', 
          onClick: function(helpers, btn) { 
            const file = helpers.getFile();
            if (file) helpers.copyToClipboard(file.name, btn);
          } 
        },
        { 
          label: '📥 Download', 
          id: 'dl', 
          onClick: function(helpers, btn) { 
            const file = helpers.getFile();
            const content = helpers.getContent();
            if (file && content) {
              helpers.download(file.name, content, 'video/mp4');
            }
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device. We use browser-native decoders for maximum security.'
    });
  };
})();
