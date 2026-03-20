/**
 * OmniOpener — SQL Toolkit
 * Uses OmniTool SDK, highlight.js, and sql-formatter.
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
      infoHtml: '<strong>SQL Toolkit:</strong> Professional SQL viewer with syntax highlighting and one-click beautification.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/sql-formatter@15.3.1/dist/sql-formatter.min.js');
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
          label: '✨ Beautify',
          id: 'beautify',
          onClick: function (helpers) {
            if (typeof sqlFormatter === 'undefined') {
              helpers.showError('Engine Error', 'SQL Formatter not loaded yet.');
              return;
            }
            try {
              const formatted = sqlFormatter.format(helpers.getContent());
              helpers.getMountEl()._onFileUpdate(helpers.getFile(), formatted);
            } catch (e) {
              helpers.showError('Format Error', e.message);
            }
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        // Expose update for internal use
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Highlighting SQL...');

        try {
          const highlightedCode = hljs.highlight(content, {language: 'sql'}).value;
          const renderHtml = `
            <div class="flex flex-col h-[80vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-xl">
              <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex items-center justify-between text-[11px] font-mono text-surface-400">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-[#ff5f56]"></span>
                  <span class="w-2 h-2 rounded-full bg-[#ffbd2e]"></span>
                  <span class="w-2 h-2 rounded-full bg-[#27c93f]"></span>
                  <span class="ml-2 truncate max-w-xs">${escapeHtml(file.name)}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span>${content.split('\n').length} lines</span>
                  <span>${(content.length / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              <div class="flex-1 overflow-auto p-6 font-mono text-sm leading-relaxed">
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
