/**
 * OmniOpener — APNG Viewer & Converter
 * Uses OmniTool SDK. Parses and renders Animated PNG (APNG) files frame-by-frame.
 */
(function () {
  'use strict';

  var currentFrame = 0;
  var frames = [];
  var frameInfo = [];
  var playing = false;
  var playTimeout = null;
  var canvas = null;
  var ctx = null;
  var width = 0;
  var height = 0;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.apng,.png',
      dropLabel: 'Drop an APNG file here',
      infoHtml: '<strong>How it works:</strong> This tool parses Animated PNG (APNG) files frame-by-frame using <code>UPNG.js</code>. You can inspect frames, control playback, and export frames as PNG. All processing is 100% local.',

      actions: [
        { 
          label: '▶ Play', 
          id: 'play-pause', 
          onClick: function (h, btn) { 
            togglePlay(h, btn); 
          } 
        },
        { 
          label: '⬅ Prev', 
          id: 'prev', 
          onClick: function (h) { 
            seek(h, -1); 
          } 
        },
        { 
          label: 'Next ➡', 
          id: 'next', 
          onClick: function (h) { 
            seek(h, 1); 
          } 
        },
        { 
          label: '📋 Copy Frame', 
          id: 'copy-frame', 
          onClick: function (h, btn) {
            if (canvas) {
              canvas.toBlob(function(blob) {
                try {
                  var item = new ClipboardItem({ 'image/png': blob });
                  navigator.clipboard.write([item]).then(function() {
                    var orig = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    setTimeout(function() { btn.textContent = orig; }, 1500);
                  });
                } catch (e) {
                  h.showError('Clipboard error', 'Your browser may not support copying images or clipboard access.');
                }
              }, 'image/png');
            }
          }
        },
        { 
          label: '📥 Save Frame', 
          id: 'save-frame', 
          onClick: function (h) {
            if (canvas) {
              canvas.toBlob(function(blob) {
                h.download('frame-' + (currentFrame + 1) + '.png', blob, 'image/png');
              }, 'image/png');
            }
          }
        },
      ],

      onInit: function (h) {
        if (typeof UPNG === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing APNG…');
        stopPlay();
        
        // Small delay to ensure UPNG is loaded if it was just requested
        setTimeout(function () {
          try {
            renderApng(content, h);
          } catch (err) {
            h.showError('Failed to parse APNG', err.message);
          }
        }, 100);
      },

      onDestroy: function() {
        stopPlay();
      }
    });
  };

  function renderApng(buffer, h) {
    if (typeof UPNG === 'undefined') {
      throw new Error('UPNG library not loaded. Please check your connection.');
    }

    var img = UPNG.decode(buffer);
    if (!img) throw new Error('Invalid PNG/APNG file.');

    width = img.width;
    height = img.height;
    
    try {
      frames = UPNG.toRGBA8(img);
    } catch (e) {
      throw new Error('Failed to decode frames: ' + e.message);
    }
    
    frameInfo = img.frames;
    var frameCount = frames.length;

    if (frameCount === 0) {
      throw new Error('No frames found in image.');
    }

    h.render(
      '<div class="p-6 flex flex-col items-center gap-6">' +
        '<div class="relative bg-surface-100 rounded-lg overflow-hidden border border-surface-200 shadow-inner" style="min-width: 200px; min-height: 200px;">' +
          '<canvas id="apng-canvas" class="max-w-full h-auto block mx-auto bg-[url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uAnP+PgsZaG95ACpCjGBxpAbBoMmoYBBgx8CAfAnS7IAABU7QAfSTC99wAAAABJRU5ErkJggg==\')]"></canvas>' +
        '</div>' +
        '<div class="w-full max-w-md space-y-4">' +
          '<div class="flex items-center justify-between text-sm text-surface-500 font-medium">' +
            '<span>Frame <span id="frame-num">1</span> / ' + frameCount + '</span>' +
            '<span>' + width + ' x ' + height + ' px</span>' +
          '</div>' +
          '<input type="range" id="frame-slider" min="0" max="' + (frameCount - 1) + '" value="0" class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">' +
          '<div class="grid grid-cols-2 gap-4 text-xs text-surface-400 bg-surface-50 p-3 rounded-lg border border-surface-100">' +
            '<div><strong>Total Frames:</strong> ' + frameCount + '</div>' +
            '<div><strong>Animation:</strong> ' + (frameCount > 1 ? 'Yes' : 'No') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    canvas = document.getElementById('apng-canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
    
    var slider = document.getElementById('frame-slider');
    slider.addEventListener('input', function() {
      currentFrame = parseInt(this.value);
      drawFrame(currentFrame);
    });

    currentFrame = 0;
    drawFrame(0);

    // If no animation, hide play controls
    if (frameCount <= 1) {
      var playBtn = document.getElementById('omni-action-play-pause');
      if (playBtn) playBtn.classList.add('hidden');
      var nextBtn = document.getElementById('omni-action-next');
      if (nextBtn) nextBtn.classList.add('hidden');
      var prevBtn = document.getElementById('omni-action-prev');
      if (prevBtn) prevBtn.classList.add('hidden');
      slider.classList.add('hidden');
    }
  }

  function drawFrame(idx) {
    if (!frames[idx] || !ctx) return;
    
    var rgba = new Uint8ClampedArray(frames[idx]);
    var imageData = new ImageData(rgba, width, height);
    ctx.putImageData(imageData, 0, 0);
    
    var frameNumEl = document.getElementById('frame-num');
    if (frameNumEl) frameNumEl.textContent = idx + 1;
    
    var slider = document.getElementById('frame-slider');
    if (slider) slider.value = idx;
  }

  function seek(h, delta) {
    if (frames.length === 0) return;
    currentFrame = (currentFrame + delta + frames.length) % frames.length;
    drawFrame(currentFrame);
  }

  function togglePlay(h, btn) {
    if (frames.length <= 1) return;
    if (playing) {
      stopPlay();
    } else {
      playing = true;
      btn.textContent = '⏸ Pause';
      btn.classList.add('bg-brand-50', 'border-brand-200', 'text-brand-700');
      
      var play = function() {
        if (!playing) return;
        var info = frameInfo[currentFrame] || {};
        var delay = info.delay || 100;
        
        currentFrame = (currentFrame + 1) % frames.length;
        drawFrame(currentFrame);
        playTimeout = setTimeout(play, delay);
      };
      play();
    }
  }

  function stopPlay() {
    playing = false;
    if (playTimeout) clearTimeout(playTimeout);
    var btn = document.getElementById('omni-action-play-pause');
    if (btn) {
      btn.textContent = '▶ Play';
      btn.classList.remove('bg-brand-50', 'border-brand-200', 'text-brand-700');
    }
  }

})();
