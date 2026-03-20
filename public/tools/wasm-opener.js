/**
 * OmniOpener — WebAssembly (WASM) Toolkit
 * Uses OmniTool SDK. Visual hex viewer, module inspector, and runtime playground.
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
      infoHtml: '<strong>WASM Toolkit:</strong> Professional WebAssembly inspector with hex viewer, module analysis, and runtime playground.',
      
      onFile: async function (file, content, h) {
        let moduleInfo = { exports: [], imports: [] };
        let instance = null;
        try {
           const module = await WebAssembly.compile(content);
           moduleInfo.exports = WebAssembly.Module.exports(module);
           moduleInfo.imports = WebAssembly.Module.imports(module);
           // Try simple instantiation (might fail if imports are required)
           if (moduleInfo.imports.length === 0) {
              instance = await WebAssembly.instantiate(module);
           }
        } catch (e) {}

        const hexDump = (buffer) => {
           const view = new DataView(buffer);
           let result = '';
           for (let i = 0; i < Math.min(buffer.byteLength, 5000); i += 16) {
              let hex = '';
              let ascii = '';
              for (let j = 0; j < 16; j++) {
                 if (i + j < buffer.byteLength) {
                    const byte = view.getUint8(i + j);
                    hex += byte.toString(16).padStart(2, '0') + ' ';
                    ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                 } else {
                    hex += '   ';
                 }
              }
              result += `<div class="flex gap-4"><span class="text-surface-500">${i.toString(16).padStart(8, '0')}</span><span class="text-brand-400">${hex}</span><span class="text-surface-400">${ascii}</span></div>`;
           }
           return result;
        };

        h.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-[#0d1117] text-surface-300 shadow-xl font-mono">
            <div class="shrink-0 bg-[#161b22] border-b border-[#30363d] px-4 py-2 flex items-center justify-between">
               <span class="text-xs font-bold text-surface-500">${escapeHtml(file.name)}</span>
               <div class="flex gap-4 text-[10px] font-bold uppercase">
                  <button id="tab-hex" class="border-b-2 border-brand-500 text-brand-500 px-2 pb-1">Hex</button>
                  <button id="tab-info" class="border-b-2 border-transparent text-surface-500 px-2 pb-1">Module</button>
                  <button id="tab-play" class="border-b-2 border-transparent text-surface-500 px-2 pb-1">Playground</button>
               </div>
            </div>
            <div class="flex-1 overflow-auto p-4 text-[11px] leading-tight selection:bg-brand-500/30">
               <div id="view-hex" class="space-y-0.5">${hexDump(content)}</div>
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
               <div id="view-play" class="hidden p-6 space-y-6">
                  <h3 class="text-green-500 font-bold uppercase tracking-widest text-[12px]">Function Caller</h3>
                  <div class="space-y-4 max-w-lg">
                     <div class="flex flex-col gap-2">
                        <label class="text-[10px] text-surface-500">Exported Function</label>
                        <select id="wasm-func" class="bg-[#161b22] border border-[#30363d] rounded p-2 text-xs outline-none">
                           ${moduleInfo.exports.filter(e => e.kind === 'function').map(e => `<option value="${e.name}">${e.name}</option>`).join('')}
                        </select>
                     </div>
                     <div class="flex flex-col gap-2">
                        <label class="text-[10px] text-surface-500">Arguments (comma separated)</label>
                        <input type="text" id="wasm-args" placeholder="e.g. 10, 20" class="bg-[#161b22] border border-[#30363d] rounded p-2 text-xs outline-none">
                     </div>
                     <button id="btn-run-wasm" class="px-4 py-2 bg-brand-600 text-white font-bold rounded-lg text-xs hover:bg-brand-700 transition-all">Invoke Function</button>
                     <div class="mt-6 p-4 bg-black/50 border border-[#30363d] rounded-xl">
                        <p class="text-[10px] text-surface-500 uppercase mb-2">Result</p>
                        <div id="wasm-result" class="text-lg font-bold text-green-400">Ready.</div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        `);

        const tabs = { hex: document.getElementById('tab-hex'), info: document.getElementById('tab-info'), play: document.getElementById('tab-play') };
        const views = { hex: document.getElementById('view-hex'), info: document.getElementById('view-info'), play: document.getElementById('view-play') };

        Object.keys(tabs).forEach(k => {
           tabs[k].onclick = () => {
              Object.values(tabs).forEach(t => t.classList.replace('border-brand-500', 'border-transparent'));
              Object.values(tabs).forEach(t => t.classList.replace('text-brand-500', 'text-surface-500'));
              tabs[k].classList.replace('border-transparent', 'border-brand-500');
              tabs[k].classList.replace('text-surface-500', 'text-brand-500');
              Object.values(views).forEach(v => v.classList.add('hidden'));
              views[k].classList.remove('hidden');
           };
        });

        document.getElementById('btn-run-wasm').onclick = () => {
           const funcName = document.getElementById('wasm-func').value;
           const args = document.getElementById('wasm-args').value.split(',').map(a => parseFloat(a.trim())).filter(a => !isNaN(a));
           const resultEl = document.getElementById('wasm-result');
           
           if (!instance) {
              resultEl.textContent = "Error: Module requires imports to instantiate.";
              resultEl.className = "text-red-400";
              return;
           }

           try {
              const res = instance.exports[funcName](...args);
              resultEl.textContent = res === undefined ? "Void" : res;
              resultEl.className = "text-green-400";
           } catch (e) {
              resultEl.textContent = e.message;
              resultEl.className = "text-red-400";
           }
        };
      }
    });
  };
})();

