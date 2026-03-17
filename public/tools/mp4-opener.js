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
        } catch(e) {
          helpers.showError('Could not parse mp4 file', e.message);
        }
      },
      actions: [
        { 
          label: '📋 Copy Filename', 
          id: 'copy-name', 
          onClick: function(helpers, btn) { 
            const file = helpers.getFile();
            if (file) helpers.copyToClipboard(file.name, btn);
          } 
        },
        { 
          label: '📥 Download Original', 
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
