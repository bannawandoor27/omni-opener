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
      infoHtml: '<strong>Proto Toolkit:</strong> Professional Proto viewer with TS generation, schema navigation, and syntax highlighting.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', () => {
           helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/protobuf.min.js');
        });
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

      onFile: function _onFileFn(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlighter...');
          setTimeout(() => _onFileFn(file, content, helpers), 500);
          return;
        }

        const lines = content.split('\n');
        const schema = { messages: [], enums: [], services: [] };
        lines.forEach((line, idx) => {
           const trimmed = line.trim();
           if (trimmed.startsWith('message ')) schema.messages.push({ name: trimmed.split(' ')[1].split('{')[0].trim(), line: idx });
           else if (trimmed.startsWith('enum ')) schema.enums.push({ name: trimmed.split(' ')[1].split('{')[0].trim(), line: idx });
           else if (trimmed.startsWith('service ')) schema.services.push({ name: trimmed.split(' ')[1].split('{')[0].trim(), line: idx });
        });

        const highlighted = hljs.highlight(content, { language: 'protobuf' }).value;

        helpers.render(`
          <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#282c34] shadow-sm font-mono">
            <!-- Sidebar -->
            <div class="w-56 shrink-0 bg-[#21252b] border-r border-[#181a1f] flex flex-col p-4 space-y-6 overflow-auto">
               <div>
                  <h3 class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-4">Navigation</h3>
                  <div class="space-y-4">
                     ${schema.messages.length > 0 ? `
                       <div>
                         <p class="text-[9px] font-bold text-surface-600 uppercase mb-2">Messages</p>
                         ${schema.messages.map(m => `<button onclick="window._proto_jump(${m.line})" class="block w-full text-left text-[11px] text-brand-400 hover:text-brand-300 truncate transition-colors">💠 ${escapeHtml(m.name)}</button>`).join('')}
                       </div>
                     ` : ''}
                     ${schema.enums.length > 0 ? `
                       <div>
                         <p class="text-[9px] font-bold text-surface-600 uppercase mb-2">Enums</p>
                         ${schema.enums.map(e => `<button onclick="window._proto_jump(${e.line})" class="block w-full text-left text-[11px] text-yellow-400 hover:text-yellow-300 truncate transition-colors">🔘 ${escapeHtml(e.name)}</button>`).join('')}
                       </div>
                     ` : ''}
                  </div>
               </div>
            </div>

            <!-- Content -->
            <div class="flex-1 flex flex-col overflow-hidden">
               <div class="shrink-0 bg-[#21252b] border-b border-[#181a1f] px-4 py-2 flex">
                  <button id="tab-code" class="px-4 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400">Proto Source</button>
                  <button id="tab-ts" class="px-4 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300">TS Generator</button>
               </div>
               <div id="view-code" class="flex-1 overflow-auto p-6 text-[13px] leading-relaxed scroll-smooth">
                  <pre class="text-surface-100"><code>${highlighted}</code></pre>
               </div>
               <div id="view-ts" class="hidden flex-1 overflow-auto p-6 bg-surface-900">
                  <pre class="text-brand-300 text-[12px]"><code>${escapeHtml(generateTS(content))}</code></pre>
               </div>
            </div>
          </div>
        `);

        window._proto_jump = (line) => {
           const container = document.getElementById('view-code');
           const pre = container.querySelector('pre');
           const lineContent = content.split('\n')[line];
           // Simple scroll estimation
           container.scrollTop = (line / content.split('\n').length) * pre.scrollHeight;
        };

        const tabCode = document.getElementById('tab-code');
        const tabTs = document.getElementById('tab-ts');
        const viewCode = document.getElementById('view-code');
        const viewTs = document.getElementById('view-ts');

        tabCode.onclick = () => {
           tabCode.className = "px-4 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
           tabTs.className = "px-4 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300";
           viewCode.classList.remove('hidden');
           viewTs.classList.add('hidden');
        };

        tabTs.onclick = () => {
           tabTs.className = "px-4 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-400";
           tabCode.className = "px-4 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-500 hover:text-surface-300";
           viewTs.classList.remove('hidden');
           viewCode.classList.add('hidden');
        };

        function generateTS(proto) {
           let ts = "";
           const msgRegex = /message\s+([a-zA-Z0-9_]+)\s*\{([\s\S]*?)\}/g;
           let m;
           while ((m = msgRegex.exec(proto)) !== null) {
              ts += `interface ${m[1]} {\n`;
              const fields = m[2].split('\n').filter(l => l.includes('='));
              fields.forEach(f => {
                 const parts = f.trim().split(/\s+/);
                 let type = parts[0];
                 let name = parts[1];
                 if (['repeated', 'optional', 'required'].includes(type)) { type = parts[1]; name = parts[2]; }
                 let tsType = 'any';
                 if (['string', 'bytes'].includes(type)) tsType = 'string';
                 else if (['int32', 'int64', 'uint32', 'uint64', 'double', 'float', 'fixed32', 'fixed64'].includes(type)) tsType = 'number';
                 else if (type === 'bool') tsType = 'boolean';
                 else tsType = type;
                 ts += `  ${name}?: ${tsType}${f.includes('repeated') ? '[]' : ''};\n`;
              });
              ts += `}\n\n`;
           }
           return ts || "// No messages found to generate TS interfaces.";
        }
      }
    });
  };
})();

