/**
 * OmniOpener — AAC/M4A Opener Tool
 * A production-grade audio tool for playback, visualization, and conversion.
 */
(function () {
  'use strict';

  var wavesurfer = null;
  var currentBlobUrl = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.aac,.m4a',
      binary: true,
      dropLabel: 'Drop an AAC or M4A file here',
      infoHtml: 'Audio processing happens locally in your browser for maximum privacy.',

      actions: [
        {
          label: '▶️ Play / Pause',
          id: 'play-pause',
          onClick: function () {
            if (wavesurfer) {
              wavesurfer.playPause();
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function (h) {
            var file = h.getFile();
            var content = h.getContent();
            if (file && content) {
              h.download(file.name, content, 'audio/aac');
            }
          }
        },
        {
          label: '🔄 Export as WAV',
          id: 'export-wav',
          onClick: function (h, btn) {
            var content = h.getContent();
            if (!content || content.byteLength === 0) return;
            
            var origText = btn.textContent;
            btn.textContent = '⌛ Converting...';
            btn.disabled = true;

            var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            // Use a slice to avoid detaching the original buffer
            audioCtx.decodeAudioData(content.slice(0), function (buffer) {
              var wavBlob = audioBufferToWav(buffer);
              var fileName = (h.getFile().name || 'audio').replace(/\.[^/.]+$/, "") + ".wav";
              h.download(fileName, wavBlob, 'audio/wav');
              btn.textContent = origText;
              btn.disabled = false;
            }, function (err) {
              h.showError('Conversion failed', 'The browser could not decode this audio file. It may be in an unsupported format or corrupted.');
              btn.textContent = origText;
              btn.disabled = false;
            });
          }
        }
      ],

      onInit: function (h) {
        if (typeof WaveSurfer === 'undefined') {
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
        }
      },

      onFile: function (file, content, h) {
        if (!content || content.byteLength === 0) {
          h.render(
            '<div class="flex flex-col items-center justify-center p-12 text-center text-surface-500">' +
              '<div class="text-4xl mb-4">🔇</div>' +
              '<p class="text-lg font-medium text-surface-800">This file is empty</p>' +
              '<p class="text-sm">The selected AAC file contains no data.</p>' +
            '</div>'
          );
          return;
        }

        h.showLoading('Initializing audio engine...');

        var setupPlayer = function() {
          if (typeof WaveSurfer === 'undefined') {
            setTimeout(setupPlayer, 50);
            return;
          }

          // Cleanup previous
          if (wavesurfer) {
            try { wavesurfer.destroy(); } catch (e) {}
            wavesurfer = null;
          }
          if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
          }

          var isM4A = file.name.toLowerCase().endsWith('.m4a');
          var mimeType = isM4A ? 'audio/mp4' : 'audio/aac';
          currentBlobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));

          var humanSize = (file.size / 1024 < 1024) 
            ? (file.size / 1024).toFixed(1) + ' KB' 
            : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

          h.render(
            '<div class="p-6">' +
              // U1: File Info Bar
              '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
                '<span class="font-semibold text-surface-800">' + h.escapeHtml(file.name) + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span>' + humanSize + '</span>' +
                '<span class="text-surface-300">|</span>' +
                '<span class="text-surface-500">' + (isM4A ? '.m4a' : '.aac') + ' file</span>' +
              '</div>' +

              // Waveform Display
              '<div class="mb-8">' +
                '<div class="flex items-center justify-between mb-3">' +
                  '<h3 class="font-semibold text-surface-800">Waveform</h3>' +
                  '<span id="playback-status" class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Ready</span>' +
                '</div>' +
                '<div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">' +
                  '<div id="waveform" class="min-h-[128px]"></div>' +
                '</div>' +
              '</div>' +

              // U10: Section header with metadata
              '<div class="mb-4">' +
                '<h3 class="font-semibold text-surface-800">Audio Information</h3>' +
              '</div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">' +
                // U9: Content cards
                '<div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Duration</div>' +
                  '<div id="meta-duration" class="text-lg font-semibold text-surface-800">--:--</div>' +
                '</div>' +
                '<div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Sample Rate</div>' +
                  '<div id="meta-rate" class="text-lg font-semibold text-surface-800">--</div>' +
                '</div>' +
                '<div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Channels</div>' +
                  '<div id="meta-channels" class="text-lg font-semibold text-surface-800">--</div>' +
                '</div>' +
                '<div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 transition-all">' +
                  '<div class="text-xs font-bold uppercase text-surface-400 mb-1">Bit Depth</div>' +
                  '<div id="meta-depth" class="text-lg font-semibold text-surface-800">16-bit</div>' +
                '</div>' +
              '</div>' +
            '</div>'
          );

          try {
            wavesurfer = WaveSurfer.create({
              container: '#waveform',
              waveColor: '#818cf8',
              progressColor: '#4f46e5',
              cursorColor: '#4f46e5',
              barWidth: 2,
              barRadius: 3,
              responsive: true,
              height: 128,
              url: currentBlobUrl
            });

            wavesurfer.on('ready', function (dur) {
              var mins = Math.floor(dur / 60);
              var secs = Math.floor(dur % 60);
              document.getElementById('meta-duration').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
              
              var data = wavesurfer.getDecodedData();
              if (data) {
                document.getElementById('meta-rate').textContent = (data.sampleRate / 1000).toFixed(1) + ' kHz';
                document.getElementById('meta-channels').textContent = data.numberOfChannels === 1 ? 'Mono' : (data.numberOfChannels === 2 ? 'Stereo' : data.numberOfChannels + ' Ch');
              }
            });

            var statusEl = document.getElementById('playback-status');
            wavesurfer.on('play', function () { 
              if (statusEl) { statusEl.textContent = 'Playing'; statusEl.className = 'text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full'; }
            });
            wavesurfer.on('pause', function () { 
              if (statusEl) { statusEl.textContent = 'Paused'; statusEl.className = 'text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full'; }
            });
            wavesurfer.on('finish', function () { 
              if (statusEl) { statusEl.textContent = 'Finished'; statusEl.className = 'text-xs bg-surface-100 text-surface-700 px-2 py-0.5 rounded-full'; }
            });
            wavesurfer.on('error', function (err) { 
              h.showError('Playback Error', 'The browser encountered an error while trying to play this audio. It might use an unsupported codec profile or be corrupted.'); 
            });

          } catch (err) {
            h.showError('Initialization Error', 'Failed to initialize the audio player: ' + err.message);
          }
        };

        h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js', setupPlayer);
      },

      onDestroy: function () {
        if (wavesurfer) {
          try { wavesurfer.destroy(); } catch (e) {}
          wavesurfer = null;
        }
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
          currentBlobUrl = null;
        }
      }
    });
  };

  /**
   * Helper: Convert AudioBuffer to WAV format
   * Standard RIFF WAV (PCM 16-bit)
   */
  function audioBufferToWav(buffer) {
    var numOfChan = buffer.numberOfChannels,
        length = buffer.length * numOfChan * 2 + 44,
        bufferArray = new ArrayBuffer(length),
        view = new DataView(bufferArray),
        channels = [], i, sample, offset = 0, pos = 0;

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }

    // RIFF identifier
    setUint32(0x46464952);
    // file length
    setUint32(length - 8);
    // RIFF type
    setUint32(0x45564157);
    // format chunk identifier
    setUint32(0x20746d66);
    // format chunk length
    setUint32(16);
    // sample format (raw)
    setUint16(1);
    // channel count
    setUint16(numOfChan);
    // sample rate
    setUint32(buffer.sampleRate);
    // byte rate (sample rate * block align)
    setUint32(buffer.sampleRate * numOfChan * 2);
    // block align (channel count * bytes per sample)
    setUint16(numOfChan * 2);
    // bits per sample
    setUint16(16);
    // data chunk identifier
    setUint32(0x61746164);
    // data chunk length
    setUint32(length - pos - 4);

    // write interleaved data
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
