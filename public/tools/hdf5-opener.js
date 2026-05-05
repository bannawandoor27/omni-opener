(function () {
  'use strict';

  /**
   * Escapes strings for safe HTML insertion (B6)
   */
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Human-readable byte formatting (U1)
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generates a filtered hex dump with search metadata (B7, U8, Format Excellence)
   */
  function generateHexDump(buffer, start, length) {
    const totalBytes = buffer.byteLength;
    const bytes = new Uint8Array(buffer, start, Math.min(length, totalBytes - start));
    let lines = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const offset = (start + i).toString(16).padStart(8, '0');
      const chunk = bytes.slice(i, i + 16);
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      const hexPadded = hex.padEnd(47, ' ');
      
      lines.push(
        `<div class="hex-line flex py-0.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0" data-search="${esc(hex.toLowerCase())} ${esc(ascii.toLowerCase())}">` +
          `<span class="w-20 text-surface-500 shrink-0 font-mono select-none">${offset}</span>` +
          `<span class="text-brand-400 shrink-0 mr-4 font-mono font-bold">${esc(hexPadded)}</span>` +
          `<span class="text-surface-400 font-mono">|${esc(ascii)}|</span>` +
        `</div>`
      );
    }
    return lines.join('');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.h5,.hdf5,.hdf,.he5,.he4',
      dropLabel: 'Drop HDF5 file here',
      actions: [
        {
          label: '📥 Download File',
          id: 'dl',
          onClick: function (h) {
            const content = h.getContent();
            const file = h.getFile();
            if (content && file) h.download(file.name, content);
          }
        },
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().sha256;
            if (hash) h.copyToClipboard(hash, btn);
          }
        }
      ],
      onFile: async function _onFileFn(file, content, h) {
        if (!content || content.byteLength === 0) {
          h.showError('Empty File', 'The provided HDF5 file contains no data.');
          return;
        }

        h.showLoading('Analyzing HDF5 Hierarchical Structure...');

        // 1. Compute Integrity Hash (B3)
        const hashBuffer = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        h.setState({ sha256: hashHex });

        // 2. Detect HDF5 Signature (at offsets 0, 512, 1024, 2048, 4096, 8192)
        const bytes = new Uint8Array(content);
        const HDF5_MAGIC = [0x89, 0x48, 0x44, 0x46, 0x0D, 0x0A, 0x1A, 0x0A];
        let sigOffset = -1;
        const searchOffsets = [0, 512, 1024, 2048, 4096, 8192];
        
        for (const off of searchOffsets) {
          if (bytes.length < off + 8) break;
          let match = true;
          for (let i = 0; i < 8; i++) {
            if (bytes[off + i] !== HDF5_MAGIC[i]) { match = false; break; }
          }
          if (match) { sigOffset = off; break; }
        }

        const isValid = sigOffset !== -1;
        const superblock = {
          version: isValid && bytes.length > sigOffset + 8 ? bytes[sigOffset + 8] : 'N/A',
          offsetSize: isValid && bytes.length > sigOffset + 13 ? bytes[sigOffset + 13] : 'N/A',
          lengthSize: isValid && bytes.length > sigOffset + 14 ? bytes[sigOffset + 14] : 'N/A'
        };

        const displayLineLimit = 8192; // Max bytes for hex dump (B7)
        const lineCount = Math.ceil(Math.min(content.byteLength, displayLineLimit) / 16);

        // 3. Render UI
        h.render(`
          <div class="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
            <!-- U1: File Info Bar -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 shadow-sm border border-surface-100">
              <span class="font-semibold text-surface-800">${esc(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500 font-medium italic">HDF5 Hierarchical Data</span>
            </div>

            <!-- Dashboard Grid (U9) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Validity Status -->
              <div class="rounded-xl border border-surface-200 p-5 hover:border-brand-300 transition-all bg-white shadow-sm group">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Verification</h3>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${isValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${isValid ? 'Verified' : 'Mismatch'}
                  </span>
                </div>
                <div class="text-2xl font-bold ${isValid ? 'text-surface-800' : 'text-red-500'} mb-1">
                  ${isValid ? 'Valid HDF5' : 'Invalid File'}
                </div>
                <p class="text-xs text-surface-400">
                  ${isValid ? `Signature found at byte ${sigOffset}` : 'HDF5 magic header not detected'}
                </p>
              </div>

              <!-- Integrity Hash -->
              <div class="rounded-xl border border-surface-200 p-5 hover:border-brand-300 transition-all bg-white shadow-sm lg:col-span-2">
                <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-3">Integrity (SHA-256)</h3>
                <div class="font-mono text-[11px] break-all text-brand-700 bg-brand-50/50 p-3 rounded-lg border border-brand-100 leading-relaxed shadow-inner">
                  ${hashHex}
                </div>
              </div>
            </div>

            <!-- Metadata Details (U7, U10) -->
            <div class="space-y-3">
              <div class="flex items-center justify-between px-1">
                <h3 class="font-bold text-surface-800 flex items-center gap-2">
                  Superblock Analysis
                  <span class="text-xs font-normal text-surface-400">(HDF5 Header)</span>
                </h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">SPEC V${superblock.version}</span>
              </div>
              <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50/80 border-b border-surface-200">
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Internal Property</th>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700">Value / Parameter</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-4 py-3 text-surface-500">Superblock Format Version</td>
                      <td class="px-4 py-3 font-mono text-brand-600 font-bold">${superblock.version}</td>
                    </tr>
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-4 py-3 text-surface-500">Offset Addressing Size</td>
                      <td class="px-4 py-3 font-mono">${superblock.offsetSize} bytes</td>
                    </tr>
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-4 py-3 text-surface-500">Length Addressing Size</td>
                      <td class="px-4 py-3 font-mono">${superblock.lengthSize} bytes</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Raw Data Explorer (U8, U10, Format Excellence) -->
            <div class="space-y-3">
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 px-1">
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-surface-800">Hexadecimal Explorer</h3>
                  <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full font-bold">${lineCount} entries displayed</span>
                </div>
                <div class="relative">
                  <input type="text" id="hex-search" placeholder="Search hex or ASCII strings..." 
                    class="text-xs border border-surface-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full md:w-64 shadow-sm transition-all">
                  <svg class="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
              </div>
              <div class="rounded-xl overflow-hidden border border-surface-900 shadow-2xl bg-gray-950">
                <div id="hex-container" class="p-5 text-[11px] font-mono bg-gray-950 text-gray-200 overflow-x-auto leading-relaxed max-h-[500px] overflow-y-auto custom-scrollbar">
                  ${generateHexDump(content, 0, displayLineLimit)}
                </div>
              </div>
            </div>

            <!-- Format Tip -->
            <div class="bg-brand-50/50 border border-brand-100 rounded-2xl p-6 text-sm text-brand-900 flex items-start gap-4">
              <div class="text-2xl select-none">🧪</div>
              <div class="space-y-1">
                <p class="font-bold text-brand-950">Scientific Data Insight</p>
                <p class="leading-relaxed opacity-90">
                  HDF5 is a complex container format. This tool performs high-level validation and raw bit inspection. 
                  For deep data extraction of datasets (tensors) or group hierarchies, we recommend the 
                  <code class="bg-brand-100 px-1.5 py-0.5 rounded font-mono font-bold text-brand-800 text-[11px]">h5py</code> Python library 
                  or the standalone <code class="bg-brand-100 px-1.5 py-0.5 rounded font-mono font-bold text-brand-800 text-[11px]">HDFView</code> application.
                </p>
              </div>
            </div>
          </div>

          <style>
            .custom-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: #030712; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #1f2937; border-radius: 5px; border: 2px solid #030712; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #374151; }
            @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            .animate-in { animation: fade-in 0.4s ease-out forwards; }
          </style>
        `);

        // 4. Interaction Logic (Format Excellence)
        const searchInput = document.getElementById('hex-search');
        if (searchInput) {
          searchInput.addEventListener('input', function (e) {
            const term = e.target.value.toLowerCase();
            const lines = document.querySelectorAll('.hex-line');
            lines.forEach(line => {
              const contentMatch = line.getAttribute('data-search').includes(term);
              line.style.display = contentMatch ? 'flex' : 'none';
            });
          });
        }
      }
    });
  };
})();
