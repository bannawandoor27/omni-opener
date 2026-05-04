/**
 * OmniOpener — EXE (PE) Analyzer Tool
 * Uses OmniTool SDK. Parses PE headers, calculates entropy, and provides a hex dump.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop an .exe or .dll file here',
      infoHtml: '<strong>Privacy:</strong> Analysis is performed entirely in your browser. No binary data is uploaded.',

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
          label: '📥 Download File',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        // Prepare any dependencies if needed
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing PE structure...');

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

          // 3. PE Header Parsing
          let peInfo = {
            isValid: false,
            machine: 'Unknown',
            timestamp: 'Unknown',
            sections: 0,
            characteristics: '0x0000',
            subsystem: 'Unknown',
            is64Bit: false
          };

          if (buffer.byteLength >= 64) {
            const mzSignature = view.getUint16(0, true);
            if (mzSignature === 0x5A4D) { // 'MZ'
              const peOffset = view.getUint32(0x3C, true);
              if (buffer.byteLength >= peOffset + 24) {
                const peSignature = view.getUint32(peOffset, true);
                if (peSignature === 0x00004550) { // 'PE\0\0'
                  peInfo.isValid = true;
                  const machineType = view.getUint16(peOffset + 4, true);
                  peInfo.machine = getMachineType(machineType);
                  const timestamp = view.getUint32(peOffset + 8, true);
                  peInfo.timestamp = new Date(timestamp * 1000).toUTCString();
                  peInfo.sections = view.getUint16(peOffset + 6, true);
                  peInfo.characteristics = '0x' + view.getUint16(peOffset + 22, true).toString(16).padStart(4, '0').toUpperCase();
                  
                  // Optional Header
                  const magic = view.getUint16(peOffset + 24, true);
                  peInfo.is64Bit = (magic === 0x20b);
                  const subsystem = view.getUint16(peOffset + 92, true);
                  peInfo.subsystem = getSubsystem(subsystem);
                }
              }
            }
          }

          // 4. Entropy Calculation
          const entropy = calculateEntropy(new Uint8Array(buffer));

          // 5. Hex Dump (first 4KB)
          const hexDump = generateHexDump(buffer.slice(0, 4096));

          // Render UI
          h.render(`
            <div class="p-6 space-y-6 font-sans bg-white">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Metadata Card -->
                <div class="bg-surface-50 rounded-xl p-5 border border-surface-200 shadow-sm">
                  <h4 class="text-xs font-bold text-surface-400 mb-4 uppercase tracking-widest">General Analysis</h4>
                  <div class="space-y-3 text-sm">
                    <div class="flex justify-between border-b border-surface-100 pb-2">
                      <span class="text-surface-500">SHA-256 Hash</span>
                      <span class="font-mono text-[10px] break-all text-right max-w-[200px]">${hashHex}</span>
                    </div>
                    <div class="flex justify-between border-b border-surface-100 pb-2">
                      <span class="text-surface-500">File Size</span>
                      <span class="font-medium text-surface-700">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <div class="flex justify-between border-b border-surface-100 pb-2">
                      <span class="text-surface-500">Entropy</span>
                      <span class="font-medium text-surface-700">${entropy.toFixed(4)} bits/byte</span>
                    </div>
                    <div class="pt-1">
                      <div class="w-full bg-surface-200 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-brand-500 h-full" style="width: ${(entropy / 8) * 100}%"></div>
                      </div>
                      <p class="text-[10px] text-surface-400 mt-1 italic">High entropy (>7.0) may indicate compression or encryption.</p>
                    </div>
                  </div>
                </div>

                <!-- PE Header Card -->
                <div class="bg-surface-50 rounded-xl p-5 border border-surface-200 shadow-sm">
                  <h4 class="text-xs font-bold text-surface-400 mb-4 uppercase tracking-widest">PE Header Detail</h4>
                  ${peInfo.isValid ? `
                    <div class="space-y-3 text-sm">
                      <div class="flex justify-between border-b border-surface-100 pb-2">
                        <span class="text-surface-500">Architecture</span>
                        <span class="font-medium text-surface-700">${peInfo.machine} (${peInfo.is64Bit ? '64-bit' : '32-bit'})</span>
                      </div>
                      <div class="flex justify-between border-b border-surface-100 pb-2">
                        <span class="text-surface-500">Compile Time</span>
                        <span class="text-xs text-surface-700 font-medium">${peInfo.timestamp}</span>
                      </div>
                      <div class="flex justify-between border-b border-surface-100 pb-2">
                        <span class="text-surface-500">Sections Count</span>
                        <span class="font-medium text-surface-700">${peInfo.sections}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-surface-500">Subsystem</span>
                        <span class="font-medium text-surface-700">${peInfo.subsystem}</span>
                      </div>
                    </div>
                  ` : `
                    <div class="flex flex-col items-center justify-center h-full py-4 text-surface-400">
                      <span class="text-2xl mb-2">⚠️</span>
                      <p class="text-sm italic">Not a valid Portable Executable (PE) file.</p>
                    </div>
                  `}
                </div>
              </div>

              <!-- Hex Viewer -->
              <div class="border border-surface-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-surface-100 px-4 py-2.5 border-b border-surface-200 flex justify-between items-center">
                  <span class="text-[11px] font-bold text-surface-500 uppercase tracking-widest">Binary Preview (First 4KB)</span>
                  <span class="text-[10px] text-surface-400 font-mono">Offset: 0x00000000</span>
                </div>
                <div class="bg-white overflow-auto max-h-[500px]">
                  <pre class="p-4 font-mono text-[11px] leading-relaxed text-surface-700 whitespace-pre">${hexDump}</pre>
                </div>
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('Analysis Failed', err.message);
        }
      }
    });

    // --- Helper Functions ---

    function getMachineType(type) {
      const types = {
        0x014c: 'Intel 386',
        0x8664: 'x64 (AMD64)',
        0x01c0: 'ARM Little Endian',
        0xaa64: 'ARM64',
        0x0200: 'Intel Itanium',
        0x0166: 'MIPS R4000',
        0x01f0: 'PowerPC Little Endian'
      };
      return types[type] || `Unknown (0x${type.toString(16)})`;
    }

    function getSubsystem(sub) {
      const systems = {
        1: 'Native',
        2: 'Windows GUI',
        3: 'Windows CLI (Console)',
        7: 'POSIX',
        9: 'Windows CE',
        10: 'EFI Application',
        11: 'EFI Boot Service Driver',
        12: 'EFI Runtime Driver',
        13: 'EFI ROM'
      };
      return systems[sub] || `Other (${sub})`;
    }

    function calculateEntropy(data) {
      const freq = new Uint32Array(256);
      for (let i = 0; i < data.length; i++) freq[data[i]]++;
      let entropy = 0;
      const len = data.length;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / len;
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
