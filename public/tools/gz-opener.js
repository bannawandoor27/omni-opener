/**
 * OmniOpener — GZIP Toolkit
 * Professional-grade browser-based decompression for .gz files.
 */
(function () {
  'use strict';

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    // Closure variables for state and cleanup
    let lastDecompressed = null;
    let lastOriginalName = '';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.gz',
      binary: true,
      infoHtml: '<strong>GZIP Toolkit:</strong> Secure, client-side decompression for GZIP archives. Real-time size analysis and content preview without server uploads.',
      
      actions: [
        {
          label: '📥 Download Unpacked',
          id: 'download',
          onClick: function (h) {
            const { decompressed, originalName } = h.getState();
            if (decompressed && originalName) {
              h.download(originalName, decompressed, 'application/octet-stream');
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (h, btn) {
            const { textContent } = h.getState();
            if (textContent) {
              h.copyToClipboard(textContent, btn);
            } else {
              const orig = btn.textContent;
              btn.textContent = '❌ No Text';
              setTimeout(() => { btn.textContent = orig; }, 1500);
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onDestroy: function() {
        lastDecompressed = null;
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof pako === 'undefined') {
          h.showLoading('Preparing engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        h.showLoading('Decompressing archive...');

        // Wrap in setTimeout to ensure the loading message renders first
        setTimeout(() => {
          try {
            const uint8 = new Uint8Array(content);
            const decompressed = pako.ungzip(uint8);
            const originalName = file.name.replace(/\.gz$/i, '') || 'unpacked_file';
            
            lastDecompressed = decompressed;
            lastOriginalName = originalName;

            let textContent = null;
            let isText = false;
            let previewHtml = '';

            // Try to decode as text for preview (first 1MB to avoid hanging browser)
            try {
              const decoder = new TextDecoder('utf-8', { fatal: true });
              const previewSlice = decompressed.slice(0, 1024 * 1024);
              textContent = decoder.decode(decompressed);
              isText = true;

              const displayContent = textContent.length > 50000 
                ? textContent.substring(0, 50000) + '\n\n... (truncated for performance) ...'
                : textContent;

              previewHtml = `
                <div class="mt-6">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Content Preview</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${isText ? 'Text Detected' : 'Binary Data'}</span>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[500px] whitespace-pre-wrap break-all">${escapeHtml(displayContent)}</pre>
                  </div>
                </div>
              `;
            } catch (e) {
              // Not text or failed to decode
              previewHtml = `
                <div class="mt-6 flex flex-col items-center justify-center p-12 border-2 border-dashed border-surface-200 rounded-xl bg-surface-50">
                  <div class="text-4xl mb-4">📄</div>
                  <div class="text-surface-600 font-medium">Binary Content</div>
                  <div class="text-surface-400 text-sm mt-1">This file contains binary data and cannot be previewed as text.</div>
                </div>
              `;
            }

            h.setState({
              decompressed: decompressed,
              originalName: originalName,
              textContent: textContent
            });

            const ratio = ((decompressed.length / file.size) * 100).toFixed(1);

            h.render(`
              <div class="max-w-4xl mx-auto">
                <!-- U1. File info bar -->
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                  <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatBytes(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">GZIP Archive</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Compressed</div>
                    <div class="text-2xl font-bold text-surface-900">${formatBytes(file.size)}</div>
                  </div>
                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm border-l-4 border-l-brand-500">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Unpacked Size</div>
                    <div class="text-2xl font-bold text-brand-600">${formatBytes(decompressed.length)}</div>
                  </div>
                  <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Expansion Ratio</div>
                    <div class="text-2xl font-bold text-surface-900">${ratio}%</div>
                  </div>
                </div>

                <div class="bg-surface-50/50 p-6 rounded-2xl border border-surface-100">
                  <div class="flex items-center gap-4 mb-6">
                    <div class="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white text-xl shadow-lg shadow-brand-200">
                      📦
                    </div>
                    <div>
                      <div class="text-sm font-bold text-surface-900">Extracted File</div>
                      <div class="text-xs text-surface-500 font-mono">${escapeHtml(originalName)}</div>
                    </div>
                    <div class="ml-auto">
                       <button onclick="document.getElementById('omni-action-download').click()" class="px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm font-semibold text-surface-700 hover:bg-surface-50 transition-colors shadow-sm">
                         Download File
                       </button>
                    </div>
                  </div>
                  
                  ${previewHtml}
                </div>

                <!-- Footer Stats -->
                <div class="mt-8 flex items-center justify-between px-2 text-[11px] text-surface-400 font-medium">
                  <div class="flex items-center gap-4">
                    <span>Algorithm: DEFLATE</span>
                    <span>Format: GZIP (RFC 1952)</span>
                  </div>
                  <span>Processed Client-Side via Pako</span>
                </div>
              </div>
            `);

          } catch (err) {
            console.error('GZIP Error:', err);
            h.showError('Decompression Failed', 'This file could not be decompressed. It may be corrupted, password protected, or not a valid GZIP archive.');
          }
        }, 50);
      }
    });
  };
})();
