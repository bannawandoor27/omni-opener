/**
 * OmniOpener — GZ Opener Tool
 * Uses OmniTool SDK. Decompresses .gz files in the browser using pako.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.gz',
      dropLabel: 'Drop a .gz file here',
      infoHtml: '<strong>Privacy:</strong> Decompression happens entirely in your browser. No data is uploaded.',

      actions: [
        {
          label: '📥 Download Decompressed',
          id: 'download',
          onClick: function (h) {
            var state = h.getState();
            if (state.decompressed) {
              var originalName = h.getFile().name;
              var newName = originalName.replace(/\.gz$/i, '') || 'decompressed_file';
              h.download(newName, state.decompressed);
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (h, btn) {
            var state = h.getState();
            if (state.isText && state.textValue) {
              h.copyToClipboard(state.textValue, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing...');

        // Ensure pako is loaded
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', function() {
            processGz(content, h);
          });
        } else {
          processGz(content, h);
        }
      }
    });
  };

  function processGz(arrayBuffer, h) {
    try {
      var uint8 = new Uint8Array(arrayBuffer);
      var decompressed = pako.ungzip(uint8);
      h.setState('decompressed', decompressed);

      // Try to detect if it's text
      var isText = true;
      var textValue = '';
      try {
        var decoder = new TextDecoder('utf-8', { fatal: true });
        textValue = decoder.decode(decompressed);
        h.setState('isText', true);
        h.setState('textValue', textValue);
      } catch (e) {
        h.setState('isText', false);
        isText = false;
      }

      if (isText) {
        var escapedText = textValue
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        
        h.render(
          '<div class="p-4">' +
            '<div class="mb-4 flex items-center justify-between">' +
              '<span class="text-xs font-mono text-surface-400">Preview (First 100KB)</span>' +
              '<span class="text-xs text-surface-400">' + decompressed.length + ' bytes decompressed</span>' +
            '</div>' +
            '<pre class="text-sm font-mono bg-surface-50 p-4 rounded-lg overflow-auto max-h-[600px] whitespace-pre-wrap break-all">' +
              escapedText.substring(0, 102400) + (escapedText.length > 102400 ? '\n\n... (truncated)' : '') +
            '</pre>' +
          '</div>'
        );
      } else {
        h.render(
          '<div class="flex flex-col items-center justify-center h-64 text-center p-8">' +
            '<div class="text-500 mb-4">📄</div>' +
            '<p class="font-medium text-surface-700">Binary file decompressed</p>' +
            '<p class="text-sm text-surface-400 mt-1">Size: ' + decompressed.length + ' bytes</p>' +
            '<p class="text-xs text-surface-400 mt-4">This file contains binary data and cannot be previewed as text.</p>' +
          '</div>'
        );
      }

      // Show/hide copy action based on text content
      var copyBtn = document.getElementById('omni-action-copy');
      if (copyBtn) {
        if (isText) copyBtn.classList.remove('hidden');
        else copyBtn.classList.add('hidden');
      }

    } catch (err) {
      h.showError('Decompression failed', err.message);
    }
  }

})();
