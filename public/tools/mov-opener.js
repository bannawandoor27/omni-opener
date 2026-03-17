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

        } catch (e) {
          helpers.showError('Could not parse mov file', e.message);
        }
      },
      actions: [
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
