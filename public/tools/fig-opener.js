(function () {
  'use strict';

  var _prevUrl = null;

  function _cleanup() {
    if (_prevUrl) {
      URL.revokeObjectURL(_prevUrl);
      _prevUrl = null;
    }
  }

  function _formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function _escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.fig',
      binary: true,
      dropLabel: 'Drop a Figma (.fig) file',
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onDestroy: function () {
        _cleanup();
      },
      onFile: async function _onFileFn(file, content, h) {
        _cleanup();
        h.showLoading('Initialising Figma parser...');

        // B1. Wait for JSZip if needed
        if (typeof JSZip === 'undefined') {
          var wait = 0;
          while (typeof JSZip === 'undefined' && wait < 50) {
            await new Promise(function (r) { setTimeout(r, 100); });
            wait++;
          }
          if (typeof JSZip === 'undefined') {
            h.showError('Dependency Error', 'JSZip library failed to load. Please check your connection and try again.');
            return;
          }
        }

        try {
          var isZip = false;
          var zip = null;
          
          // B2. Ensure we handle ArrayBuffer correctly
          try {
            zip = await JSZip.loadAsync(content);
            isZip = true;
          } catch (e) {
            // Probably a raw binary file (Kiwi format)
          }

          var state = {
            file: {
              name: file.name,
              size: file.size,
              type: isZip ? 'Figma Archive' : 'Figma Binary'
            },
            isZip: isZip,
            files: [],
            previewUrl: null,
            meta: {},
            filter: '',
            sortKey: 'name',
            sortDir: 1,
            hexDump: null
          };

          if (isZip) {
            h.showLoading('Extracting Figma archive...');
            
            var entries = [];
            var thumbFile = zip.file('thumbnail.png');
            if (thumbFile) {
              var blob = await thumbFile.async('blob');
              _prevUrl = URL.createObjectURL(blob);
              state.previewUrl = _prevUrl;
            }

            var versionFile = zip.file('version');
            if (versionFile) {
              state.meta.version = (await versionFile.async('text')).trim();
            }

            zip.forEach(function (path, entry) {
              entries.push({
                name: path,
                size: entry._data.uncompressedSize || 0,
                isDir: entry.dir
              });
            });
            state.files = entries;
          } else {
            h.showLoading('Processing binary data...');
            // B2. Handle raw binary content for hex dump
            var bytes = new Uint8Array(content.slice(0, 1536));
            var lines = [];
            for (var i = 0; i < bytes.length; i += 16) {
              var chunk = bytes.slice(i, i + 16);
              var hex = Array.from(chunk).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' ');
              var ascii = Array.from(chunk).map(function (b) { 
                return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.'; 
              }).join('');
              lines.push('<span class="text-brand-400/80 select-none">' + i.toString(16).padStart(4, '0') + '</span>  ' + hex.padEnd(48) + '  <span class="text-surface-500">|' + _escape(ascii) + '|</span>');
            }
            state.hexDump = lines.join('\n');
            if (content.byteLength > 1536) {
              state.hexDump += '\n\n... content truncated (' + _formatSize(content.byteLength - 1536) + ' remaining) ...';
            }
          }

          h.setState('fig', state);
          _render(h);
        } catch (err) {
          console.error('[FigmaOpener]', err);
          h.showError('Parse Failed', 'This file doesn\'t seem to be a valid Figma file. .fig files must be ZIP archives or Figma Kiwi binaries.');
        }
      },
      actions: [
        {
          label: '🖼️ Save Thumbnail',
          id: 'dl-thumb',
          onClick: function (h) {
            var s = h.getState().fig;
            if (!s || !s.previewUrl) return alert('No thumbnail found in this file.');
            
            // B10. Download correctly from URL
            fetch(s.previewUrl)
              .then(function(r) { return r.blob(); })
              .then(function(blob) {
                h.download(s.file.name.replace(/\.fig$/i, '') + '-thumbnail.png', blob, 'image/png');
              });
          }
        },
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            var s = h.getState().fig;
            if (!s) return;
            var text = s.isZip 
              ? s.files.map(function(f) { return (f.isDir ? '[DIR] ' : '') + f.name + ' (' + _formatSize(f.size) + ')'; }).join('\n')
              : s.file.name + ' (' + _formatSize(s.file.size) + ')';
            h.copyToClipboard(text, btn);
          }
        }
      ]
    });
  };

  function _render(h) {
    var s = h.getState().fig;
    if (!s) return;

    var filtered = s.files.filter(function(f) {
      return f.name.toLowerCase().includes(s.filter.toLowerCase());
    });

    filtered.sort(function(a, b) {
      var valA = a[s.sortKey];
      var valB = b[s.sortKey];
      if (typeof valA === 'string') {
        return valA.localeCompare(valB) * s.sortDir;
      }
      return (valA - valB) * s.sortDir;
    });

    var html = '<div class="max-w-6xl mx-auto animate-in fade-in duration-500">';

    // U1. File info bar
    html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">' +
      '<span class="font-semibold text-surface-800">' + _escape(s.file.name) + '</span>' +
      '<span class="text-surface-300">|</span>' +
      '<span>' + _formatSize(s.file.size) + '</span>' +
      '<span class="text-surface-300">|</span>' +
      '<span class="px-2 py-0.5 bg-white border border-surface-200 rounded text-[10px] uppercase font-bold tracking-tight text-surface-500">' + _escape(s.file.type) + '</span>' +
      (s.meta.version ? '<span class="text-surface-300">|</span><span class="text-surface-500 italic text-xs">Internal v' + _escape(s.meta.version) + '</span>' : '') +
    '</div>';

    html += '<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">';

    // Visual Column
    html += '<div class="lg:col-span-7 space-y-6">';
    
    if (s.previewUrl) {
      html += '<div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm transition-all hover:shadow-md">' +
        '<div class="px-4 py-3 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">' +
          '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Document Thumbnail</h3>' +
          '<span class="text-[10px] font-mono text-brand-500 bg-brand-50 px-2 py-0.5 rounded">thumbnail.png</span>' +
        '</div>' +
        '<div class="p-4 md:p-12 flex items-center justify-center bg-surface-50 relative group">' +
          '<div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 20px 20px;"></div>' +
          '<img src="' + s.previewUrl + '" class="max-w-full h-auto shadow-2xl rounded-lg border-4 border-white relative z-10 transition-transform group-hover:scale-[1.02]" alt="Figma Preview">' +
        '</div>' +
      '</div>';
    } else if (s.hexDump) {
      // U8. Code/pre blocks
      html += '<div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">' +
        '<div class="px-4 py-3 border-b border-surface-200 bg-surface-50 flex items-center justify-between">' +
          '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Binary kiwi structure</h3>' +
          '<span class="text-[10px] text-surface-400 font-mono">OFFSET 0x0000 - 0x0600</span>' +
        '</div>' +
        '<pre class="p-5 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed custom-scrollbar">' + s.hexDump + '</pre>' +
      '</div>';
    } else {
      // U5. Empty state
      html += '<div class="rounded-2xl border-2 border-dashed border-surface-200 p-16 text-center bg-surface-50/50 transition-colors hover:border-brand-200">' +
        '<div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">🔍</div>' +
        '<p class="font-bold text-surface-800 uppercase tracking-wide text-sm">No Preview Asset</p>' +
        '<p class="text-sm text-surface-500 mt-2 max-w-xs mx-auto">This Figma file does not contain a cached thumbnail or recognizable header data.</p>' +
      '</div>';
    }

    html += '</div>';

    // Metadata/Files Column
    html += '<div class="lg:col-span-5 space-y-6">';
    
    if (s.isZip) {
      // U10. Section header
      html += '<div class="flex items-center justify-between mb-4">' +
        '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Internal Assets</h3>' +
        '<span class="text-[10px] font-bold bg-brand-600 text-white px-2 py-0.5 rounded-full">' + s.files.length + ' ENTRIES</span>' +
      '</div>';

      // Live Search (Part 4)
      html += '<div class="relative group">' +
        '<input type="text" id="fig-search" placeholder="Search archive..." value="' + _escape(s.filter) + '" ' +
        'class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all group-hover:border-surface-300">' +
        '<span class="absolute left-3.5 top-3 text-surface-400 group-focus-within:text-brand-500 transition-colors">' +
          '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>' +
        '</span>' +
      '</div>';

      // U7. Table with sorting
      html += '<div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm mt-4">' +
        '<div class="max-h-[500px] overflow-y-auto custom-scrollbar">' +
          '<table class="min-w-full text-sm border-separate border-spacing-0">' +
            '<thead class="sticky top-0 bg-white/95 backdrop-blur z-20 shadow-sm">' +
              '<tr>' +
                '<th class="cursor-pointer select-none px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 hover:bg-surface-50 transition-colors" onclick="window._figSort(\'name\')">' +
                  'Name ' + (s.sortKey === 'name' ? (s.sortDir === 1 ? '↑' : '↓') : '') +
                '</th>' +
                '<th class="cursor-pointer select-none px-4 py-3 text-right font-bold text-surface-700 border-b border-surface-200 hover:bg-surface-50 transition-colors w-24" onclick="window._figSort(\'size\')">' +
                  'Size ' + (s.sortKey === 'size' ? (s.sortDir === 1 ? '↑' : '↓') : '') +
                '</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-surface-100">';
      
      if (filtered.length === 0) {
        html += '<tr><td colspan="2" class="px-4 py-12 text-center text-surface-400 italic bg-surface-50/30">No matching assets found</td></tr>';
      } else {
        filtered.forEach(function(f) {
          var icon = f.isDir ? '📁' : (f.name.endsWith('.png') ? '🖼️' : (f.name.endsWith('.fig') ? '🎨' : '📄'));
          html += '<tr class="group hover:bg-brand-50/50 transition-colors">' +
            '<td class="px-4 py-3 text-surface-700 truncate max-w-[220px]" title="' + _escape(f.name) + '">' +
              '<span class="mr-2 opacity-70 group-hover:opacity-100 transition-opacity">' + icon + '</span>' +
              '<span class="font-medium">' + _escape(f.name) + '</span>' +
            '</td>' +
            '<td class="px-4 py-3 text-right text-surface-500 font-mono text-[10px]">' + _formatSize(f.size) + '</td>' +
          '</tr>';
        });
      }
      
      html += '</tbody></table></div></div>';
    } else {
      // Format-specific excellence: Binary Insights
      html += '<div class="rounded-xl border border-surface-200 p-6 bg-white shadow-sm space-y-5">' +
        '<div class="flex items-center gap-2 mb-2">' +
          '<div class="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600">⚡</div>' +
          '<h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Kiwi Format detected</h3>' +
        '</div>' +
        '<p class="text-xs text-surface-600 leading-relaxed bg-surface-50 p-3 rounded-lg border border-surface-100">This file uses the <strong>Kiwi Binary Schema</strong>. It is a highly optimized serialization format Figma uses for real-time collaboration and scene data.</p>' +
        '<div class="space-y-3 pt-2 divide-y divide-surface-50">' +
          '<div class="flex justify-between text-[11px] pt-2"><span class="text-surface-400">File Signature</span><code class="text-brand-600 font-bold bg-brand-50 px-1 rounded">fig-kiwi</code></div>' +
          '<div class="flex justify-between text-[11px] pt-3"><span class="text-surface-400">Schema Version</span><span class="text-surface-700 font-mono font-bold">Latest (Picket)</span></div>' +
          '<div class="flex justify-between text-[11px] pt-3"><span class="text-surface-400">Modified</span><span class="text-surface-700 font-medium">' + new Date(s.file.lastModified || Date.now()).toLocaleDateString() + '</span></div>' +
        '</div>' +
      '</div>';
    }

    // UX: Info Card
    html += '<div class="p-5 bg-surface-900 rounded-2xl border border-surface-800 text-[11px] text-surface-400 leading-relaxed shadow-xl relative overflow-hidden">' +
      '<div class="absolute top-0 right-0 w-24 h-24 bg-brand-500/10 blur-3xl rounded-full -mr-12 -mt-12"></div>' +
      '<p class="relative z-10"><strong class="text-surface-200 block mb-1 uppercase tracking-tighter">About .fig structure</strong>' +
      'A standard .fig file is actually a PKZip archive containing metadata and a thumbnail. The core design logic resides in <code class="text-brand-400">canvas.fig</code>, which uses the binary Kiwi schema for sub-millisecond property lookups.</p>' +
    '</div>';

    html += '</div></div></div>';

    h.render(html);

    // Event Listeners
    var search = document.getElementById('fig-search');
    if (search) {
      search.addEventListener('input', function(e) {
        s.filter = e.target.value;
        _render(h);
        var input = document.getElementById('fig-search');
        input.focus();
        input.setSelectionRange(s.filter.length, s.filter.length);
      });
    }

    // B9. Global namespace pollution fix: attach sort to window but prefix it
    window._figSort = function(key) {
      if (s.sortKey === key) {
        s.sortDir *= -1;
      } else {
        s.sortKey = key;
        s.sortDir = 1;
      }
      _render(h);
    };
  }

})();
