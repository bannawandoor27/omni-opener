/**
 * OmniOpener — WebAssembly Text (WAT) Viewer & Converter
 * Uses OmniTool SDK, Prism.js for highlighting, and WABT for conversion.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.wat',
      binary: false,
      infoHtml: '<strong>WAT Toolkit:</strong> Professional WebAssembly Text viewer with syntax highlighting, module inspection, and WAT-to-WASM conversion.',

      actions: [
        {
          label: '📋 Copy WAT',
          id: 'copy-wat',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        },
        {
          label: '📥 Download WASM',
          id: 'dl-wasm',
          onClick: async function (h, btn) {
            if (typeof wabt === 'undefined') {
              h.showError('Library Loading', 'WABT library is still loading. Please wait a moment.');
              return;
            }
            try {
              h.showLoading('Converting to WASM...');
              const instance = await window.wabt();
              const module = instance.parseWat(h.getFile().name, h.getContent());
              const { buffer } = module.toBinary({ log: false, canonicalize_lebs: true, relocatable: false, write_debug_names: false });
              h.download(h.getFile().name.replace(/\.wat$/, '.wasm'), buffer, 'application/wasm');
              h.hideLoading();
            } catch (err) {
              h.showError('Conversion Failed', 'Could not convert WAT to WASM: ' + err.message);
            }
          }
        },
        {
          label: '📥 Download WAT',
          id: 'dl-wat',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'text/plain');
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css');
        h.loadScripts([
          'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-wasm.min.js',
          'https://cdn.jsdelivr.net/npm/wabt@1.0.35/index.js'
        ]);
      },

      onFile: function (file, content, h) {
        if (!content || content.trim() === '') {
          h.render('<div class="flex flex-col items-center justify-center p-12 text-surface-400 border-2 border-dashed border-surface-200 rounded-xl"><div class="text-4xl mb-4">📄</div><div class="text-lg font-medium">Empty WAT file</div><p class="text-sm">This file contains no WebAssembly text code.</p></div>');
          return;
        }

        h.showLoading('Parsing WebAssembly text...');

        const renderTool = async () => {
          try {
            // Ensure libraries are loaded
            if (typeof window.wabt === 'undefined' || typeof window.Prism === 'undefined' || !window.Prism.languages.wasm) {
              setTimeout(renderTool, 100);
              return;
            }

            let moduleInfo = { exports: [], imports: [] };
            let wasmBuffer = null;
            let analysisError = null;

            try {
              const instance = await window.wabt();
              const module = instance.parseWat(file.name, content);
              const binary = module.toBinary({ log: false, canonicalize_lebs: true, relocatable: false, write_debug_names: false });
              wasmBuffer = binary.buffer;
              
              const wasmModule = await WebAssembly.compile(wasmBuffer);
              moduleInfo.exports = WebAssembly.Module.exports(wasmModule);
              moduleInfo.imports = WebAssembly.Module.imports(wasmModule);
            } catch (e) {
              analysisError = e.message;
              console.warn('WABT analysis failed', e);
            }

            const isLargeFile = content.length > 500000;
            const displayContent = isLargeFile ? content.substring(0, 500000) : content;
            const highlighted = window.Prism.highlight(displayContent, window.Prism.languages.wasm, 'wasm');

            const hexDump = (buffer) => {
              if (!buffer) return `<div class="p-8 text-center text-surface-400">Binary data unavailable. ${analysisError ? 'Analysis failed: ' + escapeHtml(analysisError) : ''}</div>`;
              const view = new DataView(buffer.buffer || buffer);
              let result = '';
              const limit = Math.min(buffer.byteLength, 16384);
              for (let i = 0; i < limit; i += 16) {
                let hex = '';
                let ascii = '';
                for (let j = 0; j < 16; j++) {
                  if (i + j < buffer.byteLength) {
                    const byte = view.getUint8(i + j);
                    hex += byte.toString(16).padStart(2, '0') + ' ';
                    ascii += (byte >= 32 && byte <= 126) ? escapeHtml(String.fromCharCode(byte)) : '.';
                  } else {
                    hex += '   ';
                  }
                }
                result += `<div class="flex gap-4 border-b border-white/5 py-0.5"><span class="text-surface-500 w-20 shrink-0">${i.toString(16).padStart(8, '0')}</span><span class="text-brand-400 font-medium">${hex}</span><span class="text-surface-400 hidden md:block">${ascii}</span></div>`;
              }
              if (buffer.byteLength > limit) {
                result += `<div class="text-surface-500 py-4 italic border-t border-white/10 mt-2">Showing first 16KB of ${formatBytes(buffer.byteLength)} total binary size. Download WASM for full content.</div>`;
              }
              return result;
            };

            h.render(`
              <div class="space-y-4">
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600">
                  <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatBytes(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">.wat file</span>
                  ${isLargeFile ? '<span class="ml-auto text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-xs font-medium">Large file: Preview truncated</span>' : ''}
                </div>

                <div class="bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                  <div class="flex border-b border-surface-200 bg-surface-50/50 p-1">
                    <button id="btn-code" class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all bg-white shadow-sm text-brand-600 border border-surface-200">WAT Source</button>
                    <button id="btn-inspect" class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all text-surface-500 hover:text-surface-700">Module Info</button>
                    <button id="btn-hex" class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all text-surface-500 hover:text-surface-700">Binary Hex</button>
                  </div>

                  <div id="view-code" class="relative group">
                    <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button id="copy-inner" class="p-2 bg-surface-800/80 text-white rounded-lg hover:bg-surface-800 text-xs backdrop-blur-sm">Copy Code</button>
                    </div>
                    <div class="max-h-[70vh] overflow-auto bg-gray-950">
                      <pre class="p-6 text-sm font-mono leading-relaxed text-gray-100 m-0"><code class="language-wasm">${highlighted}</code></pre>
                    </div>
                  </div>

                  <div id="view-inspect" class="hidden p-6 max-h-[70vh] overflow-auto space-y-8">
                    <div class="relative">
                      <input type="text" id="inspect-search" placeholder="Filter imports/exports..." class="w-full px-4 py-2 bg-surface-50 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 mb-6" />
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <section>
                        <div class="flex items-center justify-between mb-4">
                          <h3 class="font-bold text-surface-800 flex items-center gap-2">
                            <span class="w-2 h-6 bg-brand-500 rounded-full"></span>
                            Exports
                          </h3>
                          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${moduleInfo.exports.length} items</span>
                        </div>
                        <div class="space-y-2" id="exports-list">
                          ${moduleInfo.exports.map(e => `
                            <div class="item-card rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-sm transition-all bg-white" data-name="${escapeHtml(e.name)}">
                              <div class="flex items-center justify-between">
                                <span class="font-mono text-sm font-semibold text-surface-900 truncate mr-2" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 font-bold uppercase tracking-tight">${e.kind}</span>
                              </div>
                            </div>
                          `).join('') || '<div class="text-surface-400 italic text-sm p-4 text-center border-2 border-dashed border-surface-100 rounded-xl">No exports defined</div>'}
                        </div>
                      </section>

                      <section>
                        <div class="flex items-center justify-between mb-4">
                          <h3 class="font-bold text-surface-800 flex items-center gap-2">
                            <span class="w-2 h-6 bg-purple-500 rounded-full"></span>
                            Imports
                          </h3>
                          <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">${moduleInfo.imports.length} items</span>
                        </div>
                        <div class="space-y-2" id="imports-list">
                          ${moduleInfo.imports.map(i => `
                            <div class="item-card rounded-xl border border-surface-200 p-3 hover:border-purple-300 hover:shadow-sm transition-all bg-white" data-name="${escapeHtml(i.module)} ${escapeHtml(i.name)}">
                              <div class="flex items-center justify-between mb-1">
                                <span class="text-[10px] text-purple-600 font-bold uppercase tracking-wider">${escapeHtml(i.module)}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 font-bold uppercase tracking-tight">${i.kind}</span>
                              </div>
                              <div class="font-mono text-sm font-semibold text-surface-900 truncate" title="${escapeHtml(i.name)}">${escapeHtml(i.name)}</div>
                            </div>
                          `).join('') || '<div class="text-surface-400 italic text-sm p-4 text-center border-2 border-dashed border-surface-100 rounded-xl">No imports defined</div>'}
                        </div>
                      </section>
                    </div>
                  </div>

                  <div id="view-hex" class="hidden bg-gray-950 p-6 max-h-[70vh] overflow-auto">
                    <div class="font-mono text-[12px] leading-relaxed text-gray-300">
                      ${hexDump(wasmBuffer)}
                    </div>
                  </div>
                </div>
              </div>
            `);

            const btnCode = document.getElementById('btn-code');
            const btnInspect = document.getElementById('btn-inspect');
            const btnHex = document.getElementById('btn-hex');
            const viewCode = document.getElementById('view-code');
            const viewInspect = document.getElementById('view-inspect');
            const viewHex = document.getElementById('view-hex');
            const copyInner = document.getElementById('copy-inner');
            const searchInput = document.getElementById('inspect-search');

            const setActive = (btn, view) => {
              [btnCode, btnInspect, btnHex].forEach(b => {
                b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600', 'border', 'border-surface-200');
                b.classList.add('text-surface-500', 'hover:text-surface-700');
              });
              [viewCode, viewInspect, viewHex].forEach(v => v.classList.add('hidden'));
              
              btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600', 'border', 'border-surface-200');
              btn.classList.remove('text-surface-500', 'hover:text-surface-700');
              view.classList.remove('hidden');
            };

            btnCode.onclick = () => setActive(btnCode, viewCode);
            btnInspect.onclick = () => setActive(btnInspect, viewInspect);
            btnHex.onclick = () => setActive(btnHex, viewHex);

            if (copyInner) {
              copyInner.onclick = (e) => h.copyToClipboard(content, e.target);
            }

            if (searchInput) {
              searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('.item-card').forEach(card => {
                  const name = card.getAttribute('data-name').toLowerCase();
                  card.style.display = name.includes(term) ? 'block' : 'none';
                });
              };
            }

            h.hideLoading();
          } catch (err) {
            h.showError('Analysis Failed', 'Could not process the WAT file: ' + err.message);
          }
        };

        renderTool();
      }
    });
  };
})();
