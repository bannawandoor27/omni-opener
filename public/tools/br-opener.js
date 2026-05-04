(function () {
  'use strict';

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.br',
      dropLabel: 'Drop a Brotli (.br) file here',
      infoHtml: '<strong>Brotli Decompressor:</strong> This tool decompresses .br files 100% locally in your browser. Perfect for inspecting compressed web assets without uploading them to any server.',

      actions: [
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            var state = h.getState();
            if (state.decompressed) {
              h.download(state.decompressedFilename || 'file', state.decompressed, 'application/octet-stream');
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (h, btn) {
            var state = h.getState();
            if (state.text) {
              h.copyToClipboard(state.text, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof BrotliDecode === 'undefined') {
          return h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing Brotli file...');

        return h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js').then(function () {
          try {
            var uint8 = new Uint8Array(content);
            var decompressed = BrotliDecode(uint8);

            if (!decompressed || decompressed.length === 0) {
              throw new Error('Decompression failed or returned empty data.');
            }

            var filename = file.name.endsWith('.br') ? file.name.slice(0, -3) : file.name + '.out';
            h.setState({
              decompressed: decompressed,
              decompressedFilename: filename
            });

            // Detect if it's text
            var text = '';
            var isBinary = false;
            try {
              var decoder = new TextDecoder('utf-8', { fatal: true });
              text = decoder.decode(decompressed);
              // Check for null bytes or other common binary indicators in the first 8KB
              if (text.slice(0, 8192).indexOf('\0') !== -1) {
                isBinary = true;
              }
            } catch (e) {
              isBinary = true;
            }

            if (!isBinary) {
              h.setState({ text: text });
              h.render(
                '<div class="p-6">' +
                  '<div class="flex items-center justify-between mb-3 text-surface-500 text-xs uppercase tracking-wider font-semibold">' +
                    '<span>Decompressed Preview</span>' +
                    '<span>' + decompressed.length.toLocaleString() + ' bytes</span>' +
                  '</div>' +
                  '<pre id="br-content-preview" class="text-xs font-mono whitespace-pre-wrap break-all bg-surface-50 p-4 rounded-xl border border-surface-200 max-h-[600px] overflow-auto text-surface-800"></pre>' +
                '</div>'
              );
              var previewEl = document.getElementById('br-content-preview');
              if (previewEl) previewEl.textContent = text;
              
              var copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.classList.remove('hidden');
            } else {
              h.setState({ text: null });
              h.render(
                '<div class="flex flex-col items-center justify-center py-24">' +
                  '<div class="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center text-4xl mb-6">📦</div>' +
                  '<div class="text-xl font-bold text-surface-900">Decompressed Binary</div>' +
                  '<div class="text-sm text-surface-500 mt-2 font-mono bg-surface-50 px-3 py-1 rounded border border-surface-200">' + esc(filename) + '</div>' +
                  '<div class="text-xs text-surface-400 mt-4">' + decompressed.length.toLocaleString() + ' bytes</div>' +
                  '<div class="mt-8 px-4 py-2 bg-surface-50 text-surface-600 text-xs rounded border border-surface-100">' +
                    'This file contains binary data and cannot be previewed as text.' +
                  '</div>' +
                '</div>'
              );
              
              var copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.classList.add('hidden');
            }
          } catch (err) {
            h.showError('Decompression Error', err.message || 'The Brotli file may be corrupted or use an unsupported feature.');
          }
        });
      }
    });
  };
})();
