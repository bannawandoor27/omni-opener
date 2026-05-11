/**
 * OmniOpener — WebP Opener Tool
 * Senior Staff Engineer Edition - Production Perfect
 */
(function () {
  'use strict';

  // Closure variables to avoid global pollution
  var _lastPreviewUrl = null;
  var _exifLoaded = false;

  /**
   * Safe HTML escaping
   */
  function esc(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  /**
   * Human readable file size
   */
  function fmtBytes(b) {
    if (!b || isNaN(b)) return '0 B';
    var i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) * 1 + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  }

  /**
   * Memory management: Clean up object URLs
   */
  function cleanup() {
    if (_lastPreviewUrl) {
      URL.revokeObjectURL(_lastPreviewUrl);
      _lastPreviewUrl = null;
    }
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.webp',
      binary: true,
      infoHtml: '<strong>WebP Professional:</strong> Advanced browser-native viewer and converter. Extract EXIF metadata and export to standard formats instantly.',

      actions: [
        {
          label: '🔍+',
          id: 'zoom-in',
          title: 'Zoom In',
          onClick: function (h) {
            var s = h.getState();
            var newZoom = Math.min((s.zoom || 1) + 0.25, 4);
            h.setState('zoom', newZoom);
            _updateTransform(h);
          }
        },
        {
          label: '🔍−',
          id: 'zoom-out',
          title: 'Zoom Out',
          onClick: function (h) {
            var s = h.getState();
            var newZoom = Math.max((s.zoom || 1) - 0.25, 0.1);
            h.setState('zoom', newZoom);
            _updateTransform(h);
          }
        },
        {
          label: '🔄 Rotate',
          id: 'rotate',
          onClick: function (h) {
            var s = h.getState();
            var newRotate = ((s.rotate || 0) + 90) % 360;
            h.setState('rotate', newRotate);
            _updateTransform(h);
          }
        },
        {
          label: '📋 Copy',
          id: 'copy-img',
          onClick: function (h, btn) {
            _copyImageToClipboard(h, btn);
          }
        },
        {
          label: '🖼️ PNG',
          id: 'save-png',
          onClick: function (h) { _exportAs(h, 'image/png', 'png'); }
        },
        {
          label: '📷 JPG',
          id: 'save-jpg',
          onClick: function (h) { _exportAs(h, 'image/jpeg', 'jpg'); }
        }
      ],

      onInit: function (h) {
        cleanup();
        return h.loadScript('https://cdn.jsdelivr.net/npm/exifreader/dist/exif-reader.min.js')
          .then(function() { _exifLoaded = true; });
      },

      onDestroy: function () {
        cleanup();
      },

      onFile: function _onFile(file, content, h) {
        h.showLoading('Optimizing WebP preview...');
        cleanup();

        // Ensure library is ready (B1/B4)
        var p = _exifLoaded 
          ? Promise.resolve() 
          : h.loadScript('https://cdn.jsdelivr.net/npm/exifreader/dist/exif-reader.min.js').then(function() { _exifLoaded = true; });

        return p.then(function () {
          return new Promise(function (resolve, reject) {
            var blob = new Blob([content], { type: 'image/webp' });
            _lastPreviewUrl = URL.createObjectURL(blob);

            var metadata = null;
            if (window.ExifReader) {
              try {
                // ExifReader expects ArrayBuffer or Uint8Array
                metadata = window.ExifReader.load(content);
                // Clean up metadata object for display
                var cleanMeta = {};
                for (var key in metadata) {
                  if (metadata[key] && metadata[key].description !== undefined) {
                    cleanMeta[key] = metadata[key].description;
                  }
                }
                metadata = Object.keys(cleanMeta).length > 0 ? cleanMeta : null;
              } catch (e) {
                console.warn('ExifReader failed:', e);
              }
            }

            var img = new Image();
            img.onload = function () {
              h.setState({
                previewUrl: _lastPreviewUrl,
                zoom: 1,
                rotate: 0,
                width: img.width,
                height: img.height,
                metadata: metadata,
                fileName: file.name,
                fileSize: file.size
              });
              _renderUI(h);
              resolve();
            };
            img.onerror = function () {
              h.showError('Invalid WebP File', 'This file could not be decoded as a WebP image. It might be corrupted or an unsupported animation format.');
              reject(new Error('WebP decode failed'));
            };
            img.src = _lastPreviewUrl;
          });
        });
      }
    });
  };

  /**
   * Main Render Logic
   */
  function _renderUI(h) {
    var s = h.getState();
    if (!s.previewUrl) return;

    var fileInfo = 
      '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">' +
        '<span class="font-semibold text-surface-800">' + esc(s.fileName) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span>' + fmtBytes(s.fileSize) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span class="text-surface-500">' + s.width + ' × ' + s.height + ' px</span>' +
        '<span class="ml-auto bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">WebP</span>' +
      '</div>';

    var metaHtml = '';
    if (s.metadata) {
      var rows = '';
      Object.keys(s.metadata).sort().forEach(function(key) {
        var val = s.metadata[key];
        if (typeof val === 'string' || typeof val === 'number') {
          rows += '<tr class="even:bg-surface-50/50 hover:bg-brand-50/30 transition-colors">' +
            '<td class="px-4 py-2 font-mono text-[11px] text-surface-400 border-b border-surface-100 w-1/3">' + esc(key) + '</td>' +
            '<td class="px-4 py-2 text-surface-700 border-b border-surface-100">' + esc(val) + '</td>' +
          '</tr>';
        }
      });

      if (rows) {
        metaHtml = 
          '<div class="mt-10 w-full max-w-4xl">' +
            '<div class="flex items-center justify-between mb-3">' +
              '<h3 class="font-semibold text-surface-800 flex items-center gap-2">' +
                '<svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' +
                'Image Metadata' +
              '</h3>' +
              '<span class="text-[10px] bg-surface-100 text-surface-500 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">EXIF Data</span>' +
            '</div>' +
            '<div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm">' +
              '<div class="max-h-80 overflow-y-auto bg-white">' +
                '<table class="min-w-full text-sm">' +
                  '<thead><tr class="bg-surface-50"><th class="px-4 py-2 text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Property</th><th class="px-4 py-2 text-left text-[10px] font-bold text-surface-400 uppercase tracking-wider border-b border-surface-200">Value</th></tr></thead>' +
                  '<tbody>' + rows + '</tbody>' +
                '</table>' +
              '</div>' +
            '</div>' +
          '</div>';
      }
    }

    h.render(
      '<div class="flex flex-col items-center p-4 md:p-8 min-h-[500px]">' +
        fileInfo +
        '<div class="group relative w-full flex justify-center p-8 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 overflow-hidden transition-colors hover:border-surface-300 min-h-[400px]" style="background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 20px 20px;">' +
          '<div class="absolute inset-0 bg-white/40 backdrop-blur-[1px] pointer-events-none"></div>' +
          '<div id="webp-stage" class="relative z-10 flex items-center justify-center transition-transform duration-300 ease-out" style="transform: scale(' + (s.zoom || 1) + ') rotate(' + (s.rotate || 0) + 'deg);">' +
            '<img id="webp-preview-img" src="' + s.previewUrl + '" ' +
              'class="max-w-full h-auto shadow-2xl rounded-sm ring-1 ring-black/5" ' +
              'style="display: block; image-rendering: -webkit-optimize-contrast;">' +
          '</div>' +
        '</div>' +
        metaHtml +
      '</div>'
    );
  }

  /**
   * Fast transform update without full re-render
   */
  function _updateTransform(h) {
    var s = h.getState();
    var el = h.getRenderEl().querySelector('#webp-stage');
    if (el) {
      el.style.transform = 'scale(' + (s.zoom || 1) + ') rotate(' + (s.rotate || 0) + 'deg)';
    }
  }

  /**
   * Copy to clipboard (B10 compliance)
   */
  function _copyImageToClipboard(h, btn) {
    var s = h.getState();
    if (!s.previewUrl) return;

    h.showLoading('Preparing image copy...');
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
            btn.textContent = '✓ Copied';
            btn.classList.add('bg-green-100', 'text-green-700');
            setTimeout(function () { 
              btn.textContent = orig;
              btn.classList.remove('bg-green-100', 'text-green-700');
            }, 2000);
            h.showLoading(false);
          }).catch(function (err) {
            console.error('Clipboard error:', err);
            h.copyToClipboard('Failed to copy. Browser might not support image clipboard.', btn);
            h.showLoading(false);
          });
        } catch (err) {
          h.showError('Clipboard Not Supported', 'Your browser does not support copying images directly. Use "Download PNG" instead.');
          h.showLoading(false);
        }
      }, 'image/png');
    };
    img.src = s.previewUrl;
  }

  /**
   * Export to PNG/JPG (B10 compliance)
   */
  function _exportAs(h, mime, ext) {
    var s = h.getState();
    if (!s.previewUrl) return;

    h.showLoading('Converting to ' + ext.toUpperCase() + '...');
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      
      // Handle JPEG transparency (make white background)
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(function (blob) {
        var baseName = s.fileName.replace(/\.[^/.]+$/, "");
        h.download(baseName + "." + ext, blob, mime);
        h.showLoading(false);
      }, mime, 0.92);
    };
    img.src = s.previewUrl;
  }

})();
