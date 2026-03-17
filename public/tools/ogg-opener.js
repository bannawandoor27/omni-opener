(function() {
  'use strict';

  /**
   * OmniOpener — OGG Audio Viewer
   * A production-quality viewer for .ogg files.
   */
  window.initTool = function(toolConfig, mountEl) {
    function formatSize(b) {
      return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ogg',
      dropLabel: 'Drop a .ogg file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed for native audio playback
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Preparing audio player...');
        
        try {
          const blob = new Blob([content], { type: 'audio/ogg' });
          const url = URL.createObjectURL(blob);
          
          const html = `
            <div class="p-6 max-w-4xl mx-auto">
              <!-- File Info Bar -->
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <span class="text-xl">🎵</span>
                <span class="font-medium truncate">${file.name}</span>
                <span class="text-surface-400">·</span>
                <span class="shrink-0">${formatSize(file.size)}</span>
              </div>
              
              <!-- Player Container -->
              <div class="flex flex-col items-center justify-center py-16 bg-gradient-to-b from-white to-surface-50 rounded-2xl border border-surface-200 shadow-sm">
                <div class="w-24 h-24 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-8 shadow-inner ring-4 ring-brand-50/50">
                  <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                
                <div class="w-full max-w-md px-6">
                  <audio controls class="w-full h-12 mb-4 focus:outline-none">
                    <source src="${url}" type="audio/ogg">
                    Your browser does not support the audio element.
                  </audio>
                  <div class="flex justify-between items-center text-[10px] text-surface-400 uppercase tracking-widest font-bold px-1">
                    <span>OGG Media Container</span>
                    <span>Vorbis / Opus</span>
                  </div>
                </div>
              </div>

              ${file.size > 20 * 1024 * 1024 ? `
                <div class="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <span class="text-amber-500 text-lg">⚠️</span>
                  <div>
                    <p class="text-sm font-semibold text-amber-800">Large file detected</p>
                    <p class="text-xs text-amber-700 mt-0.5">This file is ${formatSize(file.size)}. Large files may take longer to load and play depending on your browser's memory.</p>
                  </div>
                </div>
              ` : ''}

              <!-- Details Grid -->
              <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-4 rounded-xl border border-surface-100 bg-white shadow-sm">
                  <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">File Specifications</h3>
                  <dl class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <dt class="text-surface-500">Format</dt>
                      <dd class="text-surface-700 font-medium">OGG Audio</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-surface-500">MIME Type</dt>
                      <dd class="text-surface-700 font-mono text-xs">audio/ogg</dd>
                    </div>
                    <div class="flex justify-between">
                      <dt class="text-surface-500">Size</dt>
                      <dd class="text-surface-700 font-medium">${file.size.toLocaleString()} bytes</dd>
                    </div>
                  </dl>
                </div>
                <div class="p-4 rounded-xl border border-surface-100 bg-white shadow-sm">
                  <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Playback Notes</h3>
                  <p class="text-xs text-surface-500 leading-relaxed">
                    OGG is a free, open container format. This viewer uses your browser's native HTML5 audio engine. 
                    Support for Opus or Vorbis codecs is required for playback.
                  </p>
                </div>
              </div>
            </div>
          `;
          
          helpers.render(html);
        } catch (e) {
          helpers.showError('Could not load OGG file', e.message);
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
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers) {
            const file = helpers.getFile();
            const content = helpers.getContent();
            if (file && content) {
              helpers.download(file.name, content, 'audio/ogg');
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your audio files never leave your device.'
    });
  };
})();
