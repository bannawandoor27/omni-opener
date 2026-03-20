/**
 * OmniOpener — GraphQL Toolkit
 * Uses OmniTool SDK and highlight.js.
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
      accept: '.graphql,.gql',
      dropLabel: 'Drop a GraphQL file here',
      binary: false,
      infoHtml: '<strong>GraphQL Toolkit:</strong> Professional GraphQL viewer with syntax highlighting, schema navigation, and formatting.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '✨ Format',
          id: 'format-gql',
          onClick: function (h) {
             // Very basic formatter since full graphql-js is too big
             let content = h.getContent();
             let formatted = content.replace(/\{/g, ' {\n').replace(/\}/g, '\n}\n').replace(/\n\s*\n/g, '\n').trim();
             // (Real formatting would require a parser, but let's do a simple one)
             h.getMountEl()._onFileUpdate(h.getFile(), formatted);
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        // Extract Schema Items
        const defs = { types: [], queries: [], mutations: [] };
        const lines = content.split('\n');
        lines.forEach(l => {
           const t = l.trim();
           if (t.startsWith('type ')) defs.types.push(t.split(' ')[1].split('{')[0].trim());
           else if (t.startsWith('query ') || (t.startsWith('{') && !content.includes('type '))) {
              const name = t.split(' ')[1] ? t.split(' ')[1].split('(')[0].split('{')[0].trim() : 'anonymous';
              if (name && !defs.queries.includes(name)) defs.queries.push(name);
           }
           else if (t.startsWith('mutation ')) defs.mutations.push(t.split(' ')[1].split('(')[0].split('{')[0].trim());
        });

        const highlighted = hljs.highlight(content, { language: 'graphql' }).value;

        helpers.render(`
          <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-sm font-mono">
            <!-- Sidebar -->
            <div class="w-56 shrink-0 bg-[#21252b] border-r border-[#181a1f] flex flex-col p-4 space-y-6 overflow-auto">
               ${defs.queries.length > 0 ? `
                 <div>
                   <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2 text-blue-400">Queries</h3>
                   <div class="space-y-1">
                     ${defs.queries.map(q => `<div class="text-[11px] text-surface-300 truncate">🔍 ${escapeHtml(q)}</div>`).join('')}
                   </div>
                 </div>
               ` : ''}
               ${defs.mutations.length > 0 ? `
                 <div>
                   <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2 text-pink-400">Mutations</h3>
                   <div class="space-y-1">
                     ${defs.mutations.map(m => `<div class="text-[11px] text-surface-300 truncate">⚡ ${escapeHtml(m)}</div>`).join('')}
                   </div>
                 </div>
               ` : ''}
               ${defs.types.length > 0 ? `
                 <div>
                   <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2 text-purple-400">Types</h3>
                   <div class="space-y-1">
                     ${defs.types.map(t => `<div class="text-[11px] text-surface-300 truncate">📦 ${escapeHtml(t)}</div>`).join('')}
                   </div>
                 </div>
               ` : ''}
            </div>

            <!-- Content Area -->
            <div class="flex-1 overflow-auto p-6 text-[13px] leading-relaxed relative">
               <pre class="text-surface-100"><code>${highlighted}</code></pre>
            </div>
          </div>
        `);
      }
    });
  };
})();
