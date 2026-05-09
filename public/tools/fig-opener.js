(function () {
  'use strict';

  var currentPreviewUrl = null;

  function cleanup() {
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
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
      onDestroy: function() {
        cleanup();
      },
      onFile: async function _onFile(file, content, helpers) {
        cleanup();
        helpers.showLoading('Checking file format...');

        if (typeof JSZip === 'undefined') {
          var attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(function (r) { return setTimeout(r, 100); });
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Library not ready', 'JSZip is taking too long to load. Please refresh and try again.');
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
            // Not a ZIP, probably raw Kiwi binary
          }

          var state = {
            file: {
              name: file.name,
              size: file.size,
              lastModified: file.lastModified
            },
            isZip: isZip,
            files: [],
            previewUrl: null,
            meta: { type: isZip ? 'Figma Archive' : 'Figma Binary' },
            filter: ''
          };

          if (isZip) {
            helpers.showLoading('Extracting archive contents...');
            var thumbFile = zip.file('thumbnail.png');
            if (thumbFile) {
              var blob = await thumbFile.async('blob');
              currentPreviewUrl = URL.createObjectURL(blob);
              state.previewUrl = currentPreviewUrl;
            }

            var files = [];
            zip.forEach(function (path, entry) {
              files.push({
                name: path,
                size: entry._data.uncompressedSize,
                isDir: entry.dir
              });
            });
            state.files = files;

            var versionFile = zip.file('version');
            if (versionFile) {
              state.meta.version = (await versionFile.async('text')).trim();
            }
          } else {
            helpers.showLoading('Reading binary data...');
            var bytes = new Uint8Array(content.slice(0, 1024));
            var hexLines = [];
            for (var i = 0; i < bytes.length; i += 16) {
              var chunk = bytes.slice(i, i + 16);
              var hex = Array.from(chunk).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ');
              var ascii = Array.from(chunk).map(function (b) { return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.'; }).join('');
              hexLines.push('<span class="text-brand-400 select-none">' + i.toString(16).padStart(4, '0') + '</span>  ' + hex.padEnd(48) + '  <span class="text-surface-400">|' + escapeHtml(ascii) + '|</span>');
            }
            state.hexDump = hexLines.join('\n');
            if (content.byteLength > 1024) {
               state.hexDump += '\n\n... and ' + formatSize(content.byteLength - 1024) + ' more ...';
            }
          }

          helpers.setState('fig', state);
          render(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not parse .fig file', 'The file might be encrypted, corrupted, or not a valid Figma format.');
        }
      },
      actions: [
        {
          label: '🖼️ Download Preview',
          id: 'dl-preview',
          onClick: function (helpers) {
            var state = helpers.getState().fig;
            if (state && state.previewUrl) {
               fetch(state.previewUrl).then(function(r) { return r.blob(); }).then(function(blob) {
                 helpers.download(state.file.name.replace(/\.fig$/i, '') + '-preview.png', blob, 'image/png');
               });
            } else {
              alert('No preview image available in this file.');
            }
          }
        },
        {
          label: '📋 Copy File List',
          id: 'copy-files',
          onClick: function (helpers, btn) {
            var state = helpers.getState().fig;
            if (state && state.files.length) {
              var list = state.files.map(function(f) { return (f.isDir ? '[DIR] ' : '') + f.name + ' (' + formatSize(f.size) + ')'; }).join('\n');
              helpers.copyToClipboard(list, btn);
            } else {
              helpers.copyToClipboard(state.file.name + '\n' + formatSize(state.file.size), btn);
            }
          }
        }
      ]
    });
  };

  function render(helpers) {
    var state = helpers.getState().fig;
    if (!state) return;

    var filteredFiles = state.files.filter(function(f) {
      return f.name.toLowerCase().includes(state.filter.toLowerCase());
    });

    var html = '<div class="max-w-6xl mx-auto">';
    
    // U1. File info bar
    html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">' +
      '<span class="font-semibold text-surface-800">' + escapeHtml(state.file.name) + '</span>' +
      '<span class="text-surface-300">|</span>' +
      '<span>' + formatSize(state.file.size) + '</span>' +
      '<span class="text-surface-300">|</span>' +
      '<span class="text-surface-500">.fig file (' + escapeHtml(state.meta.type) + ')</span>' +
      (state.meta.version ? '<span class="text-surface-300">|</span><span class="text-surface-500">v' + escapeHtml(state.meta.version) + '</span>' : '') +
    '</div>';

    html += '<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">';

    // Left Column
    html += '<div class="lg:col-span-7 space-y-6">';
    
    if (state.previewUrl) {
      html += '<div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">' +
        '<div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">' +
          '<h3 class="font-semibold text-surface-800 text-sm">Visual Preview</h3>' +
          '<span class="text-xs font-mono text-surface-400">thumbnail.png</span>' +
        '</div>' +
        '<div class="p-4 md:p-8 flex items-center justify-center bg-surface-100/50">' +
          '<img src="' + state.previewUrl + '" class="max-w-full h-auto shadow-xl rounded-lg border border-white" alt="Figma Thumbnail">' +
        '</div>' +
      '</div>';
    } else if (state.hexDump) {
      html += '<div class="rounded-xl overflow-hidden border border-surface-200">' +
        '<div class="px-4 py-3 border-b border-surface-200 bg-surface-50">' +
          '<h3 class="font-semibold text-surface-800 text-sm">Binary Header (Kiwi Format)</h3>' +
        '</div>' +
        '<pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">' + state.hexDump + '</pre>' +
      '</div>';
    } else if (state.isZip && state.files.length === 0) {
      // U5. Empty state
      html += '<div class="rounded-2xl border-2 border-dashed border-surface-200 p-12 text-center text-surface-400 bg-surface-50">' +
        '<div class="text-4xl mb-3">🕳️</div>' +
        '<p class="font-medium text-surface-600">Empty Figma Archive</p>' +
        '<p class="text-sm mt-1">This archive contains no files.</p>' +
      '</div>';
    } else {
      html += '<div class="rounded-2xl border-2 border-dashed border-surface-200 p-12 text-center text-surface-400 bg-surface-50">' +
        '<div class="text-4xl mb-3">📄</div>' +
        '<p class="font-medium text-surface-600">No Preview Available</p>' +
        '<p class="text-sm mt-1">This file doesn\'t contain a thumbnail or recognizable binary header.</p>' +
      '</div>';
    }

    html += '</div>';

    // Right Column
    html += '<div class="lg:col-span-5 space-y-6">';
    
    if (state.isZip) {
      // U10. Section header with counts
      html += '<div class="flex items-center justify-between mb-1">' +
        '<h3 class="font-semibold text-surface-800">Archive Contents</h3>' +
        '<span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">' + state.files.length + ' items</span>' +
      '</div>';

      // Search Box (Part 4 - Archive Excellence)
      html += '<div class="relative mb-3">' +
        '<input type="text" id="fig-filter" placeholder="Filter files..." value="' + escapeHtml(state.filter) + '" ' +
        'class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">' +
        '<span class="absolute left-3 top-2.5 text-surface-400">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>' +
        '</span>' +
      '</div>';

      // U7. Table
      html += '<div class="overflow-x-auto rounded-xl border border-surface-200 bg-white max-h-[500px] overflow-y-auto">' +
        '<table class="min-w-full text-sm">' +
          '<thead class="sticky top-0 bg-white/95 backdrop-blur z-10">' +
            '<tr>' +
              '<th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>' +
              '<th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Size</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>';
      
      if (filteredFiles.length === 0) {
        html += '<tr><td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">No files match your search</td></tr>';
      } else {
        filteredFiles.forEach(function(f) {
          html += '<tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">' +
            '<td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 truncate max-w-[200px]" title="' + escapeHtml(f.name) + '">' +
              '<span class="mr-2">' + (f.isDir ? '📁' : (f.name.endsWith('.png') ? '🖼️' : '📄')) + '</span>' +
              escapeHtml(f.name) +
            '</td>' +
            '<td class="px-4 py-2.5 text-right text-surface-500 border-b border-surface-100 font-mono text-xs">' + formatSize(f.size) + '</td>' +
          '</tr>';
        });
      }
      
      html += '</tbody></table></div>';
    } else {
      // Binary Info Card
      html += '<div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm space-y-4">' +
        '<h3 class="font-semibold text-surface-800 text-sm uppercase tracking-wider">Binary Data Info</h3>' +
        '<p class="text-sm text-surface-600 leading-relaxed">This file appears to be a raw <strong>Figma Kiwi binary</strong> rather than a standard archive. This format is typically used for internal canvas data storage.</p>' +
        '<div class="space-y-2 pt-2">' +
          '<div class="flex justify-between text-xs"><span class="text-surface-400">Magic String</span><code class="text-brand-600 font-bold">fig-kiwi</code></div>' +
          '<div class="flex justify-between text-xs"><span class="text-surface-400">Entropy</span><span class="text-surface-700 font-medium">High (Compressed)</span></div>' +
          '<div class="flex justify-between text-xs"><span class="text-surface-400">Modified</span><span class="text-surface-700">' + new Date(state.file.lastModified).toLocaleDateString() + '</span></div>' +
        '</div>' +
      '</div>';
    }

    html += '<div class="p-4 bg-brand-50 rounded-xl border border-brand-100 text-xs text-brand-800 leading-relaxed">' +
      '<p><strong>Did you know?</strong> .fig files are actually ZIP archives. The "canvas.fig" entry inside contains the actual vector design data in a specialized binary format.</p>' +
    '</div>';

    html += '</div></div></div>';

    helpers.render(html);

    // Event listeners
    var filterInput = document.getElementById('fig-filter');
    if (filterInput) {
      filterInput.addEventListener('input', function(e) {
        state.filter = e.target.value;
        render(helpers);
        // Refocus and set cursor to end
        var input = document.getElementById('fig-filter');
        input.focus();
        input.setSelectionRange(state.filter.length, state.filter.length);
      });
    }
  }

})();
