(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _filesize = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop a Shared Object (.so) or ELF file',
      infoHtml: '<strong>Security:</strong> ELF analysis is performed locally in your browser. No binary data is ever uploaded.',

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
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/filesize@10.1.0/dist/filesize.min.js', () => {
          if (window.filesize) _filesize = window.filesize;
        });
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing ELF structure...');

        try {
          const buffer = content;
          if (buffer.byteLength < 16) throw new Error('File too small to be a valid ELF binary.');
          
          const view = new DataView(buffer);
          const bytes = new Uint8Array(buffer);
          
          // ELF Magic: 0x7F 'E' 'L' 'F'
          if (view.getUint32(0, false) !== 0x7F454C46) {
            throw new Error('Invalid ELF magic bytes. This does not appear to be a Linux shared object or executable.');
          }

          const is64 = view.getUint8(4) === 2;
          const isLittle = view.getUint8(5) === 1;
          const type = view.getUint16(16, isLittle);
          const machine = view.getUint16(18, isLittle);
          const entry = is64 ? view.getBigUint64(24, isLittle) : BigInt(view.getUint32(24, isLittle));
          
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
          
          const elfInfo = {
            'Format': is64 ? 'ELF64' : 'ELF32',
            'Endian': isLittle ? 'Little Endian' : 'Big Endian',
            'Type': getElfType(type),
            'Machine': getElfMachine(machine),
            'Entry Point': '0x' + entry.toString(16)
          };

          const sections = [];
          const symbols = [];
          
          const shoff = is64 ? Number(view.getBigUint64(40, isLittle)) : view.getUint32(32, isLittle);
          const shnum = is64 ? view.getUint16(60, isLittle) : view.getUint16(48, isLittle);
          const shentsize = is64 ? view.getUint16(58, isLittle) : view.getUint16(46, isLittle);
          const shstrndx = is64 ? view.getUint16(62, isLittle) : view.getUint16(50, isLittle);

          if (shoff > 0 && shoff < buffer.byteLength) {
            const shstrtabEntryOff = shoff + shstrndx * shentsize;
            const strTabOff = is64 ? Number(view.getBigUint64(shstrtabEntryOff + 24, isLittle)) : view.getUint32(shstrtabEntryOff + 16, isLittle);
            
            let symTabSection = null;
            let strTabSection = null;

            for (let i = 0; i < Math.min(shnum, 512); i++) {
              const off = shoff + i * shentsize;
              if (off + shentsize > buffer.byteLength) break;
              
              const nameOff = view.getUint32(off, isLittle);
              const sType = view.getUint32(off + 4, isLittle);
              const sAddr = is64 ? view.getBigUint64(off + 16, isLittle) : BigInt(view.getUint32(off + 12, isLittle));
              const sSize = is64 ? view.getBigUint64(off + 32, isLittle) : BigInt(view.getUint32(off + 20, isLittle));
              
              let name = '';
              if (strTabOff > 0) {
                for (let j = 0; j < 128; j++) {
                  const b = bytes[strTabOff + nameOff + j];
                  if (!b) break;
                  name += String.fromCharCode(b);
                }
              }
              
              const section = { name: name || `section_${i}`, type: getSectionType(sType), addr: '0x' + sAddr.toString(16), size: Number(sSize) };
              sections.push(section);

              if (sType === 2 || sType === 11) { // SYMTAB or DYNSYM
                symTabSection = { off: is64 ? Number(view.getBigUint64(off + 24, isLittle)) : view.getUint32(off + 16, isLittle), size: Number(sSize), entsize: is64 ? 24 : 16, link: view.getUint32(off + (is64 ? 44 : 28), isLittle) };
              }
            }

            if (symTabSection) {
              const strTabEntryOff = shoff + symTabSection.link * shentsize;
              const symStrTabOff = is64 ? Number(view.getBigUint64(strTabEntryOff + 24, isLittle)) : view.getUint32(strTabEntryOff + 16, isLittle);
              
              const numSyms = Math.floor(symTabSection.size / symTabSection.entsize);
              for (let i = 0; i < Math.min(numSyms, 1000); i++) {
                const off = symTabSection.off + i * symTabSection.entsize;
                const nameOff = view.getUint32(off, isLittle);
                const info = is64 ? view.getUint8(off + 4) : view.getUint8(off + 12);
                const value = is64 ? view.getBigUint64(off + 8, isLittle) : view.getUint32(off + 4, isLittle);
                
                let sName = '';
                if (symStrTabOff > 0) {
                  for (let j = 0; j < 256; j++) {
                    const b = bytes[symStrTabOff + nameOff + j];
                    if (!b) break;
                    sName += String.fromCharCode(b);
                  }
                }
                if (sName) {
                  symbols.push({ name: sName, value: '0x' + value.toString(16), type: getSymbolType(info & 0xf), bind: getSymbolBind(info >> 4) });
                }
              }
            }
          }

          const entropy = (function(data) {
            const f = new Uint32Array(256);
            for (let i = 0; i < data.length; i++) f[data[i]]++;
            let e = 0;
            for (let i = 0; i < 256; i++) { if (f[i] > 0) { const p = f[i] / data.length; e -= p * Math.log2(p); } }
            return e;
          })(bytes);

          const hex = generateHexDump(buffer.slice(0, 2048));
          h.setState({ hash: hashHex, sections, symbols });

          const humanSize = _filesize ? _filesize.format(file.size) : (file.size / 1024).toFixed(1) + ' KB';

          const renderContent = (filter = '') => {
            const term = filter.toLowerCase();
            const filteredSections = sections.filter(s => s.name.toLowerCase().includes(term) || s.type.toLowerCase().includes(term));
            const filteredSymbols = symbols.filter(s => s.name.toLowerCase().includes(term) || s.type.toLowerCase().includes(term));

            return `
              <div class="p-6 max-w-7xl mx-auto">
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                  <span class="font-semibold text-surface-800">${h.escapeHtml(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${humanSize}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">Shared Object / ELF</span>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
                  <div class="lg:col-span-1 space-y-6">
                    <div class="bg-white rounded-2xl border border-surface-200 p-5 shadow-sm">
                      <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">Header Info</h3>
                      <div class="space-y-4">
                        ${Object.entries(elfInfo).map(([k, v]) => `
                          <div>
                            <p class="text-[10px] text-surface-400 uppercase font-semibold mb-0.5">${k}</p>
                            <p class="text-sm font-mono text-surface-900">${v}</p>
                          </div>
                        `).join('')}
                      </div>
                    </div>

                    <div class="bg-surface-900 text-white rounded-2xl p-5 shadow-lg">
                      <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">Binary Entropy</h3>
                      <div class="space-y-3">
                        <div class="flex justify-between items-end">
                          <span class="text-2xl font-mono text-brand-400">${entropy.toFixed(3)}</span>
                          <span class="text-[10px] text-surface-500 mb-1">bits/byte</span>
                        </div>
                        <div class="h-1.5 bg-surface-800 rounded-full overflow-hidden">
                          <div class="h-full bg-brand-500 transition-all duration-700" style="width: ${(entropy / 8) * 100}%"></div>
                        </div>
                        <p class="text-[10px] text-surface-500 leading-relaxed">
                          ${entropy > 7.5 ? 'Very high entropy: Likely compressed or encrypted.' : 'Normal entropy for code binaries.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="lg:col-span-3 space-y-6">
                    <div class="relative">
                      <input type="text" id="elf-search" placeholder="Search sections or symbols..." 
                             class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none"
                             value="${h.escapeHtml(filter)}">
                      <svg class="absolute left-3 top-3 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>

                    <div class="space-y-6">
                      <section>
                        <div class="flex items-center justify-between mb-3">
                          <h3 class="font-semibold text-surface-800">Sections</h3>
                          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredSections.length}</span>
                        </div>
                        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                          <table class="min-w-full text-sm">
                            <thead class="bg-surface-50 border-b border-surface-200">
                              <tr>
                                <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                                <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                                <th class="px-4 py-3 text-left font-semibold text-surface-700">Address</th>
                                <th class="px-4 py-3 text-right font-semibold text-surface-700">Size</th>
                              </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-surface-100">
                              ${filteredSections.map(s => `
                                <tr class="hover:bg-brand-50 transition-colors">
                                  <td class="px-4 py-2.5 font-mono text-brand-600 font-medium">${h.escapeHtml(s.name)}</td>
                                  <td class="px-4 py-2.5 text-surface-500 text-xs">${s.type}</td>
                                  <td class="px-4 py-2.5 font-mono text-surface-400 text-xs">${s.addr}</td>
                                  <td class="px-4 py-2.5 text-right text-surface-700 font-mono text-xs">${_filesize ? _filesize.format(s.size) : s.size + ' B'}</td>
                                </tr>
                              `).join('')}
                              ${filteredSections.length === 0 ? '<tr><td colspan="4" class="px-4 py-12 text-center text-surface-400 italic">No matching sections found.</td></tr>' : ''}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      ${symbols.length > 0 ? `
                      <section>
                        <div class="flex items-center justify-between mb-3">
                          <h3 class="font-semibold text-surface-800">Symbols</h3>
                          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredSymbols.length}</span>
                        </div>
                        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm max-h-[400px]">
                          <table class="min-w-full text-sm">
                            <thead class="sticky top-0 bg-white/95 backdrop-blur border-b border-surface-200 z-10">
                              <tr>
                                <th class="px-4 py-3 text-left font-semibold text-surface-700">Symbol</th>
                                <th class="px-4 py-3 text-left font-semibold text-surface-700">Type</th>
                                <th class="px-4 py-3 text-left font-semibold text-surface-700">Bind</th>
                                <th class="px-4 py-3 text-right font-semibold text-surface-700">Value</th>
                              </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-surface-100">
                              ${filteredSymbols.slice(0, 500).map(s => `
                                <tr class="hover:bg-brand-50 transition-colors">
                                  <td class="px-4 py-2 font-mono text-surface-900 text-xs truncate max-w-[300px]" title="${h.escapeHtml(s.name)}">${h.escapeHtml(s.name)}</td>
                                  <td class="px-4 py-2"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${s.type === 'FUNC' ? 'bg-blue-100 text-blue-700' : 'bg-surface-100 text-surface-600'}">${s.type}</span></td>
                                  <td class="px-4 py-2 text-surface-500 text-[11px]">${s.bind}</td>
                                  <td class="px-4 py-2 text-right font-mono text-surface-400 text-xs">${s.value}</td>
                                </tr>
                              `).join('')}
                              ${filteredSymbols.length > 500 ? `<tr><td colspan="4" class="px-4 py-3 text-center bg-surface-50 text-[11px] text-surface-500 italic">... showing first 500 of ${filteredSymbols.length} symbols ...</td></tr>` : ''}
                              ${filteredSymbols.length === 0 ? '<tr><td colspan="4" class="px-4 py-12 text-center text-surface-400 italic">No matching symbols found.</td></tr>' : ''}
                            </tbody>
                          </table>
                        </div>
                      </section>
                      ` : ''}
                    </div>

                    <section>
                      <h3 class="font-semibold text-surface-800 mb-3">Hex Preview <span class="text-xs font-normal text-surface-400 ml-2">(first 2KB)</span></h3>
                      <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                        <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed">${hex}</pre>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            `;
          };

          h.render(renderContent());

          const searchInput = mountEl.querySelector('#elf-search');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              const term = e.target.value;
              const contentEl = mountEl.querySelector('.lg\\:col-span-3');
              if (contentEl) {
                // We re-render just the data parts to maintain focus on search
                const newHtml = renderContent(term);
                const temp = document.createElement('div');
                temp.innerHTML = newHtml;
                const newCol = temp.querySelector('.lg\\:col-span-3');
                if (newCol) {
                  // Carefully replace children except search input to keep focus
                  const sectionsList = contentEl.querySelector('.space-y-6');
                  const newSectionsList = newCol.querySelector('.space-y-6');
                  if (sectionsList && newSectionsList) sectionsList.innerHTML = newSectionsList.innerHTML;
                }
              }
            });
          }

        } catch (err) {
          h.showError('Analysis Failed', err.message);
        }
      }
    });

    function getElfType(t) {
      return { 0: 'NONE', 1: 'Relocatable (REL)', 2: 'Executable (EXEC)', 3: 'Shared Object (DYN)', 4: 'Core (CORE)' }[t] || 'Unknown (' + t + ')';
    }

    function getElfMachine(m) {
      const machines = { 0x03: 'x86', 0x28: 'ARM', 0x3E: 'x86-64', 0xB7: 'AArch64', 0xF3: 'RISC-V', 0x14: 'PowerPC', 0x2B: 'SPARC' };
      return machines[m] || 'Unknown (0x' + m.toString(16) + ')';
    }

    function getSectionType(t) {
      const types = { 0: 'NULL', 1: 'PROGBITS', 2: 'SYMTAB', 3: 'STRTAB', 4: 'RELA', 5: 'HASH', 6: 'DYNAMIC', 7: 'NOTE', 8: 'NOBITS', 9: 'REL', 10: 'SHLIB', 11: 'DYNSYM' };
      return types[t] || 'Other (' + t + ')';
    }

    function getSymbolType(t) {
      return { 0: 'NOTYPE', 1: 'OBJECT', 2: 'FUNC', 3: 'SECTION', 4: 'FILE', 5: 'COMMON', 6: 'TLS' }[t] || 'OTHER';
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
