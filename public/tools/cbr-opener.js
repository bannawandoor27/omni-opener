/**
 * OmniOpener — CBR Opener Tool
 * Uses OmniTool SDK. Renders .cbr (RAR) comic archives in the browser.
 */
(function () {
  'use strict';

  var blobUrls = [];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbr,.rar',
      binary: true,
      dropLabel: 'Drop a .cbr or .rar comic here',
      infoHtml: '<strong>How it works:</strong> This tool extracts and renders images from your CBR archive locally in your browser using the unrar.js library. No files are uploaded to any server.',

      actions: [
        {
          label: '📋 Copy Filename',
          id: 'copy-name',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getFile().name, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), h.getFile().type);
          }
        }
      ],

      onInit: function (h) {
        cleanup();
        // Load unrar library
        if (typeof Unrar === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@fiahfy/unrar.js@0.1.1/dist/unrar.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Extracting archive…');
        cleanup();

        if (typeof Unrar === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@fiahfy/unrar.js@0.1.1/dist/unrar.js', function () {
            // Small delay to ensure global is populated
            setTimeout(function() {
              processRar(content, h);
            }, 50);
          });
        } else {
          processRar(content, h);
        }
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };

  function cleanup() {
    blobUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    blobUrls = [];
  }

  function processRar(buffer, h) {
    try {
      // Handle potential UMD global variations
      var UnrarClass = window.Unrar || (window.unrar && window.unrar.Unrar);
      if (!UnrarClass) {
        throw new Error('Unrar library failed to initialize.');
      }

      var unrar = new UnrarClass(new Uint8Array(buffer));
      var files = unrar.extract();

      if (!files || files.length === 0) {
        h.showError('Empty Archive', 'This archive does not appear to contain any files.');
        return;
      }

      // Filter for image files
      var entries = files.filter(function (file) {
        var ext = file.name.split('.').pop().toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].indexOf(ext) !== -1;
      });

      if (entries.length === 0) {
        h.showError('No Images Found', 'No supported image files found inside the archive.');
        return;
      }

      // Sort entries by name naturally (important for comics)
      entries.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      // Prepare container
      h.render('<div id="cbr-viewer" class="flex flex-col items-center gap-8 p-4 md:p-8 bg-surface-50 min-h-full"></div>');
      var container = h.getRenderEl().querySelector('#cbr-viewer');
      
      entries.forEach(function (file, i) {
        var mime = getMimeType(file.name);
        var blob = new Blob([file.data], { type: mime });
        var url = URL.createObjectURL(blob);
        blobUrls.push(url);

        var wrapper = document.createElement('div');
        wrapper.className = 'w-full max-w-4xl flex flex-col items-center gap-2';

        var img = document.createElement('img');
        img.src = url;
        img.className = 'max-w-full h-auto shadow-2xl rounded-sm border border-surface-200 bg-white';
        img.alt = 'Page ' + (i + 1);
        img.loading = 'lazy';

        var caption = document.createElement('div');
        caption.className = 'text-xs text-surface-400 font-mono';
        caption.textContent = (i + 1) + ' / ' + entries.length + ' — ' + file.name.split('/').pop();

        wrapper.appendChild(img);
        wrapper.appendChild(caption);
        container.appendChild(wrapper);
      });

      // Add back-to-top button
      var topBtn = document.createElement('button');
      topBtn.className = 'mt-6 px-6 py-2 bg-white border border-surface-200 rounded-full text-sm font-medium hover:bg-surface-100 transition-colors shadow-sm';
      topBtn.textContent = '↑ Back to Top';
      topBtn.onclick = function() { h.getRenderEl().scrollTo({ top: 0, behavior: 'smooth' }); };
      container.appendChild(topBtn);

    } catch (err) {
      h.showError('Failed to open CBR', err.message);
    }
  }

  function getMimeType(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    var map = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'png': 'image/png', 'gif': 'image/gif',
      'webp': 'image/webp', 'avif': 'image/avif',
      'bmp': 'image/bmp'
    };
    return map[ext] || 'application/octet-stream';
  }

})();
