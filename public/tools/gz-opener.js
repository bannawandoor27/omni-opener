/**
 * OmniOpener — GZIP Toolkit
 * Professional-grade browser-based decompression for .gz files.
 */
(function () {
  'use strict';

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gz',
      binary: true,
      infoHtml: '<strong>GZIP Toolkit:</strong> Secure, client-side decompression for GZIP archives. Real-time size analysis and content preview without server uploads.',
      
      actions: [
        {
          label: '📥 Download Unpacked',
          id: 'download',
          onClick: function (h) {
            var state = h.getState();
            if (state.decompressed && state.filename) {
              h.download(state.filename, state.decompressed, 'application/octet-stream');
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (h, btn) {
            var state = h.getState();
            if (state.textContent) {
              h.copyToClipboard(state.textContent, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing archive...');

        // Small delay to ensure the loading message renders first
        setTimeout(function () {
          try {
            if (typeof pako === 'undefined') {
              h.showError('Engine Not Loaded', 'The decompression engine (pako) is still loading. Please try again in a moment.');
              return;
            }

            var uint8 = new Uint8Array(content);
            var decompressed = pako.ungzip(uint8);
            var originalName = file.name.replace(/\.gz$/i, '') || 'unpacked_file';
            
            var textContent = null;
            var isText = false;
            var previewHtml = '';

            // Try to decode as text for preview
            try {
              var decoder = new TextDecoder('utf-8', { fatal: true });
              textContent = decoder.decode(decompressed);
              isText = true;

              var displayContent = textContent.length > 50000 
                ? textContent.substring(0, 50000) + '\n\n... (truncated for preview) ...'
                : textContent;

              previewHtml = 
                '<div class="mt-6">' +
                  '<div class="flex items-center justify-between mb-3">' +
                    '<h3 class="font-semibold text-surface-800 text-sm">Content Preview</h3>' +
                    '<span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase">Text Detected</span>' +
                  '</div>' +
                  '<div class="rounded-xl overflow-hidden border border-surface-200">' +
                    '<pre class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[500px] whitespace-pre-wrap break-all">' + esc(displayContent) + '</pre>' +
                  '</div>' +
                '</div>';
            } catch (e) {
              // Binary data
              previewHtml = 
                '<div class="mt-6 flex flex-col items-center justify-center p-12 border-2 border-dashed border-surface-200 rounded-xl bg-surface-50">' +
                  '<div class="text-4xl mb-4">📄</div>' +
                  '<div class="text-surface-600 font-medium">Binary Content</div>' +
                  '<div class="text-surface-400 text-sm mt-1">This file contains binary data and cannot be previewed as text.</div>' +
                '</div>';
            }

            h.setState({
              decompressed: decompressed,
              filename: originalName,
              textContent: textContent
            });

            var ratio = ((decompressed.length / file.size) * 100).toFixed(1);

            h.render(
              '<div class="p-6">' +
                '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">' +
                  '<div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">' +
                    '<div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Compressed</div>' +
                    '<div class="text-2xl font-bold text-surface-900">' + formatBytes(file.size) + '</div>' +
                  '</div>' +
                  '<div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm border-l-4 border-l-brand-500">' +
                    '<div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Unpacked Size</div>' +
                    '<div class="text-2xl font-bold text-brand-600">' + formatBytes(decompressed.length) + '</div>' +
                  '</div>' +
                  '<div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">' +
                    '<div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Expansion Ratio</div>' +
                    '<div class="text-2xl font-bold text-surface-900">' + ratio + '%</div>' +
                  '</div>' +
                '</div>' +

                '<div class="bg-surface-50 p-6 rounded-2xl border border-surface-100">' +
                  '<div class="flex items-center gap-4 mb-6">' +
                    '<div class="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white text-xl shadow-lg">' +
                      '📦' +
                    '</div>' +
                    '<div>' +
                      '<div class="text-sm font-bold text-surface-900">Extracted File</div>' +
                      '<div class="text-xs text-surface-500 font-mono">' + esc(originalName) + '</div>' +
                    '</div>' +
                    '<div class="ml-auto">' +
                       '<button onclick="document.getElementById(\'omni-action-download\').click()" class="px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm font-semibold text-surface-700 hover:bg-surface-50 transition-colors shadow-sm">' +
                         'Download File' +
                       '</button>' +
                    '</div>' +
                  '</div>' +
                  previewHtml +
                '</div>' +

                '<div class="mt-8 flex items-center justify-between px-2 text-[11px] text-surface-400 font-medium">' +
                  '<div class="flex items-center gap-4">' +
                    '<span>Algorithm: DEFLATE</span>' +
                    '<span>Format: GZIP (RFC 1952)</span>' +
                  '</div>' +
                  '<span>Processed Client-Side via Pako</span>' +
                '</div>' +
              '</div>'
            );

          } catch (err) {
            h.showError('Decompression Failed', 'This file could not be decompressed. It may be corrupted or not a valid GZIP archive.');
          }
        }, 100);
      }
    });
  };
})();
