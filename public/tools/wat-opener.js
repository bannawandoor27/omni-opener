/**
 * OmniOpener — WebAssembly Text (WAT) Production Toolkit
 * Production-grade WAT viewer, analyzer, and WASM compiler.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let _wabtModule = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.wat',
      binary: false,
      infoHtml: 'Advanced WebAssembly Text (WAT) toolkit. Inspect module structure, exports, imports, and compile to binary WASM directly in your browser.',

      actions: [
        {
          label: '📋 Copy WAT',
          id: 'copy-wat',
          onClick: (h, btn) => h.copyToClipboard(h.getContent(), btn)
        },
        {
          label: '⚡ Download WASM',
          id: 'dl-wasm',
          onClick: async function (h) {
            if (!_wabtModule) {
              h.showError('Compiler Not Ready', 'The WABT engine is still loading or the WAT syntax is invalid.');
              return;
            }
            try {
              h.showLoading('Compiling to WASM...');
              const { buffer } = _wabtModule.toBinary({ log: false, canonicalize_lebs: true, relocatable: false, write_debug_names: false });
              const blob = new Blob([buffer], { type: 'application/wasm' });
              h.download(h.getFile().name.replace(/\.wat$/, '') + '.wasm', blob, 'application/wasm');
              h.hideLoading();
            } catch (err) {
              h.showError('Compilation Error', 'Failed to generate WASM binary.', err.message);
            }
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

      onFile: function _onFileFn(file, content, h) {
        if (!content || content.trim().length === 0) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-surface-400 border-2 border-dashed border-surface-200 rounded-xl">
              <div class="text-4xl mb-4">📄</div>
              <div class="font-semibold text-surface-800 mb-1">Empty WAT File</div>
              <p class="text-sm">This file contains no WebAssembly Text content.</p>
            </div>
          `);
          return;
        }

        const renderTool = async () => {
          // B1: Wait for libraries
          if (typeof window.wabt === 'undefined' || typeof window.Prism === 'undefined' || !window.Prism.languages.wasm) {
            h.showLoading('Loading WAT engine...');
            setTimeout(renderTool, 100);
            return;
          }

          h.showLoading('Analyzing module...');

          let moduleInfo = { exports: [], imports: [] };
          let hexDump = '';
          let parseError = null;
          _wabtModule = null;

          try {
            const wabt = await window.wabt();
            _wabtModule = wabt.parseWat(file.name, content);
            const binary = _wabtModule.toBinary({ log: false, canonicalize_lebs: true });
            const bytes = binary.buffer;

            // Extract info using browser's native WebAssembly
            try {
              const compiled = await WebAssembly.compile(bytes);
              moduleInfo.exports = WebAssembly.Module.exports(compiled);
              moduleInfo.imports = WebAssembly.Module.imports(compiled);
            } catch (e) {
              // Fallback if compilation fails but WABT parsed it
            }

            // Generate Hex Dump (B7: Truncated)
            const maxHex = 4096;
            const len = Math.min(bytes.length, maxHex);
            for (let i = 0; i < len; i += 16) {
              let hex = '';
              let ascii = '';
              for (let j = 0; j < 16; j++) {
                if (i + j < bytes.length) {
                  const b = bytes[i + j];
                  hex += b.toString(16).padStart(2, '0') + ' ';
                  ascii += (b >= 32 && b <= 126) ? escapeHtml(String.fromCharCode(b)) : '.';
                } else {
                  hex += '   ';
                }
              }
              hexDump += `<div class="flex gap-4 border-b border-white/5 py-0.5"><span class="text-surface-600 w-16 shrink-0">${i.toString(16).padStart(6, '0')}</span><span class="text-brand-400">${hex}</span><span class="text-surface-500 hidden md:block">${ascii}</span></div>`;
            }
            if (bytes.length > maxHex) {
              hexDump += `<div class="mt-4 p-3 bg-white/5 rounded text-surface-500 italic text-xs text-center border border-white/10">Truncated: Showing first ${formatBytes(maxHex)} of ${formatBytes(bytes.length)} binary module.</div>`;
            }
          } catch (err) {
            parseError = err.message;
          }

          // B7: Large source truncation
          const maxSource = 200000;
          const isLargeSource = content.length > maxSource;
          const displaySource = isLargeSource ? content.substring(0, maxSource) + '\n\n;; [TRUNCATED DUE TO SIZE]' : content;
          const highlighted = window.Prism.highlight(displaySource, window.Prism.languages.wasm, 'wasm');

          h.render(`
            <div class="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">WebAssembly Text</span>
                ${parseError ? '<span class="ml-auto flex items-center gap-1.5 text-red-600 font-medium"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg> Syntax Error</span>' : ''}
              </div>

              <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                <!-- Tabs -->
                <div class="flex p-1.5 bg-surface-50 border-b border-surface-200 gap-1">
                  <button id="tab-src" class="flex-1 py-2.5 px-4 text-sm font-semibold rounded-xl transition-all bg-white shadow-sm text-brand-600 border border-surface-200/50">Source Code</button>
                  <button id="tab-analysis" class="flex-1 py-2.5 px-4 text-sm font-semibold rounded-xl transition-all text-surface-500 hover:text-surface-700 hover:bg-surface-100/50">Module Analysis</button>
                  <button id="tab-hex" class="flex-1 py-2.5 px-4 text-sm font-semibold rounded-xl transition-all text-surface-500 hover:text-surface-700 hover:bg-surface-100/50">Binary Preview</button>
                </div>

                <!-- Source View -->
                <div id="view-src" class="relative group">
                  <div class="max-h-[70vh] overflow-auto bg-[#1d1f21] custom-scrollbar">
                    <pre class="p-6 text-[13px] font-mono leading-relaxed text-gray-100 m-0"><code class="language-wasm">${highlighted}</code></pre>
                  </div>
                </div>

                <!-- Analysis View -->
                <div id="view-analysis" class="hidden p-6 max-h-[70vh] overflow-auto bg-white">
                  ${parseError ? `
                    <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
                      <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      </div>
                      <h3 class="text-lg font-bold text-surface-900 mb-2">WAT Parsing Failed</h3>
                      <p class="text-surface-500 max-w-md mb-4">${escapeHtml(parseError)}</p>
                      <div class="p-4 bg-surface-50 rounded-xl border border-surface-100 text-xs font-mono text-left w-full overflow-auto max-h-40">
                        ${escapeHtml(content.split('\n').slice(0, 5).join('\n'))}
                      </div>
                    </div>
                  ` : `
                    <div class="mb-6 sticky top-0 bg-white pt-2 pb-4 z-10 border-b border-surface-100">
                      <div class="relative">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        <input type="text" id="analysis-search" placeholder="Search exports, imports, functions..." 
                          class="w-full pl-10 pr-4 py-2.5 bg-surface-50 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-inner" />
                      </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <!-- Exports -->
                      <section>
                        <div class="flex items-center justify-between mb-4 px-1">
                          <h3 class="font-bold text-surface-900">Exports</h3>
                          <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">${moduleInfo.exports.length} items</span>
                        </div>
                        <div class="space-y-3" id="exports-container">
                          ${moduleInfo.exports.map(exp => `
                            <div class="analysis-card group rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white" data-search="${escapeHtml(exp.name)}">
                              <div class="flex items-center justify-between">
                                <span class="font-mono text-sm font-bold text-surface-800 break-all">${escapeHtml(exp.name)}</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-lg bg-surface-100 text-surface-600 font-black uppercase tracking-tighter">${exp.kind}</span>
                              </div>
                            </div>
                          `).join('') || '<div class="text-center py-12 bg-surface-50 rounded-2xl border border-dashed border-surface-200 text-surface-400 text-sm">No exports defined</div>'}
                        </div>
                      </section>

                      <!-- Imports -->
                      <section>
                        <div class="flex items-center justify-between mb-4 px-1">
                          <h3 class="font-bold text-surface-900">Imports</h3>
                          <span class="text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">${moduleInfo.imports.length} items</span>
                        </div>
                        <div class="space-y-3" id="imports-container">
                          ${moduleInfo.imports.map(imp => `
                            <div class="analysis-card group rounded-xl border border-surface-200 p-4 hover:border-amber-300 hover:shadow-md transition-all bg-white" data-search="${escapeHtml(imp.module)} ${escapeHtml(imp.name)}">
                              <div class="flex items-center justify-between mb-2">
                                <span class="text-[10px] font-black uppercase tracking-widest text-amber-600">${escapeHtml(imp.module)}</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-lg bg-surface-100 text-surface-600 font-black uppercase tracking-tighter">${imp.kind}</span>
                              </div>
                              <div class="font-mono text-sm font-bold text-surface-800 break-all">${escapeHtml(imp.name)}</div>
                            </div>
                          `).join('') || '<div class="text-center py-12 bg-surface-50 rounded-2xl border border-dashed border-surface-200 text-surface-400 text-sm">No imports defined</div>'}
                        </div>
                      </section>
                    </div>
                  `}
                </div>

                <!-- Hex View -->
                <div id="view-hex" class="hidden bg-[#0d0e12] p-6 max-h-[70vh] overflow-auto custom-scrollbar">
                  <div class="font-mono text-[12px] leading-relaxed">
                    ${hexDump || '<div class="text-center py-12 text-surface-600">No binary data available</div>'}
                  </div>
                </div>
              </div>
            </div>

            <style>
              .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            </style>
          `);

          // Tab Logic
          const tabs = {
            'src': { btn: document.getElementById('tab-src'), view: document.getElementById('view-src') },
            'analysis': { btn: document.getElementById('tab-analysis'), view: document.getElementById('view-analysis') },
            'hex': { btn: document.getElementById('tab-hex'), view: document.getElementById('view-hex') }
          };

          Object.entries(tabs).forEach(([id, tab]) => {
            tab.btn.addEventListener('click', () => {
              Object.values(tabs).forEach(t => {
                t.btn.classList.remove('bg-white', 'shadow-sm', 'text-brand-600', 'border', 'border-surface-200/50');
                t.btn.classList.add('text-surface-500', 'hover:text-surface-700', 'hover:bg-surface-100/50');
                t.view.classList.add('hidden');
              });
              tab.btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600', 'border', 'border-surface-200/50');
              tab.btn.classList.remove('text-surface-500', 'hover:text-surface-700', 'hover:bg-surface-100/50');
              tab.view.classList.remove('hidden');
            });
          });

          // Search Logic (U4 Format-Specific Excellence)
          const searchInput = document.getElementById('analysis-search');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              const term = e.target.value.toLowerCase();
              document.querySelectorAll('.analysis-card').forEach(card => {
                const text = card.getAttribute('data-search').toLowerCase();
                card.style.display = text.includes(term) ? 'block' : 'none';
              });
            });
          }

          h.hideLoading();
        };

        renderTool();
      }
    });
  };
})();
