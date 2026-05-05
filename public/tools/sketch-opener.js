/**
 * OmniOpener — Sketch Opener
 * Uses OmniTool SDK and JSZip to inspect .sketch design files.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    var _previewUrl = null;
    var _previewBlob = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      infoHtml: '<strong>Sketch Opener:</strong> A browser-based viewer for .sketch files. Inspect design previews, extract embedded images, and view document metadata without uploading to any server.',

      actions: [
        {
          label: '📸 Download Preview',
          id: 'dl-preview',
          onClick: function (h) {
            if (_previewBlob) {
              h.download(h.getFile().name + '.png', _previewBlob, 'image/png');
            } else {
              alert('No preview available to download.');
            }
          }
        },
        {
          label: '🖼️ Extract Images',
          id: 'dl-images',
          onClick: function (h) {
            var content = h.getContent();
            if (!content) return;
            JSZip.loadAsync(content).then(function (zip) {
              var imgFolder = zip.folder('images');
              var count = 0;
              imgFolder.forEach(function() { count++; });
              if (count === 0) {
                alert('No embedded images found in this Sketch file.');
                return;
              }
              return imgFolder.generateAsync({ type: 'blob' }).then(function (blob) {
                h.download(h.getFile().name + '-images.zip', blob, 'application/zip');
              });
            }).catch(function (err) {
              alert('Extraction failed: ' + err.message);
            });
          }
        },
        {
          label: '📄 Metadata JSON',
          id: 'dl-meta',
          onClick: function (h) {
            var content = h.getContent();
            if (!content) return;
            JSZip.loadAsync(content).then(function (zip) {
              return zip.file('meta.json').async('string');
            }).then(function (json) {
              h.download(h.getFile().name + '.meta.json', json, 'application/json');
            }).catch(function (err) {
              alert('Could not extract metadata: ' + err.message);
            });
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onFile: function (file, content, h) {
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading Sketch engine...');
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js').then(function () {
            processSketch(file, content, h);
          });
          return;
        }
        processSketch(file, content, h);
      },

      onDestroy: function () {
        if (_previewUrl) {
          URL.revokeObjectURL(_previewUrl);
          _previewUrl = null;
        }
        _previewBlob = null;
      }
    });

    /**
     * Parse the Sketch ZIP bundle and render the preview
     */
    function processSketch(file, content, h) {
      h.showLoading('Analyzing Sketch file...');

      JSZip.loadAsync(content).then(function (zip) {
        var previewFile = zip.file('previews/preview.png');
        var metaFile = zip.file('meta.json');

        var promises = [
          previewFile ? previewFile.async('blob') : Promise.resolve(null),
          metaFile ? metaFile.async('string') : Promise.resolve('{}')
        ];

        return Promise.all(promises);
      }).then(function (results) {
        var blob = results[0];
        var metaJson = results[1];
        var meta = {};
        try { meta = JSON.parse(metaJson); } catch (e) { }

        _previewBlob = blob;
        if (_previewUrl) URL.revokeObjectURL(_previewUrl);

        var html = '<div class="p-6 md:p-10 space-y-8">';
        
        // Metadata Bar
        html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-4">';
        var stats = [
          { l: 'App Version', v: meta.appVersion || 'Unknown' },
          { l: 'Creator', v: meta.app || 'Sketch' },
          { l: 'Format', v: meta.version || 'Unknown' },
          { l: 'Pages', v: (meta.pagesAndArtboards ? Object.keys(meta.pagesAndArtboards).length : '0') }
        ];
        stats.forEach(function(s) {
          html += '<div class="bg-surface-50 p-3 rounded-lg border border-surface-100">' +
                    '<div class="text-[10px] uppercase tracking-wider text-surface-400 font-bold">' + esc(s.l) + '</div>' +
                    '<div class="text-sm font-semibold text-surface-700 truncate">' + esc(s.v) + '</div>' +
                  '</div>';
        });
        html += '</div>';

        // Preview Image
        if (blob) {
          _previewUrl = URL.createObjectURL(blob);
          html += '<div class="flex flex-col items-center gap-4">' +
                    '<div class="text-sm font-medium text-surface-500">Design Preview</div>' +
                    '<div class="shadow-xl rounded-xl border border-surface-200 bg-white overflow-hidden">' +
                      '<img src="' + _previewUrl + '" class="max-w-full h-auto block" style="max-height: 70vh;" />' +
                    '</div>' +
                  '</div>';
        } else {
          html += '<div class="py-20 text-center border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50">' +
                    '<div class="text-5xl mb-4">💎</div>' +
                    '<div class="text-lg font-bold text-surface-700">No Preview Available</div>' +
                    '<p class="text-sm text-surface-500">This file doesn\'t have a preview image saved inside it.</p>' +
                  '</div>';
        }

        html += '</div>';
        h.render(html);
      }).catch(function (err) {
        h.showError('Invalid Sketch File', 'Could not parse the Sketch bundle. ' + err.message);
      });
    }

    function esc(str) {
      if (!str) return '';
      var d = document.createElement('div');
      d.textContent = String(str);
      return d.innerHTML;
    }
  };
})();
