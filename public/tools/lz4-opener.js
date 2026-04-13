/**
 * OmniOpener — LZ4 Opener
 * Uses OmniTool SDK and lz4js for client-side decompression.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.lz4',
      infoHtml: '<strong>Privacy:</strong> LZ4 decompression happens entirely in your browser. No data is uploaded to any server.',

      actions: [
        {
          label: '📥 Download Extracted',
          id: 'download-extracted',
          onClick: function (h) {
            const state = h.getState();
            if (state.decompressed) {
              h.download(state.originalName || 'extracted_file', state.decompressed);
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy-text',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.isText && state.decompressedText) {
              h.copyToClipboard(state.decompressedText, btn);
            } else if (state.decompressed) {
              try {
                const text = new TextDecoder().decode(state.decompressed);
                h.copyToClipboard(text, btn);
              } catch (e) {
                h.showError('Copy Failed', 'Content is binary and cannot be copied as text.');
              }
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/lz4js@0.2.0/lz4js.min.js');
      },

      onFile: function (file, content, h) {
        const self = this;
        if (typeof lz4js === 'undefined') {
          h.showLoading('Loading LZ4 decompressor...');
          setTimeout(function () {
            if (typeof lz4js !== 'undefined') self.onFile(file, content, h);
            else h.showError('Dependency Error', 'Failed to load lz4js library.');
          }, 1000);
          return;
        }

        h.showLoading('Decompressing LZ4 archive...');
        
        // Small delay to ensure UI updates
        setTimeout(function () {
          try {
            const uint8 = new Uint8Array(content);
            const decompressed = lz4js.decompress(uint8);
            const originalName = file.name.replace(/\.lz4$/i, '');
            
            let isText = true;
            let decompressedText = '';
            try {
              const decoder = new TextDecoder('utf-8', { fatal: true });
              // Try to decode a sample to check if it's text
              decoder.decode(decompressed.slice(0, 8192));
              // If successful, decode the whole thing (if not too large)
              if (decompressed.length < 5 * 1024 * 1024) {
                decompressedText = new TextDecoder().decode(decompressed);
              } else {
                decompressedText = new TextDecoder().decode(decompressed.slice(0, 100000)) + '\n\n... [Content truncated for preview] ...';
              }
            } catch (e) {
              isText = false;
            }

            h.setState({
              decompressed: decompressed,
              decompressedText: decompressedText,
              isText: isText,
              originalName: originalName
            });

            const ratio = (decompressed.length / file.size).toFixed(2);
            
            h.render(`
              <div class="p-6 space-y-6 font-sans">
                <div class="flex items-center justify-between border-b border-surface-200 pb-4">
                  <div>
                    <h3 class="text-xl font-bold text-surface-900">${escapeHtml(file.name)}</h3>
                    <p class="text-sm text-surface-500">${(file.size / 1024).toFixed(2)} KB • LZ4 Archive</p>
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="bg-surface-50 rounded-xl p-4 border border-surface-200 text-center">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Compressed</div>
                    <div class="text-lg font-mono font-bold text-surface-700">${(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <div class="bg-surface-50 rounded-xl p-4 border border-surface-200 text-center">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Unpacked</div>
                    <div class="text-lg font-mono font-bold text-brand-600">${(decompressed.length / 1024).toFixed(1)} KB</div>
                  </div>
                  <div class="bg-surface-50 rounded-xl p-4 border border-surface-200 text-center">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Ratio</div>
                    <div class="text-lg font-mono font-bold text-surface-700">${ratio}x</div>
                  </div>
                </div>

                <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                    <span class="text-xs font-bold text-surface-700 uppercase tracking-wider">
                      ${isText ? '📄 Text Preview' : '📦 Binary Data'}
                    </span>
                  </div>
                  <div class="p-0">
                    ${isText ? `
                      <pre class="p-6 font-mono text-[13px] leading-relaxed text-surface-800 bg-white overflow-auto max-h-[500px] whitespace-pre-wrap">${escapeHtml(decompressedText)}</pre>
                    ` : `
                      <div class="p-20 text-center space-y-4">
                        <div class="text-5xl">💾</div>
                        <div>
                          <p class="text-surface-700 font-bold text-lg">Binary File Detected</p>
                          <p class="text-surface-500 text-sm mt-1">This archive contains binary data that cannot be previewed as text.</p>
                        </div>
                        <button onclick="document.getElementById('omni-action-download-extracted').click()" class="px-6 py-2 bg-brand-600 text-white rounded-lg font-bold text-sm shadow-md hover:bg-brand-700 transition-colors">
                          Extract and Save File
                        </button>
                      </div>
                    `}
                  </div>
                </div>
              </div>
            `);

          } catch (err) {
            h.showError('Decompression Failed', 'The LZ4 archive might be corrupted or in an unsupported format: ' + err.message);
          }
        }, 50);
      }
    });
  };
})();
