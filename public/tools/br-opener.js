(function () {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

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
              h.download(state.filename || 'decompressed.out', state.decompressed);
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
        if (typeof BrotliDecode === 'undefined') {
          return h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing Brotli file...');

        return h.loadScript('https://unpkg.com/brotli@1.3.3/build/decode.js').then(function () {
          if (typeof BrotliDecode === 'undefined') {
            throw new Error('Brotli library failed to load. Please check your connection.');
          }

          try {
            const uint8 = new Uint8Array(content);
            const decompressed = BrotliDecode(uint8);

            if (!decompressed || decompressed.length === 0) {
              throw new Error('Decompression failed or returned empty data.');
            }

            const filename = file.name.endsWith('.br') ? file.name.slice(0, -3) : file.name + '.out';
            
            let text = '';
            let isBinary = false;
            try {
              const decoder = new TextDecoder('utf-8', { fatal: true });
              text = decoder.decode(decompressed);
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

            let html = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 border-b border-surface-200 text-sm text-surface-600">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>Original: ${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span>Decompressed: ${formatSize(decompressed.length)}</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 rounded-full bg-surface-200 text-surface-700 text-xs">${isBinary ? 'Binary' : 'Text'}</span>
              </div>
            `;

            if (isBinary) {
              html += `
                <div class="flex flex-col items-center justify-center py-20">
                  <div class="text-4xl mb-4">📦</div>
                  <h3 class="text-lg font-semibold text-surface-900">Binary Content</h3>
                  <p class="text-sm text-surface-500 mt-1 max-w-sm text-center">
                    This file contains binary data and cannot be previewed as text. You can download the decompressed file using the button above.
                  </p>
                </div>
              `;
              h.render(html);
              const copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.style.display = 'none';
            } else {
              html += `
                <div class="p-4">
                  <div class="mb-4">
                    <input type="text" id="br-search" placeholder="Search in text..." 
                           class="w-full px-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre id="br-pre" class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-auto max-h-[600px] leading-relaxed"></pre>
                  </div>
                </div>
              `;
              h.render(html);
              
              const copyBtn = document.getElementById('omni-action-copy');
              if (copyBtn) copyBtn.style.display = 'inline-flex';

              const preEl = document.getElementById('br-pre');
              const searchInput = document.getElementById('br-search');

              const MAX_PREVIEW = 200000;
              const truncated = text.length > MAX_PREVIEW;
              preEl.textContent = truncated ? text.slice(0, MAX_PREVIEW) + '\n\n... [Content truncated for preview]' : text;

              if (searchInput) {
                searchInput.addEventListener('input', function() {
                  const query = this.value.toLowerCase();
                  if (!query) {
                    preEl.textContent = truncated ? text.slice(0, MAX_PREVIEW) + '\n\n... [Content truncated]' : text;
                    return;
                  }

                  const lines = text.split('\n');
                  const matches = [];
                  for (let i = 0; i < lines.length && matches.length < 500; i++) {
                    if (lines[i].toLowerCase().includes(query)) {
                      matches.push(lines[i]);
                    }
                  }

                  if (matches.length === 0) {
                    preEl.innerHTML = '<div class="text-surface-500 italic">No matches found</div>';
                  } else {
                    preEl.innerHTML = matches.map(l => {
                      const escaped = esc(l);
                      return escaped.replace(new RegExp('(' + query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + ')', 'gi'), '<mark class="bg-brand-500/40 text-white rounded-sm px-0.5">$1</mark>');
                    }).join('\n');
                    if (matches.length === 500) {
                      preEl.innerHTML += '\n\n... [Showing first 500 matches]';
                    }
                  }
                });
              }
            }
          } catch (err) {
            console.error(err);
            h.showError('Decompression Failed', 'The Brotli file could not be decompressed. It may be invalid or use an unsupported dictionary.');
          }
        });
      }
    });
  };
})();
