/**
 * OmniOpener — WebAssembly (WASM) Toolkit
 * Uses OmniTool SDK. Visual hex viewer, module inspector, and runtime playground.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.wasm',
      binary: true,
      infoHtml: '<strong>WASM Toolkit:</strong> Professional WebAssembly inspector with hex viewer, module analysis, and runtime playground. All processing is 100% local.',

      actions: [
        {
          label: '📋 Copy Hex',
          id: 'copy-hex',
          onClick: function (h, btn) {
            const content = h.getContent();
            if (content) {
              const hex = Array.from(new Uint8Array(content))
                .map(function (b) { return b.toString(16).padStart(2, '0'); })
                .join(' ');
              h.copyToClipboard(hex, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/wasm');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/wabt@1.0.35/index.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing WASM module…');

        try {
          // Ensure WABT is loaded
          await h.loadScript('https://cdn.jsdelivr.net/npm/wabt@1.0.35/index.js');

          const module = await WebAssembly.compile(content);
          const exports = WebAssembly.Module.exports(module);
          const imports = WebAssembly.Module.imports(module);

          let wat = '';
          let instance = null;

          // Try to generate WAT
          try {
            if (typeof wabt !== 'undefined') {
              const w = await wabt();
              const wasmModule = w.readWasm(new Uint8Array(content), { readDebugNames: true });
              wat = wasmModule.toText({ foldExprs: false, inlineExport: true });
            } else {
              wat = 'Error: WABT library not loaded.';
            }
          } catch (e) {
            wat = 'Error generating WAT: ' + e.message;
          }

          // Try to instantiate
          try {
            if (imports.length === 0) {
              instance = await WebAssembly.instantiate(module);
            }
          } catch (e) {
            console.warn('Instantiation failed:', e);
          }

          renderWasm(file, content, module, exports, imports, instance, wat, h);
        } catch (err) {
          h.showError('WASM Analysis Failed', err.message);
        }
      }
    });
  };

  function renderWasm(file, content, module, exports, imports, instance, wat, h) {
    const hexDump = function (buffer) {
      const view = new DataView(buffer);
      let result = '';
      const limit = Math.min(buffer.byteLength, 8192);
      for (let i = 0; i < limit; i += 16) {
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
        result += '<div><span class="text-surface-400 mr-4">' + i.toString(16).padStart(8, '0') + '</span><span class="text-brand-600 mr-4">' + hex + '</span><span class="text-surface-500">' + ascii + '</span></div>';
      }
      if (buffer.byteLength > limit) {
        result += '<div class="text-surface-400 mt-2 italic">... Truncated for performance (total size: ' + buffer.byteLength + ' bytes)</div>';
      }
      return result;
    };

    h.render(
      '<div class="flex flex-col h-[700px] bg-white font-mono text-[12px] overflow-hidden rounded-xl border border-surface-200">' +
        '<div class="flex items-center gap-1 p-2 bg-surface-50 border-b border-surface-200">' +
          '<button id="tab-hex" class="px-3 py-1.5 rounded bg-brand-600 text-white font-medium transition-colors">Hex View</button>' +
          '<button id="tab-wat" class="px-3 py-1.5 rounded hover:bg-surface-200 text-surface-600 font-medium transition-colors">WAT (Text)</button>' +
          '<button id="tab-info" class="px-3 py-1.5 rounded hover:bg-surface-200 text-surface-600 font-medium transition-colors">Module Info</button>' +
          '<button id="tab-play" class="px-3 py-1.5 rounded hover:bg-surface-200 text-surface-600 font-medium transition-colors">Playground</button>' +
          '<div class="ml-auto px-2 py-1 bg-surface-200 rounded text-[10px] text-surface-600 font-bold uppercase tracking-tight">' +
            (content.byteLength / 1024).toFixed(1) + ' KB' +
          '</div>' +
        '</div>' +
        '<div class="flex-1 overflow-auto p-4 bg-white">' +
          '<div id="view-hex" class="whitespace-pre leading-relaxed">' + hexDump(content) + '</div>' +
          '<div id="view-wat" class="hidden whitespace-pre leading-relaxed text-surface-700">' + esc(wat) + '</div>' +
          '<div id="view-info" class="hidden space-y-8">' +
            '<section>' +
              '<h3 class="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2 mb-4 uppercase tracking-wider">Exports (' + exports.length + ')</h3>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">' +
                (exports.map(function (e) {
                  return '<div class="p-3 bg-surface-50 rounded-lg border border-surface-100 flex flex-col gap-1">' +
                    '<span class="text-[10px] font-bold text-brand-500 uppercase">' + esc(e.kind) + '</span>' +
                    '<span class="text-surface-800 break-all font-bold">' + esc(e.name) + '</span>' +
                  '</div>';
                }).join('') || '<p class="text-surface-400 italic">No exports found.</p>') +
              '</div>' +
            '</section>' +
            '<section>' +
              '<h3 class="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2 mb-4 uppercase tracking-wider">Imports (' + imports.length + ')</h3>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                (imports.map(function (i) {
                  return '<div class="p-3 bg-surface-50 rounded-lg border border-surface-100 flex flex-col gap-1">' +
                    '<span class="text-[10px] font-bold text-pink-500 uppercase">' + esc(i.kind) + '</span>' +
                    '<span class="text-surface-800 break-all font-bold">' + esc(i.module) + '.' + esc(i.name) + '</span>' +
                  '</div>';
                }).join('') || '<p class="text-surface-400 italic">No imports required.</p>') +
              '</div>' +
            '</section>' +
          '</div>' +
          '<div id="view-play" class="hidden max-w-2xl">' +
            '<h3 class="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2 mb-4 uppercase tracking-wider">Function Execution</h3>' +
            '<div class="space-y-4 p-6 bg-surface-50 rounded-xl border border-surface-100">' +
              '<div class="flex flex-col gap-2">' +
                '<label class="text-[11px] font-bold text-surface-500 uppercase">Target Function</label>' +
                '<select id="wasm-func" class="p-2.5 border border-surface-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-mono">' +
                  (exports.filter(function (e) { return e.kind === 'function'; }).map(function (e) {
                    return '<option value="' + esc(e.name) + '">' + esc(e.name) + '</option>';
                  }).join('') || '<option disabled>No functions available</option>') +
                '</select>' +
              '</div>' +
              '<div class="flex flex-col gap-2">' +
                '<label class="text-[11px] font-bold text-surface-500 uppercase">Arguments (JSON array)</label>' +
                '<input type="text" id="wasm-args" placeholder="e.g. [1, 2, 3]" value="[]" class="p-2.5 border border-surface-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-mono">' +
              '</div>' +
              '<button id="btn-run-wasm" class="w-full py-3 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 active:scale-[0.98] transition-all shadow-md">Execute Function</button>' +
              '<div class="mt-6">' +
                '<div class="text-[10px] font-bold text-surface-400 uppercase mb-2">Result Console</div>' +
                '<div id="wasm-result-box" class="p-4 bg-surface-900 text-green-400 rounded-lg font-mono min-h-[80px] border border-surface-800 shadow-inner break-all whitespace-pre-wrap">Ready.</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    // Tab switcher
    const el = h.getRenderEl();
    const tabBtns = {
      hex: el.querySelector('#tab-hex'),
      wat: el.querySelector('#tab-wat'),
      info: el.querySelector('#tab-info'),
      play: el.querySelector('#tab-play')
    };
    const views = {
      hex: el.querySelector('#view-hex'),
      wat: el.querySelector('#view-wat'),
      info: el.querySelector('#view-info'),
      play: el.querySelector('#view-play')
    };

    Object.keys(tabBtns).forEach(function (key) {
      if (!tabBtns[key]) return;
      tabBtns[key].onclick = function () {
        Object.keys(tabBtns).forEach(function (k) {
          tabBtns[k].className = 'px-3 py-1.5 rounded hover:bg-surface-200 text-surface-600 font-medium transition-colors';
          views[k].classList.add('hidden');
        });
        tabBtns[key].className = 'px-3 py-1.5 rounded bg-brand-600 text-white font-medium transition-colors';
        views[key].classList.remove('hidden');
      };
    });

    // Run Logic
    const runBtn = el.querySelector('#btn-run-wasm');
    if (runBtn) {
      runBtn.onclick = function () {
        const resultBox = el.querySelector('#wasm-result-box');
        const funcName = el.querySelector('#wasm-func').value;
        let args = [];

        try {
          args = JSON.parse(el.querySelector('#wasm-args').value || '[]');
          if (!Array.isArray(args)) throw new Error('Arguments must be a JSON array.');
        } catch (e) {
          resultBox.textContent = '>> Error: ' + e.message;
          resultBox.className = 'p-4 bg-red-950 text-red-400 rounded-lg font-mono min-h-[80px] border border-red-900 shadow-inner';
          return;
        }

        if (!instance) {
          resultBox.textContent = '>> Error: Module not instantiated. Does it have imports or is it invalid?';
          resultBox.className = 'p-4 bg-orange-950 text-orange-400 rounded-lg font-mono min-h-[80px] border border-orange-900 shadow-inner';
          return;
        }

        try {
          const fn = instance.exports[funcName];
          if (typeof fn !== 'function') throw new Error('Selected export is not a function.');
          const start = performance.now();
          const result = fn.apply(null, args);
          const end = performance.now();
          resultBox.textContent = '>> Executed: ' + funcName + '(' + args.join(', ') + ')\n>> Result: ' + (result === undefined ? 'void' : JSON.stringify(result)) + '\n>> Time: ' + (end - start).toFixed(4) + 'ms';
          resultBox.className = 'p-4 bg-surface-900 text-green-400 rounded-lg font-mono min-h-[80px] border border-surface-800 shadow-inner';
        } catch (e) {
          resultBox.textContent = '>> Runtime Error: ' + e.message;
          resultBox.className = 'p-4 bg-red-950 text-red-400 rounded-lg font-mono min-h-[80px] border border-red-900 shadow-inner';
        }
      };
    }
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }
})();
