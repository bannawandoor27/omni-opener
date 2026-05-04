/**
 * OmniOpener — WebAssembly (WASM) Toolkit
 * Uses OmniTool SDK. Visual hex viewer, module inspector, disassembler, and runtime playground.
 */
(function () {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.wasm',
      binary: true,
      infoHtml: '<strong>WASM Toolkit:</strong> Professional WebAssembly inspector. View binary hex data, inspect module exports/imports, disassemble to WAT, and test functions in the live playground.',
      
      actions: [
        {
          label: '📋 Copy Exports',
          id: 'copy-exports',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.moduleInfo && state.moduleInfo.exports) {
              const text = state.moduleInfo.exports.map(e => `${e.kind}: ${e.name}`).join('\n');
              h.copyToClipboard(text || 'No exports found', btn);
            }
          }
        },
        {
          label: '📄 Copy WAT',
          id: 'copy-wat',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.wat) h.copyToClipboard(state.wat, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download-wasm',
          onClick: function (h) {
            h.download(h.getFile().name || 'module.wasm', h.getContent(), 'application/wasm');
          }
        }
      ],

      onInit: function (h) {
        // Load WABT for disassembly support
        if (typeof wabt === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/wabt@1.0.35/index.js');
        }
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing WASM module...');
        
        let moduleInfo = { exports: [], imports: [] };
        let instance = null;
        let wat = '';

        try {
          // Parse module structure using native API
          const module = await WebAssembly.compile(content);
          moduleInfo.exports = WebAssembly.Module.exports(module);
          moduleInfo.imports = WebAssembly.Module.imports(module);
          
          // Attempt instantiation if no imports are required
          if (moduleInfo.imports.length === 0) {
            try {
              instance = await WebAssembly.instantiate(module);
            } catch (instError) {
              console.warn('Auto-instantiation failed:', instError);
            }
          }
          
          // Disassemble using WABT if available
          if (typeof wabt !== 'undefined') {
            try {
              const wabtLibrary = await wabt();
              const wasmModule = wabtLibrary.readWasm(new Uint8Array(content), { readDebugNames: true });
              wat = wasmModule.toText({ foldExprs: false, inlineExport: true });
            } catch (watError) {
              wat = ';; Disassembly failed: ' + watError.message;
            }
          } else {
            wat = ';; Disassembler (WABT) not loaded.';
          }

          h.setState({ moduleInfo, instance, wat });
        } catch (e) {
          h.showError('Invalid WASM File', e.message);
          return;
        }

        const hexDump = (buffer) => {
          const view = new DataView(buffer);
          let result = '';
          const maxBytes = Math.min(buffer.byteLength, 16384);
          for (let i = 0; i < maxBytes; i += 16) {
            let hex = '';
            let ascii = '';
            for (let j = 0; j < 16; j++) {
              if (i + j < buffer.byteLength) {
                const byte = view.getUint8(i + j);
                hex += byte.toString(16).padStart(2, '0') + ' ';
                ascii += (byte >= 32 && byte <= 126) ? esc(String.fromCharCode(byte)) : '.';
              } else {
                hex += '   ';
              }
            }
            result += `<div class="flex gap-4 border-b border-surface-50 last:border-0 py-0.5"><span class="text-surface-400 select-none w-16 shrink-0">${i.toString(16).padStart(6, '0')}</span><span class="text-brand-600 font-medium">${hex}</span><span class="text-surface-400 font-normal">${ascii}</span></div>`;
          }
          if (buffer.byteLength > 16384) {
            result += `<div class="p-4 text-surface-400 italic text-center">... module truncated at 16KB for performance ...</div>`;
          }
          return result;
        };

        h.render(`
          <div class="flex flex-col h-[700px] bg-white text-surface-800 font-sans">
            <!-- Tool Header/Tabs -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
              <span class="text-sm font-semibold text-surface-500 truncate mr-4">${esc(file.name)}</span>
              <div class="flex gap-1">
                <button id="tab-hex" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 text-white shadow-sm">Hex View</button>
                <button id="tab-info" class="px-3 py-1.5 text-xs font-bold rounded-lg text-surface-600 hover:bg-surface-200 transition-colors">Module Info</button>
                <button id="tab-wat" class="px-3 py-1.5 text-xs font-bold rounded-lg text-surface-600 hover:bg-surface-200 transition-colors">WAT Disassembly</button>
                <button id="tab-play" class="px-3 py-1.5 text-xs font-bold rounded-lg text-surface-600 hover:bg-surface-200 transition-colors">Playground</button>
              </div>
            </div>
            
            <!-- View Container -->
            <div class="flex-1 overflow-hidden relative">
              <!-- Hex View -->
              <div id="view-hex" class="absolute inset-0 overflow-auto p-4 font-mono text-[12px] leading-tight bg-white">
                ${hexDump(content)}
              </div>
              
              <!-- Module Info -->
              <div id="view-info" class="absolute inset-0 overflow-auto p-6 hidden bg-white">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 class="text-xs font-bold text-surface-400 mb-4 border-b pb-2 uppercase tracking-widest">Exported Members (${moduleInfo.exports.length})</h3>
                    <div class="space-y-2">
                      ${moduleInfo.exports.map(e => `
                        <div class="flex items-center gap-3 p-3 bg-surface-50 border border-surface-100 rounded-xl">
                          <span class="px-2 py-1 rounded-md bg-brand-100 text-brand-700 text-[10px] font-bold uppercase tracking-tight">${e.kind}</span>
                          <span class="font-mono text-sm text-surface-700 font-bold">${esc(e.name)}</span>
                        </div>
                      `).join('') || '<p class="text-surface-400 italic py-4">No exports found.</p>'}
                    </div>
                  </div>
                  <div>
                    <h3 class="text-xs font-bold text-surface-400 mb-4 border-b pb-2 uppercase tracking-widest">Imported Members (${moduleInfo.imports.length})</h3>
                    <div class="space-y-2">
                      ${moduleInfo.imports.map(i => `
                        <div class="flex flex-col p-3 bg-surface-50 border border-surface-100 rounded-xl">
                          <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-1 rounded-md bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-tight">${i.kind}</span>
                            <span class="text-surface-400 text-[10px] font-bold uppercase">${esc(i.module)}</span>
                          </div>
                          <span class="font-mono text-sm text-surface-700 font-bold">${esc(i.name)}</span>
                        </div>
                      `).join('') || '<p class="text-surface-400 italic py-4">No imports found.</p>'}
                    </div>
                  </div>
                </div>
              </div>

              <!-- WAT View -->
              <div id="view-wat" class="absolute inset-0 overflow-auto p-4 hidden font-mono text-[12px] whitespace-pre bg-surface-900 text-brand-50 leading-relaxed selection:bg-brand-500 selection:text-white">
                ${esc(wat)}
              </div>

              <!-- Playground -->
              <div id="view-play" class="absolute inset-0 overflow-auto p-8 hidden bg-white">
                <div class="max-w-2xl mx-auto space-y-8">
                  <div class="p-6 bg-blue-50 border border-blue-100 rounded-2xl">
                    <h4 class="text-blue-800 font-bold mb-1">Function Runner</h4>
                    <p class="text-sm text-blue-600 leading-relaxed">
                      Invoke exported functions directly. Note: Only basic numeric types (i32, i64, f32, f64) are supported for manual invocation here.
                    </p>
                    ${!instance ? '<div class="mt-4 p-3 bg-amber-100 border border-amber-200 rounded-lg text-xs text-amber-800 font-medium">⚠️ This module has external imports. Manual instantiation is disabled as mock imports were not provided.</div>' : ''}
                  </div>
                  
                  <div class="grid gap-6">
                    <div>
                      <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2 ml-1">Select Function</label>
                      <select id="wasm-func" class="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none cursor-pointer">
                        ${moduleInfo.exports.filter(e => e.kind === 'function').map(e => `<option value="${e.name}">${e.name}</option>`).join('') || '<option disabled>No functions available</option>'}
                      </select>
                    </div>
                    
                    <div>
                      <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2 ml-1">Arguments (comma separated)</label>
                      <input type="text" id="wasm-args" placeholder="e.g. 10, 20.5" class="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500 transition-all">
                    </div>
                    
                    <button id="btn-run-wasm" class="w-full py-4 bg-brand-600 text-white font-bold rounded-2xl shadow-lg shadow-brand-100 hover:bg-brand-700 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none" ${instance ? '' : 'disabled'}>
                      Execute Function
                    </button>
                    
                    <div class="mt-4 p-8 bg-surface-50 border-2 border-dashed border-surface-200 rounded-3xl text-center">
                      <p class="text-[10px] text-surface-400 font-bold uppercase mb-3 tracking-widest">Result Output</p>
                      <div id="wasm-result" class="text-3xl font-mono font-bold text-surface-300">Ready</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `);

        // Tab Switching Logic
        const tabs = {
          hex: document.getElementById('tab-hex'),
          info: document.getElementById('tab-info'),
          wat: document.getElementById('tab-wat'),
          play: document.getElementById('tab-play')
        };
        const views = {
          hex: document.getElementById('view-hex'),
          info: document.getElementById('view-info'),
          wat: document.getElementById('view-wat'),
          play: document.getElementById('view-play')
        };

        Object.keys(tabs).forEach(k => {
          tabs[k].onclick = () => {
            Object.values(tabs).forEach(t => {
              t.classList.remove('bg-brand-600', 'text-white', 'shadow-sm');
              t.classList.add('text-surface-600', 'hover:bg-surface-200');
            });
            tabs[k].classList.remove('text-surface-600', 'hover:bg-surface-200');
            tabs[k].classList.add('bg-brand-600', 'text-white', 'shadow-sm');
            
            Object.values(views).forEach(v => v.classList.add('hidden'));
            views[k].classList.remove('hidden');
          };
        });

        // Playground Logic
        const runBtn = document.getElementById('btn-run-wasm');
        if (runBtn && instance) {
          runBtn.onclick = () => {
            const funcName = document.getElementById('wasm-func').value;
            const argsInput = document.getElementById('wasm-args').value;
            const args = argsInput ? argsInput.split(',').map(a => {
              const trimmed = a.trim();
              return isNaN(trimmed) ? 0 : parseFloat(trimmed);
            }) : [];
            const resultEl = document.getElementById('wasm-result');

            try {
              const res = instance.exports[funcName](...args);
              resultEl.textContent = res === undefined ? "void" : res;
              resultEl.className = "text-3xl font-mono font-bold text-brand-600 animate-pulse";
              setTimeout(() => resultEl.classList.remove('animate-pulse'), 500);
            } catch (e) {
              resultEl.textContent = 'Error: ' + e.message;
              resultEl.className = "text-sm font-mono font-bold text-red-500 px-4";
            }
          };
        }
      }
    });
  };
})();
