(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    function cleanup() {
      if (wavesurfer) {
        try { wavesurfer.destroy(); } catch(e) {}
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.aac,.m4a',
      binary: true,
      infoHtml: '<strong>AAC Opener:</strong> Browser-based AAC/M4A audio player with waveform display. 100% local — no uploads.',
      onInit: function (h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },
      onFile: function onFileImpl(file, content, h) {
        cleanup();

        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Loading audio engine...');
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', function() {
            onFileImpl(file, content, h);
          });
          return;
        }

        const mimeType = file.name.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : 'audio/aac';
        const blob = new Blob([content], { type: mimeType });
        audioUrl = URL.createObjectURL(blob);

        h.render(
          '<div class="p-6 space-y-4">' +
            '<div id="waveform" class="w-full bg-surface-50 rounded-lg mb-4" style="min-height:80px;"></div>' +
            '<div class="flex justify-center gap-3">' +
              '<button id="btn-play" class="px-5 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors">▶ Play / Pause</button>' +
            '</div>' +
            '<div class="flex flex-wrap justify-center gap-2 mt-2">' +
              '<span class="text-xs self-center mr-1 text-surface-400 font-medium">Speed:</span>' +
              '<button data-rate="0.5" class="speed-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">0.5×</button>' +
              '<button data-rate="1" class="speed-btn px-2 py-1 bg-brand-600 text-white border border-brand-600 rounded text-xs">1×</button>' +
              '<button data-rate="1.5" class="speed-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">1.5×</button>' +
              '<button data-rate="2" class="speed-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">2×</button>' +
              '<span class="text-xs self-center mx-2 text-surface-400 font-medium">Volume:</span>' +
              '<button data-vol="0.5" class="vol-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">50%</button>' +
              '<button data-vol="1" class="vol-btn px-2 py-1 bg-brand-600 text-white border border-brand-600 rounded text-xs">100%</button>' +
              '<button data-vol="1.5" class="vol-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">150%</button>' +
              '<button data-vol="2" class="vol-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">200%</button>' +
            '</div>' +
            '<div class="flex flex-wrap justify-center gap-2 mt-2">' +
              '<button id="btn-copy-meta" class="px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">📋 Copy Metadata</button>' +
              '<button id="btn-download" class="px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200">📥 Download</button>' +
            '</div>' +
          '</div>'
        );

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#4f46e5',
          progressColor: '#818cf8',
          url: audioUrl
        });

        document.getElementById('btn-play').onclick = function() { wavesurfer.playPause(); };

        document.querySelectorAll('.speed-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            const rate = parseFloat(btn.getAttribute('data-rate'));
            wavesurfer.setPlaybackRate(rate);
            document.querySelectorAll('.speed-btn').forEach(function(b) {
              b.className = 'speed-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200';
            });
            btn.className = 'speed-btn px-2 py-1 bg-brand-600 text-white border border-brand-600 rounded text-xs';
          });
        });

        document.querySelectorAll('.vol-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            const vol = parseFloat(btn.getAttribute('data-vol'));
            wavesurfer.setVolume(Math.min(vol, 2));
            document.querySelectorAll('.vol-btn').forEach(function(b) {
              b.className = 'vol-btn px-2 py-1 bg-surface-100 border rounded text-xs hover:bg-surface-200';
            });
            btn.className = 'vol-btn px-2 py-1 bg-brand-600 text-white border border-brand-600 rounded text-xs';
          });
        });

        document.getElementById('btn-copy-meta').onclick = function(e) {
          const meta = 'File: ' + file.name + '\nSize: ' + file.size + ' bytes\nType: ' + mimeType;
          h.copyToClipboard(meta, e.target);
        };

        document.getElementById('btn-download').onclick = function() {
          h.download(file.name, content, mimeType);
        };
      },
      onDestroy: function() {
        cleanup();
      }
    });
  };
})();
