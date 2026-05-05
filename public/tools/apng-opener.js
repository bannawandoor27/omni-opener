/**
 * OmniOpener — APNG Viewer & Converter
 * Production Perfect Rewrite
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _playing = false;
    let _playTimeout = null;
    let _frames = [];
    let _frameInfo = [];
    let _currentFrame = 0;
    let _width = 0;
    let _height = 0;
    let _canvas = null;
    let _ctx = null;
    let _isUpngLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.apng,.png',
      dropLabel: 'Drop an APNG file here',
      infoHtml: '<strong>How it works:</strong> This tool parses Animated PNG (APNG) files frame-by-frame. You can inspect frames, control playback, and export individual frames as PNG. All processing happens in your browser.',

      actions: [
        {
          label: '▶ Play',
          id: 'play-pause',
          onClick: function (h, btn) {
            _togglePlay(h, btn);
          }
        },
        {
          label: '📋 Copy Frame',
          id: 'copy-frame',
          onClick: function (h, btn) {
            if (!_canvas) return;
            _canvas.toBlob(function (blob) {
              try {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(function () {
                  const orig = btn.textContent;
                  btn.textContent = '✓ Copied!';
                  setTimeout(function () { btn.textContent = orig; }, 1500);
                });
              } catch (e) {
                h.showError('Clipboard error', 'Your browser may not support copying images or clipboard access.');
              }
            }, 'image/png');
          }
        },
        {
          label: '📥 Save Frame',
          id: 'save-frame',
          onClick: function (h) {
            if (!_canvas) return;
            _canvas.toBlob(function (blob) {
              h.download(`frame-${_currentFrame + 1}.png`, blob, 'image/png');
            }, 'image/png');
          }
        }
      ],

      onInit: function (h) {
        if (typeof UPNG === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.min.js', function() {
            _isUpngLoaded = true;
          });
        } else {
          _isUpngLoaded = true;
        }
      },

      onFile: function _onFile(file, content, h) {
        _stopPlay();
        h.showLoading('Parsing APNG animation...');

        const processFile = function _process() {
          if (!_isUpngLoaded && typeof UPNG === 'undefined') {
            setTimeout(_process, 100);
            return;
          }
          
          try {
            const img = UPNG.decode(content);
            if (!img) throw new Error('Could not decode PNG data.');

            _width = img.width;
            _height = img.height;
            _frames = UPNG.toRGBA8(img);
            _frameInfo = img.frames;
            
            if (!_frames || _frames.length === 0) {
              throw new Error('No frames found in this image.');
            }

            _renderUI(file, h);
            _drawFrame(0);
          } catch (err) {
            h.showError('Could not open APNG file', err.message || 'The file may be corrupted or is not a valid APNG.');
          }
        };

        processFile();
      },

      onDestroy: function () {
        _stopPlay();
      }
    });

    function _renderUI(file, h) {
      const frameCount = _frames.length;
      const sizeStr = (file.size / 1024).toFixed(1) + ' KB';
      
      let html = `
        <div class="p-6 max-w-5xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${h.escape(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${sizeStr}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${frameCount > 1 ? 'Animated PNG' : 'Static PNG'}</span>
            ${frameCount > 1 ? `<span class="text-surface-300">|</span><span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${frameCount} frames</span>` : ''}
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <!-- Left Column: Player -->
            <div class="lg:col-span-2 space-y-6">
              <div class="relative bg-surface-100 rounded-2xl overflow-hidden border border-surface-200 shadow-inner flex items-center justify-center p-4 min-h-[400px]">
                <!-- Checkerboard pattern for transparency -->
                <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(#000 10%, transparent 10%), radial-gradient(#000 10%, transparent 10%); background-position: 0 0, 10px 10px; background-size: 20px 20px;"></div>
                <canvas id="apng-canvas" class="relative z-10 max-w-full max-h-[600px] object-contain shadow-lg"></canvas>
              </div>

              ${frameCount > 1 ? `
                <div class="bg-white p-4 rounded-xl border border-surface-200 space-y-4 shadow-sm">
                  <div class="flex items-center justify-between px-1">
                    <span class="text-sm font-medium text-surface-700">Frame <span id="frame-counter" class="text-brand-600">1</span> of ${frameCount}</span>
                    <span class="text-xs text-surface-400 font-mono">${_width} × ${_height} px</span>
                  </div>
                  <input type="range" id="frame-slider" min="0" max="${frameCount - 1}" value="0" 
                    class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                  <div class="flex justify-between gap-2">
                    <button id="btn-prev" class="flex-1 py-2 px-4 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-lg text-sm font-medium transition-colors border border-surface-200">Previous</button>
                    <button id="btn-next" class="flex-1 py-2 px-4 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-lg text-sm font-medium transition-colors border border-surface-200">Next</button>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Right Column: Metadata & Frames -->
            <div class="space-y-6">
              <!-- U10: Section Header -->
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800 text-lg">Animation Data</h3>
              </div>
              
              <div class="rounded-xl border border-surface-200 overflow-hidden text-sm">
                <table class="min-w-full">
                  <tbody class="divide-y divide-surface-100">
                    <tr class="hover:bg-surface-50 transition-colors">
                      <td class="px-4 py-3 font-medium text-surface-500 bg-surface-50/50 w-1/3">Resolution</td>
                      <td class="px-4 py-3 text-surface-700 font-mono">${_width} × ${_height}</td>
                    </tr>
                    <tr class="hover:bg-surface-50 transition-colors">
                      <td class="px-4 py-3 font-medium text-surface-500 bg-surface-50/50">Total Frames</td>
                      <td class="px-4 py-3 text-surface-700 font-mono">${frameCount}</td>
                    </tr>
                    <tr class="hover:bg-surface-50 transition-colors">
                      <td class="px-4 py-3 font-medium text-surface-500 bg-surface-50/50">Loop Count</td>
                      <td class="px-4 py-3 text-surface-700 font-mono">${_frameInfo && _frameInfo[0] ? (_frameInfo[0].loop || 'Infinite') : 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="flex items-center justify-between mt-8 mb-3">
                <h3 class="font-semibold text-surface-800">Frame Sequence</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${frameCount} items</span>
              </div>

              <div class="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto p-1 pr-2 custom-scrollbar" id="frame-grid">
                <!-- Frame thumbnails injected here -->
              </div>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      _canvas = document.getElementById('apng-canvas');
      _canvas.width = _width;
      _canvas.height = _height;
      _ctx = _canvas.getContext('2d');

      if (frameCount > 1) {
        const slider = document.getElementById('frame-slider');
        slider.addEventListener('input', function () {
          _stopPlay();
          _currentFrame = parseInt(this.value);
          _drawFrame(_currentFrame);
        });

        document.getElementById('btn-prev').addEventListener('click', () => {
          _stopPlay();
          _currentFrame = (_currentFrame - 1 + frameCount) % frameCount;
          _drawFrame(_currentFrame);
        });

        document.getElementById('btn-next').addEventListener('click', () => {
          _stopPlay();
          _currentFrame = (_currentFrame + 1) % frameCount;
          _drawFrame(_currentFrame);
        });

        _renderThumbnails(h);
      } else {
        // Hide animation actions if static
        ['play-pause'].forEach(id => {
          const btn = document.getElementById('omni-action-' + id);
          if (btn) btn.style.display = 'none';
        });
      }
    }

    function _renderThumbnails(h) {
      const grid = document.getElementById('frame-grid');
      if (!grid) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = _width;
      tempCanvas.height = _height;
      const tCtx = tempCanvas.getContext('2d');

      _frames.forEach((frame, idx) => {
        const rgba = new Uint8ClampedArray(frame);
        const imageData = new ImageData(rgba, _width, _height);
        tCtx.putImageData(imageData, 0, 0);

        const thumb = document.createElement('div');
        thumb.className = `cursor-pointer rounded-lg border-2 transition-all overflow-hidden bg-surface-50 hover:scale-105 ${idx === 0 ? 'border-brand-500' : 'border-transparent'}`;
        thumb.dataset.idx = idx;
        thumb.innerHTML = `<img src="${tempCanvas.toDataURL('image/png')}" class="w-full h-auto block" alt="Frame ${idx + 1}">`;
        
        thumb.onclick = function() {
          _stopPlay();
          _currentFrame = idx;
          _drawFrame(idx);
          
          // Update thumbnail selection
          grid.querySelectorAll('div').forEach(el => el.classList.replace('border-brand-500', 'border-transparent'));
          thumb.classList.replace('border-transparent', 'border-brand-500');
        };
        
        grid.appendChild(thumb);
      });
    }

    function _drawFrame(idx) {
      if (!_frames[idx] || !_ctx) return;

      const rgba = new Uint8ClampedArray(_frames[idx]);
      const imageData = new ImageData(rgba, _width, _height);
      _ctx.putImageData(imageData, 0, 0);

      _currentFrame = idx;
      
      const counter = document.getElementById('frame-counter');
      if (counter) counter.textContent = idx + 1;

      const slider = document.getElementById('frame-slider');
      if (slider) slider.value = idx;

      // Update grid selection if not triggered by grid itself
      const grid = document.getElementById('frame-grid');
      if (grid) {
        grid.querySelectorAll('div').forEach((el, i) => {
          if (i === idx) {
            el.classList.replace('border-transparent', 'border-brand-500');
            if (!_playing) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else {
            el.classList.replace('border-brand-500', 'border-transparent');
          }
        });
      }
    }

    function _togglePlay(h, btn) {
      if (_frames.length <= 1) return;
      if (_playing) {
        _stopPlay();
      } else {
        _playing = true;
        btn.innerHTML = '<span class="flex items-center gap-2">⏸ Pause</span>';
        btn.classList.add('bg-brand-50', 'border-brand-200', 'text-brand-700');

        const play = function () {
          if (!_playing) return;
          const info = _frameInfo[_currentFrame] || {};
          const delay = info.delay || 100;

          _currentFrame = (_currentFrame + 1) % _frames.length;
          _drawFrame(_currentFrame);
          _playTimeout = setTimeout(play, delay);
        };
        play();
      }
    }

    function _stopPlay() {
      _playing = false;
      if (_playTimeout) clearTimeout(_playTimeout);
      const btn = document.getElementById('omni-action-play-pause');
      if (btn) {
        btn.innerHTML = '<span class="flex items-center gap-2">▶ Play</span>';
        btn.classList.remove('bg-brand-50', 'border-brand-200', 'text-brand-700');
      }
    }
  };
})();
