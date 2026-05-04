(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().hash;
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
        // Dependencies can be loaded here if needed
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing ELF file...');

        try {
          const buffer = content;
          const view = new DataView(buffer);

          // 1. Compute Hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          h.setState('hash', hashHex);

          // 2. Magic Bytes
          const magicBytes = Array.from(new Uint8Array(buffer.slice(0, 16)))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');

          // 3. ELF Header Parsing
          let elfInfo = {
            isValid: false,
            class: 'Unknown',
            endian: 'Unknown',
            machine: 'Unknown',
            type: 'Unknown'
          };

          if (buffer.byteLength >= 16) {
            const magic = view.getUint32(0, false);
            if (magic === 0x7F454C46) { // '\x7fELF'
              elfInfo.isValid = true;
              const eiClass = view.getUint8(4);
              elfInfo.class = eiClass === 1 ? '32-bit' : (eiClass === 2 ? '64-bit' : 'Unknown');
              
              const eiData = view.getUint8(5);
              elfInfo.endian = eiData === 1 ? 'Little Endian' : (eiData === 2 ? 'Big Endian' : 'Unknown');
              const isLittle = eiData === 1;

              if (buffer.byteLength >= 20) {
                const type = view.getUint16(16, isLittle);
                elfInfo.type = getElfType(type);
                const machine = view.getUint16(18, isLittle);
                elfInfo.machine = getElfMachine(machine);
              }
            }
          }

          // 4. Entropy Calculation
          const entropy = calculateEntropy(new Uint8Array(buffer));

          // 5. Hex Dump (first 4KB)
          const hexDump = generateHexDump(buffer.slice(0, 4096));

          // Render UI
          h.render(`
            <div class="p-6 space-y-6 font-sans">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Metadata Card -->
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-sm font-bold text-surface-700 mb-3 uppercase tracking-wider">File Analysis</h4>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between items-center"><span class="text-surface-500">Magic Bytes:</span> <span class="font-mono text-xs text-right">${magicBytes.slice(0, 23)}...</span></div>
                    <div class="flex justify-between items-center"><span class="text-surface-500">SHA-256:</span> <span class="font-mono text-[10px] break-all ml-4 text-right">${hashHex}</span></div>
                    <div class="flex justify-between items-center"><span class="text-surface-500">Entropy:</span> <span>${entropy.toFixed(4)} bits/byte</span></div>
                    <div class="mt-2 w-full bg-surface-200 h-1.5 rounded-full overflow-hidden">
                      <div class="bg-brand-500 h-full" style="width: ${(entropy / 8) * 100}%"></div>
                    </div>
                  </div>
                </div>

                <!-- ELF Header Card -->
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-sm font-bold text-surface-700 mb-3 uppercase tracking-wider">ELF Header Info</h4>
                  ${elfInfo.isValid ? `
                    <div class="space-y-2 text-sm">
                      <div class="flex justify-between"><span class="text-surface-500">Class:</span> <span>${elfInfo.class}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">Endianness:</span> <span>${elfInfo.endian}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">Machine:</span> <span>${elfInfo.machine}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">Type:</span> <span>${elfInfo.type}</span></div>
                    </div>
                  ` : `
                    <div class="flex items-center justify-center h-24 text-surface-400 italic">No valid ELF header found</div>
                  `}
                </div>
              </div>

              <!-- Hex Viewer -->
              <div class="border border-surface-200 rounded-xl overflow-hidden bg-white">
                <div class="bg-surface-100 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                  <span class="text-xs font-bold text-surface-700 uppercase">Hex Viewer (First 4KB)</span>
                </div>
                <div class="overflow-auto max-h-96">
                  <pre class="p-4 font-mono text-[11px] leading-tight text-surface-800 whitespace-pre">${hexDump}</pre>
                </div>
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('Analysis Failed', err.message);
        }
      }
    });

    // Helper functions
    function getElfType(type) {
      const types = {
        1: 'Relocatable',
        2: 'Executable',
        3: 'Shared Object',
        4: 'Core'
      };
      return types[type] || `Unknown (0x${type.toString(16)})`;
    }

    function getElfMachine(m) {
      const machines = {
        0x03: 'x86',
        0x28: 'ARM',
        0x3E: 'x86-64',
        0xB7: 'AArch64',
        0xF3: 'RISC-V'
      };
      return machines[m] || `Unknown (0x${m.toString(16)})`;
    }

    function calculateEntropy(data) {
      const freq = new Array(256).fill(0);
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
        let line = i.toString(16).padStart(8, '0') + '  ';
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
