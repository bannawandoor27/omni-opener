(function () {
  'use strict';

  /**
   * OmniOpener Dylib Tool
   * A high-performance Mach-O dynamic library analyzer.
   */
  window.initTool = function (toolConfig, mountEl) {
    let currentFile = null;
    let currentContent = null;
    let lastAnalysis = null;

    // Mach-O Constants
    const MH_MAGIC = 0xFEEDFACE;
    const MH_CIGAM = 0xCEFAEDFE;
    const MH_MAGIC_64 = 0xFEEDFACF;
    const MH_CIGAM_64 = 0xCFFAEDFE;
    const FAT_MAGIC = 0xCAFEBABE;
    const FAT_CIGAM = 0xBEBAFECA;

    const LC_ID_DYLIB = 0xd;
    const LC_LOAD_DYLIB = 0xc;
    const LC_LOAD_WEAK_DYLIB = 0x18 | 0x80000000;
    const LC_REEXPORT_DYLIB = 0x1f | 0x80000000;
    const LC_RPATH = 0x1c | 0x80000000;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onFile: async function _onFile(file, content, h) {
        currentFile = file;
        currentContent = content;

        if (!content || content.byteLength === 0) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-surface-500">
              <div class="w-16 h-16 mb-4 bg-surface-100 rounded-full flex items-center justify-center">
                <svg class="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <p class="text-lg font-semibold text-surface-900">Empty .dylib file</p>
              <p class="text-sm">The uploaded file contains no data to analyze.</p>
            </div>
          `);
          return;
        }

        h.showLoading('Analyzing Mach-O structures...');

        try {
          const analysis = await analyzeDylib(content);
          lastAnalysis = analysis;
          renderAnalysis(analysis, h);
        } catch (error) {
          console.error('[DylibOpener] Error:', error);
          h.showError('Could not open dylib file', 'The file may be corrupted or in an unsupported format. This tool supports Mach-O dynamic libraries and Universal binaries.');
        }
      },
      onDestroy: function() {
        currentFile = null;
        currentContent = null;
        lastAnalysis = null;
      }
    });

    /**
     * Renders the full analysis view
     */
    function renderAnalysis(analysis, h) {
      const sizeStr = h.helpers.formatBytes(currentFile.size);
      const entropyPercent = (analysis.entropy / 8) * 100;

      h.render(`
        <div class="max-w-6xl mx-auto p-4 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
            <span class="font-semibold text-surface-800">${h.helpers.escape(currentFile.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${sizeStr}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.dylib file</span>
            ${analysis.isFat ? `<span class="ml-auto px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-[10px] font-bold uppercase tracking-wider">Universal Binary</span>` : ''}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <!-- Binary Fingerprint -->
            <div class="md:col-span-2 bg-white rounded-2xl border border-surface-200 p-6 shadow-sm">
              <div class="flex items-center justify-between mb-6">
                <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                  <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  Binary Identity
                </h3>
              </div>
              
              <div class="space-y-6">
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-bold text-surface-400 uppercase tracking-wider">SHA-256 Checksum</span>
                    <button id="copy-hash" class="text-brand-600 hover:text-brand-700 text-xs font-medium flex items-center gap-1 transition-colors">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                      Copy
                    </button>
                  </div>
                  <code class="block bg-surface-50 p-3 rounded-xl text-xs font-mono text-surface-600 break-all border border-surface-100">${analysis.sha256}</code>
                </div>

                <div class="grid grid-cols-2 gap-6">
                  <div>
                    <span class="text-xs font-bold text-surface-400 uppercase tracking-wider block mb-2">Shannon Entropy</span>
                    <div class="flex items-end justify-between mb-2">
                      <span class="text-2xl font-bold text-surface-900 tabular-nums">${analysis.entropy.toFixed(4)}</span>
                      <span class="text-[10px] font-bold text-surface-400 pb-1">BITS/BYTE</span>
                    </div>
                    <div class="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                      <div class="h-full bg-brand-500 transition-all duration-1000" style="width: ${entropyPercent}%"></div>
                    </div>
                  </div>
                  <div>
                    <span class="text-xs font-bold text-surface-400 uppercase tracking-wider block mb-2">Magic Bytes</span>
                    <div class="h-12 flex items-center px-4 bg-brand-50 rounded-xl border border-brand-100">
                      <code class="text-lg font-bold text-brand-700 font-mono">${analysis.magicHex}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Architectures -->
            <div class="bg-white rounded-2xl border border-surface-200 p-6 shadow-sm">
              <h3 class="font-semibold text-surface-800 mb-5 flex items-center gap-2">
                <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                Architectures
              </h3>
              <div class="space-y-3 overflow-y-auto max-h-[280px] pr-2 scrollbar-thin">
                ${analysis.architectures.map(arch => `
                  <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                    <div class="flex justify-between items-start mb-1">
                      <span class="font-bold text-surface-800">${arch.name}</span>
                      <span class="text-[10px] bg-white px-1.5 py-0.5 rounded border border-surface-200 text-surface-500 uppercase font-bold">${arch.cpuType}</span>
                    </div>
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-surface-500">${arch.fileType}</span>
                      <code class="text-surface-400">${arch.flags}</code>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div class="space-y-8">
            <!-- Linked Libraries -->
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-6 py-4 bg-surface-50/50 border-b border-surface-200 flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <h3 class="font-semibold text-surface-800">Linked Libraries</h3>
                  <span id="dep-count" class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">${analysis.dependencies.length} items</span>
                </div>
                <div class="relative">
                  <input type="text" id="dep-search" placeholder="Filter..." 
                    class="pl-8 pr-4 py-1.5 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                  <svg class="w-4 h-4 absolute left-2.5 top-2 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>

              <div class="p-6">
                ${analysis.installName ? `
                  <div class="mb-6 p-4 bg-brand-50/50 border border-brand-100 rounded-xl flex items-center gap-4">
                    <div class="p-2 bg-brand-100 text-brand-600 rounded-lg">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    </div>
                    <div class="min-w-0">
                      <label class="text-[10px] font-bold text-brand-600 uppercase tracking-widest block mb-0.5">Dylib ID (Install Name)</label>
                      <div class="text-sm font-mono font-medium text-surface-900 truncate" title="${h.helpers.escape(analysis.installName)}">${h.helpers.escape(analysis.installName)}</div>
                    </div>
                  </div>
                ` : ''}

                <div class="overflow-x-auto rounded-xl border border-surface-200">
                  <table class="min-w-full text-sm" id="dep-table">
                    <thead>
                      <tr class="bg-surface-50 border-b border-surface-200">
                        <th class="px-4 py-3 text-left font-semibold text-surface-700">Library Path</th>
                        <th class="px-4 py-3 text-right font-semibold text-surface-700">Version</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${analysis.dependencies.length > 0 ? analysis.dependencies.map(dep => `
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-2 font-mono text-[11px] text-surface-600 break-all">${h.helpers.escape(dep.path)}</td>
                          <td class="px-4 py-2 text-right font-mono text-[11px] text-surface-500">${dep.currentVersion || '—'}</td>
                        </tr>
                      `).join('') : `
                        <tr><td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">No external dynamic libraries found.</td></tr>
                      `}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Hex Inspector -->
            <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
              <div class="px-6 py-4 bg-gray-900 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <h3 class="font-semibold text-white">Hex Inspector</h3>
                  <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest border border-gray-700 px-2 py-0.5 rounded">First 4KB</span>
                </div>
                <button id="copy-hex" class="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                  Copy Hex
                </button>
              </div>
              <div class="bg-gray-950 p-1">
                <pre class="p-4 text-[10px] md:text-[11px] font-mono text-brand-300/80 overflow-x-auto leading-relaxed max-h-[400px] scrollbar-invert">${analysis.hexDump}</pre>
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="mt-12 flex flex-wrap gap-4 justify-center pb-12">
            <button id="download-raw" class="flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 transition-all active:scale-95">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              Download Binary
            </button>
            <button id="export-json" class="flex items-center gap-2 px-6 py-3 bg-white border border-surface-200 hover:border-brand-500 hover:text-brand-600 text-surface-700 rounded-xl font-bold transition-all active:scale-95">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              Export Report
            </button>
          </div>
        </div>

        <style>
          .scrollbar-thin::-webkit-scrollbar { width: 4px; }
          .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
          .scrollbar-thin::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
          .scrollbar-invert::-webkit-scrollbar { width: 6px; height: 6px; }
          .scrollbar-invert::-webkit-scrollbar-track { background: #0a0a0a; }
          .scrollbar-invert::-webkit-scrollbar-thumb { background: #334155; border-radius: 6px; }
        </style>
      `);

      // Bind events
      const downloadBtn = document.getElementById('download-raw');
      const exportBtn = document.getElementById('export-json');
      const copyHashBtn = document.getElementById('copy-hash');
      const copyHexBtn = document.getElementById('copy-hex');
      const searchInput = document.getElementById('dep-search');

      if (downloadBtn) downloadBtn.onclick = () => h.download(currentFile.name, currentContent);
      if (exportBtn) exportBtn.onclick = () => {
        const data = {
          file: currentFile.name,
          size: currentFile.size,
          analysis: analysis
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        h.download(currentFile.name.replace(/\.[^/.]+$/, "") + "_report.json", blob);
      };
      
      if (copyHashBtn) copyHashBtn.onclick = (e) => h.copyToClipboard(analysis.sha256, e.currentTarget);
      if (copyHexBtn) copyHexBtn.onclick = (e) => h.copyToClipboard(analysis.hexDump, e.currentTarget);

      if (searchInput) {
        searchInput.oninput = (e) => {
          const term = e.target.value.toLowerCase();
          const rows = document.querySelectorAll('#dep-table tbody tr');
          let visibleCount = 0;
          
          rows.forEach(row => {
            if (row.cells.length < 2) return;
            const text = row.textContent.toLowerCase();
            const match = text.includes(term);
            row.style.display = match ? '' : 'none';
            if (match) visibleCount++;
          });

          const countEl = document.getElementById('dep-count');
          if (countEl) countEl.textContent = `${visibleCount} found`;
        };
      }
    }

    /**
     * Core Mach-O Analysis Logic
     */
    async function analyzeDylib(buffer) {
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      // 1. Hash and Entropy
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const entropy = calculateEntropy(bytes);

      // 2. Identify Structure
      const magic = view.getUint32(0, false);
      const magicHex = '0x' + magic.toString(16).toUpperCase().padStart(8, '0');
      
      let architectures = [];
      let dependencies = [];
      let installName = null;
      let isFat = false;

      if (magic === FAT_MAGIC || magic === FAT_CIGAM) {
        isFat = true;
        const isLittle = magic === FAT_CIGAM;
        const nfat = view.getUint32(4, isLittle);
        
        // Safety cap for fat binaries
        const count = Math.min(nfat, 64);
        for (let i = 0; i < count; i++) {
          const offset = 8 + (i * 20);
          if (offset + 20 > buffer.byteLength) break;
          
          const archOffset = view.getUint32(offset + 8, isLittle);
          
          if (archOffset + 28 <= buffer.byteLength) {
            const archHeader = parseMachHeader(buffer, archOffset);
            if (archHeader) {
              architectures.push(archHeader);
              // Extract logic from first valid arch if deps empty
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
        hexDump: generateHexDump(buffer.slice(0, 4096))
      };
    }

    function parseMachHeader(buffer, offset) {
      const view = new DataView(buffer);
      if (offset + 28 > buffer.byteLength) return null;

      const magic = view.getUint32(offset, false);
      const is64 = (magic === MH_MAGIC_64 || magic === MH_CIGAM_64);
      const isSwap = (magic === MH_CIGAM || magic === MH_CIGAM_64);
      
      if (![MH_MAGIC, MH_CIGAM, MH_MAGIC_64, MH_CIGAM_64].includes(magic)) return null;

      const cpuType = view.getInt32(offset + 4, isSwap);
      const fileType = view.getUint32(offset + 12, isSwap);
      const ncmds = view.getUint32(offset + 16, isSwap);
      const flags = view.getUint32(offset + 24, isSwap);

      return {
        name: getCpuName(cpuType, is64),
        cpuType: `0x${Math.abs(cpuType).toString(16).toUpperCase()}`,
        fileType: getFileTypeName(fileType),
        ncmds,
        flags: `0x${flags.toString(16).toUpperCase().padStart(8, '0')}`,
        is64,
        isSwap,
        offset,
        headerSize: is64 ? 32 : 28
      };
    }

    function parseLoadCommands(buffer, archOffset, header) {
      const view = new DataView(buffer);
      const deps = [];
      let installName = null;

      let currentPos = archOffset + header.headerSize;
      const maxCmds = Math.min(header.ncmds, 1000);

      for (let i = 0; i < maxCmds; i++) {
        if (currentPos + 8 > buffer.byteLength) break;
        
        const cmd = view.getUint32(currentPos, header.isSwap);
        const cmdsize = view.getUint32(currentPos + 4, header.isSwap);

        if (cmdsize < 8 || currentPos + cmdsize > buffer.byteLength) break;

        if ([LC_ID_DYLIB, LC_LOAD_DYLIB, LC_LOAD_WEAK_DYLIB, LC_REEXPORT_DYLIB].includes(cmd)) {
          const nameOffset = view.getUint32(currentPos + 8, header.isSwap);
          const currentVersion = view.getUint32(currentPos + 16, header.isSwap);
          
          if (nameOffset < cmdsize) {
            const path = readString(buffer, currentPos + nameOffset, cmdsize - nameOffset);
            const versionStr = parseVersion(currentVersion);

            if (cmd === LC_ID_DYLIB) {
              installName = path;
            } else {
              deps.push({ path, currentVersion: versionStr });
            }
          }
        }

        currentPos += cmdsize;
      }

      return { dependencies: deps, installName };
    }

    function readString(buffer, offset, maxLen) {
      const bytes = new Uint8Array(buffer);
      let str = "";
      const limit = Math.min(bytes.length, offset + (maxLen || 4096));
      for (let i = offset; i < limit; i++) {
        if (bytes[i] === 0) break;
        // Basic sanitization: only allow printable ASCII
        if (bytes[i] >= 32 && bytes[i] <= 126) {
          str += String.fromCharCode(bytes[i]);
        } else {
          str += '?';
        }
      }
      return str.trim();
    }

    function parseVersion(v) {
      const patch = v & 0xFF;
      const minor = (v >> 8) & 0xFF;
      const major = (v >> 16);
      return `${major}.${minor}.${patch}`;
    }

    function getCpuName(type, is64) {
      const absType = Math.abs(type);
      const types = {
        1: 'VAX', 6: 'MC680x0', 7: is64 ? 'x86_64' : 'i386', 10: 'MC98000', 11: 'HPPA', 
        12: is64 ? 'ARM64' : 'ARM', 13: 'MC88000', 14: 'SPARC', 15: 'i860', 18: 'PowerPC'
      };
      return types[absType] || `Arch (${absType})`;
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
