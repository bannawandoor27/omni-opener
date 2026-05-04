(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop a Shared Object (.so) file here',
      infoHtml: '<strong>Security:</strong> Analysis is performed entirely in your browser. No binary data is ever uploaded to a server.',

      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.hash) h.copyToClipboard(state.hash, btn);
          }
        },
        {
          label: '📝 Copy Hex',
          id: 'copy-hex',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.hex) h.copyToClipboard(state.hex, btn);
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
        // Load helper for pretty file sizes
        h.loadScript('https://cdn.jsdelivr.net/npm/filesize@10.1.0/dist/filesize.min.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing ELF structure...');

        try {
          const buffer = content;
          const view = new DataView(buffer);
          const bytes = new Uint8Array(buffer);
          
          // Verify ELF Magic: 0x7F 'E' 'L' 'F'
          if (buffer.byteLength < 16 || view.getUint32(0, false) !== 0x7F454C46) {
            throw new Error('Not a valid ELF file. Missing expected magic bytes.');
          }

          // Compute SHA-256 Hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          
          h.setState({ hash: hashHex });

          // ELF Header Parsing
          const is64 = view.getUint8(4) === 2;
          const isLittle = view.getUint8(5) === 1;
          const type = view.getUint16(16, isLittle);
          const machine = view.getUint16(18, isLittle);
          const entry = is64 ? view.getBigUint64(24, isLittle) : BigInt(view.getUint32(24, isLittle));
          
          const elfInfo = {
            class: is64 ? '64-bit' : '32-bit',
            data: isLittle ? 'Little Endian' : 'Big Endian',
            type: getElfType(type),
            machine: getElfMachine(machine),
            entry: '0x' + entry.toString(16)
          };

          // Entropy Calculation
          const entropy = calculateEntropy(bytes);

          // Parse Section Headers
          const sections = [];
          const shoff = is64 ? Number(view.getBigUint64(40, isLittle)) : view.getUint32(32, isLittle);
          const shnum = is64 ? view.getUint16(60, isLittle) : view.getUint16(48, isLittle);
          const shentsize = is64 ? view.getUint16(58, isLittle) : view.getUint16(46, isLittle);
          const shstrndx = is64 ? view.getUint16(62, isLittle) : view.getUint16(50, isLittle);

          if (shoff > 0 && shoff < buffer.byteLength && shnum > 0) {
            // Locate the section name string table (.shstrtab)
            const shstrtabEntryOff = shoff + shstrndx * shentsize;
            const strTabOff = is64 ? 
              Number(view.getBigUint64(shstrtabEntryOff + 24, isLittle)) : 
              view.getUint32(shstrtabEntryOff + 16, isLittle);
            
            for (let i = 0; i < Math.min(shnum, 128); i++) {
              const off = shoff + i * shentsize;
              if (off + shentsize > buffer.byteLength) break;
              
              const nameOff = view.getUint32(off, isLittle);
              const sType = view.getUint32(off + 4, isLittle);
              const sAddr = is64 ? view.getBigUint64(off + 16, isLittle) : BigInt(view.getUint32(off + 12, isLittle));
              const sSize = is64 ? view.getBigUint64(off + 32, isLittle) : BigInt(view.getUint32(off + 20, isLittle));
              
              let name = '(unknown)';
              if (strTabOff > 0 && strTabOff + nameOff < buffer.byteLength) {
                let n = '';
                for (let j = 0; j < 64; j++) {
                  const b = bytes[strTabOff + nameOff + j];
                  if (!b || b === 0) break;
                  n += String.fromCharCode(b);
                }
                name = n || '(null)';
              }
              
              sections.push({ 
                name, 
                type: getSectionType(sType), 
                addr: '0x' + sAddr.toString(16), 
                size: Number(sSize) 
              });
            }
          }

          const hex = generateHexDump(buffer.slice(0, 4096));
          h.setState({ hex: hex });

          const sizeFormatter = (typeof filesize !== 'undefined') ? filesize.format : (s) => s + ' B';

          h.render(`
            <div class="p-6 space-y-8 font-sans">
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2 space-y-6">
                  <!-- ELF Header Card -->
                  <div class="bg-surface-50 rounded-2xl border border-surface-200 overflow-hidden">
                    <div class="bg-surface-100 px-4 py-2 border-b border-surface-200">
                      <span class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">System Header</span>
                    </div>
                    <div class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                      ${Object.entries(elfInfo).map(([k, v]) => `
                        <div>
                          <p class="text-[10px] text-surface-400 uppercase font-semibold mb-1">${k}</p>
                          <p class="text-sm font-mono text-surface-900">${v}</p>
                        </div>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Sections Table -->
                  <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden">
                    <div class="bg-surface-100 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                      <span class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Section Headers (${sections.length})</span>
                      <span class="text-[10px] text-surface-400 italic">Showing up to 128 entries</span>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-[11px]">
                        <thead class="bg-surface-50 text-surface-500 border-b border-surface-200">
                          <tr>
                            <th class="px-4 py-2 font-semibold">Name</th>
                            <th class="px-4 py-2 font-semibold">Type</th>
                            <th class="px-4 py-2 font-semibold">Address</th>
                            <th class="px-4 py-2 font-semibold text-right">Size</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100">
                          ${sections.map(s => `
                            <tr class="hover:bg-surface-50 transition-colors">
                              <td class="px-4 py-2 font-mono text-brand-600 font-medium">${s.name}</td>
                              <td class="px-4 py-2 text-surface-500">${s.type}</td>
                              <td class="px-4 py-2 font-mono text-surface-400">${s.addr}</td>
                              <td class="px-4 py-2 text-right text-surface-700 font-mono">${sizeFormatter(s.size)}</td>
                            </tr>
                          `).join('')}
                          ${sections.length === 0 ? '<tr><td colspan="4" class="px-4 py-8 text-center text-surface-400 italic">No section headers found. This might be a stripped binary.</td></tr>' : ''}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div class="space-y-6">
                  <!-- Binary Analysis Card -->
                  <div class="bg-surface-900 text-white rounded-2xl p-5 space-y-4 shadow-lg">
                    <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Binary Analysis</h4>
                    <div class="space-y-4">
                      <div>
                        <div class="flex justify-between text-xs mb-1.5">
                          <span class="text-surface-400 font-medium">Data Entropy</span>
                          <span class="font-mono text-brand-400">${entropy.toFixed(4)} <span class="text-[10px] text-surface-500">bits/byte</span></span>
                        </div>
                        <div class="h-2 bg-surface-800 rounded-full overflow-hidden">
                          <div class="h-full bg-brand-500 transition-all duration-500" style="width: ${(entropy / 8) * 100}%"></div>
                        </div>
                        <p class="text-[9px] text-surface-500 mt-2">Higher entropy often indicates compressed or encrypted data sections.</p>
                      </div>
                      <div class="pt-2 border-t border-surface-800">
                        <p class="text-[10px] text-surface-400 uppercase font-semibold mb-1.5">SHA-256 Signature</p>
                        <p class="text-[10px] font-mono break-all text-surface-300 leading-relaxed bg-black/30 p-2 rounded-lg">${hashHex}</p>
                      </div>
                    </div>
                  </div>

                  <!-- Hex View -->
                  <div class="bg-surface-50 rounded-2xl border border-surface-200 overflow-hidden">
                    <div class="bg-surface-100 px-4 py-2 border-b border-surface-200">
                      <span class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Hex Preview (4KB)</span>
                    </div>
                    <div class="bg-white p-4 overflow-x-auto">
                      <pre class="font-mono text-[9px] leading-[1.2] text-surface-600">${hex}</pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('ELF Analysis Failed', err.message);
        }
      }
    });

    // --- Data Mapping Helpers ---

    function getElfType(t) {
      return { 1: 'Relocatable (REL)', 2: 'Executable (EXEC)', 3: 'Shared Object (DYN)', 4: 'Core (CORE)' }[t] || 'Unknown (' + t + ')';
    }

    function getElfMachine(m) {
      const machines = { 
        0x03: 'x86', 
        0x28: 'ARM', 
        0x3E: 'x86-64', 
        0xB7: 'AArch64', 
        0xF3: 'RISC-V',
        0x14: 'PowerPC',
        0x2B: 'SPARC',
        0x32: 'IA-64'
      };
      return machines[m] || 'Unknown (0x' + m.toString(16) + ')';
    }

    function getSectionType(t) {
      const types = { 
        0: 'NULL', 1: 'PROGBITS', 2: 'SYMTAB', 3: 'STRTAB', 4: 'RELA', 5: 'HASH', 
        6: 'DYNAMIC', 7: 'NOTE', 8: 'NOBITS', 9: 'REL', 10: 'SHLIB', 11: 'DYNSYM' 
      };
      return types[t] || 'Other (' + t + ')';
    }

    function calculateEntropy(data) {
      const freq = new Uint32Array(256);
      for (let i = 0; i < data.length; i++) freq[data[i]]++;
      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / data.length;
          entropy -= p * Math.log2(p);
        }
      }
      return entropy;
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
