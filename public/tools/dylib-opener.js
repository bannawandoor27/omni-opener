(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let lastAnalysis = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing Mach-O binary...');

        if (!content || content.byteLength === 0) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-surface-500">
              <svg class="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <p class="text-lg font-medium">Empty dylib file</p>
              <p class="text-sm">This file contains no data to analyze.</p>
            </div>
          `);
          return;
        }

        try {
          const analysis = await analyzeDylib(file, content);
          lastAnalysis = analysis;

          const sizeStr = h.helpers.formatBytes(file.size);
          const entropyWidth = (analysis.entropy / 8) * 100;

          h.render(`
            <div class="max-w-6xl mx-auto p-4 lg:p-6 animate-in fade-in duration-500">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800">${h.helpers.escape(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${sizeStr}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">Mach-O Dynamic Library</span>
                ${analysis.isFat ? `<span class="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-bold uppercase tracking-wider">Universal Binary</span>` : ''}
              </div>

              <!-- Top Section: Stats & Metadata -->
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <!-- Metadata Card -->
                <div class="lg:col-span-2 rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
                  <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-surface-800 flex items-center gap-2">
                      <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      Binary Fingerprint
                    </h3>
                  </div>
                  <div class="space-y-4">
                    <div>
                      <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400 block mb-1">SHA-256 Hash</label>
                      <div class="flex items-center gap-2">
                        <code class="flex-1 bg-surface-50 p-2 rounded text-xs font-mono text-surface-700 break-all border border-surface-100">${analysis.sha256}</code>
                        <button id="btn-copy-hash" class="p-2 hover:bg-brand-50 text-brand-600 rounded-lg transition-colors" title="Copy Hash">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                        </button>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400 block mb-1">Entropy</label>
                        <div class="flex items-center gap-3">
                          <span class="text-sm font-semibold text-surface-700">${analysis.entropy.toFixed(4)} <span class="text-[10px] font-normal text-surface-400 uppercase">bits/byte</span></span>
                          <div class="flex-1 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                            <div class="h-full bg-brand-500 transition-all duration-1000" style="width: ${entropyWidth}%"></div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label class="text-[10px] font-bold uppercase tracking-widest text-surface-400 block mb-1">Magic Bytes</label>
                        <code class="text-xs font-mono text-brand-600">${analysis.magicHex}</code>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Arch Info Card -->
                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
                  <h3 class="font-bold text-surface-800 mb-4 flex items-center gap-2">
                    <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
                    Architecture
                  </h3>
                  <div class="space-y-3">
                    ${analysis.architectures.map(arch => `
                      <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                        <div class="flex justify-between items-center mb-1">
                          <span class="font-bold text-surface-800">${arch.name}</span>
                          <span class="text-[10px] font-bold px-1.5 py-0.5 bg-surface-200 rounded text-surface-600 uppercase tracking-tighter">${arch.cpuType}</span>
                        </div>
                        <div class="text-xs text-surface-500 flex justify-between">
                          <span>${arch.fileType}</span>
                          <span class="font-mono text-[10px]">${arch.flags}</span>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>

              <!-- Main Content: Tabs -->
              <div class="space-y-6">
                <!-- Dependencies Section -->
                <div class="bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                  <div class="px-5 py-4 border-b border-surface-200 flex items-center justify-between bg-surface-50/50">
                    <h3 class="font-bold text-surface-800 flex items-center gap-2">
                      <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                      Linked Libraries
                    </h3>
                    <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">${analysis.dependencies.length} deps</span>
                  </div>
                  
                  <div class="p-5">
                    ${analysis.installName ? `
                      <div class="mb-4 p-3 bg-brand-50 border border-brand-100 rounded-lg">
                        <label class="text-[10px] font-bold text-brand-600 uppercase tracking-widest block mb-1">Dylib ID (Install Name)</label>
                        <span class="text-sm font-mono text-brand-800 break-all">${h.helpers.escape(analysis.installName)}</span>
                      </div>
                    ` : ''}

                    ${analysis.dependencies.length > 0 ? `
                      <div class="overflow-x-auto rounded-lg border border-surface-100">
                        <table class="min-w-full text-sm">
                          <thead>
                            <tr class="bg-surface-50 border-b border-surface-100">
                              <th class="px-4 py-3 text-left font-bold text-surface-700">Path</th>
                              <th class="px-4 py-3 text-right font-bold text-surface-700">Version</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-surface-50">
                            ${analysis.dependencies.map(dep => `
                              <tr class="hover:bg-brand-50/30 transition-colors">
                                <td class="px-4 py-2 font-mono text-xs text-surface-700">${h.helpers.escape(dep.path)}</td>
                                <td class="px-4 py-2 text-right font-mono text-[10px] text-surface-500">${dep.currentVersion || 'N/A'}</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      </div>
                    ` : `
                      <div class="text-center py-8 text-surface-400 italic">No external dependencies found.</div>
                    `}
                  </div>
                </div>

                <!-- Hex Viewer Section -->
                <div class="bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                  <div class="px-5 py-4 border-b border-surface-200 flex items-center justify-between bg-surface-50/50">
                    <h3 class="font-bold text-surface-800 flex items-center gap-2">
                      <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                      Hex Viewer
                    </h3>
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-bold text-surface-400 uppercase">First 8KB</span>
                      <button id="btn-copy-hex" class="text-xs text-brand-600 hover:text-brand-700 font-semibold transition-colors">Copy Hex</button>
                    </div>
                  </div>
                  <div class="bg-gray-950 p-1">
                    <pre class="p-4 text-[10px] md:text-xs font-mono text-gray-400 overflow-x-auto leading-tight selection:bg-brand-500 selection:text-white max-h-[500px]">${analysis.hexDump}</pre>
                  </div>
                </div>
              </div>

              <!-- Action Bar -->
              <div class="mt-8 flex flex-wrap gap-4 justify-center pb-12">
                <button id="btn-download" class="flex items-center gap-2 px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-200 transition-all active:scale-95">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Download File
                </button>
                <button id="btn-export-json" class="flex items-center gap-2 px-6 py-2.5 bg-white border border-surface-200 hover:border-brand-300 text-surface-700 rounded-xl font-bold shadow-sm transition-all active:scale-95">
                  <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                  Export Analysis
                </button>
              </div>
            </div>
          `);

          // Event Listeners
          document.getElementById('btn-download').onclick = () => h.download(file.name, content);
          document.getElementById('btn-export-json').onclick = () => {
            const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' });
            h.download(file.name.replace(/\.[^/.]+$/, "") + "_analysis.json", blob);
          };
          document.getElementById('btn-copy-hash').onclick = (e) => h.copyToClipboard(analysis.sha256, e.currentTarget);
          document.getElementById('btn-copy-hex').onclick = (e) => h.copyToClipboard(analysis.hexDump, e.currentTarget);

        } catch (error) {
          console.error('[DylibOpener]', error);
          h.showError('Analysis Failed', 'This file does not appear to be a valid Mach-O dynamic library. It may be corrupted or from an unsupported platform.');
        }
      }
    });

    async function analyzeDylib(file, buffer) {
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      // 1. SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      // 2. Entropy
      const entropy = calculateEntropy(bytes);

      // 3. Magic & Basic Identification
      const magic = view.getUint32(0, false);
      const magicHex = '0x' + magic.toString(16).toUpperCase().padStart(8, '0');
      
      let architectures = [];
      let dependencies = [];
      let installName = null;
      let isFat = false;

      // Mach-O Magic constants
      const MH_MAGIC = 0xFEEDFACE;
      const MH_CIGAM = 0xCEFAEDFE;
      const MH_MAGIC_64 = 0xFEEDFACF;
      const MH_CIGAM_64 = 0xCFFAEDFE;
      const FAT_MAGIC = 0xCAFEBABE;
      const FAT_CIGAM = 0xBEBAFECA;

      if (magic === FAT_MAGIC || magic === FAT_CIGAM) {
        isFat = true;
        const isLittle = magic === FAT_CIGAM;
        const nfat = view.getUint32(4, isLittle);
        
        for (let i = 0; i < nfat; i++) {
          const offset = 8 + (i * 20);
          if (offset + 20 > buffer.byteLength) break;
          
          const cpuType = view.getInt32(offset, isLittle);
          const cpuSubtype = view.getInt32(offset + 4, isLittle);
          const archOffset = view.getUint32(offset + 8, isLittle);
          const archSize = view.getUint32(offset + 12, isLittle);
          
          // Peek into the architecture to get header info
          if (archOffset + 28 <= buffer.byteLength) {
            const archHeader = parseMachHeader(buffer, archOffset);
            if (archHeader) {
              architectures.push(archHeader);
              // Merge dependencies from the first architecture found
              if (dependencies.length === 0) {
                const results = parseLoadCommands(buffer, archOffset, archHeader);
                dependencies = results.dependencies;
                installName = results.installName;
              }
            }
          }
        }
      } else {
        const header = parseMachHeader(buffer, 0);
        if (header) {
          architectures.push(header);
          const results = parseLoadCommands(buffer, 0, header);
          dependencies = results.dependencies;
          installName = results.installName;
        } else {
          throw new Error('Invalid Mach-O magic');
        }
      }

      return {
        sha256,
        entropy,
        magicHex,
        isFat,
        architectures,
        dependencies,
        installName,
        hexDump: generateHexDump(buffer.slice(0, 8192))
      };
    }

    function parseMachHeader(buffer, offset) {
      const view = new DataView(buffer);
      const magic = view.getUint32(offset, false);
      
      const MH_MAGIC = 0xFEEDFACE;
      const MH_CIGAM = 0xCEFAEDFE;
      const MH_MAGIC_64 = 0xFEEDFACF;
      const MH_CIGAM_64 = 0xCFFAEDFE;

      const is64 = (magic === MH_MAGIC_64 || magic === MH_CIGAM_64);
      const isSwap = (magic === MH_CIGAM || magic === MH_CIGAM_64);
      
      if (![MH_MAGIC, MH_CIGAM, MH_MAGIC_64, MH_CIGAM_64].includes(magic)) return null;

      const cpuType = view.getInt32(offset + 4, isSwap);
      const fileType = view.getUint32(offset + 12, isSwap);
      const ncmds = view.getUint32(offset + 16, isSwap);
      const sizeofcmds = view.getUint32(offset + 20, isSwap);
      const flags = view.getUint32(offset + 24, isSwap);

      return {
        name: getCpuName(cpuType, is64),
        cpuType: `0x${cpuType.toString(16).toUpperCase()}`,
        fileType: getFileTypeName(fileType),
        ncmds,
        sizeofcmds,
        flags: `0x${flags.toString(16).toUpperCase().padStart(8, '0')}`,
        is64,
        isSwap,
        offset,
        headerSize: is64 ? 32 : 28
      };
    }

    function parseLoadCommands(buffer, offset, header) {
      const view = new DataView(buffer);
      const deps = [];
      let installName = null;

      const LC_ID_DYLIB = 0xd;
      const LC_LOAD_DYLIB = 0xc;
      const LC_LOAD_WEAK_DYLIB = 0x18 | 0x80000000; // LC_REQ_DYLD
      const LC_REEXPORT_DYLIB = 0x1f | 0x80000000;

      let currentPos = offset + header.headerSize;
      for (let i = 0; i < header.ncmds; i++) {
        if (currentPos + 8 > buffer.byteLength) break;
        
        const cmd = view.getUint32(currentPos, header.isSwap);
        const cmdsize = view.getUint32(currentPos + 4, header.isSwap);

        if (cmd === LC_ID_DYLIB || cmd === LC_LOAD_DYLIB || cmd === LC_LOAD_WEAK_DYLIB || cmd === LC_REEXPORT_DYLIB) {
          // dylib_command structure
          // uint32_t cmd;
          // uint32_t cmdsize;
          // struct dylib dylib;
          //   union lc_str name; (offset)
          //   uint32_t timestamp;
          //   uint32_t current_version;
          //   uint32_t compatibility_version;
          
          const nameOffset = view.getUint32(currentPos + 8, header.isSwap);
          const currentVersion = view.getUint32(currentPos + 16, header.isSwap);
          
          const path = readString(buffer, currentPos + nameOffset);
          const versionStr = parseVersion(currentVersion);

          if (cmd === LC_ID_DYLIB) {
            installName = path;
          } else {
            deps.push({ path, currentVersion: versionStr });
          }
        }

        currentPos += cmdsize;
      }

      return { dependencies: deps, installName };
    }

    function readString(buffer, offset) {
      const bytes = new Uint8Array(buffer);
      let str = "";
      for (let i = offset; i < bytes.length; i++) {
        if (bytes[i] === 0) break;
        str += String.fromCharCode(bytes[i]);
      }
      return str;
    }

    function parseVersion(v) {
      const patch = v & 0xFF;
      const minor = (v >> 8) & 0xFF;
      const major = (v >> 16);
      return `${major}.${minor}.${patch}`;
    }

    function getCpuName(type, is64) {
      const types = {
        1: 'VAX', 6: 'MC680x0', 7: is64 ? 'x86_64' : 'i386', 10: 'MC98000', 11: 'HPPA', 
        12: is64 ? 'ARM64' : 'ARM', 13: 'MC88000', 14: 'SPARC', 15: 'i860', 18: 'PowerPC'
      };
      return types[Math.abs(type)] || `Unknown (${type})`;
    }

    function getFileTypeName(type) {
      const types = {
        1: 'Object', 2: 'Executable', 3: 'Fixed VM Lib', 4: 'Core', 5: 'Preload', 
        6: 'Dylib', 7: 'Dylinker', 8: 'Bundle', 9: 'Dylib Stub', 10: 'DSYM', 11: 'Kext'
      };
      return types[type] || `Unknown (${type})`;
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
