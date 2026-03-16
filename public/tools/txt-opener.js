/**
 * OmniOpener — TXT Viewer Tool
 * Uses OmniTool SDK. Renders .txt files with search and line numbers.
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
      accept: '.txt,.text,.log,.md,.json,.xml,.yaml,.yml,.sql,.ini,.conf,.sh,.bat,.py,.js,.css,.html',
      dropLabel: 'Drop a text file here',
      binary: false,
      infoHtml: '<strong>Text Viewer:</strong> A clean, performant way to view text files. Everything stays in your browser.',
      
      actions: [
        {
          label: '📋 Copy Content',
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
            helpers.download(file ? file.name : 'export.txt', helpers.getContent());
          }
        }
      ],

      onFile: function (file, content, helpers) {
        helpers.showLoading('Preparing viewer...');

        if (!content || content.trim() === '') {
          helpers.render(`
            <div class="flex flex-col items-center justify-center h-64 text-surface-400">
              <span class="text-4xl mb-2">📄</span>
              <p class="font-medium">This file is empty</p>
              <p class="text-sm">There is no text content to display.</p>
            </div>
          `);
          return;
        }

        const lines = content.split(/\r?\n/);
        const fileSize = formatBytes(file.size);
        const maxDisplayLines = 10000;
        const isTruncated = lines.length > maxDisplayLines;
        const displayLines = isTruncated ? lines.slice(0, maxDisplayLines) : lines;

        const renderHtml = `
          <div class="flex flex-col h-[70vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <!-- Header (Sticky) -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200">
              <div class="flex items-center justify-between px-4 py-2 text-xs text-surface-500 font-medium">
                <div class="flex items-center gap-2 truncate mr-4">
                  <span class="text-lg">📄</span>
                  <span class="truncate">${escapeHtml(file.name)}</span>
                </div>
                <div class="shrink-0 flex items-center gap-3">
                  <span>${fileSize}</span>
                  <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
                  <span>${lines.length.toLocaleString()} lines</span>
                </div>
              </div>

              <!-- Search Bar -->
              <div class="px-3 pb-3 pt-1">
                <div class="relative group">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">🔍</span>
                  <input type="text" id="txt-search" 
                    placeholder="Search in text..." 
                    class="w-full pl-9 pr-24 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                  >
                  <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span id="search-count" class="hidden text-[10px] font-bold uppercase tracking-tight text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">0 matches</span>
                    <button id="search-clear" class="hidden p-1 hover:bg-surface-100 rounded text-surface-400 hover:text-surface-600 transition-colors">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Content Area (Scrollable) -->
            <div id="txt-viewport" class="flex-1 overflow-auto bg-white font-mono text-[13px] leading-relaxed relative">
              <div class="flex min-w-full">
                <!-- Line Numbers -->
                <div id="txt-line-numbers" class="shrink-0 text-right pr-4 pl-2 py-4 bg-surface-50 text-surface-300 select-none border-r border-surface-100 sticky left-0 z-10" style="min-width: 3.5rem;">
                  ${displayLines.map((_, i) => `<div>${i + 1}</div>`).join('')}
                </div>
                <!-- Text Content -->
                <pre id="txt-display" class="flex-1 p-4 text-surface-800 whitespace-pre tab-4">${escapeHtml(displayLines.join('\n'))}</pre>
              </div>
              
              ${isTruncated ? `
                <div class="p-6 text-center border-t border-surface-100 bg-surface-50">
                  <p class="text-sm text-surface-500 italic">Showing first ${maxDisplayLines.toLocaleString()} lines. For full file processing, use the Download action.</p>
                </div>
              ` : ''}
            </div>
            
            <!-- Empty State for Search -->
            <div id="txt-search-empty" class="hidden flex-1 flex flex-col items-center justify-center p-12 text-surface-400 bg-white">
              <span class="text-3xl mb-3">🔍</span>
              <p class="font-medium text-surface-600">No matches found</p>
              <p class="text-sm mt-1">Try a different search term</p>
            </div>
          </div>
        `;

        helpers.render(renderHtml);

        const searchInput = document.getElementById('txt-search');
        const searchClear = document.getElementById('search-clear');
        const searchCount = document.getElementById('search-count');
        const display = document.getElementById('txt-display');
        const viewport = document.getElementById('txt-viewport');
        const emptyState = document.getElementById('txt-search-empty');
        const lineNumbers = document.getElementById('txt-line-numbers');

        let searchTimeout;

        function performSearch() {
          const term = searchInput.value;
          
          if (!term) {
            display.innerHTML = escapeHtml(displayLines.join('\n'));
            searchClear.classList.add('hidden');
            searchCount.classList.add('hidden');
            emptyState.classList.add('hidden');
            display.parentElement.classList.remove('hidden');
            return;
          }

          searchClear.classList.remove('hidden');
          
          const lowTerm = term.toLowerCase();
          const escapedLines = displayLines.map(line => escapeHtml(line));
          let matches = 0;
          
          const regex = new RegExp('(' + term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + ')', 'gi');
          
          const highlightedLines = escapedLines.map(line => {
            if (line.toLowerCase().includes(lowTerm)) {
              const result = line.replace(regex, '<mark class="bg-brand-100 text-brand-900 rounded-sm px-0.5 font-bold">$1</mark>');
              const count = (line.match(regex) || []).length;
              matches += count;
              return result;
            }
            return line;
          });

          if (matches === 0) {
            emptyState.classList.remove('hidden');
            display.parentElement.classList.add('hidden');
            searchCount.textContent = '0 matches';
            searchCount.classList.remove('hidden');
          } else {
            emptyState.classList.add('hidden');
            display.parentElement.classList.remove('hidden');
            display.innerHTML = highlightedLines.join('\n');
            searchCount.textContent = `${matches} match${matches === 1 ? '' : 'es'}`;
            searchCount.classList.remove('hidden');
          }
        }

        searchInput.addEventListener('input', function () {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(performSearch, 150) ;
        });

        searchClear.addEventListener('click', function () {
          searchInput.value = '';
          performSearch();
          searchInput.focus();
        });
      }
    });
  };
})();

