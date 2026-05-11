(function () {
  'use strict';

  /**
   * OmniOpener MKV Tool
   * Browser-based MKV player, metadata viewer, and converter using FFmpeg.wasm.
   */

  const FFMPEG_JS = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.0/dist/ffmpeg.min.js';
  const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';

  let activeUrls = [];
  let audioContext = null;
  let gainNode = null;

  function revokeAll() {
    activeUrls.forEach(url => URL.revokeObjectURL(url));
    activeUrls = [];
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    gainNode = null;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mkv',
      binary: true,
      dropLabel: 'Drop MKV video here',
      infoHtml: '<strong>Privacy:</strong> Your video is processed locally in the browser. Large files may take a moment to initialize.',

      onInit: function (helpers) {
        revokeAll();
        return helpers.loadScript(FFMPEG_JS);
      },

      onFile: async function (file, content, helpers) {
        helpers.showLoading('Analyzing Matroska container...');
        revokeAll();

        const blob = new Blob([content], { type: 'video/x-matroska' });
        const videoUrl = URL.createObjectURL(blob);
        activeUrls.push(videoUrl);

        helpers.setState({
          content,
          videoUrl,
          isConverted: false,
          meta: {
            duration: 'Calculating...',
            resolution: 'Analyzing...',
            streams: []
          }
        });

        renderMKV(file, helpers);

        // Try to extract detailed stream info using FFmpeg
        try {
          if (typeof FFmpeg !== 'undefined') {
            const { createFFmpeg } = FFmpeg;
            const ffmpeg = createFFmpeg({ log: false, corePath: FFMPEG_CORE });
            await ffmpeg.load();
            
            ffmpeg.FS('writeFile', 'info.mkv', new Uint8Array(content));
            
            let logs = '';
            ffmpeg.setLogger(({ message }) => { logs += message + '\n'; });
            
            // Running without output to trigger info dump
            try { await ffmpeg.run('-i', 'info.mkv'); } catch(e) {}

            const streams = parseStreams(logs);
            const state = helpers.getState();
            state.meta.streams = streams;
            
            // Update the streams list in the UI without re-rendering everything
            const streamList = helpers.getRenderEl().querySelector('#stream-list');
            if (streamList) {
              streamList.innerHTML = renderStreamsList(streams);
            }
          }
        } catch (e) {
          console.warn('FFmpeg info extraction failed', e);
        }
      },

      actions: [
        {
          label: '⚡ Convert to MP4',
          id: 'convert',
          onClick: async function (helpers, btn) {
            const state = helpers.getState();
            const file = helpers.getFile();
            if (!state.content || state.isConverted) return;

            const originalLabel = btn.innerHTML;
            
            try {
              helpers.showLoading('Loading FFmpeg engine...');
              if (typeof FFmpeg === 'undefined') {
                await helpers.loadScript(FFMPEG_JS);
              }

              const { createFFmpeg } = FFmpeg;
              const ffmpeg = createFFmpeg({ log: true, corePath: FFMPEG_CORE });

              btn.disabled = true;
              btn.innerHTML = '⌛ Preparing...';
              
              await ffmpeg.load();
              
              ffmpeg.FS('writeFile', 'input.mkv', new Uint8Array(state.content));

              ffmpeg.setProgress(({ ratio }) => {
                const pct = Math.max(0, Math.min(100, Math.floor(ratio * 100)));
                helpers.showLoading(`Converting: ${pct}%...`);
                btn.innerHTML = `⌛ ${pct}%`;
              });

              // Convert to browser-friendly H.264/AAC MP4
              await ffmpeg.run(
                '-i', 'input.mkv',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '26',
                '-c:a', 'aac',
                '-movflags', '+faststart',
                'output.mp4'
              );

              const data = ffmpeg.FS('readFile', 'output.mp4');
              const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
              const mp4Url = URL.createObjectURL(mp4Blob);
              activeUrls.push(mp4Url);

              helpers.setState({
                videoUrl: mp4Url,
                isConverted: true,
                mp4Blob: mp4Blob
              });

              renderMKV(file, helpers);
              
              btn.innerHTML = '✅ Done';
              setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalLabel;
              }, 3000);
            } catch (err) {
              console.error(err);
              helpers.showError('Conversion Failed', err.message || 'The browser WASM environment failed to process this file.');
              btn.disabled = false;
              btn.innerHTML = originalLabel;
            }
          }
        },
        {
          label: '📸 Snapshot',
          id: 'snapshot',
          onClick: function (helpers) {
            const video = helpers.getRenderEl().querySelector('video');
            if (!video || video.readyState < 2) {
              return helpers.showError('Snapshot Failed', 'Please ensure the video is loaded and playing.');
            }

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob((blob) => {
              if (blob) helpers.download(`snapshot-${Date.now()}.png`, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Info',
          id: 'copy-info',
          onClick: function (helpers, btn) {
            const s = helpers.getState();
            if (!s.meta.streams.length) return helpers.showError('No Info', 'Stream info not yet analyzed.');
            const info = s.meta.streams.map(st => `[${st.type}] ${st.codec} ${st.details}`).join('\n');
            helpers.copyToClipboard(info, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const s = helpers.getState();
            const file = helpers.getFile();
            if (s.isConverted && s.mp4Blob) {
              helpers.download(file.name.replace(/\.[^/.]+$/, "") + '.mp4', s.mp4Blob, 'video/mp4');
            } else if (s.content) {
              helpers.download(file.name, s.content, 'video/x-matroska');
            }
          }
        }
      ]
    });
  };

  function renderMKV(file, helpers) {
    const s = helpers.getState();
    const mount = helpers.getRenderEl();
    
    const html = `
      <div class="max-w-6xl mx-auto p-4 animate-in fade-in duration-500">
        <!-- File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Matroska Video</span>
          ${s.isConverted ? `
            <span class="ml-auto px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase tracking-wider">MP4 CONVERTED</span>
          ` : ''}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-8 space-y-6">
            <!-- Player Container -->
            <div class="relative group bg-black rounded-2xl overflow-hidden aspect-video shadow-2xl">
              <video id="omni-player" class="w-full h-full cursor-pointer" controls playsinline src="${s.videoUrl}"></video>
              
              <!-- Native Playback Error Overlay -->
              <div id="error-overlay" class="absolute inset-0 z-10 hidden flex-col items-center justify-center bg-surface-900/90 backdrop-blur-sm text-center p-8">
                <div class="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 14c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h3 class="text-white text-xl font-bold mb-2">Codec Not Supported Natively</h3>
                <p class="text-surface-400 text-sm mb-6 max-w-sm">
                  Browsers often cannot play MKV/HEVC/AC3 natively. Click "Convert to MP4" to view this file.
                </p>
                <button id="convert-hint-btn" class="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-brand-600/20">
                  Convert to compatible MP4
                </button>
              </div>
            </div>

            <!-- Controls -->
            <div class="bg-white rounded-2xl p-5 border border-surface-200 shadow-sm flex flex-wrap items-center justify-between gap-6">
               <div class="flex items-center gap-4">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Speed</span>
                  <div class="flex bg-surface-100 p-1 rounded-xl">
                    ${[0.5, 1, 1.5, 2].map(speed => `
                      <button class="speed-btn px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${speed === 1 ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}" data-speed="${speed}">${speed}x</button>
                    `).join('')}
                  </div>
                </div>
                
                <div class="flex items-center gap-4 flex-1 max-w-xs">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Volume Boost</span>
                  <input type="range" class="volume-slider flex-1 accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer" min="0" max="3" step="0.1" value="1">
                  <span class="volume-value text-xs font-mono font-bold text-surface-600 w-12 text-right">100%</span>
                </div>
            </div>
          </div>

          <!-- Metadata Sidebar -->
          <div class="lg:col-span-4 space-y-6">
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-4 py-3 bg-surface-50 border-b border-surface-200">
                <h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Properties</h3>
              </div>
              <div class="p-4">
                 <div class="overflow-hidden rounded-xl border border-surface-100">
                   <table class="min-w-full text-xs">
                     <tbody class="divide-y divide-surface-100">
                       <tr>
                         <td class="px-3 py-2.5 font-medium text-surface-400">Duration</td>
                         <td id="info-dur" class="px-3 py-2.5 text-right font-mono text-surface-800">${s.meta.duration}</td>
                       </tr>
                       <tr>
                         <td class="px-3 py-2.5 font-medium text-surface-400">Resolution</td>
                         <td id="info-res" class="px-3 py-2.5 text-right font-mono text-surface-800">${s.meta.resolution}</td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
                <h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Streams</h3>
              </div>
              <div id="stream-list" class="p-2 max-h-[400px] overflow-y-auto space-y-2">
                ${renderStreamsList(s.meta.streams)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    const video = mount.querySelector('#omni-player');
    const overlay = mount.querySelector('#error-overlay');
    const convertHint = mount.querySelector('#convert-hint-btn');

    if (video) {
      video.onloadedmetadata = () => {
        const mins = Math.floor(video.duration / 60);
        const secs = Math.floor(video.duration % 60);
        const dur = isFinite(video.duration) ? `${mins}m ${secs}s` : 'Unknown';
        const res = video.videoWidth ? `${video.videoWidth} × ${video.videoHeight}` : 'Unknown';
        
        helpers.setState({ meta: { ...helpers.getState().meta, duration: dur, resolution: res } });
        const dEl = mount.querySelector('#info-dur'), rEl = mount.querySelector('#info-res');
        if (dEl) dEl.textContent = dur;
        if (rEl) rEl.textContent = res;
      };

      video.onerror = () => {
        if (!helpers.getState().isConverted) {
          overlay.classList.remove('hidden');
          overlay.classList.add('flex');
        }
      };

      if (convertHint) {
        convertHint.onclick = () => document.getElementById('omni-action-convert')?.click();
      }

      // Speed Controls
      const speedBtns = mount.querySelectorAll('.speed-btn');
      speedBtns.forEach(btn => {
        btn.onclick = () => {
          video.playbackRate = parseFloat(btn.dataset.speed);
          speedBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600'));
          btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
        };
      });

      // Volume Boost
      const volumeSlider = mount.querySelector('.volume-slider');
      const volumeValue = mount.querySelector('.volume-value');
      if (volumeSlider) {
        volumeSlider.oninput = () => {
          const val = parseFloat(volumeSlider.value);
          volumeValue.textContent = Math.round(val * 100) + '%';
          if (val > 1) {
            if (!audioContext) {
              audioContext = new (window.AudioContext || window.webkitAudioContext)();
              const source = audioContext.createMediaElementSource(video);
              gainNode = audioContext.createGain();
              source.connect(gainNode);
              gainNode.connect(audioContext.destination);
            }
            if (gainNode) gainNode.gain.value = val;
            video.volume = 1;
          } else {
            video.volume = val;
            if (gainNode) gainNode.gain.value = 1;
          }
        };
      }
    }
  }

  function renderStreamsList(streams) {
    if (!streams || !streams.length) return '<div class="p-4 text-center text-surface-400 text-xs italic">Analyzing streams...</div>';
    return streams.map(stream => `
      <div class="p-3 rounded-xl border border-surface-100 bg-surface-50/50">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] font-bold text-brand-600 uppercase">${esc(stream.type)}</span>
          <span class="text-[10px] font-mono text-surface-400">#${esc(stream.id)}</span>
        </div>
        <div class="text-xs font-semibold text-surface-800 truncate">${esc(stream.codec)}</div>
        ${stream.details ? `<div class="text-[10px] text-surface-500 mt-1 truncate">${esc(stream.details)}</div>` : ''}
      </div>
    `).join('');
  }

  function parseStreams(log) {
    const streams = [];
    const streamRegex = /Stream #0:(\d+).*?: (Video|Audio|Subtitle): ([\w\s\(\)]+)(?:, (.*))?/;
    log.split('\n').forEach(line => {
      const match = line.match(streamRegex);
      if (match) {
        streams.push({
          id: match[1],
          type: match[2],
          codec: match[3].trim(),
          details: match[4] ? match[4].trim() : ''
        });
      }
    });
    return streams;
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
