/**
 * OmniOpener — JSON Viewer/Converter Tool
 * Uses OmniTool SDK. Renders and allows conversion of .json files.
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
      accept: '.json',
      dropLabel: 'Drop a .json file here',
      binary: false,
      infoHtml: '<strong>JSON Tool:</strong> Format, minify, and search JSON data instantly. 100% private.',
      
      actions: [
        {
          label: '📋 Copy JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            const content = helpers.getState().parsedJson;
            if (content) {
              helpers.copyToClipboard(JSON.stringify(content, null, 2), btn);
            }
          } 
        },
        {
          label: '📥 Formatted', 
          id: 'dl-formatted', 
          onClick: function (helpers) {
            const content = helpers.getState().parsedJson;
            if (content) {
              const originalFilename = helpers.getFile().name;
              const newFilename = originalFilename.replace(/\.json$/i, '.formatted.json');
              helpers.download(newFilename, JSON.stringify(content, null, 2), 'application/json');
            }
          }
        },
        {
          label: '📥 Minified', 
          id: 'dl-minified', 
          onClick: function (helpers) {
            const content = helpers.getState().parsedJson;
            if (content) {
              const originalFilename = helpers.getFile().name;
              const newFilename = originalFilename.replace(/\.json$/i, '.minified.json');
              helpers.download(newFilename, JSON.stringify(content), 'application/json');
            }
          }
        },
      ],

      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing JSON...');
        
        try {
          const parsed = JSON.parse(content);
          helpers.setState('parsedJson', parsed);
          
          const prettyJson = JSON.stringify(parsed, null, 2);
          const fileSize = formatBytes(file.size);
          
          let itemCount = 0;
          if (Array.isArray(parsed)) itemCount = parsed.length;
          else if (typeof parsed === 'object' && parsed !== null) itemCount = Object.keys(parsed).length;

          const renderHtml = `
            <div class="flex flex-col h-[70vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <!-- Header -->
              <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                <div class="flex items-center justify-between px-4 py-2 text-xs text-surface-500 font-medium">
                  <div class="flex items-center gap-2 truncate mr-4">
                    <span class="text-lg">📦</span>
                    <span class="truncate">${escapeHtml(file.name)}</span>
                  </div>
                  <div class="shrink-0 flex items-center gap-3">
                    <span>${fileSize}</span>
                    <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
                    <span>${itemCount} ${Array.isArray(parsed) ? 'items' : 'keys'}</span>
                  </div>
                </div>

                <!-- Search -->
                <div class="px-3 pb-3 pt-1">
                  <div class="relative group">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                    <input type="text" id="json-search" 
                      placeholder="Filter or search in JSON..." 
                      class="w-full pl-9 pr-20 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                    >
                    <div id="json-search-count" class="hidden absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-tight text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">0 matches</div>
                  </div>
                </div>
              </div>

              <!-- Content Area -->
              <div id="json-viewport" class="flex-1 overflow-auto bg-white p-4 font-mono text-[13px] leading-relaxed">
                <pre id="json-display" class="text-surface-800 whitespace-pre">${escapeHtml(prettyJson)}</pre>
                
                <!-- Search Empty State -->
                <div id="json-search-empty" class="hidden h-64 flex flex-col items-center justify-center text-surface-400">
                  <span class="text-3xl mb-3">🔍</span>
                  <p class="font-medium text-surface-600">No matches found</p>
                </div>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const searchInput = document.getElementById('json-search');
          const searchCount = document.getElementById('json-search-count');
          const display = document.getElementById('json-display');
          const emptyState = document.getElementById('json-search-empty');

          let searchTimeout;

          function performSearch() {
            const term = searchInput.value;
            if (!term) {
              display.innerHTML = escapeHtml(prettyJson);
              display.classList.remove('hidden');
              emptyState.classList.add('hidden');
              searchCount.classList.add('hidden');
              return;
            }

            const lowTerm = term.toLowerCase();
            const regex = new RegExp('(' + term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + ')', 'gi');
            
            // For large JSON, this might be slow, but for most it's fine
            const escaped = escapeHtml(prettyJson);
            const highlighted = escaped.replace(regex, '<mark class="bg-yellow-100 text-yellow-900 rounded-sm px-0.5 font-bold">$1</mark>');
            
            const matchCount = (escaped.match(regex) || []).length;
            
            if (matchCount === 0) {
              display.classList.add('hidden');
              emptyState.classList.remove('hidden');
              searchCount.textContent = '0 matches';
              searchCount.classList.remove('hidden');
            } else {
              display.classList.remove('hidden');
              emptyState.classList.add('hidden');
              display.innerHTML = highlighted;
              searchCount.textContent = `${matchCount} match${matchCount === 1 ? '' : 'es'}`;
              searchCount.classList.remove('hidden');
            }
          }

          searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 150);
          });

        } catch (err) {
          helpers.showError('Invalid JSON', 'The file could not be parsed as JSON. ' + err.message);
          helpers.setState('parsedJson', null);
        }
      }
    });
  };

})();

