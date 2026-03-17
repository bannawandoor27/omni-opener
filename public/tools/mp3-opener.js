(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mp3',
      binary: true,
      dropLabel: 'Drop an MP3 file to play and visualize',
      infoHtml: '<strong>Privacy:</strong> Your audio is processed entirely in your browser. No data is uploaded to any server.',

      actions: [
        {
          label: 'Play/Pause',
          id: 'play-pause',
          icon: 'play',
          onClick: function (h) {
            var ws = h.getState().wavesurfer;
            if (ws) ws.playPause();
          }
        },
        {
          label: 'Export WAV',
          id: 'export-wav',
          icon: 'download',
          onClick: function (h, btn) {
            var content = h.getContent();
            if (!content) return;
            var origLabel = btn.innerHTML;
            btn.innerHTML = 'Converting...';
            btn.disabled = true;

            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtx.decodeAudioData(content.slice(0), function (buffer) {
              var wavBlob = audioBufferToWav(buffer);
              var fileName = (h.getFile().name || 'audio').replace(/\.[^/.]+$/, "") + ".wav";
              h.download(fileName, wavBlob, 'audio/wav');
              btn.innerHTML = origLabel;
              btn.disabled = false;
            }, function (err) {
              h.showError('Conversion failed', 'The audio data could not be decoded. ' + (err.message || ''));
              btn.innerHTML = origLabel;
              btn.disabled = false;
            });
          }
        },
        {
          label: 'Download MP3',
          id: 'download',
          icon: 'download',
          onClick: function (h) {
            var file = h.getFile();
            var content = h.getContent();
            if (file && content) {
              h.download(file.name, content, 'audio/mpeg');
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },

      onFile: function (file, content, h) {
        if (!content || content.byteLength === 0) {
          h.render('<div class="p-12 text-center text-surface-500">The MP3 file appears to be empty.</div>');
          return;
        }

        h.showLoading('Analyzing audio spectrum...');

        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', function () {
          if (typeof WaveSurfer === 'undefined') {
            h.showError('Library Load Failed', 'Could not load WaveSurfer.js. Please check your internet connection.');
            return;
          }

          var state = h.getState();
          if (state.wavesurfer) {
            try { state.wavesurfer.destroy(); } catch (e) {}
          }
          if (state.blobUrl) {
            URL.revokeObjectURL(state.blobUrl);
          }

          var blobUrl = URL.createObjectURL(new Blob([content], { type: 'audio/mpeg' }));
          h.setState('blobUrl', blobUrl);

          var sizeMb = (file.size / (1024 * 1024)).toFixed(2);
          
          h.render(
            '<div class="p-6 max-w-5xl mx-auto">' +
              // U1. File info bar
              '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
                '<span class="font-semibold text-surface-800">' + h.escapeHtml(file.name) + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span>' + sizeMb + ' MB</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span class="text-surface-500">MP3 Audio</span>' +
              '</div>' +

              // Waveform Card
              '<div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm mb-6">' +
                '<div class="p-6">' +
                  '<div class="waveform-container min-h-[128px] mb-4"></div>' +
                  
                  // Controls Row
                  '<div class="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-surface-100">' +
                    '<div class="flex items-center gap-4">' +
                      '<button class="play-btn bg-brand-600 hover:bg-brand-700 text-white w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-sm">' +
                        '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
                      '</button>' +
                      '<div class="text-lg font-mono text-surface-800">' +
                        '<span class="current-time">0:00</span>' +
                        '<span class="text-surface-400 mx-1">/</span>' +
                        '<span class="total-duration">0:00</span>' +
                      '</div>' +
                    '</div>' +
                    
                    '<div class="flex items-center gap-6 flex-1 max-w-xs">' +
                      '<div class="flex-1">' +
                        '<label class="text-[10px] font-bold uppercase text-surface-400 block mb-1">Volume</label>' +
                        '<input type="range" class="volume-slider w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600" min="0" max="1" step="0.1" value="1">' +
                      '</div>' +
                      '<div class="flex-1">' +
                        '<label class="text-[10px] font-bold uppercase text-surface-400 block mb-1">Zoom</label>' +
                        '<input type="range" class="zoom-slider w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600" min="10" max="500" value="10">' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              // Metadata Grid
              '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">' +
                '<div class="bg-surface-50 rounded-xl p-4 border border-surface-100">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Sample Rate</div>' +
                  '<div class="meta-rate font-semibold text-surface-700">-- Hz</div>' +
                '</div>' +
                '<div class="bg-surface-50 rounded-xl p-4 border border-surface-100">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Channels</div>' +
                  '<div class="meta-channels font-semibold text-surface-700">--</div>' +
                '</div>' +
                '<div class="bg-surface-50 rounded-xl p-4 border border-surface-100">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Status</div>' +
                  '<div class="meta-status font-semibold text-brand-600">Loading...</div>' +
                '</div>' +
                '<div class="bg-surface-50 rounded-xl p-4 border border-surface-100 text-center flex items-center justify-center">' +
                  '<button class="reset-btn text-xs font-bold uppercase text-surface-500 hover:text-brand-600 transition-colors">Reset View</button>' +
                '</div>' +
              '</div>' +
            '</div>'
          );

          var renderEl = h.getRenderEl();
          var playBtn = renderEl.querySelector('.play-btn');
          var currentTimeEl = renderEl.querySelector('.current-time');
          var totalDurationEl = renderEl.querySelector('.total-duration');
          var volumeSlider = renderEl.querySelector('.volume-slider');
          var zoomSlider = renderEl.querySelector('.zoom-slider');
          var resetBtn = renderEl.querySelector('.reset-btn');

          var formatTime = function (seconds) {
            var mins = Math.floor(seconds / 60);
            var secs = Math.floor(seconds % 60);
            return mins + ':' + (secs < 10 ? '0' : '') + secs;
          };

          try {
            var ws = WaveSurfer.create({
              container: renderEl.querySelector('.waveform-container'),
              waveColor: '#cbd5e1', // surface-300
              progressColor: '#4f46e5', // brand-600
              cursorColor: '#4f46e5',
              barWidth: 2,
              barGap: 3,
              barRadius: 4,
              height: 128,
              normalize: true,
              interact: true
            });
            h.setState('wavesurfer', ws);

            ws.on('ready', function () {
              var dur = ws.getDuration();
              totalDurationEl.textContent = formatTime(dur);
              renderEl.querySelector('.meta-status').textContent = 'Ready';
              
              var data = ws.getDecodedData();
              if (data) {
                renderEl.querySelector('.meta-rate').textContent = data.sampleRate + ' Hz';
                renderEl.querySelector('.meta-channels').textContent = data.numberOfChannels === 1 ? 'Mono' : 'Stereo';
              }
            });

            ws.on('audioprocess', function () {
              currentTimeEl.textContent = formatTime(ws.getCurrentTime());
            });

            ws.on('play', function () {
              playBtn.innerHTML = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
              renderEl.querySelector('.meta-status').textContent = 'Playing';
            });

            ws.on('pause', function () {
              playBtn.innerHTML = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
              renderEl.querySelector('.meta-status').textContent = 'Paused';
            });

            ws.on('finish', function () {
              renderEl.querySelector('.meta-status').textContent = 'Finished';
            });

            ws.on('error', function (err) {
              h.showError('Playback Error', err.message || 'An error occurred during audio processing.');
            });

            playBtn.onclick = function () { ws.playPause(); };
            volumeSlider.oninput = function () { ws.setVolume(parseFloat(volumeSlider.value)); };
            zoomSlider.oninput = function () { ws.zoom(parseFloat(zoomSlider.value)); };
            resetBtn.onclick = function () {
              ws.zoom(10);
              zoomSlider.value = 10;
              ws.setTime(0);
            };

            ws.load(blobUrl);
          } catch (err) {
            h.showError('Initialization Failed', 'Could not initialize the audio visualizer: ' + err.message);
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
    setUint32(buffer.sampleRate * numOfChan * 2);
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
