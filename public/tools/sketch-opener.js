/**
 * OmniOpener — Sketch Opener
 * Production-perfect Sketch design file inspector.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    var _zip = null;
    var _previewUrl = null;
    var _meta = null;
    var _doc = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      infoHtml: '<strong>Sketch Opener:</strong> Professional inspector for .sketch files. Preview designs, browse artboards, and extract assets without opening Sketch.',

      actions: [
        {
          label: '📸 Save Preview',
          id: 'dl-preview',
          onClick: function (h) {
            if (!_zip) return;
            var file = h.getFile();
            h.showLoading('Preparing high-res preview...');
            
            var previewFile = _zip.file('previews/preview.png');
            if (!previewFile) {
              h.showLoading(false);
              h.showError('No Preview', 'This Sketch file was saved without a preview image.');
              return;
            }

            previewFile.async('blob').then(function (blob) {
              h.download((file.name || 'design').replace(/\.sketch$/i, '') + '-preview.png', blob, 'image/png');
              h.showLoading(false);
            }).catch(function (err) {
              h.showLoading(false);
              h.showError('Export Failed', 'The preview image could not be extracted: ' + err.message);
            });
          }
        },
        {
          label: '🖼️ Extract Assets',
          id: 'dl-images',
          onClick: function (h) {
            if (!_zip) return;
            var imgFolder = _zip.folder('images');
            var files = [];
            imgFolder.forEach(function(path) { files.push(path); });
            
            if (files.length === 0) {
              h.showError('No Assets', 'No embedded bitmap images were found in this Sketch file.');
              return;
            }

            h.showLoading('Packaging ' + files.length + ' assets...');
            imgFolder.generateAsync({ type: 'blob' }).then(function (blob) {
              h.download((h.getFile().name || 'design').replace(/\.sketch$/i, '') + '-assets.zip', blob, 'application/zip');
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

      onFile: function _onFileFn(file, content, h) {
        // B5: Revoke previous URL
        if (_previewUrl) {
          URL.revokeObjectURL(_previewUrl);
          _previewUrl = null;
        }
        _zip = null;
        _meta = null;
        _doc = null;

        // B1: Handle CDN loading
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading JSZip engine...');
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js').then(function () {
            _onFileFn(file, content, h);
          });
          return;
        }

        // B2: Content is ArrayBuffer (binary:true)
        if (!content || content.byteLength === 0) {
          h.showError('Empty File', 'This .sketch file contains no data.');
          return;
        }

        h.showLoading('Decompressing Sketch bundle...');

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
          try { _meta = JSON.parse(results[1]); } catch (e) { _meta = {}; }
          try { _doc = JSON.parse(results[2]); } catch (e) { _doc = {}; }

          var pages = _meta.pagesAndArtboards || {};
          var pageKeys = Object.keys(pages);
          var totalArtboards = 0;
          pageKeys.forEach(function(k) {
            totalArtboards += Object.keys(pages[k].artboards || {}).length;
          });

          var html = '<div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">';

          // U1: File Info Bar
          html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">' +
                    '<span class="font-bold text-surface-900 flex items-center gap-2">💎 ' + esc(file.name) + '</span>' +
                    '<span class="text-surface-300">|</span>' +
                    '<span>' + formatSize(file.size) + '</span>' +
                    '<span class="text-surface-300">|</span>' +
                    '<span class="text-surface-500 font-medium">' + esc(_meta.appVersion || 'Unknown') + '</span>' +
                    '<div class="ml-auto flex gap-2">' +
                      '<span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-wider">Sketch Format</span>' +
                    '</div>' +
                  '</div>';

          // Summary Grid
          html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">';
          var stats = [
            { l: 'Pages', v: pageKeys.length, i: '📄' },
            { l: 'Artboards', v: totalArtboards, i: '🔳' },
            { l: 'Symbols', v: (_doc.layerSymbols ? Object.keys(_doc.layerSymbols).length : 0), i: '🔄' },
            { l: 'Assets', v: (_zip.folder('images') ? 0 : 0), i: '🖼️' }
          ];
          
          // Count assets manually
          var assetCount = 0;
          _zip.folder('images').forEach(function() { assetCount++; });
          stats[3].v = assetCount;

          stats.forEach(function(s) {
            html += '<div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm hover:border-brand-300 transition-all group">' +
                      '<div class="flex items-center justify-between mb-1">' +
                        '<span class="text-[10px] uppercase tracking-wider text-surface-400 font-bold">' + esc(s.l) + '</span>' +
                        '<span class="text-sm opacity-50 group-hover:opacity-100 transition-opacity">' + s.i + '</span>' +
                      '</div>' +
                      '<div class="text-2xl font-black text-surface-800">' + s.v + '</div>' +
                    '</div>';
          });
          html += '</div>';

          html += '<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">';
          
          // Main Preview (Col 8/12)
          html += '<div class="lg:col-span-8 space-y-6">';
          if (blob) {
            _previewUrl = URL.createObjectURL(blob);
            html += '<div class="flex flex-col gap-4">' +
                      '<div class="flex items-center justify-between">' +
                        '<h3 class="font-bold text-surface-800 flex items-center gap-2">Quick Preview</h3>' +
                        '<span class="text-[10px] bg-surface-100 text-surface-500 px-2 py-1 rounded uppercase font-bold">Generated by Sketch</span>' +
                      '</div>' +
                      '<div class="rounded-2xl border border-surface-200 bg-surface-50 overflow-hidden shadow-inner group relative flex items-center justify-center p-4 min-h-[400px]">' +
                        '<img src="' + _previewUrl + '" class="max-w-full h-auto shadow-2xl rounded-lg bg-white" style="max-height: 75vh;" id="main-preview-img" />' +
                      '</div>' +
                    '</div>';
          } else {
            html += '<div class="h-[400px] flex flex-col items-center justify-center text-center border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50 p-8">' +
                      '<div class="text-5xl mb-4 grayscale opacity-30">👁️‍🗨️</div>' +
                      '<div class="text-lg font-bold text-surface-800">No Preview Available</div>' +
                      '<p class="text-surface-500 mt-2 max-w-xs text-sm">This file was saved without a preview image. You can still browse the document structure in the sidebar.</p>' +
                    '</div>';
          }

          // Metadata Table (U7)
          html += '<div>' +
                    '<div class="flex items-center justify-between mb-3">' +
                      '<h3 class="font-bold text-surface-800">Document Metadata</h3>' +
                    '</div>' +
                    '<div class="overflow-hidden rounded-xl border border-surface-200">' +
                      '<table class="min-w-full text-sm">' +
                        '<thead>' +
                          '<tr class="bg-surface-50 border-b border-surface-200">' +
                            '<th class="px-4 py-2.5 text-left font-bold text-surface-700">Property</th>' +
                            '<th class="px-4 py-2.5 text-left font-bold text-surface-700">Value</th>' +
                          '</tr>' +
                        '</thead>' +
                        '<tbody class="divide-y divide-surface-100">' +
                          '<tr><td class="px-4 py-2 font-medium text-surface-500 bg-surface-50/50">Application</td><td class="px-4 py-2 text-surface-700">' + esc(_meta.app || 'Sketch') + '</td></tr>' +
                          '<tr><td class="px-4 py-2 font-medium text-surface-500 bg-surface-50/50">Version</td><td class="px-4 py-2 text-surface-700">' + esc(_meta.appVersion || 'N/A') + '</td></tr>' +
                          '<tr><td class="px-4 py-2 font-medium text-surface-500 bg-surface-50/50">Format</td><td class="px-4 py-2 text-surface-700">JSON v' + esc(_meta.version || '?') + '</td></tr>' +
                          '<tr><td class="px-4 py-2 font-medium text-surface-500 bg-surface-50/50">Build</td><td class="px-4 py-2 text-surface-700">' + esc(_meta.build || 'N/A') + '</td></tr>' +
                          '<tr><td class="px-4 py-2 font-medium text-surface-500 bg-surface-50/50">Last Commit</td><td class="px-4 py-2 font-mono text-xs text-surface-600">' + esc(_meta.commit || 'N/A') + '</td></tr>' +
                        '</tbody>' +
                      '</table>' +
                    '</div>' +
                  '</div>';

          html += '</div>'; // End Main Content

          // Sidebar (Col 4/12)
          html += '<div class="lg:col-span-4 space-y-8">';
          
          // Pages Navigation (U10 + Data excellence)
          html += '<div>' +
                    '<div class="flex items-center justify-between mb-4">' +
                      '<h3 class="font-bold text-surface-800">Structure</h3>' +
                      '<span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">' + pageKeys.length + ' Pages</span>' +
                    '</div>' +
                    '<div class="relative mb-4 group">' +
                      '<span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none group-focus-within:text-brand-500 transition-colors">🔍</span>' +
                      '<input type="text" id="node-filter" placeholder="Search pages or artboards..." class="w-full pl-9 pr-3 py-2.5 text-sm border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all bg-white shadow-sm">' +
                    '</div>' +
                    '<div id="node-list" class="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">';
          
          if (pageKeys.length === 0) {
            html += '<div class="text-center py-10 bg-surface-50 rounded-xl border border-dashed border-surface-200">' +
                      '<div class="text-2xl mb-2 opacity-50">📂</div>' +
                      '<div class="text-xs font-medium text-surface-400 italic">No structure found</div>' +
                    '</div>';
          } else {
            pageKeys.forEach(function(pid) {
              var p = pages[pid];
              var artboards = p.artboards ? Object.keys(p.artboards) : [];
              html += '<div class="node-item group/node" data-name="' + esc(p.name).toLowerCase() + '">' +
                        '<div class="flex items-center gap-3 p-3 rounded-xl bg-surface-50 border border-surface-100 group-hover/node:border-brand-300 group-hover/node:bg-white transition-all cursor-default shadow-sm">' +
                          '<span class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-surface-200 text-sm shadow-sm group-hover/node:border-brand-100">📄</span>' +
                          '<div class="min-w-0 flex-1">' +
                            '<div class="text-sm font-bold text-surface-700 truncate">' + esc(p.name) + '</div>' +
                            '<div class="text-[10px] text-surface-400 font-medium uppercase tracking-tight">' + artboards.length + ' Artboards</div>' +
                          '</div>' +
                        '</div>' +
                        '<div class="ml-8 mt-2 space-y-1.5 border-l-2 border-surface-100 pl-4">';
              artboards.forEach(function(aid) {
                var a = p.artboards[aid];
                html += '<div class="artboard-item flex items-center gap-2.5 p-2 rounded-lg hover:bg-brand-50 hover:text-brand-700 transition-colors cursor-default group/art" data-name="' + esc(a.name).toLowerCase() + '">' +
                          '<span class="text-xs opacity-40 group-hover/art:opacity-100 transition-opacity">🔳</span>' +
                          '<span class="text-xs font-medium text-surface-600 truncate">' + esc(a.name) + '</span>' +
                        '</div>';
              });
              html += '</div></div>';
            });
          }
          html += '</div></div>';

          // Images Section (Asset Preview)
          if (assetCount > 0) {
            html += '<div class="pt-6 border-t border-surface-100">' +
                      '<div class="flex items-center justify-between mb-4">' +
                        '<h3 class="font-bold text-surface-800">Bitmap Assets</h3>' +
                        '<span class="text-[10px] font-bold bg-surface-100 text-surface-500 px-2 py-0.5 rounded-full uppercase">' + assetCount + ' Files</span>' +
                      '</div>' +
                      '<div class="grid grid-cols-4 gap-2">';
            
            var shownCount = 0;
            _zip.folder('images').forEach(function() {
              if (shownCount < 12) {
                html += '<div class="aspect-square bg-surface-50 rounded-lg border border-surface-200 flex items-center justify-center hover:border-brand-300 hover:shadow-sm transition-all cursor-help overflow-hidden group">' +
                          '<span class="text-[9px] font-bold text-surface-400 group-hover:text-brand-500 uppercase">Img</span>' +
                        '</div>';
              }
              shownCount++;
            });

            if (assetCount > 12) {
              html += '<div class="aspect-square bg-brand-50 rounded-lg border border-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-600 shadow-sm">+' + (assetCount - 12) + '</div>';
            }
            html += '</div>' +
                    '<button id="extract-trigger" class="mt-4 w-full py-2.5 bg-surface-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">' +
                      '<span>📥 Download All Assets</span>' +
                    '</button>' +
                  '</div>';
          }

          html += '</div>'; // End Sidebar
          html += '</div>'; // End Grid
          html += '</div>'; // End Container

          h.render(html);

          // Interactive Logic
          setTimeout(function() {
            // Search Logic
            var input = document.getElementById('node-filter');
            if (input) {
              input.addEventListener('input', function(e) {
                var val = e.target.value.toLowerCase().trim();
                document.querySelectorAll('.node-item').forEach(function(node) {
                  var nodeName = node.getAttribute('data-name');
                  var hasVisibleChild = false;
                  
                  node.querySelectorAll('.artboard-item').forEach(function(art) {
                    var artName = art.getAttribute('data-name');
                    if (val === '' || nodeName.indexOf(val) !== -1 || artName.indexOf(val) !== -1) {
                      art.style.display = 'flex';
                      hasVisibleChild = true;
                    } else {
                      art.style.display = 'none';
                    }
                  });
                  
                  node.style.display = (val === '' || nodeName.indexOf(val) !== -1 || hasVisibleChild) ? 'block' : 'none';
                });
              });
            }

            // Button Trigger
            var btn = document.getElementById('extract-trigger');
            if (btn) {
              btn.onclick = function() {
                var action = toolConfig.actions.find(function(a) { return a.id === 'dl-images'; });
                if (action) action.onClick(h);
              };
            }
          }, 50);

        }).catch(function (err) {
          h.showLoading(false);
          h.showError('Parsing Failed', 'The Sketch file structure could not be read. It may be corrupted or encrypted: ' + err.message);
        });
      },

      onDestroy: function () {
        if (_previewUrl) {
          URL.revokeObjectURL(_previewUrl);
          _previewUrl = null;
        }
        _zip = null;
        _meta = null;
        _doc = null;
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
