(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing PE structure...');

        try {
          const buffer = content;
          const view = new DataView(buffer);
          const bytes = new Uint8Array(buffer);

          // 1. Basic Metadata
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          const entropy = calculateEntropy(bytes);
          const magic = Array.from(bytes.slice(0, 8))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');

          // 2. PE Parsing
          let peData = {
            isValid: false,
            header: {},
            sections: [],
            error: null
          };

          if (buffer.byteLength < 64) {
            peData.error = 'File too small to be a valid DLL/EXE';
          } else if (view.getUint16(0, true) !== 0x5A4D) {
            peData.error = 'Invalid MZ signature (not a DOS executable)';
          } else {
            const peOffset = view.getUint32(0x3C, true);
            if (buffer.byteLength < peOffset + 24) {
              peData.error = 'PE header offset out of bounds';
            } else if (view.getUint32(peOffset, true) !== 0x00004550) {
              peData.error = 'Invalid PE signature';
            } else {
              peData.isValid = true;
              const fileHeaderOffset = peOffset + 4;
              const machineType = view.getUint16(fileHeaderOffset, true);
              const numSections = view.getUint16(fileHeaderOffset + 2, true);
              const timestamp = view.getUint32(fileHeaderOffset + 4, true);
              const sizeOfOptionalHeader = view.getUint16(fileHeaderOffset + 16, true);
              const characteristics = view.getUint16(fileHeaderOffset + 18, true);

              peData.header = {
                machine: getMachineName(machineType),
                sectionsCount: numSections,
                timestamp: new Date(timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19),
                characteristics: '0x' + characteristics.toString(16).padStart(4, '0').toUpperCase()
              };

              // Optional Header
              const optHeaderOffset = fileHeaderOffset + 20;
              if (sizeOfOptionalHeader >= 2) {
                const magicOpt = view.getUint16(optHeaderOffset, true);
                peData.header.subsystem = getSubsystemName(view.getUint16(optHeaderOffset + (magicOpt === 0x20b ? 68 : 68), true));
                peData.header.entryPoint = '0x' + view.getUint32(optHeaderOffset + 16, true).toString(16).toUpperCase();
                peData.header.imageSize = formatSize(view.getUint32(optHeaderOffset + (magicOpt === 0x20b ? 56 : 56), true));
              }

              // Section Headers
              const sectionOffset = optHeaderOffset + sizeOfOptionalHeader;
              for (let i = 0; i < numSections; i++) {
                const offset = sectionOffset + (i * 40);
                if (offset + 40 > buffer.byteLength) break;

                const nameBytes = bytes.slice(offset, offset + 8);
                const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '');
                const vSize = view.getUint32(offset + 8, true);
                const vAddr = view.getUint32(offset + 12, true);
                const rSize = view.getUint32(offset + 16, true);
                const rPtr = view.getUint32(offset + 20, true);
                const char = view.getUint32(offset + 36, true);

                peData.sections.push({
                  name,
                  virtualSize: vSize,
                  virtualAddress: '0x' + vAddr.toString(16).toUpperCase(),
                  rawSize: rSize,
                  characteristics: '0x' + char.toString(16).toUpperCase()
                });
              }
            }
          }

          const hexDump = generateHexDump(buffer.slice(0, 2048));

          function renderUI(filter = '') {
            const filteredSections = peData.sections.filter(s => 
              s.name.toLowerCase().includes(filter.toLowerCase())
            );

            h.render(`
              <div class="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
                <!-- U1. File Info Bar -->
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 shadow-sm border border-surface-100">
                  <span class="font-semibold text-surface-800">${h.escape(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">DLL / Portable Executable</span>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                  <!-- U9. Metadata Card -->
                  <div class="lg:col-span-1 space-y-6">
                    <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
                      <h3 class="font-semibold text-surface-800 mb-4 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Static Analysis
                      </h3>
                      <div class="space-y-3 text-sm">
                        <div class="flex flex-col gap-1">
                          <span class="text-surface-400 text-xs uppercase font-medium tracking-wider">SHA-256 Hash</span>
                          <code class="p-2 bg-surface-50 rounded text-[10px] break-all border border-surface-100 font-mono text-surface-700">${hashHex}</code>
                        </div>
                        <div class="flex justify-between items-center py-2 border-b border-surface-50">
                          <span class="text-surface-500">Entropy</span>
                          <div class="flex items-center gap-3">
                            <span class="font-mono font-medium ${entropy > 7 ? 'text-red-500' : 'text-surface-700'}">${entropy.toFixed(4)}</span>
                            <div class="w-16 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                              <div class="h-full ${entropy > 7 ? 'bg-red-500' : 'bg-brand-500'}" style="width: ${(entropy / 8) * 100}%"></div>
                            </div>
                          </div>
                        </div>
                        <div class="flex justify-between items-center py-2">
                          <span class="text-surface-500">Magic Bytes</span>
                          <span class="font-mono text-xs text-surface-700">${magic}...</span>
                        </div>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex flex-col gap-2">
                      <button id="btn-copy" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-surface-200 text-surface-700 rounded-xl hover:bg-surface-50 hover:border-surface-300 transition-all text-sm font-medium">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 8h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                        Copy SHA-256
                      </button>
                      <button id="btn-download" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-700 shadow-sm transition-all text-sm font-medium">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Download DLL
                      </button>
                    </div>
                  </div>

                  <!-- PE Header Details -->
                  <div class="lg:col-span-2">
                    <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm h-full">
                      <h3 class="font-semibold text-surface-800 mb-4 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        PE Header Information
                      </h3>
                      ${peData.isValid ? `
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                            <div class="text-surface-400 text-[10px] uppercase font-bold tracking-widest mb-1">Architecture</div>
                            <div class="text-surface-800 font-medium">${peData.header.machine}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                            <div class="text-surface-400 text-[10px] uppercase font-bold tracking-widest mb-1">Compilation Time</div>
                            <div class="text-surface-800 font-medium">${peData.header.timestamp}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                            <div class="text-surface-400 text-[10px] uppercase font-bold tracking-widest mb-1">Entry Point</div>
                            <div class="text-surface-800 font-mono font-medium">${peData.header.entryPoint}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                            <div class="text-surface-400 text-[10px] uppercase font-bold tracking-widest mb-1">Subsystem</div>
                            <div class="text-surface-800 font-medium">${peData.header.subsystem || 'Unknown'}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                            <div class="text-surface-400 text-[10px] uppercase font-bold tracking-widest mb-1">Sections Count</div>
                            <div class="text-surface-800 font-medium">${peData.header.sectionsCount}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                            <div class="text-surface-400 text-[10px] uppercase font-bold tracking-widest mb-1">Characteristics</div>
                            <div class="text-surface-800 font-mono font-medium">${peData.header.characteristics}</div>
                          </div>
                        </div>
                      ` : `
                        <div class="flex flex-col items-center justify-center py-12 text-center">
                          <div class="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-3">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                          </div>
                          <p class="text-surface-600 font-medium">${peData.error || 'The file is not a valid PE executable.'}</p>
                          <p class="text-surface-400 text-xs mt-1">This tool only supports 32-bit and 64-bit Windows DLL/EXE files.</p>
                        </div>
                      `}
                    </div>
                  </div>
                </div>

                <!-- U10. Section Headers with search -->
                ${peData.isValid ? `
                  <div class="mb-8">
                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 class="font-bold text-surface-800">Section Headers</h3>
                        <p class="text-xs text-surface-500">Memory layout and flags for different file regions</p>
                      </div>
                      <div class="relative w-full sm:w-64">
                        <input type="text" id="section-search" placeholder="Filter sections..." value="${h.escape(filter)}" 
                          class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
                        <svg class="w-4 h-4 text-surface-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      </div>
                    </div>

                    <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                      <table class="min-w-full text-sm">
                        <thead class="bg-surface-50">
                          <tr>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Virtual Size</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Virtual Addr</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Raw Size</th>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Flags</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100 bg-white">
                          ${filteredSections.length > 0 ? filteredSections.map(s => `
                            <tr class="hover:bg-brand-50 transition-colors">
                              <td class="px-4 py-3 font-mono font-bold text-brand-700">${h.escape(s.name)}</td>
                              <td class="px-4 py-3 text-surface-600">${formatSize(s.virtualSize)}</td>
                              <td class="px-4 py-3 text-surface-500 font-mono text-xs">${s.virtualAddress}</td>
                              <td class="px-4 py-3 text-surface-600">${formatSize(s.rawSize)}</td>
                              <td class="px-4 py-3 text-surface-500 font-mono text-xs">${s.characteristics}</td>
                            </tr>
                          `).join('') : `
                            <tr>
                              <td colspan="5" class="px-4 py-8 text-center text-surface-400 italic">No sections matching "${h.escape(filter)}"</td>
                            </tr>
                          `}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ` : ''}

                <!-- U8. Hex Viewer -->
                <div>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Hexadecimal Preview</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">First 2 KB</span>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                    <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-gray-700">${hexDump}</pre>
                  </div>
                </div>
              </div>
            `);

            // Event Listeners
            document.getElementById('btn-download').onclick = () => h.download(file.name, buffer);
            document.getElementById('btn-copy').onclick = (e) => h.copyToClipboard(hashHex, e.target);
            
            const searchInput = document.getElementById('section-search');
            if (searchInput) {
              searchInput.oninput = (e) => renderUI(e.target.value);
            }
          }

          renderUI();

        } catch (err) {
          console.error(err);
          h.showError('Analysis Failed', 'An unexpected error occurred while parsing the DLL file structure.');
        }
      }
    });

    // --- Helper Functions ---

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

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function getMachineName(type) {
      const types = {
        0x014c: 'x86 (i386)',
        0x8664: 'x64 (AMD64)',
        0x01c0: 'ARM Little Endian',
        0xaa64: 'ARM64 Little Endian',
        0x0200: 'Intel Itanium',
        0x01c4: 'ARMV7',
        0x5032: 'RISC-V 32-bit',
        0x5064: 'RISC-V 64-bit'
      };
      return types[type] || `Unknown (0x${type.toString(16)})`;
    }

    function getSubsystemName(sub) {
      const subs = {
        1: 'Native',
        2: 'Windows GUI',
        3: 'Windows CUI (Console)',
        5: 'OS/2 CUI',
        7: 'POSIX CUI',
        9: 'Windows CE GUI',
        10: 'EFI Application',
        11: 'EFI Boot Service Driver',
        12: 'EFI Runtime Driver',
        13: 'EFI ROM',
        14: 'Xbox'
      };
      return subs[sub] || 'Unknown';
    }
  };
})();
