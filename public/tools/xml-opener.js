/**
 * OmniOpener — XML Viewer Tool
 * Uses OmniTool SDK, vkBeautify, and highlight.js.
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
      accept: '.xml,.rss,.atom,.svg,.kml,.gpx,.wsdl,.xsd',
      dropLabel: 'Drop an .xml file here',
      binary: false,
      infoHtml: '<strong>XML Viewer:</strong> Beautify and explore XML files with syntax highlighting. 100% client-side.',
      
      actions: [
        {
          label: '📋 Copy XML',
          id: 'copy',
          onClick: function (helpers, btn) {
            const content = helpers.getState().beautifiedXml;
            if (content) {
              helpers.copyToClipboard(content, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const content = helpers.getState().beautifiedXml;
            if (content) {
              const file = helpers.getFile();
              helpers.download(file ? file.name : 'export.xml', content, 'application/xml');
            }
          }
        }
      ],

      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/vkbeautify@0.99.3/vkbeautify.min.js');
      },

      onFile: function (file, content, helpers) {
        if (typeof vkbeautify === 'undefined' || typeof hljs === 'undefined') {
          helpers.showLoading('Loading XML engine...');
          setTimeout(() => helpers.onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing XML...');
        
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, 'application/xml');
          const errorNode = xmlDoc.querySelector('parsererror');
          if (errorNode) {
            throw new Error(errorNode.textContent);
          }

          const beautified = vkbeautify.xml(content, 2);
          helpers.setState('beautifiedXml', beautified);
          
          const fileSize = formatBytes(file.size);
          const tagCount = (beautified.match(/<[^!/?][^>]*>/g) || []).length;

          const renderHtml = `
            <div class="flex flex-col h-[70vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <!-- Header -->
              <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                <div class="flex items-center justify-between px-4 py-2 text-xs text-surface-500 font-medium">
                  <div class="flex items-center gap-2 truncate mr-4">
                    <span class="text-lg">📄</span>
                    <span class="truncate">${escapeHtml(file.name)}</span>
                  </div>
                  <div class="shrink-0 flex items-center gap-3">
                    <span>${fileSize}</span>
                    <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
                    <span>${tagCount.toLocaleString()} tags</span>
                  </div>
                </div>

                <!-- Search -->
                <div class="px-3 pb-3 pt-1">
                  <div class="relative group">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                    <input type="text" id="xml-search" 
                      placeholder="Search in XML..." 
                      class="w-full pl-9 pr-20 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                    >
                    <div id="xml-search-count" class="hidden absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-tight text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">0 matches</div>
                  </div>
                </div>
              </div>

              <!-- Content Area -->
              <div id="xml-viewport" class="flex-1 overflow-auto bg-white p-4 font-mono text-[13px] leading-relaxed">
                <pre id="xml-display" class="hljs language-xml text-surface-800 whitespace-pre bg-transparent p-0">${hljs.highlight(beautified, { language: 'xml' }).value}</pre>
                
                <!-- Search Empty State -->
                <div id="xml-search-empty" class="hidden h-64 flex flex-col items-center justify-center text-surface-400">
                  <span class="text-3xl mb-3">🔍</span>
                  <p class="font-medium text-surface-600">No matches found</p>
                </div>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const searchInput = document.getElementById('xml-search');
          const searchCount = document.getElementById('xml-search-count');
          const display = document.getElementById('xml-display');
          const emptyState = document.getElementById('xml-search-empty');

          let searchTimeout;

          function performSearch() {
            const term = searchInput.value;
            if (!term) {
              display.innerHTML = hljs.highlight(beautified, { language: 'xml' }).value;
              display.classList.remove('hidden');
              emptyState.classList.add('hidden');
              searchCount.classList.add('hidden');
              return;
            }

            const lowTerm = term.toLowerCase();
            const regex = new RegExp('(' + term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + ')', 'gi');
            
            // Re-highlighting with search matches is tricky because highlight.js adds tags.
            // We'll search in the RAW beautified text and then try to highlight, 
            // but for simplicity we'll just do a text-based search/highlight on the already highlighted HTML, 
            // which is risky but often works if the search term doesn't match HTML tags.
            // Better: search in RAW, if match, highlight RAW and then inject <mark> tags into the highlighted result.
            
            const highlightedHtml = hljs.highlight(beautified, { language: 'xml' }).value;
            // Simple approach: search in the textContent, then highlight if needed.
            // For better UX, let's just use the same approach as TXT opener on the RAW text when searching.
            
            const rawBeautified = beautified;
            const escaped = escapeHtml(rawBeautified);
            const marked = escaped.replace(regex, '<mark class="bg-yellow-100 text-yellow-900 rounded-sm px-0.5 font-bold">$1</mark>');
            
            const matchCount = (rawBeautified.match(regex) || []).length;
            
            if (matchCount === 0) {
              display.classList.add('hidden');
              emptyState.classList.remove('hidden');
              searchCount.textContent = '0 matches';
              searchCount.classList.remove('hidden');
            } else {
              display.classList.remove('hidden');
              emptyState.classList.add('hidden');
              display.innerHTML = marked; // Fallback to non-syntax-highlighted when searching for better performance
              searchCount.textContent = `${matchCount} match${matchCount === 1 ? '' : 'es'}`;
              searchCount.classList.remove('hidden');
            }
          }

          searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 150);
          });

        } catch (err) {
          helpers.showError('Invalid XML', 'The file could not be parsed as XML. ' + err.message);
        }
      }
    });
  };
})();

