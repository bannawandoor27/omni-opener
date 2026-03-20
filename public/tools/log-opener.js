/**
 * OmniOpener — Log Toolkit
 * Uses OmniTool SDK and highlight.js.
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
      accept: '.log,.txt',
      dropLabel: 'Drop a .log file here',
      binary: false,
      infoHtml: '<strong>Log Toolkit:</strong> Professional log viewer with level filtering, keyword highlighting, and auto-analysis.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy Errors',
          id: 'copy-errors',
          onClick: function (h, btn) {
             const lines = h.getContent().split('\n');
             const errors = lines.filter(l => l.toUpperCase().includes('ERROR') || l.toUpperCase().includes('FATAL')).join('\n');
             if (errors) h.copyToClipboard(errors, btn);
             else h.showError('No errors found');
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        const lines = content.split(/\r?\n/);
        const stats = { error: 0, warn: 0, info: 0 };
        lines.forEach(l => {
           const up = l.toUpperCase();
           if (up.includes('ERROR') || up.includes('FATAL') || up.includes('FAIL')) stats.error++;
           else if (up.includes('WARN')) stats.warn++;
           else if (up.includes('INFO')) stats.info++;
        });

        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#0d1117] text-surface-300 shadow-xl font-mono">
            <!-- Toolbar -->
            <div class="shrink-0 bg-[#161b22] border-b border-[#30363d] px-4 py-2 flex items-center justify-between">
               <div class="flex items-center gap-4">
                  <span class="text-xs font-bold text-surface-500">${escapeHtml(file.name)}</span>
                  <div class="flex gap-2">
                    <button data-level="error" class="log-filter px-2 py-0.5 rounded bg-red-900/30 text-red-400 text-[10px] font-bold border border-red-900/50 hover:bg-red-900/50 transition-colors">ERR: ${stats.error}</button>
                    <button data-level="warn" class="log-filter px-2 py-0.5 rounded bg-yellow-900/30 text-yellow-400 text-[10px] font-bold border border-yellow-900/50 hover:bg-yellow-900/50 transition-colors">WRN: ${stats.warn}</button>
                    <button data-level="info" class="log-filter px-2 py-0.5 rounded bg-blue-900/30 text-blue-400 text-[10px] font-bold border border-blue-900/50 hover:bg-blue-900/50 transition-colors">INF: ${stats.info}</button>
                  </div>
               </div>
               <div class="relative">
                  <input type="text" id="log-highlight" placeholder="Highlight keyword..." class="bg-[#0d1117] border border-[#30363d] rounded px-3 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-brand-500 w-48">
               </div>
            </div>

            <!-- Content Area -->
            <div id="log-viewport" class="flex-1 overflow-auto p-4 text-[12px] leading-relaxed selection:bg-brand-500/30">
               ${lines.map((line, i) => {
                  let cls = "log-line";
                  const up = line.toUpperCase();
                  if (up.includes('ERROR') || up.includes('FATAL') || up.includes('FAIL')) cls += " text-red-400 level-error";
                  else if (up.includes('WARN')) cls += " text-yellow-200 level-warn";
                  else if (up.includes('INFO')) cls += " text-blue-300 level-info";
                  return `<div class="${cls}" data-index="${i}"><span class="opacity-20 mr-4 inline-block w-8 text-right select-none">${i+1}</span><span class="line-content">${escapeHtml(line)}</span></div>`;
               }).join('')}
            </div>
          </div>
        `);

        const viewport = document.getElementById('log-viewport');
        const highlightInput = document.getElementById('log-highlight');
        const filters = document.querySelectorAll('.log-filter');

        highlightInput.oninput = () => {
           const term = highlightInput.value.toLowerCase();
           document.querySelectorAll('.line-content').forEach(el => {
              const txt = el.textContent;
              if (term && txt.toLowerCase().includes(term)) {
                 const regex = new RegExp(`(${term})`, 'gi');
                 el.innerHTML = escapeHtml(txt).replace(regex, '<mark class="bg-brand-500/50 text-white rounded-sm">$1</mark>');
              } else {
                 el.innerHTML = escapeHtml(txt);
              }
           });
        };

        filters.forEach(f => {
           f.onclick = () => {
              f.classList.toggle('opacity-40');
              const level = f.getAttribute('data-level');
              const isHidden = f.classList.contains('opacity-40');
              document.querySelectorAll(`.level-${level}`).forEach(l => {
                 l.style.display = isHidden ? 'none' : 'block';
              });
           };
        });
      }
    });
  };
})();
