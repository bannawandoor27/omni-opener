/**
 * OmniOpener — MP3 Opener Tool
 * Uses OmniTool SDK. Renders a waveform and provides playback controls for MP3 files.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp3',
      binary: true,
      dropLabel: 'Drop an MP3 file here',
      infoHtml: '<strong>Privacy:</strong> Your audio is processed entirely in your browser. No data is uploaded to any server.',

      actions: [
        {
          label: '▶️ Play/Pause',
          id: 'play-pause',
          onClick: function (h) {
            var ws = h.getState().wavesurfer;
            if (ws) ws.playPause();
          }
        },
        {
          label: '📋 Copy as Data URL',
          id: 'copy-data',
          onClick: function (h, btn) {
            var content = h.getContent();
            if (!content) return;
            var blob = new Blob([content], { type: 'audio/mpeg' });
            var reader = new FileReader();
            reader.onload = function (e) {
              h.copyToClipboard(e.target.result, btn);
            };
            reader.readAsDataURL(blob);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            var file = h.getFile();
            var content = h.getContent();
            if (file && content) {
              h.download(file.name, content, 'audio/mpeg');
            }
          }
        },
        {
          label: '🔄 Export as WAV',
          id: 'export-wav',
          onClick: function (h, btn) {
            var content = h.getContent();
            if (!content) return;
            var origText = btn.textContent;
            btn.textContent = '⌛ Converting...';
            btn.disabled = true;

            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtx.decodeAudioData(content.slice(0), function (buffer) {
              var wavBlob = audioBufferToWav(buffer);
              var fileName = (h.getFile().name || 'audio').replace(/\.[^/.]+$/, "") + ".wav";
              h.download(fileName, wavBlob, 'audio/wav');
              btn.textContent = origText;
              btn.disabled = false;
            }, function (err) {
              h.showError('Conversion failed', err.message);
              btn.textContent = origText;
              btn.disabled = false;
            });
          }
        }
      ],

      onInit: function (h) {
        // Pre-load WaveSurfer from CDN
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Initializing player...');

        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', function () {
          var state = h.getState();
          // Cleanup previous instances
          if (state.wavesurfer) {
            try { state.wavesurfer.destroy(); } catch (e) {}
          }
          if (state.blobUrl) {
            URL.revokeObjectURL(state.blobUrl);
          }

          var url = URL.createObjectURL(new Blob([content], { type: 'audio/mpeg' }));
          h.setState('blobUrl', url);

          h.render(
            '<div class="p-8 space-y-6">' +
              '<div class="waveform-container bg-surface-50 rounded-lg p-4 min-h-[128px]"></div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-surface-600 border-t border-surface-100 pt-6">' +
                '<div class="flex flex-col"><span class="text-xs font-bold uppercase text-surface-400">Filename</span><span class="meta-name font-medium truncate"></span></div>' +
                '<div class="flex flex-col"><span class="text-xs font-bold uppercase text-surface-400">Size</span><span class="meta-size font-medium"></span></div>' +
                '<div class="flex flex-col"><span class="text-xs font-bold uppercase text-surface-400">Duration</span><span class="meta-duration font-medium">--:--</span></div>' +
                '<div class="flex flex-col"><span class="text-xs font-bold uppercase text-surface-400">Sample Rate</span><span class="meta-rate font-medium">--</span></div>' +
                '<div class="flex flex-col"><span class="text-xs font-bold uppercase text-surface-400">Channels</span><span class="meta-channels font-medium">--</span></div>' +
                '<div class="flex flex-col"><span class="text-xs font-bold uppercase text-surface-400">Status</span><span class="meta-status font-medium">Ready</span></div>' +
              '</div>' +
            '</div>'
          );

          var renderEl = h.getRenderEl();
          renderEl.querySelector('.meta-name').textContent = file.name;
          renderEl.querySelector('.meta-size').textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

          try {
            var ws = WaveSurfer.create({
              container: renderEl.querySelector('.waveform-container'),
              waveColor: '#4f46e5',
              progressColor: '#818cf8',
              cursorColor: '#4f46e5',
              barWidth: 2,
              barRadius: 3,
              height: 128,
            });
            h.setState('wavesurfer', ws);

            ws.on('ready', function () {
              var dur = ws.getDuration();
              var mins = Math.floor(dur / 60);
              var secs = Math.floor(dur % 60);
              renderEl.querySelector('.meta-duration').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
              renderEl.querySelector('.meta-status').textContent = 'Ready';
              
              var data = ws.getDecodedData();
              if (data) {
                renderEl.querySelector('.meta-rate').textContent = data.sampleRate + ' Hz';
                renderEl.querySelector('.meta-channels').textContent = data.numberOfChannels === 1 ? 'Mono' : 'Stereo';
              }
            });

            ws.on('play', function () { renderEl.querySelector('.meta-status').textContent = 'Playing'; });
            ws.on('pause', function () { renderEl.querySelector('.meta-status').textContent = 'Paused'; });
            ws.on('finish', function () { renderEl.querySelector('.meta-status').textContent = 'Finished'; });
            ws.on('error', function (err) { h.showError('Playback Error', err.message || err); });

            ws.load(url);
          } catch (err) {
            h.showError('Player Initialization Failed', err.message);
          }
        });
      }
    });
  };

  /** Helper: Convert AudioBuffer to WAV Blob */
  function audioBufferToWav(buffer) {
    var numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferArray = new ArrayBuffer(length),
        view = new DataView(bufferArray),
        channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 4);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    for (i = 0; i < numOfChan; i++) channels.push(buffer.getChannelData(i));
    while (pos < length) {
      for (i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }
    return new Blob([bufferArray], { type: 'audio/wav' });
  }
})();
