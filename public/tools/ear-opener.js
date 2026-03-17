/**
 * OmniOpener — EAR Opener (Enterprise Archive Viewer)
 * Uses OmniTool SDK. Parses .ear files client-side using JSZip.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ear',
      binary: true,
      dropLabel: 'Drop an EAR file here',
      infoHtml: '<strong>How it works:</strong> This tool extracts the contents of Java Enterprise Archive (EAR) files directly in your browser using JSZip. No data is uploaded to any server.',

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            var files = h.getState().fileList || [];
            if (files.length === 0) return;
            var text = files.map(function (f) { return f.name; }).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download-orig',
          onClick: function (h) {
            var file = h.getFile();
            if (file) h.download(file.name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Extracting archive...');
        // Small delay to ensure JSZip is available
        setTimeout(function () {
          if (typeof JSZip === 'undefined') {
            h.showError('Dependency Error', 'JSZip failed to load. Please check your connection.');
            return;
          }
          processArchive(content, h);
        }, 200);
      }
    });
  };

  /**
   * Parse the ZIP/EAR structure
   */
  function processArchive(content, h) {
    var zip = new JSZip();
    zip.loadAsync(content)
      .then(function (zipData) {
        var files = [];
        zipData.forEach(function (relativePath, zipEntry) {
          files.push({
            name: relativePath,
            size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
            dir: zipEntry.dir,
            date: zipEntry.date,
            ref: zipEntry
          });
        });

        h.setState('fileList', files);
        renderFileList(files, h);
      })
      .catch(function (err) {
        h.showError('Failed to parse EAR file', 'This might not be a valid EAR archive. Error: ' + err.message);
      });
  }

  /**
   * Render the list of files in a nice table
   */
  function renderFileList(files, h) {
    if (files.length === 0) {
      h.render('<div class="p-8 text-center text-surface-400">Archive is empty.</div>');
      return;
    }

    var html = '<div class="overflow-x-auto"><table class="w-full text-left text-sm border-collapse">';
    html += '<thead class="bg-surface-50 border-b border-surface-200">';
    html += '<tr>';
    html += '<th class="px-4 py-3 font-semibold text-surface-700">Name</th>';
    html += '<th class="px-4 py-3 font-semibold text-surface-700 text-right">Size</th>';
    html += '<th class="px-4 py-3 font-semibold text-surface-700">Type</th>';
    html += '<th class="px-4 py-3 font-semibold text-surface-700 text-right">Action</th>';
    html += '</tr></thead><tbody>';

    files.forEach(function (file, idx) {
      var isDir = file.dir;
      var type = 'File';
      var icon = '📄';

      if (isDir) {
        type = 'Directory';
        icon = '📁';
      } else if (file.name.toLowerCase().endsWith('.war')) {
        type = 'Web Module';
        icon = '🌐';
      } else if (file.name.toLowerCase().endsWith('.jar')) {
        type = 'EJB/Library';
        icon = '📦';
      } else if (file.name.toLowerCase().endsWith('.xml')) {
        type = 'Configuration';
        icon = '⚙️';
      }

      var sizeStr = isDir ? '-' : formatSize(file.size);

      html += '<tr class="border-b border-surface-100 hover:bg-surface-50 transition-colors">';
      html += '<td class="px-4 py-3 font-mono text-xs text-surface-600 truncate max-w-md" title="' + esc(file.name) + '">' + icon + ' ' + esc(file.name) + '</td>';
      html += '<td class="px-4 py-3 text-surface-500 text-right">' + sizeStr + '</td>';
      html += '<td class="px-4 py-3 text-surface-500 pl-8">' + type + '</td>';
      html += '<td class="px-4 py-3 text-right">';
      if (!isDir) {
        html += '<button class="extract-btn text-brand-600 hover:underline font-medium" data-idx="' + idx + '">Download</button>';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table></div>';
    h.render(html);

    // Bind extraction buttons
    h.getRenderEl().querySelectorAll('.extract-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx);
        var file = files[idx];
        if (file && file.ref) {
          var originalText = btn.textContent;
          btn.textContent = '⌛...';
          file.ref.async('blob').then(function (blob) {
            h.download(file.name.split('/').pop(), blob);
            btn.textContent = originalText;
          }).catch(function(err) {
            btn.textContent = 'Error';
            console.error(err);
          });
        }
      });
    });
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
