/**
 * OmniOpener — Text/Markdown Toolkit
 * Uses OmniTool SDK, highlight.js, and marked.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.txt,.text,.log,.md,.markdown,.json,.xml,.yaml,.yml,.sql,.ini,.conf,.sh,.bat,.py,.js,.css,.html',
      dropLabel: 'Drop a text or markdown file here',
      binary: false,
      infoHtml: '<strong>Text Toolkit:</strong> Advanced text viewer with syntax highlighting, line numbers, and Markdown preview.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js');
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '👁️ Toggle Preview',
          id: 'toggle-preview',
          onClick: function (helpers) {
            const isMd = helpers.getFile().name.toLowerCase().endsWith('.md') || helpers.getFile().name.toLowerCase().endsWith('.markdown');
            if (!isMd) {
               helpers.showError('Not a Markdown file', 'Preview is only available for .md and .markdown files.');
               return;
            }
            const preview = document.getElementById('txt-preview-area');
            const source = document.getElementById('txt-source-area');
            preview.classList.toggle('hidden');
            source.classList.toggle('hidden');
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (typeof hljs === 'undefined' || typeof marked === 'undefined') {
          helpers.showLoading('Loading text engines...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }

        const isMd = file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.markdown');
        const lines = content.split('\n');
        const wordCount = content.trim().split(/\s+/).length;
        const charCount = content.length;

        const highlighted = hljs.highlightAuto(content.slice(0, 50000)).value;
        const lineNumbers = lines.map((_, i) => `<div class="text-surface-500 text-right pr-4 select-none">${i + 1}</div>`).join('');

        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-sm">
            <!-- Header -->
            <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-[#ff5f56]"></span>
                <span class="w-2 h-2 rounded-full bg-[#ffbd2e]"></span>
                <span class="w-2 h-2 rounded-full bg-[#27c93f]"></span>
                <span class="ml-2 text-[10px] font-mono text-surface-400 truncate max-w-xs">${escapeHtml(file.name)}</span>
              </div>
              <div class="flex items-center gap-4 text-[10px] font-mono text-surface-500 uppercase">
                <span>${wordCount.toLocaleString()} words</span>
                <span>${charCount.toLocaleString()} chars</span>
              </div>
            </div>

            <!-- View Area -->
            <div class="flex-1 overflow-hidden relative">
               <!-- Source Area -->
               <div id="txt-source-area" class="absolute inset-0 flex overflow-auto p-4">
                  <div class="shrink-0 font-mono text-[12px] leading-relaxed border-r border-surface-700/30 mr-4 opacity-50">
                    ${lineNumbers}
                  </div>
                  <pre class="flex-1 font-mono text-[12px] leading-relaxed text-surface-100 whitespace-pre"><code>${highlighted}</code></pre>
               </div>
               
               <!-- Preview Area (Markdown) -->
               <div id="txt-preview-area" class="absolute inset-0 hidden overflow-auto bg-white p-12">
                  <div class="prose prose-slate max-w-none">
                    ${isMd ? marked.parse(content) : ''}
                  </div>
               </div>
            </div>
          </div>
        `);
      }
    });
  };
})();
