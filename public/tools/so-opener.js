(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _filesize = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop a Shared Object (.so) or ELF file',
      infoHtml: '<strong>Security:</strong> ELF analysis is performed locally in your browser. Binary data is never uploaded.',

      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const { hash } = h.getState();
            if (hash) h.copyToClipboard(hash, btn);
          }
        },
        {
          label: '📥 Download Binary',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/octet-stream');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/filesize@10.1.0/dist/filesize.min.js', () => {
          if (window.filesize) _filesize = window.filesize;
        });
      },

      onDestroy: function (h) {
        // Clean up any potential listeners or objects if added later
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing ELF structure and symbols...');

        try {
          const buffer = content;
          if (buffer.byteLength < 16) throw new Error('File too small to be a valid ELF binary.');
          
          const view = new DataView(buffer);
          const bytes = new Uint8Array(buffer);
          
          // ELF Magic: 0x7F 'E' 'L' 'F'
          if (view.getUint32(0, false) !== 0x7F454C46) {
            throw new Error('Invalid ELF magic bytes. This file is not a valid Linux shared object or executable.');
          }

          const is64 = view.getUint8(4) === 2;
          const isLittle = view.getUint8(5) === 1;
          const type = view.getUint16(16, isLittle);
          const machine = view.getUint16(18, isLittle);
          const entry = is64 ? view.getBigUint64(24, isLittle) : BigInt(view.getUint32(24, isLittle));
          
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
          
          const headerInfo = {
            'Format': is64 ? 'ELF64' : 'ELF32',
            'Endian': isLittle ? 'Little Endian' : 'Big Endian',
            'Type': getElfType(type),
            'Machine': getElfMachine(machine),
            'Entry Point': '0x' + entry.toString(16)
          };

          const sections = [];
          const symbols = [];
          const dependencies = [];
          
          const shoff = is64 ? Number(view.getBigUint64(40, isLittle)) : view.getUint32(32, isLittle);
          const shnum = is64 ? view.getUint16(60, isLittle) : view.getUint16(48, isLittle);
          const shentsize = is64 ? view.getUint16(58, isLittle) : view.getUint16(46, isLittle);
          const shstrndx = is64 ? view.getUint16(62, isLittle) : view.getUint16(50, isLittle);

          if (shoff > 0 && shoff < buffer.byteLength) {
            const shstrtabEntryOff = shoff + shstrndx * shentsize;
            const strTabOff = is64 ? Number(view.getBigUint64(shstrtabEntryOff + 24, isLittle)) : view.getUint32(shstrtabEntryOff + 16, isLittle);
            
            let symTabSection = null;
            let dynamicSection = null;

            for (let i = 0; i < Math.min(shnum, 512); i++) {
              const off = shoff + i * shentsize;
              if (off + shentsize > buffer.byteLength) break;
              
              const nameOff = view.getUint32(off, isLittle);
              const sType = view.getUint32(off + 4, isLittle);
              const sAddr = is64 ? view.getBigUint64(off + 16, isLittle) : BigInt(view.getUint32(off + 12, isLittle));
              const sSize = is64 ? view.getBigUint64(off + 32, isLittle) : BigInt(view.getUint32(off + 20, isLittle));
              
              let name = '';
              if (strTabOff > 0 && strTabOff < buffer.byteLength) {
                for (let j = 0; j < 128; j++) {
                  if (strTabOff + nameOff + j >= buffer.byteLength) break;
                  const b = bytes[strTabOff + nameOff + j];
                  if (!b) break;
                  name += String.fromCharCode(b);
                }
              }
              
              const section = { 
                name: name || `section_${i}`, 
                type: getSectionType(sType), 
                addr: '0x' + sAddr.toString(16), 
                size: Number(sSize) 
              };
              sections.push(section);

              if (sType === 2 || sType === 11) { // SYMTAB or DYNSYM
                symTabSection = { 
                  off: is64 ? Number(view.getBigUint64(off + 24, isLittle)) : view.getUint32(off + 16, isLittle), 
                  size: Number(sSize), 
                  entsize: is64 ? 24 : 16, 
                  link: view.getUint32(off + (is64 ? 44 : 28), isLittle) 
                };
              }
              if (sType === 6) { // DYNAMIC
                dynamicSection = {
                  off: is64 ? Number(view.getBigUint64(off + 24, isLittle)) : view.getUint32(off + 16, isLittle),
                  size: Number(sSize),
                  entsize: is64 ? 16 : 8,
                  link: view.getUint32(off + (is64 ? 44 : 28), isLittle)
                };
              }
            }

            // Extract Symbols
            if (symTabSection && symTabSection.off > 0 && symTabSection.off < buffer.byteLength) {
              const strTabEntryOff = shoff + symTabSection.link * shentsize;
              const symStrTabOff = is64 ? Number(view.getBigUint64(strTabEntryOff + 24, isLittle)) : view.getUint32(strTabEntryOff + 16, isLittle);
              
              const numSyms = Math.floor(symTabSection.size / symTabSection.entsize);
              for (let i = 0; i < Math.min(numSyms, 2000); i++) {
                const off = symTabSection.off + i * symTabSection.entsize;
                if (off + symTabSection.entsize > buffer.byteLength) break;

                const nameOff = view.getUint32(off, isLittle);
                const info = is64 ? view.getUint8(off + 4) : view.getUint8(off + 12);
                const value = is64 ? view.getBigUint64(off + 8, isLittle) : BigInt(view.getUint32(off + 4, isLittle));
                
                let sName = '';
                if (symStrTabOff > 0 && symStrTabOff < buffer.byteLength) {
                  for (let j = 0; j < 256; j++) {
                    if (symStrTabOff + nameOff + j >= buffer.byteLength) break;
                    const b = bytes[symStrTabOff + nameOff + j];
                    if (!b) break;
                    sName += String.fromCharCode(b);
                  }
                }
                if (sName) {
                  symbols.push({ 
                    name: sName, 
                    value: '0x' + value.toString(16), 
                    type: getSymbolType(info & 0xf), 
                    bind: getSymbolBind(info >> 4) 
                  });
                }
              }
            }

            // Extract Dependencies (DT_NEEDED)
            if (dynamicSection && dynamicSection.off > 0 && dynamicSection.off < buffer.byteLength) {
              const strTabEntryOff = shoff + dynamicSection.link * shentsize;
              const dynStrTabOff = is64 ? Number(view.getBigUint64(strTabEntryOff + 24, isLittle)) : view.getUint32(strTabEntryOff + 16, isLittle);
              
              const numEntries = Math.floor(dynamicSection.size / dynamicSection.entsize);
              for (let i = 0; i < numEntries; i++) {
                const off = dynamicSection.off + i * dynamicSection.entsize;
                if (off + dynamicSection.entsize > buffer.byteLength) break;
                
                const tag = is64 ? view.getBigUint64(off, isLittle) : BigInt(view.getUint32(off, isLittle));
                const val = is64 ? view.getBigUint64(off + 8, isLittle) : BigInt(view.getUint32(off + 4, isLittle));
                
                if (tag === 1n) { // DT_NEEDED
                  let depName = '';
                  if (dynStrTabOff > 0 && dynStrTabOff < buffer.byteLength) {
                    for (let j = 0; j < 128; j++) {
                      if (dynStrTabOff + Number(val) + j >= buffer.byteLength) break;
                      const b = bytes[dynStrTabOff + Number(val) + j];
                      if (!b) break;
                      depName += String.fromCharCode(b);
                    }
                  }
                  if (depName) dependencies.push(depName);
                }
                if (tag === 0n) break; // DT_NULL
              }
            }
          }

          const entropy = (function(data) {
            const f = new Uint32Array(256);
            for (let i = 0; i < data.length; i++) f[data[i]]++;
            let e = 0;
            const len = data.length;
            for (let i = 0; i < 256; i++) { 
              if (f[i] > 0) { 
                const p = f[i] / len; 
                e -= p * Math.log2(p); 
              } 
            }
            return e;
          })(bytes);

          const hex = generateHexDump(buffer.slice(0, 2048));
          h.setState({ hash: hashHex, sections, symbols, dependencies, headerInfo, entropy, hex });

          render(h, mountEl, file, _filesize);

        } catch (err) {
          h.showError('Could not open ELF file', err.message || 'The file may be corrupted or in an unsupported ELF variant.');
        }
      }
    });

    function render(h, mountEl, file, filesizeLib) {
      const state = h.getState();
      const { sections, symbols, dependencies, headerInfo, entropy, hex } = state;
      const formatSize = (s) => filesizeLib ? filesizeLib.format(s) : (s / 1024).toFixed(1) + ' KB';
      const humanSize = formatSize(file.size);

      const doRender = (filter = '') => {
        const term = filter.toLowerCase();
        const filteredSections = sections.filter(s => s.name.toLowerCase().includes(term) || s.type.toLowerCase().includes(term));
        const filteredSymbols = symbols.filter(s => s.name.toLowerCase().includes(term) || s.type.toLowerCase().includes(term));

        const html = `
          <div class="p-4 md:p-6 max-w-7xl mx-auto animate-in fade-in duration-500">
            <!-- U1. File Info Bar -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
              <span class="font-semibold text-surface-800">${h.escapeHtml(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${humanSize}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">Shared Object / ELF</span>
              <span class="ml-auto text-xs font-mono bg-surface-200 px-2 py-0.5 rounded text-surface-700">${state.hash.substring(0, 12)}...</span>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <!-- Left Sidebar -->
              <div class="lg:col-span-3 space-y-6">
                <!-- Header Card -->
                <div class="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
                  <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">ELF Header</h3>
                  <div class="space-y-4">
                    ${Object.entries(headerInfo).map(([k, v]) => `
                      <div>
                        <p class="text-[10px] text-surface-400 uppercase font-semibold mb-0.5">${k}</p>
                        <p class="text-sm font-mono text-surface-900 break-all">${v}</p>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <!-- Dependencies Card -->
                <div class="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Dependencies</h3>
                    <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${dependencies.length}</span>
                  </div>
                  <div class="space-y-2">
                    ${dependencies.length > 0 ? dependencies.map(dep => `
                      <div class="text-xs font-mono bg-surface-50 p-2 rounded border border-surface-100 text-surface-700 truncate" title="${h.escapeHtml(dep)}">
                        ${h.escapeHtml(dep)}
                      </div>
                    `).join('') : '<p class="text-xs text-surface-400 italic">No dependencies found.</p>'}
                  </div>
                </div>

                <!-- Entropy Card -->
                <div class="bg-gray-900 text-white rounded-2xl p-5 shadow-md">
                  <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Binary Entropy</h3>
                  <div class="space-y-3">
                    <div class="flex justify-between items-end">
                      <span class="text-2xl font-mono text-brand-400">${entropy.toFixed(3)}</span>
                      <span class="text-[10px] text-gray-500 mb-1">bits/byte</span>
                    </div>
                    <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div class="h-full bg-brand-500 transition-all duration-1000" style="width: ${(entropy / 8) * 100}%"></div>
                    </div>
                    <p class="text-[10px] text-gray-400 leading-relaxed">
                      ${entropy > 7.5 ? 'Very high entropy: Likely compressed, encrypted, or packed.' : 'Standard entropy for executable code.'}
                    </p>
                  </div>
                </div>
              </div>

              <!-- Main Content -->
              <div class="lg:col-span-9 space-y-8">
                <!-- Search Box -->
                <div class="relative group">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg class="h-5 w-5 text-surface-400 group-focus-within:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input type="text" id="elf-search" 
                         class="block w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-2xl text-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all" 
                         placeholder="Filter sections or symbols (e.g. '.text', 'FUNC', 'malloc')..."
                         value="${h.escapeHtml(filter)}">
                </div>

                <!-- Sections Table -->
                <section>
                  <div class="flex items-center justify-between mb-3 px-1">
                    <h3 class="font-bold text-surface-800 flex items-center gap-2">
                      Sections
                      <span class="text-xs font-normal text-surface-400">Structure of the binary</span>
                    </h3>
                    <span class="text-xs font-medium bg-surface-100 text-surface-600 px-2.5 py-1 rounded-full border border-surface-200">
                      ${filteredSections.length} items
                    </span>
                  </div>
                  <div class="overflow-hidden rounded-2xl border border-surface-200 shadow-sm bg-white">
                    <div class="overflow-x-auto">
                      <table class="min-w-full text-sm divide-y divide-surface-100">
                        <thead class="bg-surface-50">
                          <tr>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Address</th>
                            <th class="px-4 py-3 text-right font-semibold text-surface-700">Size</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100">
                          ${filteredSections.map(s => `
                            <tr class="hover:bg-brand-50/50 transition-colors group">
                              <td class="px-4 py-3 font-mono text-brand-600 font-medium">${h.escapeHtml(s.name)}</td>
                              <td class="px-4 py-3">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-100 text-surface-600 border border-surface-200 uppercase">
                                  ${s.type}
                                </span>
                              </td>
                              <td class="px-4 py-3 font-mono text-surface-400 text-xs">${s.addr}</td>
                              <td class="px-4 py-3 text-right font-mono text-surface-700 text-xs">${formatSize(s.size)}</td>
                            </tr>
                          `).join('')}
                          ${filteredSections.length === 0 ? '<tr><td colspan="4" class="px-4 py-16 text-center text-surface-400 italic bg-surface-50/30">No matching sections found.</td></tr>' : ''}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                <!-- Symbols Table -->
                ${symbols.length > 0 ? `
                <section>
                  <div class="flex items-center justify-between mb-3 px-1">
                    <h3 class="font-bold text-surface-800 flex items-center gap-2">
                      Symbols
                      <span class="text-xs font-normal text-surface-400">Functions and Objects</span>
                    </h3>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-100">
                        ${filteredSymbols.length} visible
                      </span>
                    </div>
                  </div>
                  <div class="overflow-hidden rounded-2xl border border-surface-200 shadow-sm bg-white">
                    <div class="overflow-x-auto max-h-[500px] scrollbar-thin">
                      <table class="min-w-full text-sm divide-y divide-surface-100">
                        <thead class="sticky top-0 bg-white/95 backdrop-blur-md z-10 border-b border-surface-200">
                          <tr>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Symbol Name</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Bind</th>
                            <th class="px-4 py-3 text-right font-semibold text-surface-700">Value</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100">
                          ${filteredSymbols.slice(0, 500).map(s => `
                            <tr class="hover:bg-brand-50/50 transition-colors group">
                              <td class="px-4 py-2.5 font-mono text-surface-900 text-xs break-all max-w-xs" title="${h.escapeHtml(s.name)}">
                                ${h.escapeHtml(s.name)}
                              </td>
                              <td class="px-4 py-2.5">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${s.type === 'FUNC' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-surface-50 text-surface-500 border border-surface-100'}">
                                  ${s.type}
                                </span>
                              </td>
                              <td class="px-4 py-2.5">
                                <span class="text-[10px] text-surface-500 font-medium">${s.bind}</span>
                              </td>
                              <td class="px-4 py-2.5 text-right font-mono text-surface-400 text-xs">${s.value}</td>
                            </tr>
                          `).join('')}
                          ${filteredSymbols.length > 500 ? `
                            <tr>
                              <td colspan="4" class="px-4 py-4 text-center bg-surface-50 text-xs text-surface-500 font-medium">
                                Showing first 500 of ${filteredSymbols.length} symbols. Refine search to see more.
                              </td>
                            </tr>
                          ` : ''}
                          ${filteredSymbols.length === 0 ? '<tr><td colspan="4" class="px-4 py-16 text-center text-surface-400 italic bg-surface-50/30">No matching symbols found.</td></tr>' : ''}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
                ` : ''}

                <!-- Hex Preview -->
                <section>
                  <div class="flex items-center justify-between mb-3 px-1">
                    <h3 class="font-bold text-surface-800">Hex Preview</h3>
                    <span class="text-[10px] text-surface-400 uppercase font-bold tracking-tight">First 2 KB</span>
                  </div>
                  <div class="rounded-2xl overflow-hidden border border-surface-200 shadow-lg">
                    <pre class="p-5 text-[11px] font-mono bg-gray-950 text-brand-400/80 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-white/10 select-all">${hex}</pre>
                  </div>
                </section>
              </div>
            </div>
          </div>
        `;
        return html;
      };

      h.render(doRender());

      // Re-bind search with optimized partial re-render
      const setupSearch = () => {
        const searchInput = mountEl.querySelector('#elf-search');
        if (searchInput) {
          searchInput.addEventListener('input', (e) => {
            const term = e.target.value;
            const mainContent = mountEl.querySelector('.lg\\:col-span-9');
            if (mainContent) {
              const temp = document.createElement('div');
              temp.innerHTML = doRender(term);
              const newContent = temp.querySelector('.lg\\:col-span-9');
              
              // Only update sections and symbols to preserve search focus and hex view
              const sectionsOld = mainContent.querySelector('section:nth-of-type(1)');
              const sectionsNew = newContent.querySelector('section:nth-of-type(1)');
              if (sectionsOld && sectionsNew) sectionsOld.outerHTML = sectionsNew.outerHTML;

              const symbolsOld = mainContent.querySelector('section:nth-of-type(2)');
              const symbolsNew = newContent.querySelector('section:nth-of-type(2)');
              if (symbolsOld && symbolsNew) symbolsOld.outerHTML = symbolsNew.outerHTML;
            }
          });
        }
      };
      setupSearch();
    }

    // Helper functions for ELF parsing
    function getElfType(t) {
      return { 0: 'NONE', 1: 'Relocatable (REL)', 2: 'Executable (EXEC)', 3: 'Shared Object (DYN)', 4: 'Core (CORE)' }[t] || 'Unknown (' + t + ')';
    }

    function getElfMachine(m) {
      const machines = { 
        0x03: 'x86', 0x28: 'ARM', 0x3E: 'x86-64', 0xB7: 'AArch64', 0xF3: 'RISC-V', 
        0x14: 'PowerPC', 0x2B: 'SPARC', 0x31: 'SuperH', 0x4B: 'MIPS' 
      };
      return machines[m] || 'Unknown (0x' + m.toString(16) + ')';
    }

    function getSectionType(t) {
      const types = { 
        0: 'NULL', 1: 'PROGBITS', 2: 'SYMTAB', 3: 'STRTAB', 4: 'RELA', 5: 'HASH', 
        6: 'DYNAMIC', 7: 'NOTE', 8: 'NOBITS', 9: 'REL', 10: 'SHLIB', 11: 'DYNSYM',
        0x6ffffff6: 'GNU_HASH', 0x6fffffff: 'VERSYM', 0x6ffffffe: 'VERNEED'
      };
      return types[t] || 'Other (0x' + t.toString(16) + ')';
    }

    function getSymbolType(t) {
      return { 0: 'NOTYPE', 1: 'OBJECT', 2: 'FUNC', 3: 'SECTION', 4: 'FILE', 5: 'COMMON', 6: 'TLS', 10: 'LOOS', 12: 'HIOS' }[t] || 'OTHER';
    }

    function getSymbolBind(b) {
      return { 0: 'LOCAL', 1: 'GLOBAL', 2: 'WEAK' }[b] || 'OTHER';
    }

    function generateHexDump(buffer) {
      const bytes = new Uint8Array(buffer);
      let out = '';
      for (let i = 0; i < bytes.length; i += 16) {
        let line = i.toString(16).padStart(6, '0') + '  ';
        let ascii = '';
        for (let j = 0; j < 16; j++) {
          if (i + j < bytes.length) {
            const b = bytes[i + j];
            line += b.toString(16).padStart(2, '0') + ' ';
            ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            line += '   ';
          }
          if (j === 7) line += ' ';
        }
        out += line + ' |' + ascii + '|\n';
      }
      return out;
    }
  };
})();
