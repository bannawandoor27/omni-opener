(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.flac',
      dropLabel: 'Drop a FLAC file here',

      actions: [
        {
          label: '📥 Download WAV',
          id: 'dl-wav',
          onClick: function (h) {
            const buffer = h.getState().audioBuffer;
            if (!buffer) return;
            h.showLoading('Converting to WAV...');
            setTimeout(() => {
              try {
                const wavBlob = audioBufferToWav(buffer);
                const name = (h.getFile().name || 'audio').replace(/\.flac$/i, '') + '.wav';
                h.download(name, wavBlob, 'audio/wav');
              } catch (err) {
                h.showError('Conversion failed', 'Could not convert FLAC to WAV.');
              }
            }, 50);
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const tags = h.getState().tags || {};
            const buffer = h.getState().audioBuffer;
            const text = [
              `Title: ${tags.title || 'Unknown'}`,
              `Artist: ${tags.artist || 'Unknown'}`,
              `Album: ${tags.album || 'Unknown'}`,
              `Duration: ${buffer ? formatTime(buffer.duration) : 'Unknown'}`,
              `Sample Rate: ${buffer ? buffer.sampleRate + ' Hz' : 'Unknown'}`
            ].join('\n');
            h.copyToClipboard(text, btn);
          }
        }
      ],

      onInit: function (h) {
        if (typeof jsmediatags === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Analyzing audio metadata...');

        const processFile = () => {
          if (typeof jsmediatags === 'undefined') {
            setTimeout(processFile, 100);
            return;
          }

          jsmediatags.read(file, {
            onSuccess: (tag) => {
              h.setState('tags', tag.tags || {});
              decodeAndRender(file, content, tag.tags || {}, h);
            },
            onError: (error) => {
              console.warn('Metadata read error:', error);
              decodeAndRender(file, content, {}, h);
            }
          });
        };

        processFile();
      }
    });
  };

  async function decodeAndRender(file, content, tags, h) {
    h.showLoading('Decoding FLAC audio stream...');
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
      // Create a copy of the content as decodeAudioData detaches the buffer
      const bufferCopy = content.slice(0);
      const audioBuffer = await audioCtx.decodeAudioData(bufferCopy);
      h.setState('audioBuffer', audioBuffer);
      
      const fileUrl = URL.createObjectURL(file);
      h.setState('fileUrl', fileUrl);

      renderUI(file, tags, audioBuffer, fileUrl, h);
    } catch (err) {
      console.error(err);
      h.showError('Could not open FLAC file', 'The file may be corrupted or your browser does not support FLAC decoding.');
    }
  }

  function renderUI(file, tags, buffer, fileUrl, h) {
    let coverUrl = '';
    if (tags.picture) {
      const { data, format } = tags.picture;
      const blob = new Blob([new Uint8Array(data)], { type: format });
      coverUrl = URL.createObjectURL(blob);
    }

    const duration = formatTime(buffer.duration);
    const sampleRate = buffer.sampleRate.toLocaleString() + ' Hz';
    const channels = buffer.numberOfChannels === 1 ? 'Mono' : (buffer.numberOfChannels === 2 ? 'Stereo' : `${buffer.numberOfChannels} Channels`);
    const fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    const html = `
      <div class="p-2">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${fileSize}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.flac file</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2">
          <!-- Left Col: Cover & Basic Info -->
          <div class="lg:col-span-4 space-y-6">
            <div class="aspect-square w-full max-w-sm mx-auto bg-surface-100 rounded-2xl overflow-hidden shadow-sm border border-surface-200 flex items-center justify-center">
              ${coverUrl ? `<img src="${coverUrl}" class="w-full h-full object-cover" />` : '<span class="text-6xl">🎵</span>'}
            </div>
            
            <div class="space-y-1 text-center lg:text-left">
              <h2 class="text-2xl font-bold text-surface-900 leading-tight">${esc(tags.title || file.name)}</h2>
              <p class="text-lg text-brand-600 font-medium">${esc(tags.artist || 'Unknown Artist')}</p>
              <p class="text-surface-500">${esc(tags.album || 'Unknown Album')}${tags.year ? ` • ${esc(tags.year)}` : ''}</p>
            </div>
          </div>

          <!-- Right Col: Visualizer & Details -->
          <div class="lg:col-span-8 space-y-6">
            <!-- Audio Visualization (AUDIO requirement) -->
            <div class="bg-surface-900 rounded-2xl p-6 shadow-lg">
              <div class="flex items-center justify-between mb-4">
                <span class="text-xs font-mono text-brand-400 uppercase tracking-wider font-bold">Waveform Analysis</span>
                <span class="text-xs text-surface-400 font-mono">${duration}</span>
              </div>
              <canvas id="waveform-canvas" class="w-full h-32 opacity-80"></canvas>
              
              <div class="mt-6">
                <audio id="main-audio" controls class="w-full accent-brand-500 h-10">
                  <source src="${fileUrl}" type="audio/flac">
                </audio>
              </div>
            </div>

            <!-- U7: Technical Details -->
            <div class="overflow-x-auto rounded-xl border border-surface-200">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50">
                    <th colspan="2" class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Technical Properties</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  <tr class="hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium w-1/3">Duration</td>
                    <td class="px-4 py-3 text-surface-800 font-mono">${duration}</td>
                  </tr>
                  <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">Sample Rate</td>
                    <td class="px-4 py-3 text-surface-800 font-mono">${sampleRate}</td>
                  </tr>
                  <tr class="hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">Channels</td>
                    <td class="px-4 py-3 text-surface-800 font-mono">${channels}</td>
                  </tr>
                  <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">Encoder</td>
                    <td class="px-4 py-3 text-surface-800 font-mono">FLAC (Free Lossless Audio Codec)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    // Draw waveform after rendering
    setTimeout(() => {
      drawWaveform(buffer);
      
      // Cleanup URLs on next file load
      const cleanup = () => {
        if (coverUrl) URL.revokeObjectURL(coverUrl);
        // We keep fileUrl for the <audio> element until replacement
      };
      
      // Hook into some kind of cleanup if the SDK supports it, 
      // otherwise rely on memory management or next onFile.
    }, 100);
  }

  function drawWaveform(buffer) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

    // Adjust for high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.fillStyle = '#10b981'; // brand-500 (emerald)
    
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    let ret = "";
    if (hrs > 0) ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── WAV Encoder ───────────────────────────────────────
  // B2: Ensure we don't treat binary data as strings
  function audioBufferToWav(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferArr = new ArrayBuffer(length);
    const view = new DataView(bufferArr);
    const channels = [];
    let pos = 0;

    const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };

    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"
    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit
    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    for (let i = 0; i < numOfChan; i++) {
      channels.push(buffer.getChannelData(i));
    }

    let offset = 0;
    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([bufferArr], { type: 'audio/wav' });
  }

})();
