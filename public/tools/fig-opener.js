(function () {
  'use strict';

  /**
   * OmniOpener Figma (.fig) Tool
   * A high-performance browser-based Figma file inspector.
   */

  var currentPreviewUrl = null;

  function cleanup() {
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.fig',
      binary: true,
      dropLabel: 'Drop a .fig file here',
      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: async function (file, content, helpers) {
        cleanup();
        helpers.showLoading('Analyzing Figma file structure...');

        // Ensure JSZip is loaded
        if (typeof JSZip === 'undefined') {
          var attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(function (r) { return setTimeout(r, 100); });
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Library Load Issue', 'JSZip could not be loaded. Please check your connection.');
            return;
          }
        }

        try {
          var zip = null;
          var isZip = false;
          try {
            zip = await JSZip.loadAsync(content);
            isZip = true;
          } catch (e) {
            // Not a ZIP, probably raw binary Kiwi format
          }

          var state = {
            file: file,
            isZip: isZip,
            files: [],
            previewBlob: null,
            meta: { type: isZip ? 'Figma Archive' : 'Figma Binary' }
          };

          if (isZip) {
            helpers.showLoading('Extracting archive contents...');
            var thumbFile = zip.file('thumbnail.png');
            if (thumbFile) {
              state.previewBlob = await thumbFile.async('blob');
              currentPreviewUrl = URL.createObjectURL(state.previewBlob);
            }

            // Map files in ZIP
            zip.forEach(function (relativePath, zipEntry) {
              state.files.push({
                name: relativePath,
                size: zipEntry._data.uncompressedSize,
                dir: zipEntry.dir
              });
            });

            var versionFile = zip.file('version');
            if (versionFile) {
              state.meta.version = await versionFile.async('text');
            }
          } else {
            // Raw binary hex dump of first 256 bytes
            var bytes = new Uint8Array(content.slice(0, 256));
            var hexLines = [];
            for (var i = 0; i < bytes.length; i += 16) {
              var chunk = bytes.slice(i, i + 16);
              var hex = Array.from(chunk).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ');
              var ascii = Array.from(chunk).map(function (b) { return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.'; }).join('');
              hexLines.push('<span class="text-brand-600 font-mono">' + i.toString(16).padStart(4, '0') + '</span>  ' + hex.padEnd(48) + ' |' + escapeHtml(ascii) + '|');
            }
            state.hexDump = hexLines.join('\n');
          }

          helpers.setState('figData', state);
          renderUI(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not process Figma file', err.message);
        }
      },
      actions: [
        {
          label: '🖼️ Save Thumbnail',
          id: 'dl-thumb',
          onClick: function (helpers) {
            var state = helpers.getState().figData;
            if (state && state.previewBlob) {
              helpers.download(state.file.name.replace('.fig', '-thumbnail.png'), state.previewBlob, 'image/png');
            } else {
              alert('No thumbnail found in this file.');
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (helpers, btn) {
            var state = helpers.getState().figData;
            if (state) {
              var info = 'File: ' + state.file.name + '\n' +
                         'Size: ' + state.file.size + ' bytes\n' +
                         'Type: ' + state.meta.type + (state.meta.version ? '\nVersion: ' + state.meta.version : '');
              helpers.copyToClipboard(info, btn);
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> All processing is 100% client-side. Your Figma files never leave your device.'
    });
  };

  function renderUI(helpers) {
    var state = helpers.getState().figData;
    if (!state) return;

    var html = '<div class="max-w-6xl mx-auto p-4 md:p-6">' +
      '<div class="flex items-center gap-3 p-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
        '<span class="font-semibold text-surface-800">' + escapeHtml(state.file.name) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span>' + formatSize(state.file.size) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span class="uppercase font-bold text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded">' + escapeHtml(state.meta.type) + '</span>' +
      '</div>';

    html += '<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">';

    // Left Column: Preview / Hex
    html += '<div class="lg:col-span-7 space-y-6">';
    if (currentPreviewUrl) {
      html += '<div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">' +
                '<div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">' +
                  '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Visual Preview</h3>' +
                  '<span class="text-[10px] font-mono text-surface-400">thumbnail.png</span>' +
                '</div>' +
                '<div class="p-6 flex items-center justify-center bg-surface-100">' +
                  '<img src="' + currentPreviewUrl + '" class="max-w-full h-auto shadow-2xl rounded-lg border border-white" alt="Figma Preview">' +
                '</div>' +
              '</div>';
    } else if (state.hexDump) {
      html += '<div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">' +
                '<div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50">' +
                  '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Binary Inspector (First 256 Bytes)</h3>' +
                '</div>' +
                '<div class="p-4 bg-surface-900 text-surface-300 overflow-x-auto font-mono text-[11px] leading-relaxed">' +
                  '<pre>' + state.hexDump + '</pre>' +
                '</div>' +
              '</div>';
    } else {
       html += '<div class="rounded-2xl border-2 border-dashed border-surface-200 p-12 text-center text-surface-400 bg-surface-50">' +
                 '<div class="text-4xl mb-3">📁</div>' +
                 '<p>No visual preview available in this archive.</p>' +
               '</div>';
    }
    html += '</div>'; // End left column

    // Right Column: File List / Details
    html += '<div class="lg:col-span-5 space-y-6">';
    if (state.isZip) {
      html += '<div class="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden flex flex-col max-h-[600px]">' +
                '<div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">' +
                  '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Archive Contents</h3>' +
                  '<span class="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-bold">' + state.files.length + ' Items</span>' +
                '</div>' +
                '<div class="overflow-y-auto divide-y divide-surface-50">' +
                  state.files.map(function(f) {
                    return '<div class="px-4 py-2.5 hover:bg-surface-50 transition-colors flex items-center justify-between">' +
                             '<div class="min-w-0 flex items-center gap-2">' +
                               '<span class="text-sm">' + (f.dir ? '📁' : '📄') + '</span>' +
                               '<span class="text-xs font-medium text-surface-700 truncate">' + escapeHtml(f.name) + '</span>' +
                             '</div>' +
                             '<span class="text-[10px] text-surface-400 font-mono shrink-0">' + formatSize(f.size) + '</span>' +
                           '</div>';
                  }).join('') +
                '</div>' +
              '</div>';
    } else {
      html += '<div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm space-y-4">' +
                '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider">Binary Information</h3>' +
                '<p class="text-xs text-surface-500 leading-relaxed">This file is a raw Figma binary blob (Kiwi format). It does not contain an internal file system like a Figma archive (.fig-archive) does.</p>' +
                '<div class="pt-4 border-t border-surface-100">' +
                   '<div class="flex justify-between text-xs py-1"><span class="text-surface-400">Magic Number</span><span class="font-mono text-brand-600">fig-kiwi</span></div>' +
                   '<div class="flex justify-between text-xs py-1"><span class="text-surface-400">Last Modified</span><span>' + new Date(state.file.lastModified).toLocaleDateString() + '</span></div>' +
                '</div>' +
              '</div>';
    }
    
    html += '<div class="p-4 bg-brand-50 rounded-xl border border-brand-100 text-xs text-brand-800 leading-relaxed italic">' +
              '<strong>Pro Tip:</strong> Figma archives often contain a "canvas.fig" which is the actual design data, and a "thumbnail.png" for the preview.' +
            '</div>';
    html += '</div>'; // End right column

    html += '</div></div>'; // End grid and container
    helpers.render(html);
  }

})();
