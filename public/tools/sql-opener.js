/**
 * OmniOpener — SQL Viewer Tool
 * Uses OmniTool SDK and highlight.js. Renders .sql files with syntax highlighting.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.sql',
      dropLabel: 'Drop an .sql file here',
      binary: false,
      infoHtml: '<strong>SQL Viewer:</strong> Professional SQL viewer with syntax highlighting and easy export.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy SQL',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Highlighting SQL...');

        try {
          const highlightedCode = hljs.highlight(content, {language: 'sql'}).value;
          const renderHtml = `
            <div class="flex flex-col h-[75vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-xl">
              <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex items-center justify-between text-[11px] font-mono text-surface-400">
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-[#ff5f56]"></span>
                  <span class="w-3 h-3 rounded-full bg-[#ffbd2e]"></span>
                  <span class="w-3 h-3 rounded-full bg-[#27c93f]"></span>
                  <span class="ml-2">${escapeHtml(file.name)}</span>
                </div>
              </div>
              <div class="flex-1 overflow-auto p-4 font-mono text-sm leading-relaxed">
                <pre class="hljs"><code class="language-sql">${highlightedCode}</code></pre>
              </div>
            </div>
          `;
          helpers.render(renderHtml);
        } catch (e) {
          helpers.showError('Error highlighting .sql file', e.message);
        }
      }
    });
  };
})();
