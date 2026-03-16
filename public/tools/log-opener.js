/**
 * OmniOpener — LOG Viewer Tool
 * Uses OmniTool SDK. Renders .log files with filtering and highlighting.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.log,.txt',
      dropLabel: 'Drop a log file here',
      binary: false,
      infoHtml: '<strong>Log Viewer:</strong> Analyze logs with real-time search and level highlighting. Runs entirely in your browser.',

      actions: [
        {
          label: '📋 Copy All',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const file = helpers.getFile();
            helpers.download(file ? file.name : 'log.txt', helpers.getContent());
          }
        }
      ],

      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing log file...');

        const allLines = content.split(/\r?\n/);
        const fileSize = formatBytes(file.size);

        const renderHtml = `
          <div class="flex flex-col h-[75vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-950 shadow-lg">
            <!-- Header (Sticky) -->
            <div class="shrink-0 bg-surface-900 border-b border-surface-800">
              <div class="flex items-center justify-between px-4 py-2 text-[11px] text-surface-400 font-bold uppercase tracking-wider">
                <div class="flex items-center gap-2 truncate mr-4">
                  <span class="text-base">📜</span>
                  <span class="truncate text-surface-300">${escapeHtml(file.name)}</span>
                </div>
                <div class="shrink-0 flex items-center gap-3">
                  <span>${fileSize}</span>
                  <span class="w-1 h-1 bg-surface-700 rounded-full"></span>
                  <span>${allLines.length.toLocaleString()} lines</span>
                </div>
              </div>

              <!-- Controls -->
              <div class="p-3 bg-surface-900/50 flex flex-col gap-3">
                <div class="relative group">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 group-focus-within:text-brand-400 transition-colors">🔍</span>
                  <input type="text" id="log-search" 
                    placeholder="Search logs..." 
                    class="w-full pl-9 pr-4 py-2 text-sm bg-surface-950 border border-surface-800 rounded-lg text-surface-200 placeholder-surface-600 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 transition-all"
                  >
                </div>
                <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button data-level="error" class="log-filter-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-900/50 bg-red-950/30 text-red-400 hover:bg-red-900/20 transition-all flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Errors
                  </button>
                  <button data-level="warn" class="log-filter-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-yellow-900/50 bg-yellow-950/30 text-yellow-400 hover:bg-yellow-900/20 transition-all flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Warnings
                  </button>
                  <button data-level="info" class="log-filter-btn px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-900/50 bg-blue-950/30 text-blue-400 hover:bg-blue-900/20 transition-all flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Info
                  </button>
                  <div class="h-4 w-px bg-surface-800 mx-1"></div>
                  <button id="log-clear-filters" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-700 bg-surface-800 text-surface-300 hover:bg-surface-700 transition-all ml-auto">
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            <!-- Content Area -->
            <div id="log-display-container" class="flex-1 overflow-auto bg-surface-950 text-surface-300 p-0 font-mono text-[12px] leading-relaxed selection:bg-brand-500/30">
              <div id="log-display-content" class="min-w-full inline-block py-2"></div>
              
              <!-- Empty State -->
              <div id="log-empty-state" class="hidden h-64 flex flex-col items-center justify-center text-surface-500">
                <span class="text-4xl mb-3">🔍</span>
                <p class="font-medium text-surface-400">No logs found matching your filters</p>
              </div>
            </div>
            
            <!-- Status Footer -->
            <div id="log-status" class="px-4 py-2 border-t border-surface-800 bg-surface-900 text-[10px] uppercase tracking-widest text-surface-500 font-bold flex justify-between items-center">
              <span id="log-count-text">Showing all lines</span>
              <span id="log-perf-text" class="lowercase font-normal opacity-50"></span>
            </div>
          </div>
        `;

        helpers.render(renderHtml);

        const searchInput = document.getElementById('log-search');
        const displayContent = document.getElementById('log-display-content');
        const container = document.getElementById('log-display-container');
        const emptyState = document.getElementById('log-empty-state');
        const statusText = document.getElementById('log-count-text');
        const perfText = document.getElementById('log-perf-text');
        const clearBtn = document.getElementById('log-clear-filters');
        const filterBtns = document.querySelectorAll('.log-filter-btn');

        let currentSearch = '';
        let currentLevel = null;
        let updateTimeout;

        const updateDisplay = () => {
          const startTime = performance.now();
          let filtered = allLines;

          if (currentSearch) {
            const lowSearch = currentSearch.toLowerCase();
            filtered = filtered.filter(line => line.toLowerCase().includes(lowSearch));
          }

          if (currentLevel) {
            const lowLevel = currentLevel.toLowerCase();
            filtered = filtered.filter(line => line.toLowerCase().includes(lowLevel));
          }

          if (filtered.length === 0) {
            displayContent.innerHTML = '';
            emptyState.classList.remove('hidden');
            statusText.textContent = `0 matches found`;
          } else {
            emptyState.classList.add('hidden');
            
            // Limit render for performance
            const limit = 5000;
            const toRender = filtered.slice(0, limit);
            
            let html = '';
            toRender.forEach((line, i) => {
              let colorClass = 'text-surface-400';
              const lowLine = line.toLowerCase();
              let rowBg = '';
              
              if (lowLine.includes('error') || lowLine.includes('exception') || lowLine.includes('fatal')) {
                colorClass = 'text-red-400 font-medium';
                rowBg = 'bg-red-500/5';
              } else if (lowLine.includes('warn')) {
                colorClass = 'text-yellow-400';
                rowBg = 'bg-yellow-500/5';
              } else if (lowLine.includes('info')) {
                colorClass = 'text-blue-400';
              } else if (lowLine.includes('debug')) {
                colorClass = 'text-surface-600';
              }

              html += `<div class="flex gap-4 hover:bg-brand-500/10 px-4 group transition-colors ${rowBg}">
                <span class="opacity-20 w-12 text-right shrink-0 select-none border-r border-surface-800 pr-3 group-hover:opacity-40 transition-opacity">${(i + 1).toLocaleString()}</span>
                <span class="${colorClass} py-0.5 break-all">${escapeHtml(line)}</span>
              </div>`;
            });

            if (filtered.length > limit) {
              html += `<div class="p-6 text-center text-surface-500 border-t border-surface-800 mt-4 italic bg-surface-900/30">
                <p>Showing first ${limit.toLocaleString()} matches.</p>
                <p class="text-xs mt-1">Refine search to see more specific results.</p>
              </div>`;
            }

            displayContent.innerHTML = html;
            statusText.textContent = `Showing ${filtered.length.toLocaleString()} of ${allLines.length.toLocaleString()} lines`;
          }

          const endTime = performance.now();
          perfText.textContent = `${(endTime - startTime).toFixed(0)}ms`;
        };

        searchInput.addEventListener('input', (e) => {
          currentSearch = e.target.value;
          clearTimeout(updateTimeout);
          updateTimeout = setTimeout(updateDisplay, 100);
        });

        filterBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const level = btn.getAttribute('data-level');
            if (currentLevel === level) {
              currentLevel = null;
              btn.classList.remove('ring-2', 'ring-brand-500', 'bg-surface-800', 'border-surface-600');
              btn.classList.add('bg-opacity-30');
            } else {
              filterBtns.forEach(b => {
                b.classList.remove('ring-2', 'ring-brand-500', 'bg-surface-800', 'border-surface-600');
                b.classList.add('bg-opacity-30');
              });
              currentLevel = level;
              btn.classList.add('ring-2', 'ring-brand-500', 'bg-surface-800', 'border-surface-600');
              btn.classList.remove('bg-opacity-30');
            }
            updateDisplay();
          });
        });

        clearBtn.addEventListener('click', () => {
          currentSearch = '';
          currentLevel = null;
          searchInput.value = '';
          filterBtns.forEach(b => {
            b.classList.remove('ring-2', 'ring-brand-500', 'bg-surface-800', 'border-surface-600');
            b.classList.add('bg-opacity-30');
          });
          updateDisplay();
        });

        // Initial render
        updateDisplay();
      }
    });
  };
})();