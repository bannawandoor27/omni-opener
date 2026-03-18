(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.aac,.m4a',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', () => this.onFile(file, content, h));
          return;
        }

        const blob = new Blob([content], { type: 'audio/aac' });
        const url = URL.createObjectURL(blob);

        h.render(`
          <div class="p-4">
            <div id="waveform" class="w-full bg-surface-50 rounded-lg mb-4"></div>
            <div class="flex justify-center gap-4">
              <button id="btn-play" class="px-4 py-2 bg-brand-600 text-white rounded">Play/Pause</button>
            </div>
          </div>
        `);

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#4f46e5',
          progressColor: '#818cf8',
          url: url
        });

        document.getElementById('btn-play').onclick = () => wavesurfer.playPause();
      }
    });
  };
})();
