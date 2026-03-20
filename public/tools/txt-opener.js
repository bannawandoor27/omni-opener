/**
 * OmniOpener — Text/Markdown Toolkit
 * Uses OmniTool SDK, highlight.js, marked.js, and jsPDF.
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
      infoHtml: '<strong>Text Toolkit:</strong> Advanced text viewer with syntax highlighting, Find & Replace, and PDF export.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
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
          label: '📄 Export PDF',
          id: 'export-pdf',
          onClick: function (helpers) {
             const { jsPDF } = window.jspdf;
             const pdf = new jsPDF();
             const lines = helpers.getContent().split('\n');
             pdf.setFontSize(10);
             pdf.text(lines.slice(0, 100), 10, 10); // Simple limited export
             pdf.save(helpers.getFile().name.replace(/\.[^.]+$/, '.pdf'));
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        if (typeof hljs === 'undefined' || typeof marked === 'undefined' || typeof jspdf === 'undefined') {
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

            <!-- Find & Replace Bar -->
            <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex gap-4">
               <div class="flex-1 flex gap-2">
                  <input type="text" id="txt-find" placeholder="Find..." class="bg-[#282c34] border border-[#30363d] rounded px-3 py-1 text-[10px] text-surface-100 outline-none w-1/2">
                  <input type="text" id="txt-replace" placeholder="Replace with..." class="bg-[#282c34] border border-[#30363d] rounded px-3 py-1 text-[10px] text-surface-100 outline-none w-1/2">
               </div>
               <button id="btn-replace-all" class="px-3 py-1 bg-brand-600 text-white text-[10px] font-bold rounded hover:bg-brand-700">Replace All</button>
            </div>

            <!-- View Area -->
            <div class="flex-1 overflow-hidden relative">
               <div id="txt-source-area" class="absolute inset-0 flex overflow-auto p-4">
                  <div class="shrink-0 font-mono text-[12px] leading-relaxed border-r border-surface-700/30 mr-4 opacity-50">
                    ${lineNumbers}
                  </div>
                  <pre class="flex-1 font-mono text-[12px] leading-relaxed text-surface-100 whitespace-pre"><code>${highlighted}</code></pre>
               </div>
            </div>
          </div>
        `);

        document.getElementById('btn-replace-all').onclick = () => {
           const find = document.getElementById('txt-find').value;
           const replace = document.getElementById('txt-replace').value;
           if (!find) return;
           const newContent = helpers.getContent().replaceAll(find, replace);
           _onFile(file, newContent, helpers);
        };
      }
    });
  };
})();

