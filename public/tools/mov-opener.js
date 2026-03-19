(function() {
  /**
   * Format bytes into a human-readable string.
   */
  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  /**
   * Basic HTML escaping to prevent XSS.
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mov',
      dropLabel: 'Drop a .mov file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies required for native <video> element.
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing mov...');
        
        try {
          // REVOKE previous URL if it exists to prevent memory leaks
          const prevState = helpers.getState();
          if (prevState.videoUrl) {
            URL.revokeObjectURL(prevState.videoUrl);
          }

          const blob = new Blob([content], { type: 'video/quicktime' });
          const url = URL.createObjectURL(blob);
          
          // Store in state for actions and cleanup
          helpers.setState('videoBlob', blob);
          helpers.setState('videoUrl', url);

          const fileSize = formatSize(file.size);
          const isLarge = file.size > 20 * 1024 * 1024;

          const infoBar = `
            <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
              <span class="font-medium">${escapeHtml(file.name)}</span>
              <span class="text-surface-400">·</span>
              <span>${fileSize}</span>
            </div>
          `;

          const warningNotice = isLarge ? `
            <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-center gap-2">
              <span class="text-base">⚠️</span>
              <span>This is a large file (${fileSize}). Playback may be slow to start depending on your device performance.</span>
            </div>
          ` : '';

          const html = `
            <div class="p-4 md:p-6">
              ${infoBar}
              ${warningNotice}
              <div class="bg-black rounded-xl overflow-hidden shadow-xl border border-surface-200 relative group">
                <video controls class="w-full max-h-[75vh] block mx-auto bg-black" poster="">
                  <source src="${url}" type="video/quicktime">
                  <source src="${url}" type="video/mp4">
                  <div class="p-12 text-center text-white bg-surface-900">
                    <p class="text-4xl mb-4">📽️</p>
                    <p class="text-lg font-medium mb-2">Format Compatibility Issue</p>
                    <p class="text-surface-400 text-sm max-w-md mx-auto">
                      This .mov file might be using a codec (like Apple ProRes) that your browser doesn't support natively. 
                      Try downloading it to play with a dedicated media player like VLC.
                    </p>
                  </div>
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
              <div class="mt-4 flex flex-col gap-1">
                <p class="text-[10px] text-surface-400 uppercase font-bold tracking-wider">File Metadata</p>
                <div class="grid grid-cols-2 gap-4 text-xs text-surface-500 bg-surface-50 p-3 rounded-lg border border-surface-100">
                  <div><span class="text-surface-400">Filename:</span> ${escapeHtml(file.name)}</div>
                  <div><span class="text-surface-400">Size:</span> ${fileSize}</div>
                  <div><span class="text-surface-400">Type:</span> Video (QuickTime)</div>
                  <div><span class="text-surface-400">Last Modified:</span> ${new Date(file.lastModified).toLocaleString()}</div>
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


        } catch (e) {
          helpers.showError('Could not parse mov file', e.message);
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
          id: 'copy',
          onClick: function(helpers, btn) {
            const file = helpers.getFile();
            if (file) {
              helpers.copyToClipboard(file.name, btn);
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            const state = helpers.getState();
            const file = helpers.getFile();
            if (state.videoBlob && file) {
              helpers.download(file.name, state.videoBlob);
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });
  };
})();
