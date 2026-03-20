/**
 * OmniOpener — Protocol Buffers (Proto) Toolkit
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
      accept: '.proto',
      dropLabel: 'Drop a .proto file here',
      binary: false,
      infoHtml: '<strong>Proto Toolkit:</strong> Professional Proto viewer with syntax highlighting and schema navigation.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', () => {
           helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/protobuf.min.js');
        });
      },

      actions: [
        {
          label: '📋 Copy Source',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        }
      ],

      onFile: function (file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }

        // Simple Proto Parser for Sidebar
        const lines = content.split('\n');
        const schema = { messages: [], enums: [], services: [] };
        lines.forEach(line => {
           const trimmed = line.trim();
           if (trimmed.startsWith('message ')) schema.messages.push(trimmed.split(' ')[1].split('{')[0].trim());
           else if (trimmed.startsWith('enum ')) schema.enums.push(trimmed.split(' ')[1].split('{')[0].trim());
           else if (trimmed.startsWith('service ')) schema.services.push(trimmed.split(' ')[1].split('{')[0].trim());
        });

        const highlighted = hljs.highlight(content, { language: 'protobuf' }).value;

        helpers.render(`
          <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-sm">
            <!-- Sidebar -->
            <div class="w-56 shrink-0 bg-[#21252b] border-r border-[#181a1f] flex flex-col p-4 space-y-6 overflow-auto">
               ${schema.messages.length > 0 ? `
                 <div>
                   <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2">Messages</h3>
                   <div class="space-y-1">
                     ${schema.messages.map(m => `<div class="text-[11px] text-brand-400 font-mono truncate" title="${escapeHtml(m)}">💠 ${escapeHtml(m)}</div>`).join('')}
                   </div>
                 </div>
               ` : ''}
               ${schema.enums.length > 0 ? `
                 <div>
                   <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2">Enums</h3>
                   <div class="space-y-1">
                     ${schema.enums.map(e => `<div class="text-[11px] text-yellow-400 font-mono truncate" title="${escapeHtml(e)}">🔘 ${escapeHtml(e)}</div>`).join('')}
                   </div>
                 </div>
               ` : ''}
               ${schema.services.length > 0 ? `
                 <div>
                   <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2">Services</h3>
                   <div class="space-y-1">
                     ${schema.services.map(s => `<div class="text-[11px] text-green-400 font-mono truncate" title="${escapeHtml(s)}">⚡ ${escapeHtml(s)}</div>`).join('')}
                   </div>
                 </div>
               ` : ''}
               ${schema.messages.length === 0 && schema.enums.length === 0 && schema.services.length === 0 ? '<div class="text-[10px] text-surface-600 italic">No definitions found</div>' : ''}
            </div>

            <!-- Main Content -->
            <div class="flex-1 overflow-auto p-6 font-mono text-[13px] leading-relaxed relative">
               <pre class="text-surface-100"><code>${highlighted}</code></pre>
            </div>
          </div>
        `);
      }
    });
  };
})();
