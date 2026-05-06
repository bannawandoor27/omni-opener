/**
 * OmniOpener — AVIF Opener Tool
 * PRODUCTION PERFECT VERSION
 */
(function () {
  'use strict';

  /**
   * Escapes HTML to prevent XSS.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  /**
   * Formats bytes into human readable string.
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Tool state
  var currentScale = 1;
  var currentRotation = 0;
  var previewUrl = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avif',
      binary: true,
      infoHtml: '<strong>AVIF Opener:</strong> View AV1 Image File Format (AVIF) files, inspect internal ISOBMFF box structure, and convert to other formats.',

      actions: [
        {
          label: '🔍 Zoom In',
          id: 'zoom-in',
          onClick: function (h) {
            currentScale = Math.min(currentScale + 0.5, 10);
            applyTransform(h);
          }
        },
        {
          label: '🔍 Zoom Out',
          id: 'zoom-out',
          onClick: function (h) {
            currentScale = Math.max(currentScale - 0.5, 0.1);
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
          label: '📋 Copy PNG',
          id: 'copy-png',
          onClick: function (h, btn) {
            copyImageToClipboard(h, btn);
          }
        },
        {
          label: '📥 Save PNG',
          id: 'save-png',
          onClick: function (h) {
            downloadAsPng(h);
          }
        }
      ],

      onFile: function _onFile(file, content, h) {
        // B5: Revoke previous URL
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }

        // U5: Empty state handling
        if (!content || content.byteLength === 0) {
          h.render('<div class="flex flex-col items-center justify-center p-12 text-surface-400 bg-surface-50 rounded-xl border-2 border-dashed border-surface-200">' +
            '<div class="text-4xl mb-4">📭</div>' +
            '<p class="text-lg font-medium text-surface-600">Empty AVIF file</p>' +
            '<p class="text-sm">This file contains no data to display.</p>' +
            '</div>');
          return;
        }

        // U6: Immediate loading feedback
        h.showLoading('Analyzing AVIF structure...');

        var boxes = [];
        try {
          boxes = parseIsobmffBoxes(content);
        } catch (e) {
          console.warn('Box parsing failed', e);
        }

        var blob = new Blob([content], { type: 'image/avif' });
        previewUrl = URL.createObjectURL(blob);

        var img = new Image();
        img.onload = function () {
          currentScale = 1;
          currentRotation = 0;

          // U7: Format box structure as a beautiful table
          var boxRows = boxes.map(function(box) {
            return '<tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">' +
                     '<td class="px-4 py-2 font-mono font-bold text-brand-700 border-b border-surface-100">' + escapeHtml(box.type) + '</td>' +
                     '<td class="px-4 py-2 text-surface-500 border-b border-surface-100 text-right">' + formatBytes(box.size) + '</td>' +
                   '</tr>';
          }).join('');

          // U1: File info bar
          var infoBar = '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">' +
            '<span class="font-semibold text-surface-800">' + escapeHtml(file.name) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span>' + formatBytes(file.size) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span class="text-surface-500">.avif image</span>' +
            '</div>';

          h.render(
            '<div class="p-1">' +
              infoBar +
              '<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">' +
                '<!-- Preview Area -->' +
                '<div class="lg:col-span-8">' +
                  '<div class="bg-surface-100 rounded-2xl border border-surface-200 overflow-hidden flex items-center justify-center min-h-[500px] relative shadow-inner" style="background-image: conic-gradient(#fff 90deg, #f3f4f6 90deg 180deg, #fff 180deg 270deg, #f3f4f6 270deg); background-size: 24px 24px;">' +
                    '<img id="avif-preview" src="' + previewUrl + '" class="max-w-[95%] max-h-[95%] h-auto transition-transform duration-300 ease-out shadow-2xl rounded-sm" style="transform: scale(1) rotate(0deg); transform-origin: center center;" />' +
                    '<div class="absolute bottom-4 right-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium text-surface-600 border border-surface-200 shadow-sm">' +
                      img.naturalWidth + ' × ' + img.naturalHeight + ' px' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                
                '<!-- Sidebar -->' +
                '<div class="lg:col-span-4 space-y-6">' +
                  '<!-- ISOBMFF Boxes -->' +
                  '<div>' +
                    '<div class="flex items-center justify-between mb-3">' +
                      '<h3 class="font-semibold text-surface-800 text-sm uppercase tracking-wider">Internal Structure</h3>' +
                      '<span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">' + boxes.length + ' boxes</span>' +
                    '</div>' +
                    '<div class="overflow-x-auto rounded-xl border border-surface-200 max-h-[400px] overflow-y-auto bg-white shadow-sm">' +
                      '<table class="min-w-full text-xs">' +
                        '<thead>' +
                          '<tr class="bg-surface-50">' +
                            '<th class="sticky top-0 px-4 py-2.5 text-left font-semibold text-surface-700 border-b border-surface-200">Type</th>' +
                            '<th class="sticky top-0 px-4 py-2.5 text-right font-semibold text-surface-700 border-b border-surface-200">Size</th>' +
                          '</tr>' +
                        '</thead>' +
                        '<tbody>' +
                          (boxRows || '<tr><td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">No boxes detected</td></tr>') +
                        '</tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>' +
                  
                  '<!-- Technical Metadata -->' +
                  '<div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">' +
                    '<h3 class="font-semibold text-surface-800 mb-3 text-sm">Image Attributes</h3>' +
                    '<div class="space-y-3 text-sm">' +
                      '<div class="flex justify-between items-center"><span class="text-surface-500">MIME Type</span><span class="bg-surface-100 px-2 py-0.5 rounded text-surface-700 font-mono text-xs">image/avif</span></div>' +
                      '<div class="flex justify-between items-center"><span class="text-surface-500">Dimensions</span><span class="text-surface-900 font-medium">' + img.naturalWidth + ' × ' + img.naturalHeight + '</span></div>' +
                      '<div class="flex justify-between items-center"><span class="text-surface-500">Aspect Ratio</span><span class="text-surface-900">' + (img.naturalWidth / img.naturalHeight).toFixed(2) + ':1</span></div>' +
                      '<div class="pt-2 border-t border-surface-100 mt-2">' +
                        '<p class="text-[11px] text-surface-400 leading-relaxed italic">AVIF (AV1 Image File Format) utilizes the AV1 video codec technology to provide high-quality HDR image support with superior compression.</p>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>'
          );
        };

        img.onerror = function () {
          // U3: Friendly error message
          h.showError('Rendering Error', 'This AVIF file could not be displayed. It might be corrupted or your browser may not support AVIF decoding natively (Chrome 85+, Firefox 93+, Safari 16+).');
        };

        img.src = previewUrl;
      },

      onDestroy: function () {
        // B5: Revoke object URL on unmount
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        }
      }
    });
  };

  /**
   * Applies zoom and rotation to the preview image.
   */
  function applyTransform(h) {
    var img = h.getRenderEl().querySelector('#avif-preview');
    if (img) {
      img.style.transform = 'scale(' + currentScale + ') rotate(' + currentRotation + 'deg)';
    }
  }

  /**
   * B10: Downloads the current AVIF image as a PNG file.
   */
  function downloadAsPng(h) {
    var img = h.getRenderEl().querySelector('#avif-preview');
    if (!img) return;
    
    h.showLoading('Converting to PNG...');
    
    var canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    canvas.toBlob(function (blob) {
      var name = h.getFile().name.replace(/\.[^/.]+$/, "") + '.png';
      h.download(name, blob, 'image/png');
    }, 'image/png');
  }

  /**
   * Copies the image to the system clipboard as PNG.
   */
  function copyImageToClipboard(h, btn) {
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
          var oldHtml = btn.innerHTML;
          btn.innerHTML = '<span>✓ Copied!</span>';
          setTimeout(function () { btn.innerHTML = oldHtml; }, 2000);
        }).catch(function() {
          h.showError('Clipboard Denied', 'Please ensure you have given permission to access the clipboard.');
        });
      } else {
        h.showError('Not Supported', 'Copying images directly is not supported in this browser.');
      }
    }, 'image/png');
  }

  /**
   * Parses top-level ISOBMFF boxes from a buffer.
   */
  function parseIsobmffBoxes(buffer) {
    var view = new DataView(buffer);
    var offset = 0;
    var boxes = [];
    var limit = buffer.byteLength;
    
    while (offset + 8 <= limit) {
      var size = view.getUint32(offset);
      var type = "";
      for (var i = 0; i < 4; i++) {
        var c = view.getUint8(offset + 4 + i);
        // B6: Basic sanitation for type display
        type += (c >= 32 && c <= 126) ? String.fromCharCode(c) : '?';
      }
      
      var boxSize = size;
      var headerSize = 8;
      
      if (size === 1) { // 64-bit size
        if (offset + 16 > limit) break;
        boxSize = Number(view.getBigUint64(offset + 8));
        headerSize = 16;
      } else if (size === 0) { // Extends to end of file
        boxSize = limit - offset;
      }
      
      if (boxSize < headerSize) break; // Avoid infinite loops on corrupt files
      
      boxes.push({ type: type, size: boxSize });
      offset += boxSize;
      
      // B7: Safety break for unusually fragmented files
      if (boxes.length > 500) break;
    }
    return boxes;
  }
})();
