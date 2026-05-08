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

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let wabtInstance = null;

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
        if (typeof window.wabt === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/wabt@1.0.35/index.js');
        }
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing WebAssembly module...');
        
        // Wait for WABT if it's still loading (B1/B4 fix)
        let retryCount = 0;
        while (typeof window.wabt === 'undefined' && retryCount < 50) {
          await new Promise(r => setTimeout(r, 100));
          retryCount++;
        }

        let moduleInfo = { exports: [], imports: [] };
        let instance = null;
        let wat = '';

        try {
          const module = await WebAssembly.compile(content);
          moduleInfo.exports = WebAssembly.Module.exports(module);
          moduleInfo.imports = WebAssembly.Module.imports(module);
          
          if (moduleInfo.imports.length === 0) {
            try {
              instance = await WebAssembly.instantiate(module);
            } catch (instError) {
              console.warn('Auto-instantiation failed:', instError);
            }
          }
          
          if (typeof window.wabt !== 'undefined') {
            try {
              if (!wabtInstance) {
                wabtInstance = await window.wabt();
              }
              const wasmModule = wabtInstance.readWasm(new Uint8Array(content), { readDebugNames: true });
              wat = wasmModule.toText({ foldExprs: false, inlineExport: true });
            } catch (watError) {
              wat = ';; Disassembly failed: ' + watError.message;
            }
          } else {
            wat = ';; Disassembler (WABT) failed to load.';
          }

          h.setState({ moduleInfo, instance, wat, activeTab: 'hex', filter: '' });
        } catch (e) {
          h.showError('Could not open WASM file', 'The file might be corrupted or is not a valid WebAssembly binary. ' + e.message);
          return;
        }

        const renderHex = (buffer) => {
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
            result += `<div class="p-6 text-surface-400 italic text-center bg-surface-50 rounded-b-xl border-t border-surface-100 mt-2">Showing first 16KB of ${formatSize(buffer.byteLength)}</div>`;
          }
          return result;
        };

        const renderUI = () => {
          const state = h.getState();
          const activeTab = state.activeTab || 'hex';
          const filter = (state.filter || '').toLowerCase();

          const filteredExports = moduleInfo.exports.filter(e => 
            e.name.toLowerCase().includes(filter) || e.kind.toLowerCase().includes(filter)
          );
          const filteredImports = moduleInfo.imports.filter(i => 
            i.name.toLowerCase().includes(filter) || i.module.toLowerCase().includes(filter) || i.kind.toLowerCase().includes(filter)
          );

          const filteredWat = wat.split('\n').filter(line => line.toLowerCase().includes(filter)).join('\n');

          h.render(`
            <div class="flex flex-col min-h-[600px] bg-white text-surface-800 font-sans">
              <!-- File Info Bar (U1) -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 mx-4 mt-4 border border-surface-100">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(content.byteLength)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">WebAssembly Module</span>
              </div>

              <!-- Tabs & Search (Part 4) -->
              <div class="px-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="flex p-1 bg-surface-100 rounded-xl w-fit">
                  ${['hex', 'info', 'wat', 'play'].map(t => `
                    <button id="tab-${t}" class="px-4 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === t ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-700'}">
                      ${t === 'hex' ? 'Hex View' : t === 'info' ? 'Module Info' : t === 'wat' ? 'Disassembly' : 'Playground'}
                    </button>
                  `).join('')}
                </div>
                
                <div class="relative group">
                  <input type="text" id="wasm-search" placeholder="Filter ${activeTab === 'play' ? 'disabled' : 'results'}..." 
                    value="${esc(state.filter || '')}"
                    class="pl-9 pr-4 py-2 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all w-full md:w-64"
                    ${activeTab === 'play' ? 'disabled' : ''}>
                  <svg class="absolute left-3 top-2.5 w-4 h-4 text-surface-400 group-focus-within:text-brand-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
              </div>

              <!-- Content Area (Part 3) -->
              <div class="flex-1 px-4 pb-4 overflow-hidden flex flex-col">
                <!-- Hex View -->
                <div id="view-hex" class="${activeTab === 'hex' ? 'flex flex-col flex-1 overflow-hidden' : 'hidden'}">
                  <div class="rounded-xl overflow-hidden border border-surface-200 flex-1 flex flex-col">
                    <pre class="p-4 text-[12px] font-mono bg-white text-surface-700 overflow-auto leading-tight flex-1">
${renderHex(content)}
                    </pre>
                  </div>
                </div>

                <!-- Module Info -->
                <div id="view-info" class="${activeTab === 'info' ? 'overflow-auto flex-1' : 'hidden'} space-y-6">
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4">
                    <!-- Exports (U7/U10) -->
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-surface-800">Exports</h3>
                        <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${moduleInfo.exports.length} items</span>
                      </div>
                      <div class="overflow-hidden rounded-xl border border-surface-200">
                        <table class="min-w-full text-sm">
                          <thead>
                            <tr class="bg-surface-50 border-b border-surface-200">
                              <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                              <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-surface-100 bg-white">
                            ${filteredExports.map(e => `
                              <tr class="hover:bg-brand-50 transition-colors">
                                <td class="px-4 py-2.5">
                                  <span class="px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-tight">${e.kind}</span>
                                </td>
                                <td class="px-4 py-2.5 font-mono text-surface-700">${esc(e.name)}</td>
                              </tr>
                            `).join('') || `<tr><td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">No exports matching filter</td></tr>`}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <!-- Imports -->
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <h3 class="font-semibold text-surface-800">Imports</h3>
                        <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">${moduleInfo.imports.length} items</span>
                      </div>
                      <div class="overflow-hidden rounded-xl border border-surface-200">
                        <table class="min-w-full text-sm">
                          <thead>
                            <tr class="bg-surface-50 border-b border-surface-200">
                              <th class="px-4 py-3 text-left font-semibold text-surface-700">Module</th>
                              <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                              <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-surface-100 bg-white">
                            ${filteredImports.map(i => `
                              <tr class="hover:bg-purple-50 transition-colors">
                                <td class="px-4 py-2.5 text-surface-500 font-medium">${esc(i.module)}</td>
                                <td class="px-4 py-2.5 font-mono text-surface-700">${esc(i.name)}</td>
                                <td class="px-4 py-2.5">
                                  <span class="px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold uppercase tracking-tight">${i.kind}</span>
                                </td>
                              </tr>
                            `).join('') || `<tr><td colspan="3" class="px-4 py-8 text-center text-surface-400 italic">No imports matching filter</td></tr>`}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Disassembly (U8) -->
                <div id="view-wat" class="${activeTab === 'wat' ? 'flex flex-col flex-1 overflow-hidden' : 'hidden'}">
                   <div class="rounded-xl overflow-hidden border border-surface-200 flex-1 flex flex-col">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-auto leading-relaxed flex-1">
${esc(filteredWat) || '<div class="text-gray-500 italic">No code matching search filter</div>'}
                    </pre>
                  </div>
                </div>

                <!-- Playground (U9) -->
                <div id="view-play" class="${activeTab === 'play' ? 'overflow-auto flex-1' : 'hidden'} max-w-2xl mx-auto w-full py-4">
                  <div class="rounded-xl border border-surface-200 p-6 space-y-6 bg-white">
                    <div class="flex items-start gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                      <div class="p-2 bg-blue-100 rounded-lg">
                        <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      </div>
                      <div>
                        <h4 class="text-blue-900 font-bold text-sm">Function Explorer</h4>
                        <p class="text-xs text-blue-700 mt-0.5 leading-relaxed">
                          Call exported functions with numeric arguments. WASM only supports i32, i64, f32, f64 directly.
                        </p>
                      </div>
                    </div>

                    ${!instance ? `
                      <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
                        <svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        <p class="text-xs text-amber-800 font-medium">This module has external imports. Playground execution is disabled.</p>
                      </div>
                    ` : `
                      <div class="space-y-4">
                        <div>
                          <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2 ml-1">Exported Function</label>
                          <select id="wasm-func" class="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none cursor-pointer">
                            ${moduleInfo.exports.filter(e => e.kind === 'function').map(e => `<option value="${esc(e.name)}">${esc(e.name)}</option>`).join('') || '<option disabled>No functions available</option>'}
                          </select>
                        </div>
                        
                        <div>
                          <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2 ml-1">Parameters (comma separated)</label>
                          <input type="text" id="wasm-args" placeholder="e.g. 1024, 42.5" class="w-full bg-surface-50 border border-surface-200 rounded-xl p-3 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500 transition-all">
                        </div>
                        
                        <button id="btn-run-wasm" class="w-full py-4 bg-brand-600 text-white font-bold rounded-xl shadow-lg shadow-brand-100 hover:bg-brand-700 hover:-translate-y-0.5 transition-all active:scale-95">
                          Run Function
                        </button>
                        
                        <div class="mt-6 p-6 bg-surface-50 border border-surface-100 rounded-2xl text-center">
                          <p class="text-[10px] text-surface-400 font-bold uppercase mb-2 tracking-widest">Result</p>
                          <div id="wasm-result" class="text-2xl font-mono font-bold text-surface-400">Ready</div>
                        </div>
                      </div>
                    `}
                  </div>
                </div>
              </div>
            </div>
          `);

          // Attach Events
          ['hex', 'info', 'wat', 'play'].forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            if (btn) btn.onclick = () => h.setState({ activeTab: t });
          });

          const searchInput = document.getElementById('wasm-search');
          if (searchInput) {
            searchInput.oninput = (e) => h.setState({ filter: e.target.value });
            searchInput.onkeydown = (e) => {
              if (e.key === 'Escape') h.setState({ filter: '' });
            };
          }

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
                resultEl.className = "text-2xl font-mono font-bold text-brand-600 animate-pulse";
                setTimeout(() => resultEl.classList.remove('animate-pulse'), 1000);
              } catch (e) {
                resultEl.textContent = 'Runtime Error: ' + e.message;
                resultEl.className = "text-sm font-mono font-bold text-red-500 px-4";
              }
            };
          }
        };

        h.onStateChange(renderUI);
        renderUI();
      }
    });
  };
})();
