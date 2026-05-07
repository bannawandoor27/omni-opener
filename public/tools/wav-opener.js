/**
 * OmniOpener — PRODUCTION PERFECT WAV Viewer
 * High-performance audio visualization and metadata extraction.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let currentWavUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.wav',
      binary: true,
      dropLabel: 'Drop a WAV file to visualize',
      infoHtml: '<strong>Privacy:</strong> All audio processing happens in your browser. No data is uploaded to any server.',

      actions: [
        {
          label: 'Play / Pause',
          id: 'play-pause',
          icon: 'play',
          onClick: function (h) {
            if (wavesurfer) wavesurfer.playPause();
          }
        },
        {
          label: 'Download WAV',
          id: 'download',
          icon: 'download',
          onClick: function (h) {
            const file = h.getFile();
            const content = h.getContent();
            if (file && content) {
              h.download(file.name, content, 'audio/wav');
            }
          }
        },
        {
          label: 'Copy Metadata',
          id: 'copy-meta',
          icon: 'copy',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.meta) {
              h.copyToClipboard(JSON.stringify(state.meta, null, 2), btn);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof WaveSurfer === 'undefined') {
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
        }
      },

      onFile: function _onFile(file, content, h) {
        // B1: Race condition check for WaveSurfer
        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Initializing audio engine...');
          setTimeout(function() { _onFile(file, content, h); }, 100);
          return;
        }

        // B5: Revoke previous URL
        if (currentWavUrl) {
          URL.revokeObjectURL(currentWavUrl);
          currentWavUrl = null;
        }

        // B9: Destroy previous instance
        if (wavesurfer) {
          try { wavesurfer.destroy(); } catch (e) {}
          wavesurfer = null;
        }

        h.showLoading('Analyzing audio waveform...');

        try {
          const metadata = parseWavHeader(content);
          h.setState({ meta: { ...metadata, name: file.name, size: file.size } });
          
          const blob = new Blob([content], { type: 'audio/wav' });
          currentWavUrl = URL.createObjectURL(blob);

          renderUI(file, metadata, h);
          initWaveSurfer(currentWavUrl, h);
        } catch (err) {
          h.showError('Could not open WAV file', err.message || 'The file may be corrupted or in an unsupported format.');
        }
      },

      onDestroy: function () {
        if (wavesurfer) {
          try { wavesurfer.destroy(); } catch (e) {}
          wavesurfer = null;
        }
        if (currentWavUrl) {
          URL.revokeObjectURL(currentWavUrl);
          currentWavUrl = null;
        }
      }
    });

    function renderUI(file, meta, h) {
      const humanSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
      
      h.render(`
        <div class="p-6 max-w-5xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${file.name}</span>
            <span class="text-surface-300">|</span>
            <span>${humanSize}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">WAV Audio</span>
          </div>

          <!-- Waveform Section -->
          <div class="mb-6">
            <div id="waveform" class="bg-surface-50 rounded-xl overflow-hidden border border-surface-200 shadow-inner" style="min-height: 128px;"></div>
          </div>

          <!-- Controls Section -->
          <div class="flex flex-wrap items-center justify-between gap-4 p-4 bg-white rounded-xl border border-surface-200 mb-6">
            <div class="flex items-center gap-4">
              <button id="btn-play-pause" class="flex items-center justify-center w-12 h-12 rounded-full bg-brand-600 text-white hover:bg-brand-700 transition-all shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                </svg>
              </button>
              
              <div class="flex bg-surface-100 p-1 rounded-lg">
                <button class="speed-btn px-3 py-1.5 text-xs font-medium rounded-md hover:bg-white transition-all" data-speed="0.5">0.5x</button>
                <button class="speed-btn px-3 py-1.5 text-xs font-medium bg-white shadow-sm rounded-md transition-all" data-speed="1">1x</button>
                <button class="speed-btn px-3 py-1.5 text-xs font-medium rounded-md hover:bg-white transition-all" data-speed="1.5">1.5x</button>
                <button class="speed-btn px-3 py-1.5 text-xs font-medium rounded-md hover:bg-white transition-all" data-speed="2">2x</button>
              </div>
            </div>

            <div class="flex items-center gap-3 flex-1 max-w-xs">
              <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Volume</span>
              <input type="range" id="volume-slider" class="flex-1 accent-brand-600 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer" min="0" max="1" step="0.05" value="1">
              <span id="volume-label" class="text-xs font-mono text-surface-600 min-w-[4ch]">100%</span>
            </div>
          </div>

          <!-- U10: Section Header -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Technical Details</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Audio Data</span>
          </div>

          <!-- Metadata Grid -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white p-4 rounded-xl border border-surface-200 hover:border-brand-300 transition-all">
              <p class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Sample Rate</p>
              <p class="text-xl font-semibold text-surface-800">${meta.sampleRate.toLocaleString()} <span class="text-sm font-normal text-surface-500">Hz</span></p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-200 hover:border-brand-300 transition-all">
              <p class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Channels</p>
              <p class="text-xl font-semibold text-surface-800">${meta.channels === 1 ? 'Mono' : 'Stereo'}</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-200 hover:border-brand-300 transition-all">
              <p class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Bit Depth</p>
              <p class="text-xl font-semibold text-surface-800">${meta.bitDepth} <span class="text-sm font-normal text-surface-500">bit</span></p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-200 hover:border-brand-300 transition-all">
              <p class="text-[10px] text-surface-400 uppercase font-bold tracking-wider mb-1">Duration</p>
              <p id="wav-duration" class="text-xl font-semibold text-surface-800">--:--</p>
            </div>
          </div>
        </div>
      `);

      setupListeners();
    }

    function setupListeners() {
      const playBtn = document.getElementById('btn-play-pause');
      if (playBtn) {
        playBtn.onclick = () => wavesurfer && wavesurfer.playPause();
      }

      const speedBtns = document.querySelectorAll('.speed-btn');
      speedBtns.forEach(btn => {
        btn.onclick = () => {
          const speed = parseFloat(btn.dataset.speed);
          if (wavesurfer) wavesurfer.setPlaybackRate(speed);
          speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm'));
          btn.classList.add('bg-white', 'shadow-sm');
        };
      });

      const volumeSlider = document.getElementById('volume-slider');
      const volumeLabel = document.getElementById('volume-label');
      if (volumeSlider) {
        volumeSlider.oninput = () => {
          const vol = parseFloat(volumeSlider.value);
          if (volumeLabel) volumeLabel.textContent = Math.round(vol * 100) + '%';
          if (wavesurfer) wavesurfer.setVolume(vol);
        };
      }
    }

    function initWaveSurfer(url, h) {
      wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#6366f1',
        progressColor: '#4338ca',
        cursorColor: '#4338ca',
        barWidth: 2,
        barGap: 3,
        barRadius: 4,
        cursorWidth: 1,
        height: 128,
        url: url,
        normalize: true,
        interact: true,
        fillParent: true
      });

      wavesurfer.on('ready', (duration) => {
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        const el = document.getElementById('wav-duration');
        if (el) el.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      });

      wavesurfer.on('play', () => {
        const btn = document.getElementById('btn-play-pause');
        if (btn) btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
      });

      wavesurfer.on('pause', () => {
        const btn = document.getElementById('btn-play-pause');
        if (btn) btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>`;
      });

      wavesurfer.on('error', (err) => {
        h.showError('Waveform Error', 'There was an issue rendering the audio visualization.');
      });
    }

    function parseWavHeader(buffer) {
      const view = new DataView(buffer);
      
      // RIFF header
      if (view.getUint32(0, true) !== 0x46464952) throw new Error('Not a valid RIFF file');
      if (view.getUint32(8, true) !== 0x45564157) throw new Error('Not a valid WAVE file');

      let offset = 12;
      let fmt = null;

      while (offset < buffer.byteLength - 8) {
        const chunkId = view.getUint32(offset, true);
        const chunkSize = view.getUint32(offset + 4, true);

        if (chunkId === 0x20746d66) { // 'fmt '
          fmt = {
            format: view.getUint16(offset + 8, true),
            channels: view.getUint16(offset + 10, true),
            sampleRate: view.getUint32(offset + 12, true),
            byteRate: view.getUint32(offset + 16, true),
            blockAlign: view.getUint16(offset + 20, true),
            bitDepth: view.getUint16(offset + 22, true)
          };
          break;
        }
        offset += 8 + chunkSize;
      }

      if (!fmt) throw new Error('WAV "fmt" chunk not found');
      return fmt;
    }
  };
})();
