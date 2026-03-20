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
      infoHtml: '<strong>GraphQL Toolkit:</strong> Professional GraphQL viewer with TS type generation, variable management, and syntax highlighting.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy TS Types',
          id: 'copy-ts',
          onClick: function (h, btn) {
             const ts = generateTS(h.getContent());
             h.copyToClipboard(ts, btn);
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

        const highlighted = hljs.highlight(content, { language: 'graphql' }).value;

        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-sm font-mono">
            <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex items-center justify-between">
               <div class="flex px-1 bg-surface-900 border border-[#30363d] rounded-lg">
                  <button id="tab-code" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400">Query</button>
                  <button id="tab-vars" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300">Variables</button>
                  <button id="tab-ts" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300">TS Types</button>
               </div>
               <span class="text-[10px] text-surface-500 truncate max-w-xs">${escapeHtml(file.name)}</span>
            </div>

            <div class="flex-1 overflow-hidden relative">
               <div id="view-code" class="absolute inset-0 overflow-auto p-6 text-[13px] leading-relaxed">
                  <pre class="text-surface-100"><code>${highlighted}</code></pre>
               </div>
               <div id="view-vars" class="absolute inset-0 hidden flex flex-col bg-[#0d1117]">
                  <div class="shrink-0 p-3 border-b border-[#30363d] bg-[#161b22] text-[10px] font-bold text-surface-500 uppercase">JSON Variables</div>
                  <textarea id="gql-vars" class="flex-1 w-full p-6 text-brand-300 bg-transparent outline-none resize-none font-mono text-[13px]" placeholder='{\n  "id": 123\n}'></textarea>
               </div>
               <div id="view-ts" class="absolute inset-0 hidden overflow-auto p-6 bg-[#0d1117]">
                  <pre class="text-purple-300 text-[12px]"><code>${escapeHtml(generateTS(content))}</code></pre>
               </div>
            </div>
          </div>
        `);

        const tabs = { code: document.getElementById('tab-code'), vars: document.getElementById('tab-vars'), ts: document.getElementById('tab-ts') };
        const views = { code: document.getElementById('view-code'), vars: document.getElementById('view-vars'), ts: document.getElementById('view-ts') };

        Object.keys(tabs).forEach(k => {
           tabs[k].onclick = () => {
              Object.values(tabs).forEach(t => { t.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300"; });
              Object.values(views).forEach(v => v.classList.add('hidden'));
              tabs[k].className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
              views[k].classList.remove('hidden');
           };
        });

        function generateTS(gql) {
           let ts = "";
           const typeRegex = /type\s+([a-zA-Z0-9_]+)\s*\{([\s\S]*?)\}/g;
           let m;
           while ((m = typeRegex.exec(gql)) !== null) {
              ts += `interface ${m[1]} {\n`;
              const fields = m[2].trim().split('\n');
              fields.forEach(f => {
                 const parts = f.trim().split(':');
                 if (parts.length === 2) {
                    let name = parts[0].trim();
                    let type = parts[1].trim().replace('!', '');
                    let tsType = 'any';
                    if (type === 'String') tsType = 'string';
                    else if (type === 'Int' || type === 'Float') tsType = 'number';
                    else if (type === 'Boolean') tsType = 'boolean';
                    else if (type.startsWith('[') && type.endsWith(']')) tsType = type.substring(1, type.length-1) + '[]';
                    else tsType = type;
                    ts += `  ${name}: ${tsType};\n`;
                 }
              });
              ts += `}\n\n`;
           }
           return ts || "// No types found to generate TS interfaces.";
        }
      }
    });
  };
})();
