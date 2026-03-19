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
      accept: '.log,.txt',
      dropLabel: 'Drop a .log file here',
      binary: false,
      infoHtml: '<strong>Log Viewer:</strong> Professional log file viewer with syntax highlighting and easy export.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy Log',
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

        helpers.showLoading('Highlighting log...');

        const highlighted = hljs.highlightAuto(content.slice(0, 50000)).value;
        const lines = content.split(/\r?\n/).length;

        const renderHtml = `
          <div class="flex flex-col h-[75vh] border border-surface-200 rounded-xl overflow-hidden bg-surface-900 text-surface-100 shadow-xl">
            <div class="shrink-0 bg-surface-800 border-b border-surface-700 px-4 py-2 flex items-center justify-between text-[11px] font-mono text-surface-400">
              <div class="flex items-center gap-2 truncate">
                <span class="w-3 h-3 rounded-full bg-red-500"></span>
                <span class="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span class="w-3 h-3 rounded-full bg-green-500"></span>
                <span class="ml-2 truncate">${escapeHtml(file.name)}</span>
              </div>
              <span>${lines.toLocaleString()} lines</span>
            </div>
            <div class="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed selection:bg-brand-500/30">
              <pre class="hljs"><code>${highlighted}</code></pre>
              ${content.length > 50000 ? '<div class="mt-4 p-2 bg-yellow-900/20 border border-yellow-900/30 rounded text-yellow-500 text-center italic">Log truncated for performance. Copy or download for full file.</div>' : ''}
            </div>
          </div>
        `;

        helpers.render(renderHtml);
      }
    });
  };
})();
