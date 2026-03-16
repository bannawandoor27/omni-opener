(function() {
  'use strict';

  /**
   * OmniOpener WASM Tool
   * A production-perfect browser-based WebAssembly inspector and binary hex viewer.
   */

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.wasm',
      dropLabel: 'Drop a WebAssembly (.wasm) file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies required for native WebAssembly API
      },
      onFile: async function(file, content, helpers) {
        if (!content || content.byteLength === 0) {
          helpers.render(`
            <div class="flex flex-col items-center justify-center p-12 text-center">
              <div class="w-16 h-16 bg-surface-100 text-surface-400 rounded-full flex items-center justify-center mb-4">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <h3 class="text-lg font-semibold text-surface-900">Empty WASM File</h3>
              <p class="text-surface-500 mt-1">This file contains no data to analyze.</p>
            </div>
          `);
          return;
        }

        helpers.showLoading('Analyzing WebAssembly module...');

        try {
          const bytes = new Uint8Array(content);
          const isWasm = bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;

          if (!isWasm) {
            throw new Error('File does not have the valid WebAssembly magic header (\\0asm).');
          }

          let wasmModule;
          try {
            wasmModule = await WebAssembly.compile(content);
          } catch (compileError) {
            throw new Error('Failed to compile WebAssembly module: ' + compileError.message);
          }

          const exports = WebAssembly.Module.exports(wasmModule);
          const imports = WebAssembly.Module.imports(wasmModule);
          
          helpers.setState('exports', exports);
          helpers.setState('imports', imports);
          helpers.setState('fileName', file.name);

          const renderContent = () => {
            const searchQuery = (helpers.getState().search || '').toLowerCase();
            
            const filteredExports = exports.filter(e => e.name.toLowerCase().includes(searchQuery));
            const filteredImports = imports.filter(i => 
              i.name.toLowerCase().includes(searchQuery) || 
              i.module.toLowerCase().includes(searchQuery)
            );

            const fileInfoBar = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${escape(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.wasm file</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">WebAssembly 1.0</span>
              </div>
            `;

            const searchBar = `
              <div class="relative mb-6">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-4 w-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
                <input type="text" id="wasm-search" 
                  class="block w-full pl-10 pr-3 py-2 border border-surface-200 rounded-xl bg-white text-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all" 
                  placeholder="Search imports and exports..." 
                  value="${escape(helpers.getState().search || '')}">
              </div>
            `;

            const renderTable = (items, title, isImport = false) => {
              if (items.length === 0) {
                return `
                  <div class="p-8 text-center bg-surface-50 rounded-xl border border-dashed border-surface-200">
                    <p class="text-surface-500 text-sm">No ${title.toLowerCase()} found matching your search.</p>
                  </div>
                `;
              }

              return `
                <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr>
                        ${isImport ? '<th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Module</th>' : ''}
                        <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                        <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Kind</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${items.map(item => `
                        <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                          ${isImport ? `<td class="px-4 py-3 text-surface-600 font-mono">${escape(item.module)}</td>` : ''}
                          <td class="px-4 py-3 text-brand-700 font-mono font-medium">${escape(item.name)}</td>
                          <td class="px-4 py-3">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              item.kind === 'function' ? 'bg-blue-100 text-blue-700' :
                              item.kind === 'memory' ? 'bg-amber-100 text-amber-700' :
                              item.kind === 'table' ? 'bg-purple-100 text-purple-700' :
                              'bg-surface-100 text-surface-700'
                            }">${item.kind}</span>
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            };

            const getHexDump = (buffer, start = 0, length = 512) => {
              const bytes = new Uint8Array(buffer.slice(start, start + length));
              let hexHtml = '';
              let asciiHtml = '';
              
              for (let i = 0; i < bytes.length; i += 16) {
                const chunk = bytes.slice(i, i + 16);
                const offset = (start + i).toString(16).padStart(8, '0');
                
                let hexRow = '';
                let asciiRow = '';
                
                for (let j = 0; j < 16; j++) {
                  if (j < chunk.length) {
                    const b = chunk[j];
                    hexRow += b.toString(16).padStart(2, '0') + ' ';
                    asciiRow += (b >= 32 && b <= 126) ? escape(String.fromCharCode(b)) : '<span class="text-surface-400">.</span>';
                  } else {
                    hexRow += '   ';
                    asciiRow += ' ';
                  }
                  if (j === 7) hexRow += ' ';
                }
                
                hexHtml += `<div class="flex gap-4 hover:bg-surface-800 px-2 py-0.5 transition-colors">
                  <span class="text-surface-500 select-none w-20">${offset}</span>
                  <span class="text-brand-400">${hexRow}</span>
                  <span class="text-surface-300 border-l border-surface-700 pl-4">${asciiRow}</span>
                </div>`;
              }
              
              return `
                <div class="rounded-xl overflow-hidden border border-surface-200">
                  <div class="bg-surface-900 p-4 text-xs font-mono text-gray-100 overflow-x-auto leading-relaxed">
                    ${hexHtml || '<div class="text-surface-500">No binary data to show.</div>'}
                  </div>
                  ${buffer.byteLength > length ? `
                    <div class="bg-surface-50 px-4 py-2 text-xs text-surface-500 border-t border-surface-200">
                      Showing first ${length} bytes of ${formatBytes(buffer.byteLength)}.
                    </div>
                  ` : ''}
                </div>
              `;
            };

            const html = `
              <div class="p-6 max-w-6xl mx-auto">
                ${fileInfoBar}
                ${searchBar}

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                  <section>
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                        Imports
                      </h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${imports.length} items</span>
                    </div>
                    ${renderTable(filteredImports, 'Imports', true)}
                  </section>

                  <section>
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                        Exports
                      </h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${exports.length} items</span>
                    </div>
                    ${renderTable(filteredExports, 'Exports')}
                  </section>
                </div>

                <section class="mb-8">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                      <svg class="w-4 h-4 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                      Binary Hex View
                    </h3>
                    <span class="text-xs text-surface-400">Preview (Header + Content)</span>
                  </div>
                  ${getHexDump(content)}
                </section>
              </div>
            `;

            helpers.render(html);

            // Add event listener for search
            const searchInput = document.getElementById('wasm-search');
            if (searchInput) {
              searchInput.addEventListener('input', (e) => {
                helpers.setState('search', e.target.value);
                renderContent();
                // Refocus search input after re-render
                const newSearchInput = document.getElementById('wasm-search');
                if (newSearchInput) {
                  newSearchInput.focus();
                  newSearchInput.setSelectionRange(e.target.value.length, e.target.value.length);
                }
              });
            }
          };

          renderContent();

        } catch (err) {
          console.error('WASM Error:', err);
          helpers.showError(
            'Could not parse WebAssembly file',
            err.message || 'The file may be corrupted or use an unsupported WASM feature. Ensure it is a valid .wasm binary module.'
          );
        }
      },
      actions: [
        {
          label: '📋 Copy Exports',
          id: 'copy-exports',
          onClick: function(helpers, btn) {
            const exports = helpers.getState().exports || [];
            if (exports.length === 0) {
              const orig = btn.textContent;
              btn.textContent = 'Empty';
              setTimeout(() => btn.textContent = orig, 2000);
              return;
            }
            const text = exports.map(e => `${e.name} (${e.kind})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📋 Copy Imports',
          id: 'copy-imports',
          onClick: function(helpers, btn) {
            const imports = helpers.getState().imports || [];
            if (imports.length === 0) {
              const orig = btn.textContent;
              btn.textContent = 'Empty';
              setTimeout(() => btn.textContent = orig, 2000);
              return;
            }
            const text = imports.map(i => `${i.module}.${i.name} (${i.kind})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download WASM',
          id: 'download',
          onClick: function(helpers) {
            const content = helpers.getContent();
            const fileName = helpers.getState().fileName || 'module.wasm';
            helpers.download(fileName, content, 'application/wasm');
          }
        }
      ],
      infoHtml: `
        <div class="space-y-2">
          <p><strong>Security:</strong> All WebAssembly analysis is performed entirely within your browser using the native <code>WebAssembly.Module</code> API. Your binary files are never uploaded to any server.</p>
          <p><strong>Compatibility:</strong> Supports WASM 1.0 (MVP) and common extensions supported by your current browser.</p>
        </div>
      `
    });
  };
})();
