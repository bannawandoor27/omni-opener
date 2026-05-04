(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let wavesurfer = null;
    let audioUrl = null;

    function cleanup() {
      if (wavesurfer) {
        try { wavesurfer.destroy(); } catch (e) {}
        wavesurfer = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.aac,.m4a,.mp3,.wav,.ogg',
      binary: true,
      infoHtml: '<strong>AAC Opener:</strong> Private, browser-based audio player with waveform visualization. No files are uploaded to any server.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const file = h.getFile();
            if (!file) return;
            const meta = `File: ${file.name}\nSize: ${(file.size / 1024).toFixed(2)} KB\nType: ${file.type || 'audio/aac'}`;
            h.copyToClipboard(meta, btn);
          }
        },
        {
          label: '📥 Download File',
          id: 'download',
          onClick: function (h) {
            const file = h.getFile();
            const content = h.getContent();
            if (file && content) {
              h.download(file.name, content, file.type || 'audio/aac');
            }
          }
        }
      ],

      onInit: function (h) {
        return h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      },

      onFile: function onFileImpl(file, content, h) {
        cleanup();
        
        if (typeof WaveSurfer === 'undefined') {
          h.showLoading('Initializing audio engine...');
          h.loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js').then(() => {
            onFileImpl(file, content, h);
          });
          return;
        }

        const mimeType = file.name.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : (file.type || 'audio/aac');
        const blob = new Blob([content], { type: mimeType });
        audioUrl = URL.createObjectURL(blob);

        h.render(
          '<div class="p-8 space-y-8">' +
            '<div id="waveform" class="w-full bg-surface-50 rounded-2xl overflow-hidden border border-surface-200 shadow-inner" style="min-height:128px;"></div>' +
            '<div class="flex flex-col items-center gap-6">' +
              '<div class="flex items-center gap-6">' +
                '<button id="btn-play" class="w-20 h-20 flex items-center justify-center bg-brand-600 text-white rounded-full hover:bg-brand-700 transition-all shadow-xl active:scale-95 ring-4 ring-brand-50">' +
                  '<svg class="w-10 h-10 ml-1" id="play-svg" fill="currentColor" viewBox="0 0 24 24"><path id="play-icon" d="M8 5v14l11-7z"/></svg>' +
                '</button>' +
              '</div>' +
              '<div class="w-full max-w-lg grid grid-cols-1 md:grid-cols-2 gap-8 bg-surface-50 p-6 rounded-xl border border-surface-100">' +
                '<div class="space-y-3">' +
                  '<label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest px-1">Playback Speed</label>' +
                  '<div class="flex gap-1.5 bg-white p-1 rounded-lg border border-surface-200">' +
                    ['0.5', '1', '1.5', '2'].map(rate => 
                      `<button data-rate="${rate}" class="speed-btn flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${rate === '1' ? 'bg-brand-600 text-white' : 'hover:bg-surface-50 text-surface-600'}">${rate}x</button>`
                    ).join('') +
                  '</div>' +
                '</div>' +
                '<div class="space-y-3">' +
                  '<label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest px-1">Volume</label>' +
                  '<div class="flex items-center h-[38px] px-2 bg-white rounded-lg border border-surface-200">' +
                    '<input type="range" id="vol-range" min="0" max="1" step="0.01" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>'
        );

        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          waveColor: '#818cf8',
          progressColor: '#4f46e5',
          cursorColor: '#4f46e5',
          barWidth: 3,
          barRadius: 4,
          responsive: true,
          height: 128,
          url: audioUrl
        });

        const playBtn = document.getElementById('btn-play');
        const playIcon = document.getElementById('play-icon');
        const playSvg = document.getElementById('play-svg');
        
        playBtn.onclick = () => wavesurfer.playPause();
        
        wavesurfer.on('play', () => {
          playIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
          playSvg.classList.remove('ml-1');
        });
        
        wavesurfer.on('pause', () => {
          playIcon.setAttribute('d', 'M8 5v14l11-7z');
          playSvg.classList.add('ml-1');
        });

        document.querySelectorAll('.speed-btn').forEach(btn => {
          btn.onclick = () => {
            const rate = parseFloat(btn.dataset.rate);
            wavesurfer.setPlaybackRate(rate);
            document.querySelectorAll('.speed-btn').forEach(b => {
              b.classList.remove('bg-brand-600', 'text-white');
              b.classList.add('hover:bg-surface-50', 'text-surface-600');
            });
            btn.classList.add('bg-brand-600', 'text-white');
            btn.classList.remove('hover:bg-surface-50', 'text-surface-600');
          };
        });

        const volRange = document.getElementById('vol-range');
        volRange.oninput = (e) => {
          wavesurfer.setVolume(parseFloat(e.target.value));
        };

        wavesurfer.on('ready', () => {
          h.hideLoading();
        });

        wavesurfer.on('error', (e) => {
          h.showError('Playback Error', e.message || 'Failed to decode audio file.');
        });
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
