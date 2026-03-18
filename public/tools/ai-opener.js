(function() {
  window.initTool = function(toolConfig, mountEl) {
    var pdfDoc = null;
    var pageNum = 1;
    var pageRendering = false;
    var pageNumPending = null;
    var scale = 1.5;
    var canvas = null;
    var ctx = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ai',
      dropLabel: 'Drop an Adobe Illustrator (.ai) file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfjs-dist@4.0.379/build/pdf.min.mjs', function() {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js';
        });
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing AI file...');
        
        function formatSize(b) {
          return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
        }

        var infoBar = '<div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">' +
          '<span class="font-medium">' + file.name + '</span>' +
          '<span class="text-surface-400">·</span>' +
          '<span>' + formatSize(file.size) + '</span>' +
          '</div>';

        if (file.size > 20 * 1024 * 1024) {
          helpers.append('<div class="p-4 mb-4 text-sm text-yellow-800 rounded-lg bg-yellow-50"><strong>Notice:</strong> This is a large file (>20MB). Rendering may be slow.</div>');
        }

        try {
          var loadingTask = pdfjsLib.getDocument({data: content});
          loadingTask.promise.then(function(pdf) {
            pdfDoc = pdf;
            helpers.render(infoBar + 
              '<div class="flex flex-col items-center bg-surface-100 rounded-xl p-4 overflow-auto">' +
                '<div class="flex items-center gap-4 mb-4 sticky top-0 bg-white/80 backdrop-blur p-2 rounded-lg shadow-sm z-10">' +
                  '<button id="prev" class="px-3 py-1 bg-white border border-surface-200 rounded hover:bg-surface-50 disabled:opacity-50">Previous</button>' +
                  '<span class="text-sm font-medium">Page <span id="page_num"></span> / <span id="page_count"></span></span>' +
                  '<button id="next" class="px-3 py-1 bg-white border border-surface-200 rounded hover:bg-surface-50 disabled:opacity-50">Next</button>' +
                  '<div class="h-4 w-px bg-surface-200 mx-2"></div>' +
                  '<button id="zoom-in" class="p-1 hover:bg-surface-100 rounded" title="Zoom In"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg></button>' +
                  '<button id="zoom-out" class="p-1 hover:bg-surface-100 rounded" title="Zoom Out"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"></path></svg></button>' +
                '</div>' +
                '<div class="shadow-2xl border border-surface-200 bg-white rounded"><canvas id="ai-canvas"></canvas></div>' +
              '</div>'
            );

            canvas = document.getElementById('ai-canvas');
            ctx = canvas.getContext('2d');
            document.getElementById('page_count').textContent = pdf.numPages;

            document.getElementById('prev').addEventListener('click', onPrevPage);
            document.getElementById('next').addEventListener('click', onNextPage);
            document.getElementById('zoom-in').addEventListener('click', function() { scale += 0.25; queueRenderPage(pageNum); });
            document.getElementById('zoom-out').addEventListener('click', function() { if (scale > 0.5) { scale -= 0.25; queueRenderPage(pageNum); } });

            renderPage(pageNum);
          }, function(reason) {
            // Fallback for non-PDF AI files (Older Illustrator versions)
            helpers.render(infoBar + 
              '<div class="p-8 text-center bg-white rounded-xl border border-surface-200">' +
                '<div class="text-4xl mb-4">🎨</div>' +
                '<h3 class="text-lg font-semibold text-surface-900 mb-2">Adobe Illustrator File</h3>' +
                '<p class="text-surface-500 max-w-md mx-auto">This appears to be an older Illustrator format (PostScript-based) or a file saved without PDF compatibility. Detailed preview is unavailable, but you can still download the original.</p>' +
                '<div class="mt-6 flex flex-col items-center gap-2 text-xs text-surface-400">' +
                  '<span>Format: Adobe Illustrator Artwork</span>' +
                  '<span>Binary Size: ' + formatSize(file.size) + '</span>' +
                '</div>' +
              '</div>'
            );
          });
        } catch (e) {
          helpers.showError('Could not parse AI file', e.message);
        }
      },
      actions: [
        { 
          label: '📋 Copy Info', 
          id: 'copy', 
          onClick: function(helpers, btn) {
            var file = helpers.getFile();
            var info = 'File Name: ' + file.name + '\nSize: ' + file.size + ' bytes\nType: Adobe Illustrator Artwork';
            helpers.copyToClipboard(info, btn);
          } 
        },
        { 
          label: '🖼️ Export as PNG', 
          id: 'export', 
          onClick: function(helpers, btn) {
            if (canvas) {
              var dataUrl = canvas.toDataURL('image/png');
              var link = document.createElement('a');
              link.href = dataUrl;
              link.download = helpers.getFile().name.replace('.ai', '.png');
              link.click();
            } else {
              alert('Preview not available for export.');
            }
          } 
        },
        { 
          label: '📥 Download Original', 
          id: 'dl', 
          onClick: function(helpers, btn) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/postscript');
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. AI files are parsed locally using PDF.js or metadata extraction. Your files never leave your device.'
    });

    function renderPage(num) {
      pageRendering = true;
      pdfDoc.getPage(num).then(function(page) {
        var viewport = page.getViewport({scale: scale});
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        var renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };
        var renderTask = page.render(renderContext);

        renderTask.promise.then(function() {
          pageRendering = false;
          if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
          }
        });
      });

      document.getElementById('page_num').textContent = num;
      document.getElementById('prev').disabled = (num <= 1);
      document.getElementById('next').disabled = (num >= pdfDoc.numPages);
    }

    function queueRenderPage(num) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num);
      }
    }

    function onPrevPage() {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum);
    }

    function onNextPage() {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum);
    }
  };
})();
