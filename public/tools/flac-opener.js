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
                h.showError('Conversion failed', 'Could not convert FLAC to WAV. The file might be too large or the format unsupported.');
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
              `Sample Rate: ${buffer ? buffer.sampleRate + ' Hz' : 'Unknown'}`,
              `Channels: ${buffer ? buffer.numberOfChannels : 'Unknown'}`
            ].join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '💾 Export JSON',
          id: 'dl-json',
          onClick: function (h) {
            const tags = h.getState().tags || {};
            const buffer = h.getState().audioBuffer;
            const metadata = {
              file: h.getFile().name,
              size: h.getFile().size,
              format: 'FLAC',
              tags: tags,
              technical: {
                duration: buffer ? buffer.duration : 0,
                sampleRate: buffer ? buffer.sampleRate : 0,
                channels: buffer ? buffer.numberOfChannels : 0
              }
            };
            const name = (h.getFile().name || 'audio').replace(/\.flac$/i, '') + '-metadata.json';
            const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
            h.download(name, blob, 'application/json');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js');
      },

      onFile: async function (file, content, h) {
        // Cleanup previous object URLs to prevent memory leaks
        const prevUrls = h.getState().urls || [];
        prevUrls.forEach(url => URL.revokeObjectURL(url));
        h.setState('urls', []);

        h.showLoading('Analyzing audio metadata...');

        // Wait for jsmediatags to load if it hasn't yet
        await new Promise((resolve) => {
          const check = () => {
            if (typeof jsmediatags !== 'undefined') resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        jsmediatags.read(file, {
          onSuccess: (tag) => {
            const tags = tag.tags || {};
            h.setState('tags', tags);
            decodeAndRender(file, content, tags, h);
          },
          onError: (error) => {
            console.warn('Metadata read error:', error);
            decodeAndRender(file, content, {}, h);
          }
        });
      }
    });
  };

  async function decodeAndRender(file, content, tags, h) {
    h.showLoading('Decoding lossless audio stream...');
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    try {
      // Create a copy of the content as decodeAudioData detaches the buffer (B2 check)
      const bufferCopy = content.slice(0);
      const audioBuffer = await audioCtx.decodeAudioData(bufferCopy);
      h.setState('audioBuffer', audioBuffer);
      
      const fileUrl = URL.createObjectURL(file);
      const urls = h.getState().urls || [];
      urls.push(fileUrl);
      h.setState('urls', urls);

      renderUI(file, tags, audioBuffer, fileUrl, h);
    } catch (err) {
      console.error('Audio decode error:', err);
      h.showError('Could not open FLAC file', 'The file may be corrupted, too large, or your browser does not support FLAC decoding. Ensure it is a valid FLAC audio file.');
    }
  }

  function renderUI(file, tags, buffer, fileUrl, h) {
    let coverUrl = '';
    if (tags.picture) {
      const { data, format } = tags.picture;
      try {
        const blob = new Blob([new Uint8Array(data)], { type: format });
        coverUrl = URL.createObjectURL(blob);
        const urls = h.getState().urls || [];
        urls.push(coverUrl);
        h.setState('urls', urls);
      } catch (e) {
        console.warn('Failed to create cover URL', e);
      }
    }

    const duration = formatTime(buffer.duration);
    const sampleRate = buffer.sampleRate.toLocaleString() + ' Hz';
    const channels = buffer.numberOfChannels === 1 ? 'Mono' : (buffer.numberOfChannels === 2 ? 'Stereo' : `${buffer.numberOfChannels} Channels`);
    const humanSize = formatBytes(file.size);

    // Filter tags to show in details
    const displayTags = Object.entries(tags)
      .filter(([key, val]) => typeof val === 'string' && val.length > 0 && !['title', 'artist', 'album', 'picture'].includes(key))
      .map(([key, val]) => ({ key: key.charAt(0).toUpperCase() + key.slice(1), value: val }));

    const html = `
      <div class="p-2 animate-in fade-in duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${humanSize}</span>
          <span class="text-surface-300">|</span>
          <span class="text-brand-600 font-medium">FLAC Audio</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${duration} @ ${sampleRate}</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 px-1">
          <!-- Left Column: Album Art & Key Metadata -->
          <div class="lg:col-span-4 space-y-6">
            <div class="aspect-square w-full max-w-sm mx-auto bg-surface-100 rounded-2xl overflow-hidden shadow-md border border-surface-200 flex items-center justify-center relative group">
              ${coverUrl 
                ? `<img src="${coverUrl}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />` 
                : '<div class="text-6xl select-none">🎵</div>'}
              <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
            </div>
            
            <div class="space-y-2 text-center lg:text-left px-2">
              <h2 class="text-2xl font-bold text-surface-900 leading-tight truncate" title="${esc(tags.title || file.name)}">
                ${esc(tags.title || file.name.replace(/\.[^/.]+$/, ""))}
              </h2>
              <p class="text-lg text-brand-600 font-medium truncate" title="${esc(tags.artist || 'Unknown Artist')}">
                ${esc(tags.artist || 'Unknown Artist')}
              </p>
              <p class="text-surface-500 truncate" title="${esc(tags.album || 'Unknown Album')}">
                ${esc(tags.album || 'Unknown Album')}${tags.year ? ` • ${esc(tags.year)}` : ''}
              </p>
            </div>

            <!-- Tags Section -->
            ${displayTags.length > 0 ? `
              <div class="mt-8">
                <div class="flex items-center justify-between mb-3 px-2">
                  <h3 class="font-semibold text-surface-800 text-sm uppercase tracking-wider">Metadata Tags</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${displayTags.length}</span>
                </div>
                <div class="space-y-2">
                  ${displayTags.slice(0, 8).map(tag => `
                    <div class="rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                      <div class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">${esc(tag.key)}</div>
                      <div class="text-sm text-surface-700 font-medium truncate">${esc(tag.value)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>

          <!-- Right Column: Visualizer & Technical Specs -->
          <div class="lg:col-span-8 space-y-6">
            <!-- Audio Visualization Card -->
            <div class="bg-surface-900 rounded-2xl p-6 shadow-xl border border-surface-800 relative overflow-hidden group">
              <div class="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent pointer-events-none"></div>
              
              <div class="flex items-center justify-between mb-6 relative z-10">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>
                  <span class="text-xs font-mono text-brand-400 uppercase tracking-widest font-bold">Waveform Analysis</span>
                </div>
                <span id="current-time" class="text-xs text-surface-400 font-mono">0:00 / ${duration}</span>
              </div>
              
              <div class="relative h-40 mb-6 bg-black/20 rounded-lg overflow-hidden border border-white/5">
                <canvas id="waveform-canvas" class="w-full h-full opacity-90"></canvas>
                <div id="play-head" class="absolute top-0 left-0 w-0.5 h-full bg-brand-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] z-20 pointer-events-none transition-transform duration-75"></div>
              </div>
              
              <div class="relative z-10">
                <audio id="main-audio" class="w-full accent-brand-500">
                  <source src="${fileUrl}" type="audio/flac">
                </audio>
                
                <div class="flex items-center justify-center gap-6 mt-4">
                  <button id="btn-play-pause" class="w-12 h-12 rounded-full bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-brand-500/20">
                    <svg id="svg-play" class="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                    <svg id="svg-pause" class="w-6 h-6 hidden" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                  </button>
                  <div class="flex-1 px-4">
                    <input type="range" id="audio-progress" class="w-full h-1.5 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-brand-500" min="0" max="100" value="0">
                  </div>
                </div>
              </div>
            </div>

            <!-- Technical Details Table (U7) -->
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
              <table class="min-w-full text-sm">
                <thead>
                  <tr>
                    <th colspan="2" class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-4 text-left font-semibold text-surface-800 border-b border-surface-200">
                      Technical Properties
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  <tr class="hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium w-1/3">Duration</td>
                    <td class="px-4 py-3 text-surface-700 font-mono">${duration}</td>
                  </tr>
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">Sample Rate</td>
                    <td class="px-4 py-3 text-surface-700 font-mono">${sampleRate}</td>
                  </tr>
                  <tr class="hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">Channels</td>
                    <td class="px-4 py-3 text-surface-700 font-mono">${channels}</td>
                  </tr>
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">File Size</td>
                    <td class="px-4 py-3 text-surface-700 font-mono">${humanSize} (${file.size.toLocaleString()} bytes)</td>
                  </tr>
                  <tr class="hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-3 text-surface-500 font-medium">Codec</td>
                    <td class="px-4 py-3 text-surface-700 font-mono">FLAC (Free Lossless Audio Codec)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <!-- Format Explanation Card -->
            <div class="rounded-xl bg-brand-50 border border-brand-100 p-4">
              <div class="flex gap-3">
                <div class="text-brand-600">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-brand-900">About FLAC</h4>
                  <p class="text-xs text-brand-700 mt-1 leading-relaxed">
                    FLAC is an audio coding format for lossless compression of digital audio. 
                    It provides up to 50-70% compression without losing any original data, 
                    making it the preferred choice for high-fidelity audio archiving.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    // Initialize interactive elements
    setTimeout(() => {
      drawWaveform(buffer);
      setupAudioControls(h);
    }, 50);
  }

  function setupAudioControls(h) {
    const audio = document.getElementById('main-audio');
    const playPauseBtn = document.getElementById('btn-play-pause');
    const playSvg = document.getElementById('svg-play');
    const pauseSvg = document.getElementById('svg-pause');
    const progressInput = document.getElementById('audio-progress');
    const currentTimeText = document.getElementById('current-time');
    const playHead = document.getElementById('play-head');
    
    if (!audio || !playPauseBtn) return;

    const duration = audio.duration;
    const durationStr = formatTime(duration);

    playPauseBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play();
        playSvg.classList.add('hidden');
        pauseSvg.classList.remove('hidden');
      } else {
        audio.pause();
        playSvg.classList.remove('hidden');
        pauseSvg.classList.add('hidden');
      }
    });

    audio.addEventListener('timeupdate', () => {
      const progress = (audio.currentTime / audio.duration) * 100;
      progressInput.value = progress;
      currentTimeText.innerText = `${formatTime(audio.currentTime)} / ${durationStr}`;
      
      if (playHead) {
        playHead.style.left = `${progress}%`;
      }
    });

    progressInput.addEventListener('input', () => {
      const time = (progressInput.value / 100) * audio.duration;
      audio.currentTime = time;
    });

    audio.addEventListener('ended', () => {
      playSvg.classList.remove('hidden');
      pauseSvg.classList.add('hidden');
    });
  }

  function drawWaveform(buffer) {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;

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

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#34d399'); // emerald-400
    gradient.addColorStop(0.5, '#10b981'); // emerald-500
    gradient.addColorStop(1, '#059669'); // emerald-600
    
    ctx.fillStyle = gradient;
    
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      // Draw centered waveform
      const barHeight = Math.max(2, (max - min) * amp * 0.8);
      ctx.fillRect(i, amp - (barHeight / 2), 1, barHeight);
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  // WAV Encoding Logic (B2: Binary safe)
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
