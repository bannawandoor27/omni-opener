/**
 * OmniOpener — WebAssembly Text (WAT) Viewer & Converter
 * A production-grade tool for inspecting and converting WAT files.
 */
(function () {
  'use strict';

  // Helper: Sanitize HTML to prevent XSS
  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper: Human-readable file size
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let _wabt = null;
    let _lastBlobUrl = null;

    const cleanup = () => {
      if (_lastBlobUrl) {
        URL.revokeObjectURL(_lastBlobUrl);
        _lastBlobUrl = null;
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.wat',
      binary: false,
      infoHtml: 'Professional WebAssembly Text (WAT) toolkit. View source with syntax highlighting, inspect module exports/imports, and convert to binary WASM.',

      actions: [
        {
          label: '📋 Copy WAT',
          id: 'copy-wat',
          onClick: (h, btn) => h.copyToClipboard(h.getContent(), btn)
        },
        {
          label: '⚡ Convert to WASM',
          id: 'conv-wasm',
          onClick: async function (h) {
            if (!_wabt) {
              h.showError('Tool Not Ready', 'The WABT conversion engine is still loading.');
              return;
            }
            try {
              h.showLoading('Compiling WAT to WASM...');
              const module = _wabt.parseWat(h.getFile().name, h.getContent());
              const { buffer } = module.toBinary({ log: false, canonicalize_lebs: true, relocatable: false, write_debug_names: false });
              
              const blob = new Blob([buffer], { type: 'application/wasm' });
              h.download(h.getFile().name.replace(/\.wat$/, '') + '.wasm', blob, 'application/wasm');
              h.hideLoading();
            } catch (err) {
              h.showError('Compilation Error', 'Failed to convert WAT to WASM. Check if your syntax is valid.', err.message);
            }
          }
        },
        {
          label: '📥 Save WAT',
          id: 'save-wat',
          onClick: (h) => h.download(h.getFile().name, h.getContent(), 'text/plain')
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

      onDestroy: cleanup,

      onFile: function _onFileFn(file, content, h) {
        cleanup();
        
        if (!content || content.trim() === '') {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-surface-400 border-2 border-dashed border-surface-200 rounded-xl">
              <div class="text-4xl mb-2">📄</div>
              <div class="font-medium text-surface-600">Empty WAT File</div>
              <p class="text-sm">This file contains no WebAssembly text code.</p>
            </div>
          `);
          return;
        }

        const render = async () => {
          // B1: Race condition check for libraries
          if (typeof window.wabt === 'undefined' || typeof window.Prism === 'undefined' || !window.Prism.languages.wasm) {
            h.showLoading('Preparing WAT engine...');
            setTimeout(render, 100);
            return;
          }

          try {
            if (!_wabt) {
              _wabt = await window.wabt();
            }

            h.showLoading('Analyzing module structure...');

            let moduleInfo = { exports: [], imports: [] };
            let wasmBuffer = null;
            let parseError = null;

            try {
              const module = _wabt.parseWat(file.name, content);
              const binary = module.toBinary({ log: false, canonicalize_lebs: true });
              wasmBuffer = binary.buffer;
              
              const wasmModule = await WebAssembly.compile(wasmBuffer);
              moduleInfo.exports = WebAssembly.Module.exports(wasmModule);
              moduleInfo.imports = WebAssembly.Module.imports(wasmModule);
            } catch (e) {
              parseError = e.message;
            }

            // U7-U10: UI Construction
            const isLarge = content.length > 300000;
            const displayContent = isLarge ? content.substring(0, 300000) : content;
            const highlighted = window.Prism.highlight(displayContent, window.Prism.languages.wasm, 'wasm');

            h.render(`
              <div class="animate-in fade-in duration-300">
                <!-- U1: File Info Bar -->
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                  <span class="font-semibold text-surface-800">${escape(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">.wat file</span>
                  ${isLarge ? '<span class="ml-auto text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md text-xs font-medium">Large file: Showing first 300KB</span>' : ''}
                </div>

                <div class="bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                  <!-- Tabs Navigation -->
                  <div class="flex border-b border-surface-200 bg-surface-50/50 p-1">
                    <button id="tab-src" class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all bg-white shadow-sm text-brand-600 border border-surface-200">Source Code</button>
                    <button id="tab-info" class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all text-surface-500 hover:text-surface-700">Module Info</button>
                    <button id="tab-hex" class="flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-all text-surface-500 hover:text-surface-700">Binary Preview</button>
                  </div>

                  <!-- Tab Content: Source -->
                  <div id="view-src" class="relative group">
                    <div class="max-h-[70vh] overflow-auto bg-gray-950">
                      <pre class="p-6 text-sm font-mono leading-relaxed text-gray-100 m-0"><code class="language-wasm">${highlighted}</code></pre>
                    </div>
                  </div>

                  <!-- Tab Content: Module Info -->
                  <div id="view-info" class="hidden p-6 max-h-[70vh] overflow-auto">
                    ${parseError ? `
                      <div class="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700">
                        <h4 class="font-bold mb-2">Parsing Error</h4>
                        <pre class="text-xs font-mono whitespace-pre-wrap">${escape(parseError)}</pre>
                      </div>
                    ` : `
                      <div class="mb-6">
                        <input type="text" id="info-filter" placeholder="Search exports and imports..." 
                          class="w-full px-4 py-2 bg-surface-50 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" />
                      </div>

                      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <!-- Exports Section -->
                        <section>
                          <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold text-surface-800">Exports</h3>
                            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${moduleInfo.exports.length} items</span>
                          </div>
                          <div class="space-y-2" id="exports-list">
                            ${moduleInfo.exports.map(e => `
                              <div class="info-card rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-sm transition-all bg-white" data-search="${escape(e.name)}">
                                <div class="flex items-center justify-between">
                                  <span class="font-mono text-sm font-semibold text-surface-900 truncate mr-2">${escape(e.name)}</span>
                                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 font-bold uppercase">${e.kind}</span>
                                </div>
                              </div>
                            `).join('') || '<div class="text-center py-8 text-surface-400 text-sm italic">No exports found</div>'}
                          </div>
                        </section>

                        <!-- Imports Section -->
                        <section>
                          <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold text-surface-800">Imports</h3>
                            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">${moduleInfo.imports.length} items</span>
                          </div>
                          <div class="space-y-2" id="imports-list">
                            ${moduleInfo.imports.map(i => `
                              <div class="info-card rounded-xl border border-surface-200 p-3 hover:border-purple-300 hover:shadow-sm transition-all bg-white" data-search="${escape(i.module)} ${escape(i.name)}">
                                <div class="flex items-center justify-between mb-1">
                                  <span class="text-[10px] text-purple-600 font-bold uppercase tracking-wider">${escape(i.module)}</span>
                                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 font-bold uppercase">${i.kind}</span>
                                </div>
                                <div class="font-mono text-sm font-semibold text-surface-900 truncate">${escape(i.name)}</div>
                              </div>
                            `).join('') || '<div class="text-center py-8 text-surface-400 text-sm italic">No imports found</div>'}
                          </div>
                        </section>
                      </div>
                    `}
                  </div>

                  <!-- Tab Content: Hex -->
                  <div id="view-hex" class="hidden bg-gray-950 p-6 max-h-[70vh] overflow-auto">
                    ${wasmBuffer ? `
                      <div class="font-mono text-[12px] leading-relaxed text-gray-400">
                        ${(() => {
                          const bytes = new Uint8Array(wasmBuffer);
                          let html = '';
                          const len = Math.min(bytes.length, 8192);
                          for (let i = 0; i < len; i += 16) {
                            let hex = '';
                            let ascii = '';
                            for (let j = 0; j < 16; j++) {
                              if (i + j < bytes.length) {
                                const b = bytes[i + j];
                                hex += b.toString(16).padStart(2, '0') + ' ';
                                ascii += (b >= 32 && b <= 126) ? escape(String.fromCharCode(b)) : '.';
                              } else {
                                hex += '   ';
                              }
                            }
                            html += `<div class="flex gap-4 border-b border-white/5 py-0.5"><span class="text-surface-600 w-16 shrink-0">${i.toString(16).padStart(6, '0')}</span><span class="text-brand-500">${hex}</span><span class="text-surface-500 hidden md:block">${ascii}</span></div>`;
                          }
                          if (bytes.length > len) {
                            html += `<div class="mt-4 p-3 bg-white/5 rounded text-surface-500 italic">Showing first 8KB of ${formatSize(bytes.length)} binary module.</div>`;
                          }
                          return html;
                        })()}
                      </div>
                    ` : `
                      <div class="p-12 text-center text-surface-500">
                        Binary preview unavailable due to parsing errors.
                      </div>
                    `}
                  </div>
                </div>
              </div>
            `);

            // Event Listeners for Tabs
            const tabs = {
              'src': { btn: document.getElementById('tab-src'), view: document.getElementById('view-src') },
              'info': { btn: document.getElementById('tab-info'), view: document.getElementById('view-info') },
              'hex': { btn: document.getElementById('tab-hex'), view: document.getElementById('view-hex') }
            };

            Object.entries(tabs).forEach(([id, { btn, view }]) => {
              btn.onclick = () => {
                Object.values(tabs).forEach(t => {
                  t.btn.classList.remove('bg-white', 'shadow-sm', 'text-brand-600', 'border', 'border-surface-200');
                  t.btn.classList.add('text-surface-500', 'hover:text-surface-700');
                  t.view.classList.add('hidden');
                });
                btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600', 'border', 'border-surface-200');
                btn.classList.remove('text-surface-500', 'hover:text-surface-700');
                view.classList.remove('hidden');
              };
            });

            // Search filtering
            const filterInput = document.getElementById('info-filter');
            if (filterInput) {
              filterInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                document.querySelectorAll('.info-card').forEach(card => {
                  const content = card.getAttribute('data-search').toLowerCase();
                  card.style.display = content.includes(term) ? 'block' : 'none';
                });
              };
            }

            h.hideLoading();
          } catch (err) {
            h.showError('Analysis Failed', 'Could not process the WAT file.', err.message);
          }
        };

        render();
      }
    });
  };
})();
