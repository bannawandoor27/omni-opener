/**
 * OmniOpener — CBR Opener Tool
 * Uses OmniTool SDK. Renders .cbr (RAR) comic archives in the browser.
 */
(function () {
  'use strict';

  let blobUrls = [];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbr,.rar',
      binary: true,
      dropLabel: 'Drop a .cbr or .rar comic here',
      infoHtml: '<strong>How it works:</strong> This tool extracts and renders images from your CBR archive locally in your browser. No files are uploaded to any server.',

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
        cleanupBlobUrls();
        // Load unrar library
        if (typeof Unrar === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@fiahfy/unrar.js@0.1.1/dist/unrar.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Extracting archive…');
        cleanupBlobUrls();

        if (typeof Unrar === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@fiahfy/unrar.js@0.1.1/dist/unrar.js', function () {
            processRar(content, h);
          });
        } else {
          processRar(content, h);
        }
      },

      onDestroy: function () {
        cleanupBlobUrls();
      }
    });
  };

  function cleanupBlobUrls() {
    blobUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    blobUrls = [];
  }

  function processRar(buffer, h) {
    try {
      const unrar = new Unrar(new Uint8Array(buffer));
      const files = unrar.extract();

      if (!files || files.length === 0) {
        h.showError('No images found', 'This archive does not appear to contain any supported image files (JPG, PNG, WebP, etc.).');
        return;
      }

      var entries = files.filter(function (file) {
        return isImage(file.name);
      });

      if (entries.length === 0) {
        h.showError('No images found', 'No supported image files found inside the archive.');
        return;
      }

      // Sort entries by name naturally
      entries.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      h.showLoading('Loading ' + entries.length + ' pages…');

      h.render('<div id="cbr-container" class="flex flex-col items-center gap-8 p-8 bg-surface-100 min-h-full"></div>');
      var container = h.getRenderEl().querySelector('#cbr-container');

      // Clear loading state
      container.innerHTML = '';
      
      entries.forEach(function (file, i) {
        var blob = new Blob([file.data], { type: getMimeType(file.name) });
        var url = URL.createObjectURL(blob);
        blobUrls.push(url);

        var wrapper = document.createElement('div');
        wrapper.className = 'w-full max-w-4xl flex flex-col items-center gap-2';

        var img = document.createElement('img');
        img.src = url;
        img.className = 'max-w-full h-auto shadow-2xl rounded-sm border border-surface-200';
        img.alt = 'Page ' + (i + 1);
        img.loading = 'lazy';

        var caption = document.createElement('div');
        caption.className = 'text-xs text-surface-500 font-mono';
        caption.textContent = (i + 1) + ' / ' + entries.length + ' — ' + file.name.split('/').pop();

        wrapper.appendChild(img);
        wrapper.appendChild(caption);
        container.appendChild(wrapper);
      });

      // Add back-to-top button
      var topBtn = document.createElement('button');
      topBtn.className = 'mt-4 px-4 py-2 bg-white border border-surface-200 rounded-full text-sm font-medium hover:bg-surface-50 transition-colors shadow-sm';
      topBtn.textContent = '↑ Back to Top';
      topBtn.onclick = function() { h.getRenderEl().scrollTo({ top: 0, behavior: 'smooth' }); };
      container.appendChild(topBtn);

    } catch (err) {
      h.showError('Failed to open CBR', err.message);
    }
  }

  function isImage(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(ext);
  }

  function getMimeType(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    switch (ext) {
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'avif': return 'image/avif';
      case 'bmp': return 'image/bmp';
      default: return 'application/octet-stream';
    }
  }

})();
