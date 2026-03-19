/**
 * OmniOpener — WAV Viewer & Converter
 * Uses OmniTool SDK. Renders audio waveforms and parses WAV metadata.
 */
(function () {
  'use strict';

  var wavesurfer = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.wav',
      binary: true,
      dropLabel: 'Drop a WAV file here',
      infoHtml: '<strong>Privacy:</strong> Audio processing and waveform rendering happen entirely in your browser. No audio data is uploaded.',

      actions: [
        {
          label: '▶ Play / Pause',
          id: 'play-pause',
          onClick: function () {
            if (wavesurfer) wavesurfer.playPause();
          }
        },
        {
          label: '📥 Download WAV',
          id: 'download',
          onClick: function (h) {
            var file = h.getFile();
            var content = h.getContent();
            if (file && content) {
              h.download(file.name, content, 'audio/wav');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof WaveSurfer === 'undefined') {
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Analyzing audio…');

        // Small delay to ensure WaveSurfer is loaded
        setTimeout(function () {
          try {
            renderWav(file, content, h);
          } catch (err) {
            h.showError('Failed to parse WAV', err.message);
          }
        }, 100);
      },

      onDestroy: function () {
        if (wavesurfer) {
          wavesurfer.destroy();
          wavesurfer = null;
        }
      }
    });
  };

  function renderWav(file, buffer, h) {
    var metadata = parseWavHeader(buffer);
    var duration = 'Calculating...';

    // Create UI structure
    h.render(
      '<div class="p-6 space-y-6">' +
        '<div id="waveform" class="bg-surface-50 rounded-lg overflow-hidden border border-surface-200"></div>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">' +
          '<div class="bg-surface-50 p-3 rounded-lg border border-surface-100">' +
            '<p class="text-xs text-surface-400 uppercase font-bold tracking-wider">Sample Rate</p>' +
            '<p class="text-lg font-semibold text-surface-700">' + metadata.sampleRate + ' Hz</p>' +
          '</div>' +
          '<div class="bg-surface-50 p-3 rounded-lg border border-surface-100">' +
            '<p class="text-xs text-surface-400 uppercase font-bold tracking-wider">Channels</p>' +
            '<p class="text-lg font-semibold text-surface-700">' + (metadata.channels === 1 ? 'Mono' : 'Stereo (' + metadata.channels + ')') + '</p>' +
          '</div>' +
          '<div class="bg-surface-50 p-3 rounded-lg border border-surface-100">' +
            '<p class="text-xs text-surface-400 uppercase font-bold tracking-wider">Bit Depth</p>' +
            '<p class="text-lg font-semibold text-surface-700">' + metadata.bitDepth + '-bit</p>' +
          '</div>' +
          '<div class="bg-surface-50 p-3 rounded-lg border border-surface-100">' +
            '<p class="text-xs text-surface-400 uppercase font-bold tracking-wider">Duration</p>' +
            '<p id="wav-duration" class="text-lg font-semibold text-surface-700">' + duration + '</p>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    if (wavesurfer) {
      wavesurfer.destroy();
    }

    var blob = new Blob([buffer], { type: 'audio/wav' });
    var url = URL.createObjectURL(blob);

    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: '#6366f1',
      progressColor: '#4338ca',
      cursorColor: '#4338ca',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 1,
      height: 128,
      hideScrollbar: true,
      url: url
    });

    wavesurfer.on('ready', function (d) {
      var mins = Math.floor(d / 60);
      var secs = Math.floor(d % 60);
      document.getElementById('wav-duration').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    });

    wavesurfer.on('error', function (err) {
      h.showError('WaveSurfer Issue', err);
    });
  }

  function parseWavHeader(buffer) {
    var view = new DataView(buffer);
    
    // RIFF identifier
    if (view.getUint32(0, true) !== 0x46464952) throw new Error('Invalid WAV: Not a RIFF file');
    // WAVE identifier
    if (view.getUint32(8, true) !== 0x45564157) throw new Error('Invalid WAV: Not a WAVE file');

    var offset = 12;
    var fmtFound = false;
    var channels, sampleRate, bitDepth;

    // Iterate through chunks to find 'fmt '
    while (offset < buffer.byteLength - 8) {
      var chunkId = view.getUint32(offset, true);
      var chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 0x20746d66) { // 'fmt '
        fmtFound = true;
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitDepth = view.getUint16(offset + 22, true);
        break;
      }
      offset += 8 + chunkSize;
    }

    if (!fmtFound) throw new Error('Invalid WAV: fmt chunk not found');

    return {
      channels: channels,
      sampleRate: sampleRate,
      bitDepth: bitDepth
    };
  }
})();
