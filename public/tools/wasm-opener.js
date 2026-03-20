/**
 * OmniOpener — WebAssembly (WASM) Toolkit
 * Uses OmniTool SDK. Visual hex viewer and module inspector.
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
      accept: '.wasm',
      binary: true,
      infoHtml: '<strong>WASM Toolkit:</strong> Professional WebAssembly inspector with hex viewer and module analysis.',
      
      onFile: async function (file, content, h) {
        let moduleInfo = { exports: [], imports: [] };
        try {
           const module = await WebAssembly.compile(content);
           moduleInfo.exports = WebAssembly.Module.exports(module);
           moduleInfo.imports = WebAssembly.Module.imports(module);
        } catch (e) {}

        const hexDump = (buffer) => {
           const view = new DataView(buffer);
           let hex = '';
           let ascii = '';
           let result = '';
           for (let i = 0; i < Math.min(buffer.byteLength, 10000); i++) {
              const byte = view.getUint8(i);
              hex += byte.toString(16).padStart(2, '0') + ' ';
              ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
              if ((i + 1) % 16 === 0) {
                 result += `<div class="flex gap-4"><span class="text-surface-500">${i.toString(16).padStart(8, '0')}</span><span class="text-brand-400">${hex}</span><span class="text-surface-400">${ascii}</span></div>`;
                 hex = ''; ascii = '';
              }
           }
           return result;
        };

        h.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#0d1117] text-surface-300 shadow-xl font-mono">
            <div class="shrink-0 bg-[#161b22] border-b border-[#30363d] px-4 py-2 flex items-center justify-between">
               <span class="text-xs font-bold text-surface-500">${escapeHtml(file.name)}</span>
               <div class="flex gap-4 text-[10px] font-bold uppercase">
                  <button id="tab-hex" class="border-b-2 border-brand-500 text-brand-500 px-2 pb-1">Hex View</button>
                  <button id="tab-info" class="border-b-2 border-transparent text-surface-500 px-2 pb-1">Module Info</button>
               </div>
            </div>
            <div class="flex-1 overflow-auto p-4 text-[11px] leading-tight selection:bg-brand-500/30">
               <div id="view-hex" class="space-y-0.5">
                  ${hexDump(content)}
                  ${content.byteLength > 10000 ? '<div class="text-yellow-500 p-4 italic">Hex dump truncated for performance.</div>' : ''}
               </div>
               <div id="view-info" class="hidden space-y-8 p-4">
                  <div>
                     <h3 class="text-brand-500 font-bold mb-4 uppercase tracking-widest text-[12px]">Exports</h3>
                     <div class="grid grid-cols-2 gap-2">
                        ${moduleInfo.exports.map(e => `<div class="bg-[#161b22] p-2 rounded border border-[#30363d]"><span class="text-surface-500 mr-2">${e.kind}</span>${escapeHtml(e.name)}</div>`).join('') || '<div class="italic opacity-50">None</div>'}
                     </div>
                  </div>
                  <div>
                     <h3 class="text-pink-500 font-bold mb-4 uppercase tracking-widest text-[12px]">Imports</h3>
                     <div class="grid grid-cols-1 gap-2">
                        ${moduleInfo.imports.map(i => `<div class="bg-[#161b22] p-2 rounded border border-[#30363d]"><span class="text-surface-500 mr-2">${i.kind}</span>${escapeHtml(i.module)}.${escapeHtml(i.name)}</div>`).join('') || '<div class="italic opacity-50">None</div>'}
                     </div>
                  </div>
               </div>
            </div>
          </div>
        `);

        const tabHex = document.getElementById('tab-hex');
        const tabInfo = document.getElementById('tab-info');
        const viewHex = document.getElementById('view-hex');
        const viewInfo = document.getElementById('view-info');

        tabHex.onclick = () => {
           tabHex.classList.add('border-brand-500', 'text-brand-500');
           tabInfo.classList.remove('border-brand-500', 'text-brand-500');
           viewHex.classList.remove('hidden');
           viewInfo.classList.add('hidden');
        };
        tabInfo.onclick = () => {
           tabInfo.classList.add('border-brand-500', 'text-brand-500');
           tabHex.classList.remove('border-brand-500', 'text-brand-500');
           viewInfo.classList.remove('hidden');
           viewHex.classList.add('hidden');
        };
      }
    });
  };
})();
