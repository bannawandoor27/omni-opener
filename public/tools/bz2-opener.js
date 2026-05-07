/**
 * OmniOpener — BZip2 Toolkit
 * Professional browser-based decompression and analysis using the OmniTool SDK.
 */
(function () {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function generateHexDump(uint8) {
    var out = '';
    for (var i = 0; i < uint8.length; i += 16) {
      var line = i.toString(16).padStart(8, '0') + '  ';
      var ascii = '';
      for (var j = 0; j < 16; j++) {
        if (i + j < uint8.length) {
          var b = uint8[i + j];
          line += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          line += '   ';
        }
        if (j === 7) line += ' ';
      }
      out += line + ' |' + ascii + '|\n';
    }
    return out;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.bz2',
      onInit: function (h) {
        return h.loadScript('https://cdn.jsdelivr.net/gh/antimatter15/bzip2.js/bzip2.js');
      },
      onFile: function (file, content, h) {
        h.showLoading('Decompressing BZip2 archive...');

        var prevState = h.getState();
        if (prevState && prevState.previewUrl) {
          URL.revokeObjectURL(prevState.previewUrl);
        }

        return h.loadScript('https://cdn.jsdelivr.net/gh/antimatter15/bzip2.js/bzip2.js')
          .then(function () {
            return processFile(file, content, h);
          });
      },
      actions: [
        {
          label: '📥 Download Unpacked',
          id: 'dl-unpacked',
          onClick: function (h) {
            var state = h.getState();
            if (state && state.decompressed) {
              h.download(state.originalName, state.decompressed);
            }
          }
        },
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            var state = h.getState();
            if (state && state.hashHex) {
              h.copyToClipboard(state.hashHex, btn);
            }
          }
        }
      ]
    });

    function processFile(file, content, h) {
      var uint8 = new Uint8Array(content);

      if (uint8[0] !== 0x42 || uint8[1] !== 0x5A || uint8[2] !== 0x68) {
        throw new Error('Invalid BZip2 signature (expected "BZh")');
      }

      var bitstream = bzip2.array(uint8);
      var decodedString = bzip2.simple(bitstream);
      
      var decompressed = new Uint8Array(decodedString.length);
      for (var i = 0; i < decodedString.length; i++) {
        decompressed[i] = decodedString.charCodeAt(i) & 0xff;
      }

      if (decompressed.length === 0) {
        throw new Error('Decompressed archive is empty');
      }

      var originalName = file.name.replace(/\.bz2$/i, '') || 'unpacked_file';
      var ratio = ((1 - (file.size / decompressed.length)) * 100).toFixed(1);

      return crypto.subtle.digest('SHA-256', content).then(function (hashBuffer) {
        var hashHex = Array.from(new Uint8Array(hashBuffer))
          .map(function(b) { return b.toString(16).padStart(2, '0'); })
          .join('');

        h.setState({
          decompressed: decompressed,
          originalName: originalName,
          hashHex: hashHex
        });

        var previewHtml = '';
        var isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(originalName);

        if (isImage) {
          var blob = new Blob([decompressed]);
          var url = URL.createObjectURL(blob);
          h.setState({ previewUrl: url });
          previewHtml = '<div class="mt-8">' +
              '<h3 class="font-bold text-surface-800 mb-4">Visual Preview</h3>' +
              '<div class="bg-surface-50 p-4 rounded-2xl border border-surface-200 flex justify-center shadow-sm">' +
                '<img src="' + url + '" class="max-w-full max-h-[500px] rounded shadow-sm border border-white" alt="Preview">' +
              '</div>' +
            '</div>';
        } else {
          var sample = decompressed.slice(0, 1024);
          var isProbablyText = Array.from(sample).every(function(b) {
            return b === 10 || b === 13 || b === 9 || (b >= 32 && b <= 126);
          });
          
          if (isProbablyText) {
            var text = new TextDecoder().decode(decompressed.slice(0, 30000));
            previewHtml = '<div class="mt-8">' +
                '<div class="flex items-center justify-between mb-3">' +
                  '<h3 class="font-bold text-surface-800">Text Content Preview</h3>' +
                  '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Text Mode</span>' +
                '</div>' +
                '<pre class="p-4 text-xs font-mono bg-gray-900 text-gray-100 rounded-xl overflow-auto max-h-[400px] leading-relaxed border border-gray-800 shadow-inner">' + esc(text) + (decompressed.length > 30000 ? '\n\n... [Truncated for Performance]' : '') + '</pre>' +
              '</div>';
          } else {
            var hexDump = generateHexDump(decompressed.slice(0, 2048));
            previewHtml = '<div class="mt-8">' +
                '<div class="flex items-center justify-between mb-3">' +
                  '<h3 class="font-bold text-surface-800">Binary Preview (Hex Dump)</h3>' +
                  '<span class="text-[10px] bg-surface-200 text-surface-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Binary Mode</span>' +
                '</div>' +
                '<pre class="p-4 text-[11px] font-mono bg-white text-surface-700 rounded-xl border border-surface-200 overflow-auto max-h-[400px] leading-tight shadow-inner">' + esc(hexDump) + '</pre>' +
              '</div>';
          }
        }

        h.render(
          '<div class="max-w-4xl mx-auto p-4 md:p-6">' +
            '<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">' +
              '<div class="md:col-span-2 bg-white rounded-3xl border border-surface-200 shadow-sm overflow-hidden">' +
                '<div class="px-6 py-4 bg-surface-50 border-b border-surface-100 flex justify-between items-center">' +
                  '<h2 class="font-bold text-surface-900">Extraction Report</h2>' +
                  '<div class="flex items-center gap-2">' +
                     '<span class="w-2 h-2 rounded-full bg-green-500"></span>' +
                     '<span class="text-[10px] font-bold uppercase tracking-wider text-green-700">Success</span>' +
                  '</div>' +
                '</div>' +
                '<div class="p-6">' +
                  '<div class="grid grid-cols-3 gap-4 mb-8">' +
                    '<div class="bg-surface-50 p-3 rounded-2xl border border-surface-100">' +
                      '<div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Compressed</div>' +
                      '<div class="font-mono font-bold text-surface-700 text-lg">' + formatSize(file.size) + '</div>' +
                    '</div>' +
                    '<div class="bg-surface-50 p-3 rounded-2xl border border-surface-100">' +
                      '<div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Unpacked</div>' +
                      '<div class="font-mono font-bold text-brand-600 text-lg">' + formatSize(decompressed.length) + '</div>' +
                    '</div>' +
                    '<div class="bg-surface-50 p-3 rounded-2xl border border-surface-100">' +
                      '<div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Efficiency</div>' +
                      '<div class="font-mono font-bold text-orange-600 text-lg">' + ratio + '%</div>' +
                    '</div>' +
                  '</div>' +

                  '<div class="bg-brand-50 rounded-2xl p-5 border border-brand-100 flex flex-col sm:flex-row items-center gap-4">' +
                    '<div class="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-2xl border border-brand-200">📦</div>' +
                    '<div class="flex-1 min-w-0 text-center sm:text-left">' +
                      '<div class="text-sm font-bold text-brand-900 truncate">' + esc(originalName) + '</div>' +
                      '<div class="text-[10px] text-brand-600 font-bold uppercase tracking-tight">Ready for Download</div>' +
                    '</div>' +
                    '<button id="main-dl-btn" class="w-full sm:w-auto px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">' +
                      '<span>Download</span>' +
                    '</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +

              '<div class="space-y-4">' +
                '<div class="bg-surface-50 rounded-3xl p-6 border border-surface-200 shadow-sm">' +
                  '<h4 class="text-[10px] font-bold text-surface-400 uppercase mb-4 tracking-widest">Integrity Check</h4>' +
                  '<div>' +
                    '<label class="text-[10px] text-surface-400 uppercase font-bold block mb-1.5">SHA-256 Fingerprint</label>' +
                    '<div class="bg-white border border-surface-200 rounded-xl p-3 flex items-center gap-2">' +
                      '<code class="text-[10px] text-surface-600 break-all flex-1 font-mono leading-tight">' + hashHex + '</code>' +
                      '<button id="copy-hash-inner" class="p-2 hover:bg-surface-100 rounded-lg text-surface-400 hover:text-brand-600 transition-colors">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>' +
                      '</button>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="bg-white rounded-3xl p-6 border border-surface-200 shadow-sm">' +
                  '<h4 class="text-[10px] font-bold text-surface-400 uppercase mb-2 tracking-widest">Security</h4>' +
                  '<p class="text-[11px] text-surface-500 leading-relaxed">Decompression is handled locally using your browser\'s resources. No data is transmitted to our servers.</p>' +
                '</div>' +
              '</div>' +
            '</div>' +
            previewHtml +
          '</div>'
        );

        var dlBtn = document.getElementById('main-dl-btn');
        if (dlBtn) dlBtn.onclick = function () { h.download(originalName, decompressed); };
        
        var copyBtn = document.getElementById('copy-hash-inner');
        if (copyBtn) copyBtn.onclick = function (e) { h.copyToClipboard(hashHex, e.currentTarget); };
      });
    }
  };
})();
