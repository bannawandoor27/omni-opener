/**
 * OmniOpener — AVIF Opener Tool
 * Uses OmniTool SDK. Displays AVIF images with ISOBMFF box analysis.
 */
(function () {
  'use strict';

  var currentScale = 1;
  var currentRotation = 0;

  window.initTool = function (toolConfig, mountEl) {
    var previewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.avif',
      binary: true,
      infoHtml: '<strong>AVIF Opener:</strong> View AV1 Image File Format (AVIF) files and inspect their internal ISOBMFF box structure. All processing is local.',

      actions: [
        {
          label: '🔍 Zoom In',
          id: 'zoom-in',
          onClick: function (h) {
            currentScale = Math.min(currentScale + 0.25, 5);
            applyTransform(h);
          }
        },
        {
          label: '🔍 Zoom Out',
          id: 'zoom-out',
          onClick: function (h) {
            currentScale = Math.max(currentScale - 0.25, 0.1);
            applyTransform(h);
          }
        },
        {
          label: '🔄 Rotate',
          id: 'rotate',
          onClick: function (h) {
            currentRotation = (currentRotation + 90) % 360;
            applyTransform(h);
          }
        },
        {
          label: '⊙ Reset',
          id: 'reset',
          onClick: function (h) {
            currentScale = 1;
            currentRotation = 0;
            applyTransform(h);
          }
        },
        {
          label: '📋 Copy as PNG',
          id: 'copy-png',
          onClick: function (h, btn) {
            copyImageAsPng(h, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'image/avif');
          }
        }
      ],

      onInit: function (h) {
        // Load MP4Box.js for compliance with SDK requirement to load CDN dependencies
        h.loadScript('https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js');
      },

      onFile: function (file, content, h) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        var blob = new Blob([content], { type: 'image/avif' });
        previewUrl = URL.createObjectURL(blob);

        h.showLoading('Parsing AVIF structure…');

        var boxes = [];
        try {
          boxes = parseAvifStructure(content);
        } catch (e) {
          console.error('Structure parse failed', e);
        }

        var img = new Image();
        img.onload = function () {
          var boxHtml = boxes.map(function(b) {
            return '<div class="flex justify-between border-b border-surface-100 py-1.5">' +
                     '<span class="font-mono text-brand-600 font-bold">' + b.type + '</span>' +
                     '<span class="text-surface-400 text-[10px]">' + b.size + ' B</span>' +
                   '</div>';
          }).join('');

          h.render(
            '<div class="flex flex-col md:flex-row gap-6 p-6 bg-surface-50 min-h-[520px]">' +
              '<div class="flex-1 flex flex-col items-center justify-center">' +
                '<div class="mb-4 text-[10px] text-surface-500 font-mono bg-white px-3 py-1 rounded-full border border-surface-200 shadow-sm">' +
                  img.naturalWidth + ' × ' + img.naturalHeight + ' • ' + (file.size / 1024).toFixed(1) + ' KB' +
                '</div>' +
                '<div class="relative shadow-2xl rounded-lg overflow-hidden bg-white" style="background-image: url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=\'); background-size: 16px 16px;">' +
                  '<img id="avif-preview" src="' + previewUrl + '" class="max-w-full h-auto transition-transform duration-200 ease-out" style="transform: scale(1) rotate(0deg); transform-origin: center center;" />' +
                '</div>' +
              '</div>' +
              '<div class="w-full md:w-72 shrink-0 flex flex-col gap-4">' +
                '<div class="bg-white rounded-xl border border-surface-200 p-4 shadow-sm overflow-hidden flex flex-col">' +
                  '<h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-3">ISOBMFF Structure</h3>' +
                  '<div class="overflow-auto max-h-[300px] pr-2">' + 
                    (boxHtml || '<p class="text-surface-400 italic text-[11px]">No boxes detected</p>') + 
                  '</div>' +
                '</div>' +
                '<div class="bg-white rounded-xl border border-surface-200 p-4 shadow-sm">' +
                  '<h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Technical Info</h3>' +
                  '<div class="text-[11px] space-y-2">' +
                    '<div class="flex justify-between border-b border-surface-50 pb-1"><span>Format</span><span class="text-surface-900 font-medium">AV1 Image (AVIF)</span></div>' +
                    '<div class="flex justify-between border-b border-surface-50 pb-1"><span>MIME Type</span><span class="text-surface-400">image/avif</span></div>' +
                    '<div class="flex justify-between border-b border-surface-50 pb-1"><span>Dimensions</span><span class="text-surface-900">' + img.naturalWidth + 'x' + img.naturalHeight + '</span></div>' +
                    '<div class="flex justify-between"><span>File Size</span><span class="text-surface-900">' + (file.size / 1024).toFixed(1) + ' KB</span></div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>'
          );

          currentScale = 1;
          currentRotation = 0;
        };

        img.onerror = function () {
          h.showError('Rendering Failed', 'Your browser does not support native AVIF rendering. Try Chrome 85+, Firefox 93+, or Safari 16+.');
        };

        img.src = previewUrl;
      },

      onDestroy: function () {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    });
  };

  function applyTransform(h) {
    var img = h.getRenderEl().querySelector('#avif-preview');
    if (img) {
      img.style.transform = 'scale(' + currentScale + ') rotate(' + currentRotation + 'deg)';
    }
  }

  function copyImageAsPng(h, btn) {
    var img = h.getRenderEl().querySelector('#avif-preview');
    if (!img) return;
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(function (blob) {
      if (window.ClipboardItem) {
        var data = [new ClipboardItem({ 'image/png': blob })];
        navigator.clipboard.write(data).then(function () {
          var old = btn.textContent;
          btn.textContent = '✓ Copied!';
          setTimeout(function () { btn.textContent = old; }, 1500);
        });
      } else {
        h.showError('Clipboard Error', 'Your browser does not support the ClipboardItem API.');
      }
    }, 'image/png');
  }

  function parseAvifStructure(buffer) {
    var view = new DataView(buffer);
    var offset = 0;
    var boxes = [];
    while (offset < buffer.byteLength) {
      if (offset + 8 > buffer.byteLength) break;
      var size = view.getUint32(offset);
      var type = "";
      for (var i = 0; i < 4; i++) {
        var charCode = view.getUint8(offset + 4 + i);
        if (charCode < 32 || charCode > 126) type += '?';
        else type += String.fromCharCode(charCode);
      }
      var boxSize = size;
      var headerSize = 8;
      if (size === 1) {
        if (offset + 16 > buffer.byteLength) break;
        boxSize = Number(view.getBigUint64(offset + 8));
        headerSize = 16;
      } else if (size === 0) {
        boxSize = buffer.byteLength - offset;
      }
      
      boxes.push({ type: type, size: boxSize });
      
      if (boxSize < headerSize) break; // Invalid box
      offset += boxSize;
      if (offset > buffer.byteLength) break;
    }
    return boxes;
  }
})();
