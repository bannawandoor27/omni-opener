/**
 * OmniOpener — WebP Opener Tool
 * Uses OmniTool SDK. A browser-based WebP viewer and converter.
 */
(function () {
  'use strict';

  var lastPreviewUrl = null;

  function esc(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function fmtBytes(b) {
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  function cleanup() {
    if (lastPreviewUrl) {
      URL.revokeObjectURL(lastPreviewUrl);
      lastPreviewUrl = null;
    }
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.webp',
      binary: true,
      infoHtml: '<strong>WebP Opener:</strong> View, zoom, rotate, and convert WebP images. All processing is 100% local in your browser.',

      actions: [
        {
          label: '🔍+ Zoom In',
          id: 'zoom-in',
          onClick: function (h) {
            var s = h.getState();
            var newZoom = Math.min((s.zoom || 1) + 0.25, 5);
            h.setState('zoom', newZoom);
            applyTransform(h);
          }
        },
        {
          label: '🔍− Zoom Out',
          id: 'zoom-out',
          onClick: function (h) {
            var s = h.getState();
            var newZoom = Math.max((s.zoom || 1) - 0.25, 0.1);
            h.setState('zoom', newZoom);
            applyTransform(h);
          }
        },
        {
          label: '🔄 Rotate',
          id: 'rotate',
          onClick: function (h) {
            var s = h.getState();
            var newRotate = ((s.rotate || 0) + 90) % 360;
            h.setState('rotate', newRotate);
            applyTransform(h);
          }
        },
        {
          label: '⊞ Fit',
          id: 'fit',
          onClick: function (h) {
            h.setState({ zoom: 1, rotate: 0 });
            applyTransform(h);
          }
        },
        {
          label: '📋 Copy Image',
          id: 'copy-img',
          onClick: function (h, btn) {
            copyImageToClipboard(h, btn);
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            var s = h.getState();
            if (s.metadata) h.copyToClipboard(JSON.stringify(s.metadata, null, 2), btn);
            else h.copyToClipboard('No metadata found in this image.', btn);
          }
        },
        {
          label: '🖼️ Save PNG',
          id: 'save-png',
          onClick: function (h) { exportAs(h, 'image/png', 'png'); }
        },
        {
          label: '📷 Save JPG',
          id: 'save-jpg',
          onClick: function (h) { exportAs(h, 'image/jpeg', 'jpg'); }
        },
        {
          label: '📥 Original WebP',
          id: 'dl-webp',
          onClick: function (h) { h.download(h.getFile().name, h.getContent(), 'image/webp'); }
        }
      ],

      onInit: function (h) {
        cleanup();
        return h.loadScript('https://cdn.jsdelivr.net/npm/exifreader/dist/exif-reader.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Loading WebP image...');
        cleanup();

        return h.loadScript('https://cdn.jsdelivr.net/npm/exifreader/dist/exif-reader.min.js').then(function () {
          return new Promise(function (resolve, reject) {
            var blob = new Blob([content], { type: 'image/webp' });
            lastPreviewUrl = URL.createObjectURL(blob);

            var metadata = null;
            if (window.ExifReader) {
              try {
                metadata = ExifReader.load(content);
                // Flatten metadata for easier display
                for (var key in metadata) {
                  if (metadata[key] && metadata[key].description) {
                    metadata[key] = metadata[key].description;
                  }
                }
              } catch (e) { console.warn('ExifReader error:', e); }
            }

            var img = new Image();
            img.onload = function () {
              h.setState({
                previewUrl: lastPreviewUrl,
                zoom: 1,
                rotate: 0,
                width: img.width,
                height: img.height,
                metadata: metadata
              });
              renderUI(h);
              resolve();
            };
            img.onerror = function () {
              reject(new Error('The file is either corrupted or not a valid WebP image.'));
            };
            img.src = lastPreviewUrl;
          });
        });
      }
    });
  };

  function renderUI(h) {
    var s = h.getState();
    var metaHtml = '';
    
    if (s.metadata && Object.keys(s.metadata).length > 0) {
      var rows = '';
      for (var key in s.metadata) {
        if (typeof s.metadata[key] !== 'object' && s.metadata[key] !== undefined && s.metadata[key] !== null) {
          rows += '<tr class="border-b border-surface-100">' +
            '<td class="py-1.5 pr-3 text-[10px] font-bold text-surface-400 uppercase tracking-tight whitespace-nowrap align-top">' + esc(key) + '</td>' +
            '<td class="py-1.5 text-[11px] text-surface-700 break-all">' + esc(s.metadata[key]) + '</td>' +
          '</tr>';
        }
      }
      if (rows) {
        metaHtml = '<div class="mt-8 w-full border-t border-surface-100 pt-6 text-left">' +
          '<h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">Image Metadata</h3>' +
          '<div class="bg-surface-50 rounded-xl p-4 shadow-inner max-h-80 overflow-auto">' +
            '<table class="w-full border-collapse">' + rows + '</table>' +
          '</div>' +
        '</div>';
      }
    }

    h.render(
      '<div class="flex flex-col items-center p-6 md:p-10 bg-white">' +
        '<div class="flex flex-wrap justify-center gap-3 mb-8 text-[11px]">' +
          '<div class="px-3 py-1.5 bg-surface-50 border border-surface-200 rounded-lg shadow-sm text-surface-600 font-medium"><strong>File:</strong> ' + esc(h.getFile().name) + '</div>' +
          '<div class="px-3 py-1.5 bg-surface-50 border border-surface-200 rounded-lg shadow-sm text-surface-600 font-medium"><strong>Size:</strong> ' + s.width + ' × ' + s.height + ' px</div>' +
          '<div class="px-3 py-1.5 bg-surface-50 border border-surface-200 rounded-lg shadow-sm text-surface-600 font-medium"><strong>Format:</strong> WebP (' + fmtBytes(h.getFile().size) + ')</div>' +
        '</div>' +
        '<div class="relative w-full flex justify-center bg-[url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=\')] rounded-2xl shadow-xl border border-surface-200 overflow-hidden" style="min-height: 400px;">' +
          '<img id="webp-preview-img" src="' + s.previewUrl + '" ' +
            'style="display: block; max-width: 100%; height: auto; transform: scale(' + (s.zoom || 1) + ') rotate(' + (s.rotate || 0) + 'deg); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); filter: drop-shadow(0 10px 25px rgba(0,0,0,0.1));" ' +
            'class="m-auto">' +
        '</div>' +
        metaHtml +
      '</div>'
    );
  }

  function applyTransform(h) {
    var s = h.getState();
    var el = h.getRenderEl().querySelector('#webp-preview-img');
    if (el) {
      el.style.transform = 'scale(' + (s.zoom || 1) + ') rotate(' + (s.rotate || 0) + 'deg)';
    }
  }

  function copyImageToClipboard(h, btn) {
    var s = h.getState();
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(function (blob) {
        try {
          var item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]).then(function () {
            var orig = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(function () { btn.textContent = orig; }, 1500);
          }).catch(function (err) {
            console.error('Clipboard error:', err);
            h.copyToClipboard('Failed to copy image. Browser might not support it.', btn);
          });
        } catch (err) {
          console.error('Clipboard item error:', err);
          h.copyToClipboard('Failed to copy image.', btn);
        }
      }, 'image/png');
    };
    img.src = s.previewUrl;
  }

  function exportAs(h, mime, ext) {
    var s = h.getState();
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(function (blob) {
        var name = h.getFile().name.replace(/\.[^/.]+$/, "") + "." + ext;
        h.download(name, blob, mime);
      }, mime, 0.92);
    };
    img.src = s.previewUrl;
  }
})();
