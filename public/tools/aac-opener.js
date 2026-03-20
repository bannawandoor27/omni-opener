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
          </div><div class="mt-4 flex flex-wrap justify-center gap-2"><span class="text-xs self-center mr-2">Speed:</span><button onclick="window.ws.setPlaybackRate(0.5)" class="px-2 py-1 bg-surface-100 border rounded text-xs">0.5x</button><button onclick="window.ws.setPlaybackRate(1)" class="px-2 py-1 bg-surface-100 border rounded text-xs">1x</button><button onclick="window.ws.setPlaybackRate(1.5)" class="px-2 py-1 bg-surface-100 border rounded text-xs">1.5x</button><button onclick="window.ws.setPlaybackRate(2)" class="px-2 py-1 bg-surface-100 border rounded text-xs">2x</button><span class="text-xs self-center mx-2">Volume:</span><button onclick="window.ws.setVolume(1)" class="px-2 py-1 bg-surface-100 border rounded text-xs">100%</button><button onclick="window.ws.setVolume(1.5)" class="px-2 py-1 bg-surface-100 border rounded text-xs">150%</button><button onclick="window.ws.setVolume(2)" class="px-2 py-1 bg-surface-100 border rounded text-xs">200%</button></div><div class="mt-4 flex flex-wrap justify-center gap-2"><button id="btn-copy-meta" class="px-2 py-1 bg-surface-100 border rounded text-xs">📋 Copy Metadata</button><button id="btn-download" class="px-2 py-1 bg-surface-100 border rounded text-xs">📥 Download</button></div>
        `);

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#4f46e5',
          progressColor: '#818cf8',
          url: url
        });

        window.ws = wavesurfer;
        document.getElementById('btn-play').onclick = () => wavesurfer.playPause();
        document.getElementById('btn-copy-meta').onclick = () => { const meta = `File: ${file.name}\nSize: ${file.size} bytes\nType: ${file.type}`; navigator.clipboard.writeText(meta); h.showLoading('Copied!'); setTimeout(() => h.showLoading(false), 1000); };
        document.getElementById('btn-download').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); };
      }
    });
  };
})();
