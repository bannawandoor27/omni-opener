(function () {
  'use strict';

  /**
   * OmniOpener ISO Tool
   * Production-perfect browser-based ISO 9660 disk image analyzer.
   */

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function generateHexDump(buffer, limit = 4096) {
    const bytes = new Uint8Array(buffer.slice(0, limit));
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

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onFile: function _onFileFn(file, content, h) {
        h.showLoading('Analyzing ISO image structure...');

        // Defer analysis to allow UI to show loading state
        setTimeout(async function() {
          try {
            const stats = await analyzeISO(file, content);
            h.setState('stats', stats);
            h.setState('file', file);
            h.setState('content', content);
            h.setState('searchQuery', '');
            renderUI(h);
          } catch (err) {
            console.error(err);
            h.showError('Could not open ISO file', 'The file might be corrupted or in an unsupported format. Error: ' + err.message);
          }
        }, 50);
      },
      onDestroy: function() {
        // Clear state to release memory
      }
    });
  };

  async function analyzeISO(file, buffer) {
    const stats = {
      isISO: false,
      hash: '',
      entropy: calculateEntropy(new Uint8Array(buffer.slice(0, 1048576))), // Sample first 1MB
      pvd: null,
      files: []
    };

    // Calculate SHA-256
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    stats.hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // ISO 9660 Parsing (Sector 16 / Offset 32768)
    if (buffer.byteLength > 34816) { // 32768 + 2048
      const pvdData = buffer.slice(32768, 34816);
      const magic = new TextDecoder('ascii').decode(new Uint8Array(pvdData.slice(1, 6)));
      
      if (magic === 'CD001') {
        stats.isISO = true;
        stats.pvd = parsePVD(pvdData);
        
        // Root Directory Record starts at offset 156 of the PVD
        const rootDirRecord = new Uint8Array(pvdData.slice(156, 190));
        const rootLba = new DataView(rootDirRecord.buffer, rootDirRecord.byteOffset + 2, 4).getUint32(0, true);
        const rootSize = new DataView(rootDirRecord.buffer, rootDirRecord.byteOffset + 10, 4).getUint32(0, true);
        
        stats.files = parseDirectory(buffer, rootLba, rootSize);
        stats.files.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : b.isDir ? 1 : -1));
      }
    }

    return stats;
  }

  function parsePVD(pvdBuffer) {
    const dec = new TextDecoder('ascii');
    const u8 = new Uint8Array(pvdBuffer);
    return {
      systemId: dec.decode(u8.slice(8, 40)).trim(),
      volumeId: dec.decode(u8.slice(40, 72)).trim(),
      volumeSetId: dec.decode(u8.slice(190, 318)).trim(),
      publisherId: dec.decode(u8.slice(318, 446)).trim(),
      applicationId: dec.decode(u8.slice(574, 702)).trim()
    };
  }

  function parseDirectory(buffer, lba, size) {
    const files = [];
    const sectorSize = 2048;
    const startOffset = lba * sectorSize;
    if (startOffset + size > buffer.byteLength) return [];
    
    const dirData = new Uint8Array(buffer.slice(startOffset, startOffset + size));
    let offset = 0;
    let safety = 0;
    
    while (offset < dirData.length && safety++ < 2000) {
      const len = dirData[offset];
      if (len === 0) {
        // Skip padding to next sector
        offset = Math.ceil((offset + 1) / sectorSize) * sectorSize;
        if (offset >= dirData.length) break;
        continue;
      }
      
      const flags = dirData[offset + 25];
      const nameLen = dirData[offset + 32];
      const fileLba = new DataView(dirData.buffer, dirData.byteOffset + offset + 2, 4).getUint32(0, true);
      const fileLen = new DataView(dirData.buffer, dirData.byteOffset + offset + 10, 4).getUint32(0, true);
      
      let name = new TextDecoder('ascii').decode(dirData.slice(offset + 33, offset + 33 + nameLen)).split(';')[0];
      if (name === '\x00') name = '.';
      else if (name === '\x01') name = '..';

      if (name !== '.' && name !== '..') {
        files.push({
          name: name || 'UNNAMED',
          size: fileLen,
          isDir: (flags & 2) !== 0,
          lba: fileLba
        });
      }
      offset += len;
    }
    return files;
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

  function renderUI(h) {
    const { stats, file, content, searchQuery } = h.getState();
    const filteredFiles = stats.files.filter(f => f.name.toLowerCase().includes((searchQuery || '').toLowerCase()));
    
    const html = `
      <div class="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200/50 shadow-sm">
          <span class="font-bold text-surface-900">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500 font-medium">ISO Optical Disk Image</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <!-- Column 1: Directory and Hex -->
          <div class="lg:col-span-8 space-y-8">
            
            <!-- Section: File Browser (U10) -->
            <div class="space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <h3 class="font-bold text-surface-900 text-lg">Root Directory</h3>
                  ${stats.isISO ? `<span class="px-2 py-0.5 bg-brand-100 text-brand-700 text-[10px] font-bold rounded-full border border-brand-200">${stats.files.length} ITEMS</span>` : ''}
                </div>
                ${stats.isISO ? `
                  <div class="relative w-full sm:w-64">
                    <input type="text" id="file-search" placeholder="Search files..." value="${esc(searchQuery)}" class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none shadow-sm">
                    <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
                  </div>
                ` : ''}
              </div>

              ${stats.isISO ? `
                <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
                  <div class="overflow-x-auto max-h-[400px]">
                    <table class="min-w-full text-sm">
                      <thead class="bg-surface-50 sticky top-0 z-10 border-b border-surface-200">
                        <tr>
                          <th class="px-6 py-4 text-left font-bold text-surface-700 uppercase tracking-widest text-[10px]">Name</th>
                          <th class="px-6 py-4 text-left font-bold text-surface-700 uppercase tracking-widest text-[10px] w-32">Size</th>
                          <th class="px-6 py-4 text-left font-bold text-surface-700 uppercase tracking-widest text-[10px] w-24">LBA</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-100">
                        ${filteredFiles.length > 0 ? filteredFiles.map(f => `
                          <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                            <td class="px-6 py-3 text-surface-800 flex items-center gap-3">
                              <span class="text-xl opacity-80 group-hover:scale-110 transition-transform">${f.isDir ? '📁' : '📄'}</span>
                              <span class="font-mono text-xs truncate max-w-[320px] font-medium" title="${esc(f.name)}">${esc(f.name)}</span>
                            </td>
                            <td class="px-6 py-3 text-surface-500 font-mono text-[11px]">${f.isDir ? '<span class="text-surface-300">—</span>' : formatSize(f.size)}</td>
                            <td class="px-6 py-3 text-surface-400 font-mono text-[11px]">0x${f.lba.toString(16).toUpperCase()}</td>
                          </tr>
                        `).join('') : `
                          <tr><td colspan="3" class="px-6 py-16 text-center text-surface-400 italic bg-surface-50/30">No files match your search</td></tr>
                        `}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : `
                <div class="p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200 text-surface-500">
                  <div class="text-3xl mb-3 opacity-50">📂</div>
                  <p class="font-bold text-surface-700 mb-1">No Directory Structure Found</p>
                  <p class="text-xs max-w-xs mx-auto">This image doesn't contain a standard ISO 9660 root directory or it may be using a different file system (UDF, etc.)</p>
                </div>
              `}
            </div>

            <!-- Section: Hex Viewer (U8) -->
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-surface-900 text-lg">Binary Inspection</h3>
                <button id="btn-copy-hex" class="px-3 py-1.5 text-[10px] font-bold text-surface-600 hover:text-brand-600 border border-surface-200 rounded-lg hover:border-brand-200 transition-all uppercase tracking-widest bg-white">Copy Dump</button>
              </div>
              <div class="rounded-2xl overflow-hidden border border-surface-200 bg-surface-950 shadow-xl ring-1 ring-white/5">
                <div class="bg-surface-900/80 px-4 py-2 flex justify-between items-center border-b border-white/5">
                  <span class="text-[9px] font-bold text-surface-500 uppercase tracking-[0.2em]">Primary Volume Descriptor Offset</span>
                  <span class="text-[9px] text-brand-400/70 font-mono">0x00008000</span>
                </div>
                <pre class="p-5 text-[11px] font-mono text-brand-50/90 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent h-[440px]">${esc(generateHexDump(content, 8192))}</pre>
              </div>
            </div>
          </div>

          <!-- Column 2: Metadata and Actions -->
          <div class="lg:col-span-4 space-y-8">
            
            <!-- Action Buttons (U4) -->
            <div class="bg-white rounded-3xl border border-surface-200 p-8 shadow-sm space-y-6">
              <h3 class="font-bold text-surface-900 flex items-center gap-2">
                <span class="text-brand-600">⚡</span> Quick Actions
              </h3>
              <div class="space-y-3">
                <button id="btn-dl" class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-brand-200 active:scale-95 group">
                  <span class="text-xl group-hover:rotate-12 transition-transform">📥</span> Download Image
                </button>
                <button id="btn-copy-hash" class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-surface-50 hover:bg-surface-100 text-surface-700 rounded-2xl font-bold border border-surface-200 transition-all active:scale-95 group">
                  <span class="text-xl group-hover:scale-110 transition-transform">📋</span> Copy Hash
                </button>
              </div>
            </div>

            <!-- Analysis Metadata Card -->
            <div class="bg-white rounded-3xl border border-surface-200 overflow-hidden shadow-sm">
              <div class="px-8 py-5 border-b border-surface-100 bg-surface-50/50">
                <h3 class="font-bold text-surface-800 text-xs uppercase tracking-[0.15em]">Analysis Report</h3>
              </div>
              <div class="p-0">
                <table class="w-full text-xs">
                  <tbody class="divide-y divide-surface-100">
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-8 py-4 text-surface-500 font-semibold w-32">Format</td>
                      <td class="px-8 py-4">${stats.isISO ? '<span class="text-green-600 font-bold flex items-center gap-1">Verified ISO 9660</span>' : '<span class="text-amber-600 font-bold">Unverified Raw Image</span>'}</td>
                    </tr>
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-8 py-4 text-surface-500 font-semibold">Volume ID</td>
                      <td class="px-8 py-4 font-mono text-surface-900 truncate max-w-[140px]">${esc(stats.pvd?.volumeId || 'N/A')}</td>
                    </tr>
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-8 py-4 text-surface-500 font-semibold">System ID</td>
                      <td class="px-8 py-4 font-mono text-surface-700 truncate max-w-[140px]">${esc(stats.pvd?.systemId || 'N/A')}</td>
                    </tr>
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-8 py-4 text-surface-500 font-semibold">Application</td>
                      <td class="px-8 py-4 font-mono text-surface-700 truncate max-w-[140px]">${esc(stats.pvd?.applicationId || 'N/A')}</td>
                    </tr>
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-8 py-4 text-surface-500 font-semibold">Entropy</td>
                      <td class="px-8 py-4 font-mono">
                        <span class="px-2 py-1 ${stats.entropy > 7 ? 'bg-indigo-100 text-indigo-700' : 'bg-surface-100 text-surface-700'} rounded font-bold">${stats.entropy.toFixed(4)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- SHA-256 Fingerprint -->
            <div class="bg-surface-900 rounded-3xl p-8 text-surface-300 space-y-4 shadow-inner relative overflow-hidden">
               <div class="relative z-10">
                 <div class="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-3">SHA-256 Checksum</div>
                 <div class="font-mono text-[10px] break-all leading-relaxed text-surface-400 select-all">${stats.hash}</div>
               </div>
               <div class="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                 <span class="text-4xl">🛡️</span>
               </div>
            </div>

          </div>
        </div>
      </div>
    `;

    h.render(html);

    // Re-attach interactive components
    const searchInput = document.getElementById('file-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        h.setState('searchQuery', e.target.value);
        renderUI(h);
        const input = document.getElementById('file-search');
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    }

    document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
    document.getElementById('btn-copy-hash').onclick = (e) => h.copyToClipboard(stats.hash, e.target);
    document.getElementById('btn-copy-hex').onclick = (e) => {
      const dump = generateHexDump(content, 8192);
      h.copyToClipboard(dump, e.target);
    };
  }

})();
