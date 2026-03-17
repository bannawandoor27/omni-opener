(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.webm',
      dropLabel: 'Drop a .webm file here',
      binary: true,
      onInit: function(helpers) {
        // Native browser support for WebM, no extra libraries needed
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Preparing video...');
        
        function formatSize(b) {
          return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
        }

        try {
          const blob = new Blob([content], { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          
          // Store blob and filename for actions
          helpers.setState('videoBlob', blob);
          helpers.setState('fileName', file.name);

          let warningHtml = '';
          if (file.size > 20 * 1024 * 1024) {
            warningHtml = `
              <div class="mb-4 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm flex items-start gap-3 shadow-sm">
                <svg class="w-5 h-5 mt-0.5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
                <div>
                  <p class="font-semibold">Large video file (${formatSize(file.size)})</p>
                  <p class="opacity-80">Playing high-resolution WebM files may require significant system resources.</p>
                </div>
              </div>
            `;
          }

          const html = `
            <div class="max-w-5xl mx-auto">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <div class="w-8 h-8 flex items-center justify-center bg-brand-100 text-brand-600 rounded-lg font-bold">V</div>
                <div class="flex flex-col truncate">
                  <span class="font-medium text-surface-900 truncate">${file.name}</span>
                  <span class="text-xs text-surface-500">${formatSize(file.size)} · Video/WebM</span>
                </div>
              </div>

              ${warningHtml}

              <div class="relative group bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-surface-200 aspect-video flex items-center justify-center">
                <video id="webm-player" controls class="w-full h-full max-h-[70vh] outline-none">
                  <source src="${url}" type="video/webm">
                  <div class="p-8 text-center text-white">
                    <p class="text-xl mb-2">Unsupported Video</p>
                    <p class="text-sm opacity-60 text-white/70">Your browser doesn't support WebM playback for this specific encoding.</p>
                  </div>
                </video>
              </div>

              <div class="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="p-5 bg-white border border-surface-200 rounded-xl shadow-sm transition-hover hover:shadow-md">
                  <div class="text-brand-600 mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <h3 class="font-bold text-surface-900 mb-2">WebM Format</h3>
                  <p class="text-sm text-surface-600 leading-relaxed">
                    An open, royalty-free media container designed for HTML5 video. Typically uses VP8/VP9 video and Opus/Vorbis audio.
                  </p>
                </div>
                
                <div class="p-5 bg-white border border-surface-200 rounded-xl shadow-sm transition-hover hover:shadow-md">
                  <div class="text-brand-600 mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  </div>
                  <h3 class="font-bold text-surface-900 mb-2">Local Privacy</h3>
                  <p class="text-sm text-surface-600 leading-relaxed">
                    This video is loaded directly from your computer. No data is uploaded to any server or processed remotely.
                  </p>
                </div>

                <div class="p-5 bg-white border border-surface-200 rounded-xl shadow-sm transition-hover hover:shadow-md">
                  <div class="text-brand-600 mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                  </div>
                  <h3 class="font-bold text-surface-900 mb-2">Developer Tool</h3>
                  <p class="text-sm text-surface-600 leading-relaxed">
                    WebM supports transparency (Alpha channels) and high-efficiency compression, making it ideal for web assets.
                  </p>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);
        } catch (e) {
          helpers.showError('Could not render video', e.message);
        }
      },
      actions: [
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers) {
            const blob = helpers.getState().videoBlob;
            const fileName = helpers.getState().fileName || 'video.webm';
            if (blob) {
              helpers.download(fileName, blob, 'video/webm');
            }
          }
        },
        {
          label: '📋 Copy Filename',
          id: 'copy-name',
          onClick: function(helpers, btn) {
            const fileName = helpers.getState().fileName;
            if (fileName) {
              navigator.clipboard.writeText(fileName).then(() => {
                const originalLabel = btn.innerText;
                btn.innerText = '✅ Copied!';
                setTimeout(() => btn.innerText = originalLabel, 2000);
              });
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });
  };
})();
