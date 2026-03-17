/**
 * OmniOpener — GIF Opener Tool
 * Uses OmniTool SDK. Parses and renders GIF files frame-by-frame.
 */
(function () {
  'use strict';

  var currentFrame = 0;
  var frames = [];
  var playing = false;
  var playInterval = null;
  var gifReader = null;
  var canvas = null;
  var ctx = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.gif',
      dropLabel: 'Drop a GIF here',
      infoHtml: '<strong>How it works:</strong> This tool parses GIF files frame-by-frame using <code>omggif</code>. You can inspect frames, play/pause, and export individual frames as PNG. All processing is 100% local.',

      actions: [
        { label: '▶ Play', id: 'play-pause', onClick: function (h, btn) { togglePlay(h, btn); } },
        { label: '⬅ Prev', id: 'prev', onClick: function (h) { seek(h, -1); } },
        { label: 'Next ➡', id: 'next', onClick: function (h) { seek(h, 1); } },
        { label: '📋 Copy Frame', id: 'copy-frame', onClick: function (h, btn) {
          if (canvas) {
            canvas.toBlob(function(blob) {
              var item = new ClipboardItem({ 'image/png': blob });
              navigator.clipboard.write([item]).then(function() {
                var orig = btn.textContent;
                btn.textContent = '✓ Copied!';
                setTimeout(function() { btn.textContent = orig; }, 1500);
              });
            });
          }
        }},
        { label: '📥 Save Frame', id: 'save-frame', onClick: function (h) {
          if (canvas) h.download('frame-' + currentFrame + '.png', dataURLToBlob(canvas.toDataURL('image/png')), 'image/png');
        }},
      ],

      onInit: function (h) {
        if (typeof GifReader === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing GIF…');
        stopPlay();
        
        // Small delay to ensure omggif is loaded
        setTimeout(function () {
          try {
            renderGif(content, h);
          } catch (err) {
            h.showError('Failed to parse GIF', err.message);
          }
        }, 100);
      }
    });
  };

  function renderGif(buffer, h) {
    var uint8 = new Uint8Array(buffer);
    gifReader = new GifReader(uint8);
    
    var width = gifReader.width;
    var height = gifReader.height;
    var frameCount = gifReader.numFrames();
    
    frames = [];
    for (var i = 0; i < frameCount; i++) {
      var frameInfo = gifReader.frameInfo(i);
      frames.push(frameInfo);
    }

    h.render(
      '<div class="p-6 flex flex-col items-center gap-6">' +
        '<div class="relative bg-surface-100 rounded-lg overflow-hidden border border-surface-200 shadow-inner" style="min-width: 200px; min-height: 200px;">' +
          '<canvas id="gif-canvas" class="max-w-full h-auto block mx-auto"></canvas>' +
        '</div>' +
        '<div class="w-full max-w-md space-y-4">' +
          '<div class="flex items-center justify-between text-sm text-surface-500 font-medium">' +
            '<span>Frame <span id="frame-num">1</span> / ' + frameCount + '</span>' +
            '<span>' + width + ' x ' + height + ' px</span>' +
          '</div>' +
          '<input type="range" id="frame-slider" min="0" max="' + (frameCount - 1) + '" value="0" class="w-full h-2 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">' +
          '<div class="grid grid-cols-2 gap-4 text-xs text-surface-400 bg-surface-50 p-3 rounded-lg border border-surface-100">' +
            '<div><strong>Loop count:</strong> ' + (gifReader.loopCount() === 0 ? 'Infinite' : gifReader.loopCount()) + '</div>' +
            '<div><strong>Frames:</strong> ' + frameCount + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    canvas = document.getElementById('gif-canvas');
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
  }

  function drawFrame(idx) {
    if (!gifReader || !ctx) return;
    
    // For GIFs, we often need to composite frames. 
    // omggif provides decodeAndBlitFrame for this.
    var frameData = new Uint8ClampedArray(gifReader.width * gifReader.height * 4);
    
    // Simple implementation: clear and draw. 
    // Note: Complex GIFs with "disposal method" might need sequential rendering.
    // To handle disposal methods correctly, we should ideally cache previous frames.
    // For this tool, we'll do a simple direct render.
    gifReader.decodeAndBlitFrameRGBA(idx, frameData);
    
    var imageData = new ImageData(frameData, gifReader.width, gifReader.height);
    ctx.putImageData(imageData, 0, 0);
    
    document.getElementById('frame-num').textContent = idx + 1;
    document.getElementById('frame-slider').value = idx;
  }

  function seek(h, delta) {
    if (!gifReader) return;
    var count = gifReader.numFrames();
    currentFrame = (currentFrame + delta + count) % count;
    drawFrame(currentFrame);
  }

  function togglePlay(h, btn) {
    if (!gifReader) return;
    if (playing) {
      stopPlay();
      btn.textContent = '▶ Play';
    } else {
      playing = true;
      btn.textContent = '⏸ Pause';
      btn.classList.add('bg-brand-50', 'border-brand-200');
      
      var play = function() {
        if (!playing) return;
        var info = gifReader.frameInfo(currentFrame);
        var delay = info.delay * 10 || 100; // delay is in 100ths of a second
        
        currentFrame = (currentFrame + 1) % gifReader.numFrames();
        drawFrame(currentFrame);
        playInterval = setTimeout(play, delay);
      };
      play();
    }
  }

  function stopPlay() {
    playing = false;
    if (playInterval) clearTimeout(playInterval);
    var btn = document.getElementById('omni-action-play-pause');
    if (btn) {
      btn.textContent = '▶ Play';
      btn.classList.remove('bg-brand-50', 'border-brand-200');
    }
  }

  function dataURLToBlob(dataURL) {
    var parts = dataURL.split(';base64,');
    var contentType = parts[0].split(':')[1];
    var raw = window.atob(parts[1]);
    var rawLength = raw.length;
    var uInt8Array = new Uint8Array(rawLength);
    for (var i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    return new Blob([uInt8Array], { type: contentType });
  }

})();
