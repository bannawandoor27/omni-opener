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
      infoHtml: '<strong>SQL Toolkit:</strong> Professional SQL viewer with schema extraction, formatting, and minification.',
      
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
            try {
              const formatted = sqlFormatter.format(helpers.getContent());
              helpers.getMountEl()._onFileUpdate(helpers.getFile(), formatted);
            } catch (e) { helpers.showError('Format Error', e.message); }
          }
        },
        {
          label: '📦 Minify',
          id: 'minify',
          onClick: function (helpers) {
             const minified = helpers.getContent().replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').replace(/\s+/g, ' ').trim();
             helpers.getMountEl()._onFileUpdate(helpers.getFile(), minified);
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        if (typeof hljs === 'undefined' || typeof sqlFormatter === 'undefined') {
          helpers.showLoading('Loading SQL engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        try {
          const highlightedCode = hljs.highlight(content, {language: 'sql'}).value;
          
          // Extract Schema
          const tables = [];
          const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_"`]+)\s*\(([\s\S]*?)\);/gi;
          let match;
          while ((match = createTableRegex.exec(content)) !== null) {
             const tableName = match[1].replace(/[`"]/g, '');
             const columns = match[2].split(',').map(c => c.trim().split(/\s+/)[0]).filter(c => c && !['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE', 'CHECK'].includes(c.toUpperCase()));
             tables.push({ name: tableName, cols: columns });
          }

          const renderHtml = `
            <div class="flex flex-col h-[80vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-xl font-mono">
              <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="flex px-1 bg-surface-900 border border-[#30363d] rounded-lg">
                    <button id="tab-code" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400">Source</button>
                    <button id="tab-schema" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300">Schema</button>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-[10px] text-surface-500">
                  <span>${content.split('\n').length} lines</span>
                  <span>${(content.length / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              
              <div class="flex-1 overflow-hidden relative">
                 <div id="view-code" class="absolute inset-0 overflow-auto p-6 text-sm leading-relaxed">
                    <pre class="hljs"><code class="language-sql">${highlightedCode}</code></pre>
                 </div>
                 <div id="view-schema" class="absolute inset-0 hidden overflow-auto p-8 bg-[#0d1117]">
                    <div class="max-w-3xl mx-auto space-y-6">
                       <h2 class="text-xs font-bold text-surface-500 uppercase tracking-widest">Database Schema Detected</h2>
                       ${tables.length === 0 ? '<p class="text-surface-600 italic text-xs">No CREATE TABLE statements found.</p>' : tables.map(t => `
                          <div class="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
                             <div class="bg-[#21252b] px-4 py-2 border-b border-[#30363d] flex items-center gap-2">
                                <span class="text-brand-400">📊</span>
                                <span class="text-xs font-bold text-surface-300">${escapeHtml(t.name)}</span>
                             </div>
                             <div class="p-4 flex flex-wrap gap-2">
                                ${t.cols.map(c => `<span class="px-2 py-0.5 bg-surface-900 border border-surface-700 rounded-md text-[10px] text-surface-400 font-mono">${escapeHtml(c)}</span>`).join('')}
                             </div>
                          </div>
                       `).join('')}
                    </div>
                 </div>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const tabCode = document.getElementById('tab-code');
          const tabSchema = document.getElementById('tab-schema');
          const viewCode = document.getElementById('view-code');
          const viewSchema = document.getElementById('view-schema');

          tabCode.onclick = () => {
             tabCode.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
             tabSchema.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300";
             viewCode.classList.remove('hidden');
             viewSchema.classList.add('hidden');
          };

          tabSchema.onclick = () => {
             tabSchema.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
             tabCode.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300";
             viewSchema.classList.remove('hidden');
             viewCode.classList.add('hidden');
          };

        } catch (e) { helpers.showError('Error highlighting .sql file', e.message); }
      }
    });
  };
})();

