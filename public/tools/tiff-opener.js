(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.tif,.tiff',
      binary: true,
      dropLabel: 'Drop a TIFF file here',
      infoHtml: '<strong>Privacy:</strong> This tool uses UTIF.js to decode TIFF images directly in your browser. Your files are never uploaded to any server.',

      actions: [
        {
          label: '📋 Copy PNG',
          id: 'copy-png',
          onClick: function (h, btn) {
            var canvas = h.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            canvas.toBlob(function (blob) {
              try {
                var data = [new ClipboardItem({ 'image/png': blob })];
                navigator.clipboard.write(data).then(function () {
                  var orig = btn.textContent;
                  btn.textContent = '✓ Copied!';
                  setTimeout(function () { btn.textContent = orig; }, 1500);
                });
              } catch (err) {
                alert('Copying images is not supported in this browser.');
              }
            });
          }
        },
        {
          label: '📥 Download PNG',
          id: 'download-png',
          onClick: function (h) {
            var canvas = h.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            canvas.toBlob(function (blob) {
              h.download('converted.png', blob, 'image/png');
            });
          }
        }
      ],

      onInit: function (h) {
        if (typeof UTIF === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Decoding TIFF image...');

        // Small delay to ensure UI updates and UTIF is loaded
        setTimeout(function () {
          try {
            var ifds = UTIF.decode(content);
            if (!ifds || ifds.length === 0) {
              throw new Error('No image data found in TIFF file.');
            }

            // Decode the first page
            UTIF.decodeImage(content, ifds[0]);
            var rgba = UTIF.toRGBA8(ifds[0]);

            var width = ifds[0].width;
            var height = ifds[0].height;

            // Prepare canvas
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.className = 'max-w-full h-auto mx-auto shadow-md rounded-lg bg-white';

            var ctx = canvas.getContext('2d');
            var imgData = ctx.createImageData(Math.floor(width), Math.floor(height));
            imgData.data.set(rgba);
            ctx.putImageData(imgData, 0, 0);

            // Render UI
            h.render('<div class="p-6 flex flex-col items-center gap-4" id="tiff-container"></div>');
            var container = h.getRenderEl().querySelector('#tiff-container');
            container.appendChild(canvas);

            // Metadata footer
            var meta = document.createElement('div');
            meta.className = 'text-xs text-surface-400 font-mono bg-surface-50 px-3 py-1.5 rounded-full';
            meta.textContent = width + 'x' + height + ' | ' + ifds.length + ' page(s) | ' + (file.size / 1024).toFixed(1) + ' KB';
            container.appendChild(meta);

          } catch (err) {
            h.showError('Failed to decode TIFF', err.message);
            console.error(err);
          }
        }, 50);
      }
    });
  };
})();
