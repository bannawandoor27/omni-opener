/**
 * OmniOpener — Sketch Opener
 * Production-ready Sketch design file inspector.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    var _previewUrl = null;
    var _zip = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      infoHtml: '<strong>Sketch Opener:</strong> A high-performance viewer for .sketch files. Extract assets, inspect layer hierarchies, and view design previews instantly.',

      actions: [
        {
          label: '📸 Save Preview',
          id: 'dl-preview',
          onClick: function (h) {
            var file = h.getFile();
            if (!_zip) return;
            h.showLoading('Preparing preview...');
            _zip.file('previews/preview.png').async('blob').then(function (blob) {
              h.download((file.name || 'design') + '-preview.png', blob, 'image/png');
              h.showLoading(false);
            }).catch(function() {
              h.showLoading(false);
              h.showError('Export Failed', 'The preview image could not be extracted.');
            });
          }
        },
        {
          label: '🖼️ Extract Images',
          id: 'dl-images',
          onClick: function (h) {
            if (!_zip) return;
            var imgFolder = _zip.folder('images');
            var files = [];
            imgFolder.forEach(function(path) { files.push(path); });
            
            if (files.length === 0) {
              alert('No embedded images found in this Sketch file.');
              return;
            }

            h.showLoading('Zipping ' + files.length + ' images...');
            imgFolder.generateAsync({ type: 'blob' }).then(function (blob) {
              h.download((h.getFile().name || 'design') + '-images.zip', blob, 'application/zip');
              h.showLoading(false);
            }).catch(function (err) {
              h.showLoading(false);
              h.showError('Extraction failed', err.message);
            });
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onFile: function _onFile(file, content, h) {
        // B5: Revoke previous URL
        if (_previewUrl) {
          URL.revokeObjectURL(_previewUrl);
          _previewUrl = null;
        }
        _zip = null;

        // B1: Handle CDN loading
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading JSZip engine...');
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js').then(function () {
            _onFile(file, content, h);
          });
          return;
        }

        // B2: Content is ArrayBuffer (binary:true)
        if (!content || content.byteLength === 0) {
          h.showError('Empty File', 'This .sketch file contains no data.');
          return;
        }

        h.showLoading('Unpacking Sketch bundle...');

        JSZip.loadAsync(content).then(function (zip) {
          _zip = zip;
          var previewFile = zip.file('previews/preview.png');
          var metaFile = zip.file('meta.json');
          var docFile = zip.file('document.json');

          var promises = [
            previewFile ? previewFile.async('blob') : Promise.resolve(null),
            metaFile ? metaFile.async('string') : Promise.resolve('{}'),
            docFile ? docFile.async('string') : Promise.resolve('{}')
          ];

          return Promise.all(promises);
        }).then(function (results) {
          var blob = results[0];
          var meta = {};
          var doc = {};
          try { meta = JSON.parse(results[1]); } catch (e) {}
          try { doc = JSON.parse(results[2]); } catch (e) {}

          var html = '<div class="max-w-6xl mx-auto p-4 md:p-8">';

          // U1: File Info Bar
          html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">' +
                    '<span class="font-semibold text-surface-800">' + esc(file.name) + '</span>' +
                    '<span class="text-surface-300">|</span>' +
                    '<span>' + formatSize(file.size) + '</span>' +
                    '<span class="text-surface-300">|</span>' +
                    '<span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-[10px] font-bold uppercase tracking-wider">Sketch Document</span>' +
                  '</div>';

          // Summary Stats
          html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">';
          var stats = [
            { l: 'Version', v: meta.appVersion || 'Unknown' },
            { l: 'Creator', v: meta.app || 'Sketch' },
            { l: 'Format', v: 'v' + (meta.version || '?') },
            { l: 'Pages', v: (meta.pagesAndArtboards ? Object.keys(meta.pagesAndArtboards).length : '0') }
          ];
          stats.forEach(function(s) {
            html += '<div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm hover:border-brand-200 transition-all">' +
                      '<div class="text-[10px] uppercase tracking-wider text-surface-400 font-bold mb-1">' + esc(s.l) + '</div>' +
                      '<div class="text-base font-bold text-surface-800 truncate">' + esc(s.v) + '</div>' +
                    '</div>';
          });
          html += '</div>';

          html += '<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">';
          
          // Main Preview (Col 2/3)
          html += '<div class="lg:col-span-2 space-y-6">';
          if (blob) {
            _previewUrl = URL.createObjectURL(blob);
            html += '<div class="flex flex-col gap-3">' +
                      '<div class="flex items-center justify-between">' +
                        '<h3 class="font-bold text-surface-800 flex items-center gap-2">Design Preview</h3>' +
                        '<span class="text-[10px] bg-surface-100 text-surface-500 px-2 py-1 rounded uppercase font-bold tracking-tighter">PNG RENDER</span>' +
                      '</div>' +
                      '<div class="shadow-2xl rounded-2xl border border-surface-200 bg-white overflow-hidden group relative">' +
                        '<img src="' + _previewUrl + '" class="max-w-full h-auto block mx-auto" style="max-height: 80vh;" />' +
                        '<div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none"></div>' +
                      '</div>' +
                    '</div>';
          } else {
            html += '<div class="h-full flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-surface-200 rounded-3xl bg-surface-50">' +
                      '<div class="text-6xl mb-6 grayscale opacity-50">💎</div>' +
                      '<div class="text-xl font-black text-surface-800">No Embedded Preview</div>' +
                      '<p class="text-surface-500 mt-2 max-w-xs mx-auto text-sm">This Sketch file was saved without a preview image. You can still browse its structure.</p>' +
                    '</div>';
          }
          html += '</div>';

          // Sidebar: Pages & Assets
          html += '<div class="space-y-8">';
          
          // Pages Navigation
          var pages = meta.pagesAndArtboards || {};
          var pageKeys = Object.keys(pages);
          html += '<div>' +
                    '<div class="flex items-center justify-between mb-4">' +
                      '<h3 class="font-bold text-surface-800">Pages & Artboards</h3>' +
                      '<span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">' + pageKeys.length + '</span>' +
                    '</div>' +
                    '<div class="mb-3"><input type="text" id="node-filter" placeholder="Filter nodes..." class="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"></div>' +
                    '<div id="node-list" class="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">';
          
          if (pageKeys.length === 0) {
            html += '<div class="text-sm text-surface-400 italic py-4">No pages found</div>';
          } else {
            pageKeys.forEach(function(pid) {
              var p = pages[pid];
              var artboards = p.artboards ? Object.keys(p.artboards) : [];
              html += '<div class="node-item group" data-name="' + esc(p.name).toLowerCase() + '">' +
                        '<div class="flex items-center gap-2 p-2 rounded-lg bg-surface-50 border border-surface-100 group-hover:border-brand-300 transition-all cursor-default">' +
                          '<span class="text-lg">📄</span>' +
                          '<span class="text-sm font-semibold text-surface-700 truncate">' + esc(p.name) + '</span>' +
                        '</div>' +
                        '<div class="ml-6 mt-1 space-y-1">';
              artboards.forEach(function(aid) {
                var a = p.artboards[aid];
                html += '<div class="artboard-item flex items-center gap-2 p-1.5 rounded-md hover:bg-brand-50 transition-colors cursor-default" data-name="' + esc(a.name).toLowerCase() + '">' +
                          '<span class="text-xs">🔳</span>' +
                          '<span class="text-xs text-surface-600 truncate">' + esc(a.name) + '</span>' +
                        '</div>';
              });
              html += '</div></div>';
            });
          }
          html += '</div></div>';

          // Images Section
          var images = _zip.folder('images');
          var imgList = [];
          images.forEach(function(path) { imgList.push(path); });
          
          if (imgList.length > 0) {
            html += '<div>' +
                      '<div class="flex items-center justify-between mb-4">' +
                        '<h3 class="font-bold text-surface-800">Embedded Assets</h3>' +
                        '<span class="text-xs bg-surface-100 text-surface-600 px-2.5 py-1 rounded-full font-bold">' + imgList.length + '</span>' +
                      '</div>' +
                      '<div class="grid grid-cols-3 gap-2">';
            imgList.slice(0, 9).forEach(function(path) {
              html += '<div class="aspect-square bg-surface-100 rounded-lg border border-surface-200 overflow-hidden flex items-center justify-center hover:border-brand-300 transition-all group">' +
                        '<span class="text-xs text-surface-400 group-hover:text-brand-500 font-mono">IMG</span>' +
                      '</div>';
            });
            if (imgList.length > 9) {
              html += '<div class="aspect-square bg-brand-50 rounded-lg border border-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-600">+' + (imgList.length - 9) + '</div>';
            }
            html += '</div></div>';
          }

          html += '</div></div>'; // End Sidebar and Grid

          // Footer Meta
          html += '<div class="mt-12 pt-6 border-t border-surface-100 flex flex-wrap gap-4 text-[10px] text-surface-400 font-mono uppercase tracking-widest">' +
                    '<span>Commit: ' + (meta.commit || 'N/A') + '</span>' +
                    '<span>Build: ' + (meta.build || 'N/A') + '</span>' +
                    '<span>Layers: ' + (doc.layerSymbols ? Object.keys(doc.layerSymbols).length : '0') + ' Symbols</span>' +
                  '</div>';

          html += '</div>';
          h.render(html);

          // Add Search Logic
          setTimeout(function() {
            var input = document.getElementById('node-filter');
            if (input) {
              input.addEventListener('input', function(e) {
                var val = e.target.value.toLowerCase();
                document.querySelectorAll('.node-item').forEach(function(el) {
                  var pName = el.getAttribute('data-name');
                  var hasVisibleChild = false;
                  el.querySelectorAll('.artboard-item').forEach(function(a) {
                    var aName = a.getAttribute('data-name');
                    if (aName.indexOf(val) !== -1 || pName.indexOf(val) !== -1) {
                      a.style.display = 'flex';
                      hasVisibleChild = true;
                    } else {
                      a.style.display = 'none';
                    }
                  });
                  el.style.display = (pName.indexOf(val) !== -1 || hasVisibleChild) ? 'block' : 'none';
                });
              });
            }
          }, 100);

        }).catch(function (err) {
          h.showError('Parsing Failed', 'Could not open Sketch bundle: ' + err.message);
        });
      },

      onDestroy: function () {
        if (_previewUrl) {
          URL.revokeObjectURL(_previewUrl);
          _previewUrl = null;
        }
        _zip = null;
      }
    });

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      var k = 1024;
      var sizes = ['B', 'KB', 'MB', 'GB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };
})();
