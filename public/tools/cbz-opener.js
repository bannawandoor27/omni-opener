/**
 * OmniOpener — CBZ Opener Tool
 * Uses OmniTool SDK. Renders .cbz (ZIP) comic archives in the browser.
 */
(function () {
  'use strict';

  let blobUrls = [];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbz,.zip',
      binary: true,
      dropLabel: 'Drop a .cbz or .zip comic here',
      infoHtml: '<strong>How it works:</strong> This tool extracts and renders images from your CBZ archive locally in your browser. No files are uploaded to any server.',

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
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Extracting archive…');
        cleanupBlobUrls();

        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', function () {
          processZip(content, h);
        });
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

  function processZip(buffer, h) {
    var zip = new JSZip();
    zip.loadAsync(buffer).then(function (zipDoc) {
      var entries = [];
      zipDoc.forEach(function (relativePath, file) {
        if (!file.dir && isImage(relativePath)) {
          entries.push(file);
        }
      });

      if (entries.length === 0) {
        h.showError('No images found', 'This archive does not appear to contain any supported image files (JPG, PNG, WebP, etc.).');
        return;
      }

      // Sort entries by name naturally (1.jpg, 2.jpg, 10.jpg)
      entries.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      h.showLoading('Loading ' + entries.length + ' pages…');

      h.render('<div id="cbz-container" class="flex flex-col items-center gap-8 p-8 bg-surface-100 min-h-full"></div>');
      var container = h.getRenderEl().querySelector('#cbz-container');

      var promises = entries.map(function (entry, i) {
        return entry.async('blob').then(function (blob) {
          var url = URL.createObjectURL(blob);
          blobUrls.push(url);
          return { url: url, index: i, name: entry.name };
        });
      });

      Promise.all(promises).then(function (results) {
        // Clear loading state
        container.innerHTML = '';
        
        results.forEach(function (res) {
          var wrapper = document.createElement('div');
          wrapper.className = 'w-full max-w-4xl flex flex-col items-center gap-2';

          var img = document.createElement('img');
          img.src = res.url;
          img.className = 'max-w-full h-auto shadow-2xl rounded-sm border border-surface-200';
          img.alt = 'Page ' + (res.index + 1);
          img.loading = 'lazy';

          var caption = document.createElement('div');
          caption.className = 'text-xs text-surface-500 font-mono';
          caption.textContent = (res.index + 1) + ' / ' + results.length + ' — ' + res.name.split('/').pop();

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

      }).catch(function (err) {
        h.showError('Failed to load images', err.message);
      });

    }).catch(function (err) {
      h.showError('Failed to open CBZ', err.message);
    });
  }

  function isImage(filename) {
    var ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(ext);
  }

})();
