(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    const hljsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
    const hljsCss = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.eps',
      binary: true,
      actions: [
        {
          label: '📋 Copy PostScript',
          id: 'copy-ps',
          onClick: function (helpers, btn) {
            const ps = helpers.getState().psContent;
            if (ps) {
              helpers.copyToClipboard(ps, btn);
            } else {
              helpers.showError('No content', 'Wait for the file to finish loading.');
            }
          }
        },
        {
          label: '📥 Download .ps',
          id: 'download-ps',
          onClick: function (helpers) {
            const ps = helpers.getState().psContent;
            const file = helpers.getFile();
            if (ps && file) {
              const name = file.name.replace(/\.eps$/i, '') + '.ps';
              helpers.download(name, ps, 'application/postscript');
            }
          }
        }
      ],
      onInit: function (helpers) {
        helpers.loadCSS(hljsCss);
        helpers.loadScript(hljsUrl);
      },
      onFile: function _onFileFn(file, arrayBuffer, helpers) {
        // B1, B4, B8: Check for library and handle retry
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          helpers.loadScript(hljsUrl, function () {
            _onFileFn(file, arrayBuffer, helpers);
          });
          return;
        }

        helpers.showLoading('Parsing EPS data...');

        try {
          // B2: Handle binary safely
          const data = new Uint8Array(arrayBuffer);
          let psContent = '';
          let isDos = false;

          // Detect DOS EPS Binary Header (Magic: C5 D0 D3 C6)
          if (data.length > 30 && data[0] === 0xC5 && data[1] === 0xD0 && data[2] === 0xD3 && data[3] === 0xC6) {
            isDos = true;
            const psStart = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
            const psLength = data[8] | (data[9] << 8) | (data[10] << 16) | (data[11] << 24);
            
            if (psStart + psLength > data.length) {
              throw new Error('Invalid EPS: PostScript section out of bounds');
            }
            
            // Extract the PostScript section
            psContent = new TextDecoder('ascii').decode(data.slice(psStart, psStart + psLength));
          } else {
            // Standard text-based EPS/PostScript
            psContent = new TextDecoder('utf-8').decode(data);
          }

          // U5: Empty state check
          if (!psContent || !psContent.trim()) {
            helpers.render(`
              <div class="flex flex-col items-center justify-center h-64 text-surface-400">
                <span class="text-4xl mb-4">📄</span>
                <p class="font-medium text-surface-600">No PostScript content found</p>
                <p class="text-sm">The file may contain only a preview image or be empty.</p>
              </div>
            `);
            return;
          }

          helpers.setState({ psContent: psContent });

          const sizeStr = formatBytes(file.size);
          const typeLabel = isDos ? 'Binary EPS (DOS)' : 'PostScript EPS';
          const lines = psContent.split('\n');

          // B7: Truncate very large files for performance
          const MAX_DISPLAY_CHARS = 150000;
          const isTruncated = psContent.length > MAX_DISPLAY_CHARS;
          const displayContent = isTruncated ? psContent.substring(0, MAX_DISPLAY_CHARS) : psContent;
          const highlightedHtml = hljs.highlightAuto(displayContent).value;

          // U1, U8, U10: Beautiful UI construction
          helpers.render(`
            <div class="p-6">
              <!-- U1. File info bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${sizeStr}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">${typeLabel}</span>
              </div>

              <!-- PART 4: Live Search / Filter -->
              <div class="mb-5">
                <div class="relative group">
                  <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </span>
                  <input type="text" id="ps-search" placeholder="Search PostScript code (filters lines)..." 
                    class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm">
                </div>
              </div>

              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800 text-sm">PostScript Source</h3>
                <span class="text-[10px] uppercase tracking-wider font-bold bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full">${lines.length.toLocaleString()} Lines</span>
              </div>

              <!-- U8. Code/pre block -->
              <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950 relative">
                <pre id="ps-pre" class="p-5 text-[13px] font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent"><code id="ps-code">${highlightedHtml}</code></pre>
                
                ${isTruncated ? `
                  <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-gray-950 via-gray-950/90 to-transparent p-4 pt-12 text-center">
                    <p class="text-xs text-gray-400 font-medium italic">
                      Displaying first ${MAX_DISPLAY_CHARS.toLocaleString()} characters. 
                      Use "Download .ps" to view the full ${sizeStr} file.
                    </p>
                  </div>
                ` : ''}
              </div>
            </div>
          `);

          // Live Search Logic
          const searchInput = document.getElementById('ps-search');
          const codeEl = document.getElementById('ps-code');
          let searchTimeout;

          searchInput.addEventListener('input', function (e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
              const term = e.target.value.trim().toLowerCase();
              if (!term) {
                codeEl.innerHTML = highlightedHtml;
                return;
              }

              const matchingLines = lines.filter(l => l.toLowerCase().includes(term));
              if (matchingLines.length === 0) {
                codeEl.innerHTML = '<div class="text-gray-500 py-8 italic text-center text-sm">No matching lines found</div>';
              } else {
                // Show matching lines only (truncated if too many for performance)
                const MAX_FILTER_LINES = 1000;
                const slice = matchingLines.slice(0, MAX_FILTER_LINES);
                const filteredContent = slice.join('\n');
                codeEl.innerHTML = hljs.highlightAuto(filteredContent).value;
                
                if (matchingLines.length > MAX_FILTER_LINES) {
                   codeEl.insertAdjacentHTML('beforeend', `\n\n<div class="text-gray-500 italic text-[11px] border-t border-gray-800 pt-4 mt-4">... showing first ${MAX_FILTER_LINES} of ${matchingLines.length} matches</div>`);
                }
              }
            }, 150);
          });

        } catch (err) {
          // U3: Friendly error
          helpers.showError('Could not open EPS file', err.message || 'The file may be corrupted or in an unsupported format. Try re-saving it as a standard PostScript EPS.');
        }
      },
      onDestroy: function() {
        // B5: Clean up if needed
      }
    });

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }
  };
})();
