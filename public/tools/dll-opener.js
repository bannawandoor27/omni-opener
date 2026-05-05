(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentObjectUrl = null;

    const cleanup = () => {
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onDestroy: cleanup,
      onFile: async function _onFile(file, content, h) {
        cleanup();
        h.showLoading('Analyzing Portable Executable structure...');

        try {
          const buffer = content;
          const view = new DataView(buffer);
          const bytes = new Uint8Array(buffer);

          if (buffer.byteLength < 64) {
            throw new Error('File is too small to be a valid PE executable.');
          }

          if (view.getUint16(0, true) !== 0x5A4D) {
            throw new Error('Invalid MZ signature. This does not appear to be a Windows executable or DLL.');
          }

          const peOffset = view.getUint32(0x3C, true);
          if (peOffset + 24 > buffer.byteLength) {
            throw new Error('PE header offset out of bounds.');
          }

          if (view.getUint32(peOffset, true) !== 0x00004550) {
            throw new Error('Invalid PE signature.');
          }

          const fileHeaderOffset = peOffset + 4;
          const machine = view.getUint16(fileHeaderOffset, true);
          const numSections = view.getUint16(fileHeaderOffset + 2, true);
          const timestamp = view.getUint32(fileHeaderOffset + 4, true);
          const sizeOfOptionalHeader = view.getUint16(fileHeaderOffset + 16, true);
          const characteristics = view.getUint16(fileHeaderOffset + 18, true);

          const optHeaderOffset = fileHeaderOffset + 20;
          let entryPoint = 0;
          let imageBase = 0;
          let subsystem = 0;
          let is64Bit = false;

          if (sizeOfOptionalHeader >= 2) {
            const magic = view.getUint16(optHeaderOffset, true);
            is64Bit = magic === 0x20b;
            entryPoint = view.getUint32(optHeaderOffset + 16, true);
            if (is64Bit) {
              imageBase = Number(view.getBigUint64(optHeaderOffset + 24, true));
              subsystem = view.getUint16(optHeaderOffset + 68, true);
            } else {
              imageBase = view.getUint32(optHeaderOffset + 28, true);
              subsystem = view.getUint16(optHeaderOffset + 68, true);
            }
          }

          const sectionHeaderOffset = optHeaderOffset + sizeOfOptionalHeader;
          const sections = [];
          for (let i = 0; i < numSections; i++) {
            const offset = sectionHeaderOffset + (i * 40);
            if (offset + 40 > buffer.byteLength) break;

            const nameBytes = bytes.slice(offset, offset + 8);
            const name = new TextDecoder().decode(nameBytes).replace(/\0/g, '').trim();
            const vSize = view.getUint32(offset + 8, true);
            const vAddr = view.getUint32(offset + 12, true);
            const rSize = view.getUint32(offset + 16, true);
            const rPtr = view.getUint32(offset + 20, true);
            const char = view.getUint32(offset + 36, true);

            sections.push({
              name,
              vSize,
              vAddr: '0x' + vAddr.toString(16).toUpperCase(),
              rSize,
              rPtr: '0x' + rPtr.toString(16).toUpperCase(),
              flags: '0x' + char.toString(16).toUpperCase(),
              rawFlags: char
            });
          }

          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          const entropy = calculateEntropy(bytes);
          const state = {
            filter: '',
            sortKey: 'name',
            sortDir: 1
          };

          function calculateEntropy(data) {
            const freq = new Uint32Array(256);
            for (let i = 0; i < data.length; i++) freq[data[i]]++;
            let ent = 0;
            const len = data.length;
            for (let i = 0; i < 256; i++) {
              if (freq[i] > 0) {
                const p = freq[i] / len;
                ent -= p * Math.log2(p);
              }
            }
            return ent;
          }

          function formatSize(b) {
            if (b === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(b) / Math.log(k));
            return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          }

          function generateHexDump(buf) {
            const b = new Uint8Array(buf);
            let out = '';
            for (let i = 0; i < b.length; i += 16) {
              let line = i.toString(16).padStart(8, '0') + '  ';
              let ascii = '';
              for (let j = 0; j < 16; j++) {
                if (i + j < b.length) {
                  const val = b[i + j];
                  line += val.toString(16).padStart(2, '0') + ' ';
                  ascii += (val >= 32 && val <= 126) ? String.fromCharCode(val) : '.';
                } else {
                  line += '   ';
                }
                if (j === 7) line += ' ';
              }
              out += line.padEnd(50, ' ') + ' |' + ascii + '|\n';
            }
            return out.trim();
          }

          const render = () => {
            let filtered = sections.filter(s => 
              s.name.toLowerCase().includes(state.filter.toLowerCase()) ||
              s.vAddr.toLowerCase().includes(state.filter.toLowerCase())
            );

            filtered.sort((a, b) => {
              let valA = a[state.sortKey];
              let valB = b[state.sortKey];
              if (typeof valA === 'string') return valA.localeCompare(valB) * state.sortDir;
              return (valA - valB) * state.sortDir;
            });

            h.render(`
              <div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-200 shadow-sm mb-4">
                  <span class="font-bold text-surface-900">${h.escape(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">${is64Bit ? 'PE32+ (64-bit)' : 'PE32 (32-bit)'} DLL</span>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div class="space-y-6">
                    <div class="rounded-xl border border-surface-200 bg-white p-5 shadow-sm hover:border-brand-300 transition-all">
                      <h3 class="font-bold text-surface-800 mb-4 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Static Analysis
                      </h3>
                      <div class="space-y-4">
                        <div>
                          <label class="text-[10px] font-bold text-surface-400 uppercase tracking-widest block mb-1">SHA-256 Hash</label>
                          <code class="block p-2.5 bg-surface-50 rounded-lg text-[10px] font-mono break-all border border-surface-100 text-surface-600 cursor-pointer hover:bg-surface-100" id="copy-hash-btn">${hashHex}</code>
                        </div>
                        <div class="pt-2 border-t border-surface-50">
                          <div class="flex justify-between items-center mb-1">
                            <span class="text-xs text-surface-500">Entropy</span>
                            <span class="text-xs font-mono font-bold ${entropy > 7 ? 'text-red-500' : 'text-brand-600'}">${entropy.toFixed(4)}</span>
                          </div>
                          <div class="w-full h-1.5 bg-surface-100 rounded-full overflow-hidden">
                            <div class="h-full ${entropy > 7 ? 'bg-red-500' : 'bg-brand-500'} transition-all duration-700" style="width: ${(entropy / 8) * 100}%"></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-col gap-2">
                      <button id="dl-btn" class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-brand-600 text-white rounded-xl hover:bg-brand-700 shadow-sm transition-all font-semibold text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Download DLL
                      </button>
                      <button id="copy-ep-btn" class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white border border-surface-200 text-surface-700 rounded-xl hover:bg-surface-50 transition-all font-medium text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 8h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                        Copy Entry Point
                      </button>
                    </div>
                  </div>

                  <div class="lg:col-span-2 space-y-6">
                    <div class="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
                      <h3 class="font-bold text-surface-800 mb-4 flex items-center gap-2">
                        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        PE Header Information
                      </h3>
                      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        ${renderMeta('Architecture', getMachine(machine), 'M')}
                        ${renderMeta('Compiled At', formatTS(timestamp), 'T')}
                        ${renderMeta('Entry Point', '0x' + entryPoint.toString(16).toUpperCase(), 'E')}
                        ${renderMeta('Image Base', '0x' + imageBase.toString(16).toUpperCase(), 'B')}
                        ${renderMeta('Subsystem', getSubs(subsystem), 'S')}
                        ${renderMeta('Sections', numSections.toString(), 'C')}
                      </div>
                    </div>

                    <div class="space-y-4">
                      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <h3 class="font-bold text-surface-800">Section Headers</h3>
                        <div class="relative w-full sm:w-64">
                          <input type="text" id="sec-filter" placeholder="Filter sections..." value="${h.escape(state.filter)}" 
                            class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                          <svg class="w-4 h-4 text-surface-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </div>
                      </div>

                      <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
                        <table class="min-w-full text-sm">
                          <thead>
                            <tr class="bg-surface-50">
                              <th class="cursor-pointer px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200" data-sort="name">Name ${renderSort('name')}</th>
                              <th class="cursor-pointer px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200" data-sort="vAddr">Virtual Addr ${renderSort('vAddr')}</th>
                              <th class="cursor-pointer px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200" data-sort="vSize">Virtual Size ${renderSort('vSize')}</th>
                              <th class="cursor-pointer px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200" data-sort="rSize">Raw Size ${renderSort('rSize')}</th>
                              <th class="px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200">Flags</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-surface-100">
                            ${filtered.length > 0 ? filtered.map(s => `
                              <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                                <td class="px-4 py-3 font-mono font-bold text-brand-700">${h.escape(s.name)}</td>
                                <td class="px-4 py-3 text-surface-500 font-mono text-xs">${s.vAddr}</td>
                                <td class="px-4 py-3 text-surface-600">${formatSize(s.vSize)}</td>
                                <td class="px-4 py-3 text-surface-600">${formatSize(s.rSize)}</td>
                                <td class="px-4 py-3 font-mono text-xs text-surface-400">${s.flags}</td>
                              </tr>
                            `).join('') : '<tr><td colspan="5" class="px-4 py-8 text-center text-surface-400 italic">No sections found.</td></tr>'}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div class="space-y-3">
                      <h3 class="font-bold text-surface-800">Hexadecimal Preview (1KB)</h3>
                      <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                        <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">
${generateHexDump(buffer.slice(0, 1024))}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `);

            document.getElementById('dl-btn').onclick = () => h.download(file.name, buffer);
            document.getElementById('copy-hash-btn').onclick = (e) => h.copyToClipboard(hashHex, e.currentTarget);
            document.getElementById('copy-ep-btn').onclick = (e) => h.copyToClipboard('0x' + entryPoint.toString(16).toUpperCase(), e.currentTarget);
            
            const fi = document.getElementById('sec-filter');
            fi.oninput = (e) => {
              state.filter = e.target.value;
              render();
              const n = document.getElementById('sec-filter');
              n.focus();
              n.setSelectionRange(state.filter.length, state.filter.length);
            };

            document.querySelectorAll('th[data-sort]').forEach(th => {
              th.onclick = () => {
                const key = th.getAttribute('data-sort');
                if (state.sortKey === key) state.sortDir *= -1;
                else { state.sortKey = key; state.sortDir = 1; }
                render();
              };
            });
          };

          const renderMeta = (l, v, i) => `
            <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
              <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1 flex justify-between">${l} <span>${i}</span></div>
              <div class="text-surface-800 font-bold truncate ${v.startsWith('0x') ? 'font-mono text-xs' : 'text-sm'}">${v}</div>
            </div>
          `;

          const renderSort = (k) => {
            if (state.sortKey !== k) return '<span class="opacity-20 ml-1">⇅</span>';
            return `<span class="text-brand-500 ml-1">${state.sortDir === 1 ? '▲' : '▼'}</span>`;
          };

          render();

        } catch (err) {
          h.showError('Analysis Failed', err.message || 'Error parsing DLL.');
        }
      }
    });

    function getMachine(t) {
      const m = { 0x014c: 'x86', 0x8664: 'x64', 0x01c0: 'ARM', 0xaa64: 'ARM64' };
      return m[t] || '0x' + t.toString(16);
    }
    function getSubs(s) {
      const m = { 1: 'Native', 2: 'GUI', 3: 'Console', 10: 'EFI' };
      return m[s] || 'Unknown';
    }
    function formatTS(t) {
      try { return new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' '); } catch (e) { return 'N/A'; }
    }
  };
})();
