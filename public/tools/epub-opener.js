/**
 * OmniOpener — EPUB Opener & Viewer
 * Uses OmniTool SDK and epub.js.
 */
(function () {
  'use strict';

  var book = null;
  var rendition = null;
  var keyListener = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.epub',
      binary: true,
      dropLabel: 'Drop an EPUB file here',
      infoHtml: '<strong>Privacy:</strong> This EPUB viewer runs entirely in your browser. No data leaves your device.',

      actions: [
        {
          label: '⬅️ Previous',
          id: 'prev',
          onClick: function (h) {
            if (rendition) rendition.prev();
          }
        },
        {
          label: 'Next ➡️',
          id: 'next',
          onClick: function (h) {
            if (rendition) rendition.next();
          }
        },
        {
          label: '📑 TOC',
          id: 'toc',
          onClick: function (h) {
            var tocEl = document.getElementById('epub-toc');
            if (tocEl) {
              tocEl.classList.toggle('hidden');
              tocEl.classList.toggle('md:block');
            }
          }
        },
        {
          label: 'ℹ️ Metadata',
          id: 'metadata',
          onClick: function (h) {
            if (!book) return;
            book.loaded.metadata.then(function(meta) {
              h.render(
                '<div class="p-8 max-w-2xl mx-auto space-y-4">' +
                  '<h2 class="text-2xl font-bold text-surface-800">' + esc(meta.title || 'Unknown Title') + '</h2>' +
                  '<p class="text-lg text-surface-600">By ' + esc(meta.creator || 'Unknown Author') + '</p>' +
                  '<div class="grid grid-cols-2 gap-4 text-sm text-surface-500 pt-4 border-t border-surface-100">' +
                    '<div><strong>Publisher:</strong> ' + esc(meta.publisher || 'N/A') + '</div>' +
                    '<div><strong>Language:</strong> ' + esc(meta.language || 'N/A') + '</div>' +
                    '<div><strong>Published:</strong> ' + esc(meta.pubdate || 'N/A') + '</div>' +
                    '<div><strong>Identifier:</strong> ' + esc(meta.identifier || 'N/A') + '</div>' +
                  '</div>' +
                  '<div class="mt-6 text-sm text-surface-500 italic">' + esc(meta.description || '') + '</div>' +
                  '<div class="pt-6 border-t border-surface-100">' +
                    '<button id="back-to-viewer" class="text-brand-600 font-medium hover:underline">← Back to Reader</button>' +
                  '</div>' +
                '</div>'
              );
              document.getElementById('back-to-viewer').onclick = function() {
                renderBook(h.getContent(), h);
              };
            });
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/epub+zip');
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js',
          'https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js'
        ]);
      },

      onFile: function (file, content, h) {
        h.showLoading('Opening EPUB...');
        
        var checkReady = function() {
          if (typeof ePub !== 'undefined') {
            renderBook(content, h);
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      },

      onDestroy: function() {
        cleanup();
      }
    });
  };

  function cleanup() {
    if (rendition && keyListener) {
      rendition.off("keyup", keyListener);
      document.removeEventListener("keyup", keyListener);
    }
    if (book) {
      book.destroy();
      book = null;
      rendition = null;
    }
    keyListener = null;
  }

  function renderBook(content, h) {
    try {
      cleanup();

      h.render(
        '<div class="flex flex-col md:flex-row h-[700px] border border-surface-200 rounded-lg overflow-hidden bg-white">' +
          '<div id="epub-toc" class="hidden md:block w-full md:w-64 border-r border-surface-100 bg-surface-50 overflow-y-auto p-4 text-sm">' +
            '<h3 class="font-bold mb-3 text-surface-700">Contents</h3>' +
            '<div id="toc-list" class="space-y-1"></div>' +
          '</div>' +
          '<div id="epub-viewer" class="flex-1 relative bg-white"></div>' +
        '</div>'
      );

      var viewerEl = document.getElementById('epub-viewer');
      var tocList = document.getElementById('toc-list');

      book = ePub(content);
      rendition = book.renderTo(viewerEl, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        manager: "default"
      });

      rendition.display().catch(function(err) {
        h.showError('Display Error', err.message);
      });

      // Load TOC
      book.loaded.navigation.then(function(nav) {
        if (tocList) {
          tocList.innerHTML = '';
          nav.toc.forEach(function(chapter) {
            var item = document.createElement('div');
            item.className = 'cursor-pointer hover:text-brand-600 transition-colors py-1 truncate text-surface-600 border-b border-surface-50 last:border-0';
            item.textContent = (chapter.label || 'Untitled Section').trim();
            item.onclick = function() {
              rendition.display(chapter.href);
              if (window.innerWidth < 768) {
                document.getElementById('epub-toc').classList.add('hidden');
              }
            };
            tocList.appendChild(item);
          });
        }
      });

      // Keyboard navigation
      keyListener = function(e) {
        if ((e.keyCode || e.which) == 37) rendition.prev();
        if ((e.keyCode || e.which) == 39) rendition.next();
      };
      rendition.on("keyup", keyListener);
      document.addEventListener("keyup", keyListener, false);

    } catch (err) {
      h.showError('Failed to parse EPUB', err.message);
    }
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
