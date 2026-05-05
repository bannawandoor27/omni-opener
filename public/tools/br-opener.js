(function () {
  'use strict';

  // Helper for human-readable file sizes
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Helper to escape HTML and prevent XSS
  function esc(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    let currentText = '';

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.br',
      dropLabel: 'Drop a Brotli (.br) file here',
      infoHtml: '<strong>Brotli Decompressor:</strong> This tool decompresses .br files 100% locally in your browser. Perfect for inspecting compressed web assets without uploading them to any server.',

      actions: [
        {
          label: '📥 Download Decompressed',
          id: 'download',
          onClick: function (h) {
            const state = h.getState();
            if (state.decompressed) {
              const blob = new Blob([state.decompressed], { type: 'application/octet-stream' });
              h.download(state.filename || 'decompressed.out', blob);
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.text) {
              h.copyToClipboard(state.text, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        // Pre-load the Brotli decoder
        if (typeof BrotliDecode === 'undefined') {
          return h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js');
        }
      },

      onDestroy: function (h) {
        currentText = '';
      },

      onFile: function _onFile(file, content, h) {
        h.showLoading('Decompressing Brotli file...');

        // Ensure library is loaded (B1)
        h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js').then(function () {
          if (typeof BrotliDecode === 'undefined') {
            h.showError('Library Load Failed', 'The Brotli decompression library could not be loaded from the CDN.');
            return;
          }

          try {
            // B2: Ensure content is Uint8Array
            const uint8 = new Uint8Array(content);
            const decompressed = BrotliDecode(uint8);

            if (!decompressed || decompressed.length === 0) {
              throw new Error('Decompression failed or returned empty data.');
            }

            const filename = file.name.endsWith('.br') ? file.name.slice(0, -3) : file.name + '.out';
            
            // Detect if it's text
            let text = '';
            let isBinary = false;
            try {
              const decoder = new TextDecoder('utf-8', { fatal: true });
              text = decoder.decode(decompressed);
              // B7: Large file handling - if text is huge, we'll handle it in the render
              // Check for null bytes (B2/B9 check)
              if (text.slice(0, 8192).indexOf('\0') !== -1) {
                isBinary = true;
              }
            } catch (e) {
              isBinary = true;
            }

            h.setState({
              decompressed: decompressed,
              filename: filename,
              text: isBinary ? null : text
            });

            currentText = isBinary ? '' : text;

            // U1: File info bar
            let html = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>Original: ${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span>Decompressed: ${formatSize(decompressed.length)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">${isBinary ? 'Binary Data' : 'Text Content'}</span>
              </div>
            `;

            if (isBinary) {
              html += `
                <div class="flex flex-col items-center justify-center py-20 bg-surface-50/50 rounded-2xl border border-dashed border-surface-200">
                  <div class="w-16 h-16 bg-white rounded-2xl shadow-sm border border-surface-100 flex items-center justify-center text-3xl mb-4">📦</div>
                  <h3 class="text-lg font-semibold text-surface-900">Binary File</h3>
                  <p class="text-sm text-surface-500 mt-1 max-w-sm text-center px-6">
                    This file contains binary data and cannot be previewed as text. You can download the decompressed version using the button above.
                  </p>
                  <div class="mt-6 font-mono text-xs text-surface-400 px-3 py-1 bg-white rounded-full border border-surface-100">
                    ${esc(filename)}
                  </div>
                </div>
              `;
              h.render(html);
              const copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.style.display = 'none';
            } else {
              // DATA Format Excellence: Live Search (U4/DATA)
              html += `
                <div class="mb-4">
                  <div class="relative">
                    <input type="text" id="br-search" placeholder="Search in decompressed text..." 
                           class="w-full px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all pl-10">
                    <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                  </div>
                </div>
                
                <div id="br-results-count" class="text-xs text-surface-500 mb-2 hidden"></div>

                <div class="rounded-xl overflow-hidden border border-surface-200">
                  <pre id="br-pre" class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[700px]"></pre>
                </div>
              `;
              
              h.render(html);
              const copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.style.display = 'inline-flex';

              const preEl = document.getElementById('br-pre');
              const searchInput = document.getElementById('br-search');
              const resultsCount = document.getElementById('br-results-count');

              // B7: Truncate if extremely large for performance
              const MAX_PREVIEW_SIZE = 1024 * 512; // 512KB
              if (text.length > MAX_PREVIEW_SIZE) {
                const truncated = text.slice(0, MAX_PREVIEW_SIZE);
                preEl.textContent = truncated + '\n\n... [Content truncated for performance. Download the full file to see more]';
              } else {
                preEl.textContent = text;
              }

              // Search Logic
              if (searchInput) {
                searchInput.addEventListener('input', function() {
                  const query = this.value.toLowerCase();
                  if (!query) {
                    preEl.innerHTML = esc(text.length > MAX_PREVIEW_SIZE ? text.slice(0, MAX_PREVIEW_SIZE) + '\n\n... [Content truncated]' : text);
                    resultsCount.classList.add('hidden');
                    return;
                  }

                  // Split into lines for filtering
                  const lines = text.split('\n');
                  const filtered = lines.filter(line => line.toLowerCase().includes(query));
                  
                  if (filtered.length === 0) {
                    preEl.innerHTML = '<span class="text-surface-500 italic">No matches found</span>';
                  } else {
                    // Limit search results to avoid DOM explosion
                    const displayLines = filtered.slice(0, 1000);
                    let resultHtml = displayLines.map(line => {
                      const escapedLine = esc(line);
                      const regex = new RegExp('(' + query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ')', 'gi');
                      return escapedLine.replace(regex, '<mark class="bg-brand-500/40 text-white rounded-sm px-0.5">$1</mark>');
                    }).join('\n');

                    if (filtered.length > 1000) {
                      resultHtml += '\n\n... [Showing first 1000 matches]';
                    }
                    preEl.innerHTML = resultHtml;
                  }

                  resultsCount.textContent = `Found ${filtered.length.toLocaleString()} matching lines`;
                  resultsCount.classList.remove('hidden');
                });
              }
            }
          } catch (err) {
            console.error(err);
            h.showError('Decompression Failed', 'The Brotli file could not be decompressed. It may be corrupted or use a dictionary not available in this browser environment.');
          }
        }).catch(function(err) {
          h.showError('Loading Error', 'Failed to load the Brotli decompression library.');
        });
      }
    });
  };
})();
