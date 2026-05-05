/**
 * OmniOpener — LZ4 Opener
 * Uses OmniTool SDK and lz4js for client-side decompression.
 */
(function () {
  'use strict';

  /**
   * Escapes HTML to prevent XSS (B6)
   */
  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format bytes to human readable string
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
            if (state && state.decompressed) {
              h.download(state.originalName || 'extracted_file', state.decompressed);
            }
          }
        },
        {
          label: '📋 Copy Content',
          id: 'copy-text',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state) return;
            
            if (state.isText && state.fullText) {
              h.copyToClipboard(state.fullText, btn);
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

      onDestroy: function (h) {
        // Clean up any state or URLs if needed
      },

      onFile: function _onFileFn(file, content, h) {
        // B8: Use named function to avoid 'this' context issues
        
        // B1: Check if lz4js is loaded
        if (typeof lz4js === 'undefined') {
          h.showLoading('Loading decompressor...');
          setTimeout(function() {
            _onFileFn(file, content, h);
          }, 200);
          return;
        }

        h.showLoading('Decompressing LZ4 archive...');

        // Delay slightly to let the loading spinner show up
        setTimeout(function () {
          try {
            const uint8 = new Uint8Array(content);
            const decompressed = lz4js.decompress(uint8);
            const originalName = file.name.replace(/\.lz4$/i, '') || 'extracted_file';
            
            let isText = true;
            let previewText = '';
            let fullText = '';
            
            try {
              // B2: Handle binary correctly
              const decoder = new TextDecoder('utf-8', { fatal: true });
              
              // Sample check
              decoder.decode(decompressed.slice(0, 4096));
              
              // B7: Handle large files
              const MAX_PREVIEW = 100 * 1024; // 100KB preview
              if (decompressed.length > MAX_PREVIEW) {
                previewText = new TextDecoder().decode(decompressed.slice(0, MAX_PREVIEW));
                // Only store full text if it's reasonable (e.g. < 5MB)
                if (decompressed.length < 5 * 1024 * 1024) {
                  fullText = new TextDecoder().decode(decompressed);
                }
              } else {
                fullText = new TextDecoder().decode(decompressed);
                previewText = fullText;
              }
            } catch (e) {
              isText = false;
            }

            h.setState({
              decompressed: decompressed,
              fullText: fullText,
              previewText: previewText,
              isText: isText,
              originalName: originalName,
              filter: ''
            });

            const ratio = (decompressed.length / file.size).toFixed(2);
            const sizeStr = formatSize(file.size);
            const unpackedStr = formatSize(decompressed.length);

            const renderUI = (state) => {
              const { isText, previewText, filter } = state;
              
              let displayContent = previewText;
              if (isText && filter) {
                const lines = previewText.split('\n');
                const filtered = lines.filter(line => line.toLowerCase().includes(filter.toLowerCase()));
                displayContent = filtered.join('\n');
                if (filtered.length === 0) displayContent = 'No matches found for "' + filter + '"';
              }

              h.render(`
                <div class="p-4 md:p-6 max-w-5xl mx-auto">
                  <!-- U1: File Info Bar -->
                  <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                    <span class="font-semibold text-surface-800">${escape(file.name)}</span>
                    <span class="text-surface-300">|</span>
                    <span>${sizeStr}</span>
                    <span class="text-surface-300">|</span>
                    <span class="text-surface-500">LZ4 Archive</span>
                    <span class="ml-auto text-xs font-medium px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                      ${ratio}x ratio
                    </span>
                  </div>

                  <!-- Statistics Cards -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm flex items-center gap-4">
                      <div class="w-12 h-12 rounded-lg bg-surface-100 flex items-center justify-center text-2xl">📦</div>
                      <div>
                        <div class="text-xs font-bold text-surface-400 uppercase tracking-wider">Compressed Size</div>
                        <div class="text-xl font-mono font-bold text-surface-800">${sizeStr}</div>
                      </div>
                    </div>
                    <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm flex items-center gap-4 border-l-4 border-l-brand-500">
                      <div class="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center text-2xl text-brand-500">📤</div>
                      <div>
                        <div class="text-xs font-bold text-surface-400 uppercase tracking-wider">Unpacked Size</div>
                        <div class="text-xl font-mono font-bold text-brand-600">${unpackedStr}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Content Area -->
                  <div class="space-y-4">
                    <div class="flex items-center justify-between">
                      <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                        ${isText ? '📄 Text Content' : '📦 Binary Data'}
                        ${decompressed.length > MAX_PREVIEW ? '<span class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded italic">Showing first 100KB</span>' : ''}
                      </h3>
                      
                      ${isText ? `
                        <div class="relative w-64">
                          <input type="text" 
                                 id="lz4-search"
                                 placeholder="Search content..." 
                                 value="${escape(filter || '')}"
                                 class="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-surface-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                          />
                          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                        </div>
                      ` : ''}
                    </div>

                    <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm bg-gray-950">
                      ${isText ? `
                        <pre class="p-4 text-[13px] font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-surface-700">${escape(displayContent)}</pre>
                      ` : `
                        <div class="p-12 text-center">
                          <div class="text-6xl mb-6">💾</div>
                          <h4 class="text-white font-bold text-lg mb-2">Binary File Detected</h4>
                          <p class="text-gray-400 text-sm mb-8 max-w-md mx-auto">
                            The decompressed content is binary data and cannot be displayed as text. 
                            You can download the extracted file using the button below.
                          </p>
                          <button onclick="document.getElementById('omni-action-download-extracted').click()" 
                                  class="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-sm shadow-lg transition-all transform hover:scale-105 active:scale-95">
                            Extract and Save File
                          </button>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              `);

              // Add search listener
              const searchInput = document.getElementById('lz4-search');
              if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                  const newFilter = e.target.value;
                  const newState = { ...h.getState(), filter: newFilter };
                  h.setState(newState);
                  renderUI(newState);
                });
                // Maintain focus
                if (filter) searchInput.focus();
                searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
              }
            };

            renderUI(h.getState());

          } catch (err) {
            h.showError('Decompression Failed', 'The LZ4 archive might be corrupted or in an unsupported format. Error: ' + err.message);
          }
        }, 50);
      }
    });
  };
})();
