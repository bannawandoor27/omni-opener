(function () {
  'use strict';

  /**
   * Escape HTML utility
   */
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
      infoHtml: '<strong>Brotli Decompressor:</strong> This tool decompresses .br files 100% locally in your browser. Perfect for inspecting compressed web assets.',

      actions: [
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            var state = h.getState();
            if (state.decompressed) {
              h.download(state.decompressedFilename || 'file', state.decompressed);
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
          h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing...');

        function process() {
          // The unpkg build of brotli defines BrotliDecode globally
          if (typeof BrotliDecode === 'undefined') {
            setTimeout(process, 100);
            return;
          }

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

            // Try to decode as text to see if it's previewable
            var text = new TextDecoder().decode(decompressed);
            // Simple binary check: look for null bytes or control chars in the first 8KB
            var isBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 8192));

            if (!isBinary) {
              h.setState({ text: text });
              h.render('<div class="p-4"><pre id="br-content-preview" class="text-sm font-mono whitespace-pre-wrap break-all bg-surface-50 p-4 rounded-lg border border-surface-200"></pre></div>');
              var previewEl = document.getElementById('br-content-preview');
              if (previewEl) previewEl.textContent = text;
              
              var copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.style.display = 'block';
            } else {
              h.setState({ text: null });
              h.render(
                '<div class="flex flex-col items-center justify-center py-20">' +
                  '<div class="text-6xl mb-4">📦</div>' +
                  '<div class="text-lg font-semibold text-surface-900">Decompressed Binary File</div>' +
                  '<div class="text-sm text-surface-500 mt-2">' + esc(filename) + '</div>' +
                  '<div class="text-xs text-surface-400 mt-1">' + decompressed.length.toLocaleString() + ' bytes</div>' +
                '</div>'
              );
              
              var copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.style.display = 'none';
            }
          } catch (err) {
            h.showError('Decompression Error', err.message || 'The Brotli file may be corrupted or use an unsupported feature.');
          }
        }

        process();
      }
    });
  };
})();
