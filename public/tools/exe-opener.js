/**
 * OmniOpener — EXE (PE) Analyzer Tool
 * A production-grade browser-based Portable Executable parser.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    // Closure variables for memory management
    let lastFileHash = null;

    const MACHINE_TYPES = {
      0x014c: 'Intel 386',
      0x8664: 'x64 (AMD64)',
      0x01c0: 'ARM Little Endian',
      0xaa64: 'ARM64',
      0x0200: 'Intel Itanium',
      0x0166: 'MIPS R4000',
      0x01f0: 'PowerPC Little Endian'
    };

    const SUBSYSTEMS = {
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

    const CHARACTERISTICS = [
      { mask: 0x0001, label: 'No Relocs' },
      { mask: 0x0002, label: 'Executable' },
      { mask: 0x0004, label: 'Line Numbers Stripped' },
      { mask: 0x0008, label: 'Local Symbols Stripped' },
      { mask: 0x0020, label: 'Large Address Aware' },
      { mask: 0x0100, label: '32-bit Machine' },
      { mask: 0x0200, label: 'Debug Stripped' },
      { mask: 0x1000, label: 'System File' },
      { mask: 0x2000, label: 'DLL' },
      { mask: 0x4000, label: 'Uniprocessor Only' }
    ];

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (typeof str !== 'string') return str;
      return str.replace(/[&<>"']/g, function (m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[m];
      });
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

    function parsePE(buffer) {
      const view = new DataView(buffer);
      const res = {
        isValid: false,
        is64Bit: false,
        machine: 'Unknown',
        timestamp: null,
        characteristics: [],
        entryPoint: 0,
        subsystem: 'Unknown',
        sections: []
      };

      if (buffer.byteLength < 64) return res;

      const mzSignature = view.getUint16(0, true);
      if (mzSignature !== 0x5A4D) return res;

      const peOffset = view.getUint32(0x3C, true);
      if (buffer.byteLength < peOffset + 24) return res;

      const peSignature = view.getUint32(peOffset, true);
      if (peSignature !== 0x00004550) return res;

      res.isValid = true;
      const machineType = view.getUint16(peOffset + 4, true);
      res.machine = MACHINE_TYPES[machineType] || `Unknown (0x${machineType.toString(16)})`;
      
      const numSections = view.getUint16(peOffset + 6, true);
      const timestamp = view.getUint32(peOffset + 8, true);
      res.timestamp = new Date(timestamp * 1000).toUTCString();

      const charBits = view.getUint16(peOffset + 22, true);
      res.characteristics = CHARACTERISTICS.filter(c => (charBits & c.mask)).map(c => c.label);

      const optionalHeaderOffset = peOffset + 24;
      const magic = view.getUint16(optionalHeaderOffset, true);
      res.is64Bit = (magic === 0x20b);
      
      res.entryPoint = view.getUint32(optionalHeaderOffset + 16, true);
      
      const subIndex = res.is64Bit ? 112 : 92;
      const subsystem = view.getUint16(optionalHeaderOffset + subIndex, true);
      res.subsystem = SUBSYSTEMS[subsystem] || `Other (${subsystem})`;

      // Sections
      const sizeOfOptionalHeader = view.getUint16(peOffset + 20, true);
      let sectionOffset = optionalHeaderOffset + sizeOfOptionalHeader;

      for (let i = 0; i < numSections; i++) {
        if (buffer.byteLength < sectionOffset + 40) break;
        
        let name = '';
        for (let j = 0; j < 8; j++) {
          const charCode = view.getUint8(sectionOffset + j);
          if (charCode === 0) break;
          name += String.fromCharCode(charCode);
        }

        res.sections.push({
          name: name || `Section ${i}`,
          virtualSize: view.getUint32(sectionOffset + 8, true),
          virtualAddress: view.getUint32(sectionOffset + 12, true),
          rawSize: view.getUint32(sectionOffset + 16, true),
          rawPointer: view.getUint32(sectionOffset + 20, true),
          characteristics: view.getUint32(sectionOffset + 36, true)
        });

        sectionOffset += 40;
      }

      return res;
    }

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop an .exe, .dll, or .sys file',
      infoHtml: 'Secure browser-side PE analysis. No file data is uploaded to any server.',

      actions: [
        {
          label: '📋 Copy Hash',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.hash) {
              h.copyToClipboard(state.hash, btn);
            }
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

      onFile: async function _onFileFn(file, content, h) {
        h.showLoading('Analyzing binary structure...');

        try {
          const buffer = content;
          
          // Compute Hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          h.setState('hash', hashHex);

          const pe = parsePE(buffer);
          const entropy = calculateEntropy(new Uint8Array(buffer));
          const hexDump = generateHexDump(buffer.slice(0, 4096));

          const infoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
              <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="px-2 py-0.5 rounded-md bg-surface-200 text-surface-700 text-[10px] font-bold uppercase tracking-wider">${pe.isValid ? 'Portable Executable' : 'Binary File'}</span>
            </div>
          `;

          const metadataCards = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-200 transition-all">
                <h3 class="text-[11px] font-bold text-surface-400 uppercase tracking-widest mb-3">Checksum & Entropy</h3>
                <div class="space-y-2">
                  <div class="flex flex-col">
                    <span class="text-[10px] text-surface-400 uppercase font-semibold">SHA-256</span>
                    <span class="text-xs font-mono break-all text-surface-700 mt-0.5">${hashHex}</span>
                  </div>
                  <div class="flex flex-col pt-1">
                    <div class="flex justify-between items-end mb-1">
                      <span class="text-[10px] text-surface-400 uppercase font-semibold">File Entropy</span>
                      <span class="text-xs font-bold text-brand-600">${entropy.toFixed(4)} bits/byte</span>
                    </div>
                    <div class="w-full bg-surface-100 h-1.5 rounded-full overflow-hidden">
                      <div class="h-full transition-all duration-1000 ${entropy > 7.2 ? 'bg-orange-500' : 'bg-brand-500'}" style="width: ${(entropy / 8) * 100}%"></div>
                    </div>
                    <p class="text-[9px] text-surface-400 mt-1 italic">High entropy (>7.2) suggests compression or packing.</p>
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-200 transition-all">
                <h3 class="text-[11px] font-bold text-surface-400 uppercase tracking-widest mb-3">Core Metadata</h3>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between border-b border-surface-50 pb-1.5">
                    <span class="text-surface-500 text-xs">Architecture</span>
                    <span class="font-semibold text-surface-800 text-xs">${pe.machine} ${pe.is64Bit ? '(64-bit)' : '(32-bit)'}</span>
                  </div>
                  <div class="flex justify-between border-b border-surface-50 pb-1.5">
                    <span class="text-surface-500 text-xs">Subsystem</span>
                    <span class="font-semibold text-surface-800 text-xs">${pe.subsystem}</span>
                  </div>
                  <div class="flex justify-between border-b border-surface-50 pb-1.5">
                    <span class="text-surface-500 text-xs">Entry Point</span>
                    <span class="font-mono text-brand-600 text-xs">0x${pe.entryPoint.toString(16).toUpperCase()}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-surface-500 text-xs">Compiled</span>
                    <span class="font-medium text-surface-700 text-[10px]">${pe.timestamp || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-200 transition-all">
                <h3 class="text-[11px] font-bold text-surface-400 uppercase tracking-widest mb-3">Flags & Characteristics</h3>
                <div class="flex flex-wrap gap-1.5">
                  ${pe.characteristics.length > 0 ? pe.characteristics.map(c => `
                    <span class="px-2 py-1 rounded bg-surface-100 text-surface-600 text-[10px] font-medium border border-surface-200">${c}</span>
                  `).join('') : '<span class="text-xs text-surface-400 italic">No special flags detected.</span>'}
                </div>
              </div>
            </div>
          `;

          const sectionsTable = pe.isValid && pe.sections.length > 0 ? `
            <div class="mb-6">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Section Headers</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${pe.sections.length} sections</span>
              </div>
              <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                <table class="min-w-full text-xs">
                  <thead>
                    <tr class="bg-surface-50 border-b border-surface-200">
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Virtual Size</th>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Virtual Addr</th>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Raw Size</th>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Raw Ptr</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${pe.sections.map(s => `
                      <tr class="hover:bg-brand-50 transition-colors">
                        <td class="px-4 py-2.5 font-bold text-surface-900">${escapeHtml(s.name)}</td>
                        <td class="px-4 py-2.5 font-mono text-surface-600">0x${s.virtualSize.toString(16).toUpperCase()}</td>
                        <td class="px-4 py-2.5 font-mono text-surface-600">0x${s.virtualAddress.toString(16).toUpperCase()}</td>
                        <td class="px-4 py-2.5 font-mono text-surface-600">0x${s.rawSize.toString(16).toUpperCase()}</td>
                        <td class="px-4 py-2.5 font-mono text-surface-600">0x${s.rawPointer.toString(16).toUpperCase()}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : pe.isValid ? `
            <div class="p-6 text-center border-2 border-dashed border-surface-200 rounded-xl mb-6">
              <p class="text-surface-400 text-sm">No section information found in the header.</p>
            </div>
          ` : '';

          const hexViewer = `
            <div>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Binary Preview</h3>
                <span class="text-[10px] text-surface-400 font-mono uppercase tracking-wider">First 4KB</span>
              </div>
              <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                <pre class="p-4 text-[10px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-[400px] scrollbar-thin scrollbar-thumb-gray-700">${escapeHtml(hexDump)}</pre>
              </div>
            </div>
          `;

          h.render(`
            <div class="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
              ${infoBar}
              ${pe.isValid ? '' : `
                <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <span class="text-amber-500 mt-0.5">⚠️</span>
                  <div>
                    <h4 class="text-sm font-bold text-amber-800">Invalid PE Header</h4>
                    <p class="text-xs text-amber-700 mt-0.5">The file does not appear to be a standard Windows Portable Executable. Showing raw binary data below.</p>
                  </div>
                </div>
              `}
              ${metadataCards}
              ${sectionsTable}
              ${hexViewer}
            </div>
          `);

        } catch (err) {
          console.error(err);
          h.showError('Analysis Failed', 'OmniOpener encountered an error while parsing this binary file. It might be corrupt or an unsupported variant.');
        }
      },

      onDestroy: function (h) {
        // Clean up if needed
        lastFileHash = null;
      }
    });
  };
})();
