(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _pakoPromise = null;
    let _cleanup = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pcap,.pcapng,.cap,.gz',
      binary: true,
      dropLabel: 'Drop a packet capture (PCAP/PCAPNG)',
      infoHtml: 'Professional browser-based packet analyzer. Decodes Ethernet, IPv4, IPv6, TCP, UDP, ICMP, ARP, DNS, and more. 100% private, local processing.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.packets || state.packets.length === 0) {
              h.showError('No packets to copy', 'Please load a valid PCAP file first.');
              return;
            }
            h.showLoading('Preparing JSON export...');
            setTimeout(function() {
              try {
                const data = JSON.stringify(state.packets.slice(0, 5000).map(p => ({
                  no: p.num,
                  time: p.time.toFixed(6),
                  source: p.src,
                  destination: p.dst,
                  protocol: p.proto,
                  length: p.len,
                  info: p.info
                })), null, 2);
                h.copyToClipboard(data, btn);
              } catch (e) {
                h.showError('Export failed', 'The capture might be too large for JSON serialization.');
              } finally {
                h.hideLoading();
              }
            }, 50);
          }
        },
        {
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const state = h.getState();
            if (!state.packets || state.packets.length === 0) return;
            h.showLoading('Generating CSV...');
            setTimeout(function() {
              try {
                const headers = ['No.', 'Time', 'Source', 'Destination', 'Protocol', 'Length', 'Info'];
                const rows = state.packets.slice(0, 10000).map(p => [
                  p.num,
                  p.time.toFixed(6),
                  `"${p.src}"`,
                  `"${p.dst}"`,
                  p.proto,
                  p.len,
                  `"${p.info.replace(/"/g, '""')}"`
                ]);
                const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                h.download(`${(state.fileName || 'capture').replace(/\.[^/.]+$/, '')}.csv`, csv, 'text/csv');
              } catch (e) {
                h.showError('CSV Export failed', 'An error occurred during generation.');
              } finally {
                h.hideLoading();
              }
            }, 50);
          }
        }
      ],

      onInit: function (h) {
        _pakoPromise = new Promise((resolve) => {
          if (typeof window.pako !== 'undefined') return resolve(window.pako);
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', () => {
            resolve(window.pako);
          });
        });
      },

      onFile: async function _onFileFn(file, content, h) {
        h.setState({
          fileName: file.name,
          fileSize: file.size,
          packets: [],
          selectedPacket: null,
          filter: '',
          protoFilter: 'ALL',
          sortCol: 'num',
          sortDir: 1,
          page: 1,
          perPage: 100
        });

        h.showLoading('Decompressing capture...');

        try {
          let buffer = content;
          if (!(buffer instanceof ArrayBuffer)) {
            // Ensure we have an ArrayBuffer if SDK passed something else (rare)
            if (buffer.buffer instanceof ArrayBuffer) buffer = buffer.buffer;
          }

          const magicBytes = new Uint8Array(buffer.slice(0, 2));
          const isGzip = file.name.endsWith('.gz') || (magicBytes[0] === 0x1F && magicBytes[1] === 0x8B);
          
          if (isGzip) {
            const pakoLib = await _pakoPromise;
            if (!pakoLib) throw new Error('Decompression library failed to load.');
            buffer = pakoLib.ungzip(new Uint8Array(buffer)).buffer;
          }

          h.showLoading('Analyzing packet frames...');
          await new Promise(r => setTimeout(r, 20)); // UI breathe
          
          const result = await parsePcap(buffer);
          
          if (!result.packets || result.packets.length === 0) {
            h.hideLoading();
            renderEmptyState(h);
            return;
          }

          h.setState('packets', result.packets);
          h.hideLoading();
          renderUI(h);
        } catch (err) {
          console.error('[PCAP] Error:', err);
          h.showError('Could not open PCAP file', 'The file may be corrupted, encrypted, or in an unsupported format. Standard PCAP or PCAPNG files are required.');
        }
      },

      onDestroy: function (h) {
        if (_cleanup) _cleanup();
        h.setState({ packets: [], selectedPacket: null });
      }
    });

    function renderUI(h) {
      const state = h.getState();
      const packets = state.packets || [];
      const filter = (state.filter || '').toLowerCase();
      const protoFilter = state.protoFilter || 'ALL';
      const sortCol = state.sortCol || 'num';
      const sortDir = state.sortDir || 1;

      // Filtering
      const filtered = packets.filter(p => {
        const matchesText = !filter || 
          p.src.toLowerCase().includes(filter) || 
          p.dst.toLowerCase().includes(filter) || 
          p.info.toLowerCase().includes(filter) || 
          p.proto.toLowerCase().includes(filter);
        const matchesProto = protoFilter === 'ALL' || p.proto === protoFilter;
        return matchesText && matchesProto;
      });

      // Sorting
      filtered.sort((a, b) => {
        let valA = a[sortCol];
        let valB = b[sortCol];
        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        if (valA < valB) return -1 * sortDir;
        if (valA > valB) return 1 * sortDir;
        return 0;
      });

      // Pagination
      const page = state.page || 1;
      const perPage = state.perPage || 100;
      const totalPages = Math.ceil(filtered.length / perPage);
      const start = (page - 1) * perPage;
      const currentPackets = filtered.slice(start, start + perPage);

      const protos = {};
      packets.forEach(p => protos[p.proto] = (protos[p.proto] || 0) + 1);
      const sortedProtos = Object.entries(protos).sort((a, b) => b[1] - a[1]);

      const html = `
        <div class="animate-in fade-in duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${packets.length.toLocaleString()} packets detected</span>
          </div>

          <!-- Summary Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            ${sortedProtos.slice(0, 6).map(([proto, count]) => `
              <div class="px-3 py-2 bg-white border border-surface-100 rounded-lg shadow-sm">
                <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">${proto}</div>
                <div class="text-lg font-bold text-surface-800">${count.toLocaleString()}</div>
              </div>
            `).join('')}
          </div>

          <!-- Controls Section -->
          <div class="flex flex-col md:flex-row gap-4 mb-6">
            <div class="flex-grow">
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg class="h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input type="text" id="pcap-search" placeholder="Search by IP, Protocol, or Info text..." 
                  class="block w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                  value="${escapeHtml(state.filter || '')}">
              </div>
            </div>
            <div class="w-full md:w-64">
              <select id="proto-select" class="block w-full px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all cursor-pointer">
                <option value="ALL" ${protoFilter === 'ALL' ? 'selected' : ''}>All Protocols</option>
                ${sortedProtos.map(([proto, count]) => `<option value="${proto}" ${protoFilter === proto ? 'selected' : ''}>${proto} (${count})</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- U10. Section headers with counts -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800 flex items-center gap-2">
              Captured Traffic
            </h3>
            <span class="text-xs font-medium bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">${filtered.length.toLocaleString()} matches</span>
          </div>

          <!-- U7. Tables -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm mb-4">
            <table class="min-w-full text-sm font-mono border-collapse">
              <thead>
                <tr class="bg-surface-50">
                  ${renderHeader('No.', 'num', sortCol, sortDir)}
                  ${renderHeader('Time', 'time', sortCol, sortDir)}
                  ${renderHeader('Source', 'src', sortCol, sortDir)}
                  ${renderHeader('Destination', 'dst', sortCol, sortDir)}
                  ${renderHeader('Protocol', 'proto', sortCol, sortDir)}
                  ${renderHeader('Length', 'len', sortCol, sortDir)}
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Info</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${currentPackets.length === 0 ? `
                  <tr>
                    <td colspan="7" class="px-4 py-16 text-center text-surface-400 font-sans italic">
                      No matching packets found.
                    </td>
                  </tr>
                ` : currentPackets.map(p => `
                  <tr class="packet-row group transition-colors cursor-pointer even:bg-surface-50/50 hover:bg-brand-50 ${state.selectedPacket?.num === p.num ? 'bg-brand-50/80' : ''}" data-num="${p.num}">
                    <td class="px-4 py-2.5 text-surface-400">${p.num}</td>
                    <td class="px-4 py-2.5 text-surface-500 whitespace-nowrap">${p.time.toFixed(4)}</td>
                    <td class="px-4 py-2.5 text-surface-900 font-medium whitespace-nowrap">${escapeHtml(p.src)}</td>
                    <td class="px-4 py-2.5 text-surface-900 font-medium whitespace-nowrap">${escapeHtml(p.dst)}</td>
                    <td class="px-4 py-2.5">
                      <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getProtoClass(p.proto)}">${p.proto}</span>
                    </td>
                    <td class="px-4 py-2.5 text-surface-500">${p.len}</td>
                    <td class="px-4 py-2.5 text-surface-600 truncate max-w-[200px] xl:max-w-md" title="${escapeHtml(p.info)}">${escapeHtml(p.info)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          ${totalPages > 1 ? `
            <div class="flex items-center justify-between px-4 py-3 bg-white border border-surface-200 rounded-xl mb-8">
              <div class="text-xs text-surface-500">
                Showing <span class="font-bold">${start + 1}</span> to <span class="font-bold">${Math.min(start + perPage, filtered.length)}</span> of <span class="font-bold">${filtered.length}</span> packets
              </div>
              <div class="flex gap-2">
                <button id="prev-page" class="px-3 py-1.5 text-xs font-semibold bg-white border border-surface-200 rounded-lg hover:bg-surface-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all" ${page === 1 ? 'disabled' : ''}>Previous</button>
                <button id="next-page" class="px-3 py-1.5 text-xs font-semibold bg-white border border-surface-200 rounded-lg hover:bg-surface-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all" ${page === totalPages ? 'disabled' : ''}>Next</button>
              </div>
            </div>
          ` : ''}

          <!-- Packet Inspector -->
          <div id="inspector" class="${state.selectedPacket ? 'block' : 'hidden'} mt-8 animate-in slide-in-from-bottom-4 duration-300">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-surface-800 flex items-center gap-2">
                <span class="w-6 h-6 rounded bg-brand-600 text-white text-[10px] flex items-center justify-center font-mono">#${state.selectedPacket?.num}</span>
                Packet Details
              </h3>
              <button id="close-inspector" class="text-surface-400 hover:text-surface-600 transition-colors">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-4">
                <!-- U8. Code/pre blocks -->
                <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950 shadow-sm">
                  <div class="px-4 py-2 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Hex Dump</span>
                    <button id="copy-hex" class="text-[10px] font-bold text-brand-400 hover:text-brand-300 transition-all uppercase">Copy Bytes</button>
                  </div>
                  <pre id="hex-view" class="p-4 text-[10px] md:text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed"></pre>
                </div>
              </div>

              <div class="space-y-4">
                <!-- U9. Content cards -->
                <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all">
                  <h4 class="text-[11px] font-bold text-surface-400 uppercase tracking-widest mb-4">Protocol Analysis</h4>
                  <div id="inspector-analysis" class="space-y-4"></div>
                </div>
                
                <div class="rounded-xl border border-surface-200 p-5 bg-surface-50 shadow-sm text-xs font-mono">
                  <h4 class="text-[11px] font-bold font-sans text-surface-400 uppercase tracking-widest mb-4">Metadata</h4>
                  <div id="inspector-meta" class="space-y-2 text-surface-600"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      const el = h.getRenderEl();

      // Events
      const searchInput = el.querySelector('#pcap-search');
      if (searchInput) {
        let timeout;
        searchInput.oninput = (e) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            h.setState({ filter: e.target.value, page: 1 });
            renderUI(h);
            const input = h.getRenderEl().querySelector('#pcap-search');
            if (input) {
              input.focus();
              input.setSelectionRange(e.target.value.length, e.target.value.length);
            }
          }, 300);
        };
      }

      const protoSelect = el.querySelector('#proto-select');
      if (protoSelect) {
        protoSelect.onchange = (e) => {
          h.setState({ protoFilter: e.target.value, page: 1 });
          renderUI(h);
        };
      }

      el.querySelectorAll('.sort-header').forEach(header => {
        header.onclick = () => {
          const col = header.dataset.col;
          const currentDir = h.getState().sortDir || 1;
          const currentCol = h.getState().sortCol;
          h.setState({ 
            sortCol: col, 
            sortDir: currentCol === col ? currentDir * -1 : 1,
            page: 1
          });
          renderUI(h);
        };
      });

      el.querySelectorAll('.packet-row').forEach(row => {
        row.onclick = () => {
          const num = parseInt(row.dataset.num);
          const packet = packets.find(p => p.num === num);
          if (packet) {
            h.setState('selectedPacket', packet);
            renderUI(h);
            const inspector = h.getRenderEl().querySelector('#inspector');
            if (inspector) inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
      });

      const closeBtn = el.querySelector('#close-inspector');
      if (closeBtn) closeBtn.onclick = () => { h.setState('selectedPacket', null); renderUI(h); };

      const prevBtn = el.querySelector('#prev-page');
      if (prevBtn) prevBtn.onclick = () => { h.setState('page', Math.max(1, page - 1)); renderUI(h); };

      const nextBtn = el.querySelector('#next-page');
      if (nextBtn) nextBtn.onclick = () => { h.setState('page', Math.min(totalPages, page + 1)); renderUI(h); };

      if (h.getState().selectedPacket) {
        updateInspector(h.getState().selectedPacket, h);
      }
    }

    function renderHeader(label, col, currentCol, currentDir) {
      const isSorted = currentCol === col;
      return `
        <th class="sort-header sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group" data-col="${col}">
          <div class="flex items-center gap-1">
            ${label}
            <span class="text-[10px] ${isSorted ? 'text-brand-600' : 'text-surface-300 opacity-0 group-hover:opacity-100'}">
              ${isSorted ? (currentDir === 1 ? '▲' : '▼') : '▲'}
            </span>
          </div>
        </th>
      `;
    }

    function updateInspector(packet, h) {
      const el = h.getRenderEl();
      const hexView = el.querySelector('#hex-view');
      const analysis = el.querySelector('#inspector-analysis');
      const meta = el.querySelector('#inspector-meta');
      
      if (!hexView) return;

      let hexLines = [];
      const data = packet.data;
      for (let i = 0; i < data.length; i += 16) {
        const chunk = data.slice(i, i + 16);
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
        hexLines.push(`<span class="text-gray-600">${offset}</span>  ${hex.padEnd(47)}  <span class="text-brand-500/80">${escapeHtml(ascii)}</span>`);
      }
      hexView.innerHTML = hexLines.join('\n');

      analysis.innerHTML = `
        <div class="flex justify-between items-center mb-4">
          <span class="text-xs text-surface-500">Protocol</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getProtoClass(packet.proto)}">${packet.proto}</span>
        </div>
        <div class="space-y-4">
          <div>
            <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Source</div>
            <div class="text-surface-900 font-mono text-xs bg-surface-50 p-2 rounded border border-surface-100 break-all select-all">${escapeHtml(packet.src)}</div>
          </div>
          <div>
            <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Destination</div>
            <div class="text-surface-900 font-mono text-xs bg-surface-50 p-2 rounded border border-surface-100 break-all select-all">${escapeHtml(packet.dst)}</div>
          </div>
          <div>
            <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Summary</div>
            <div class="text-surface-700 text-xs bg-brand-50/30 p-3 rounded-lg border border-brand-100/50 italic">${escapeHtml(packet.info)}</div>
          </div>
        </div>
      `;

      meta.innerHTML = `
        <div class="flex justify-between py-1 border-b border-surface-200/50"><span>Total Length:</span> <span class="text-surface-900 font-bold">${packet.len} B</span></div>
        <div class="flex justify-between py-1 border-b border-surface-200/50"><span>Captured:</span> <span class="text-surface-900 font-bold">${packet.data.length} B</span></div>
        <div class="flex justify-between py-1"><span>Timestamp:</span> <span class="text-surface-900 font-bold">${packet.time.toFixed(6)}s</span></div>
      `;

      const copyHexBtn = el.querySelector('#copy-hex');
      if (copyHexBtn) {
        copyHexBtn.onclick = (e) => {
          const textOnly = hexLines.map(line => line.replace(/<[^>]*>/g, '')).join('\n');
          h.copyToClipboard(textOnly, e.target);
        };
      }
    }

    function renderEmptyState(h) {
      const state = h.getState();
      h.render(`
        <div class="animate-in fade-in duration-700">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-8">
            <span class="font-semibold text-surface-800">${escapeHtml(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.fileSize)}</span>
          </div>
          <div class="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-surface-200 border-dashed rounded-3xl bg-surface-50/50">
            <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-surface-900 mb-2">No packets found</h3>
            <p class="text-surface-500 max-w-sm mx-auto text-sm leading-relaxed">
              We couldn't parse any network frames from this capture. Please ensure it's a standard PCAP or PCAPNG file and not encrypted.
            </p>
          </div>
        </div>
      `);
    }

    // --- Parser Implementation ---

    async function parsePcap(buffer) {
      const dv = new DataView(buffer);
      if (buffer.byteLength < 24) throw new Error('File header too small');

      const magic = dv.getUint32(0, true);
      let isLittle = true;
      let isPcapNg = false;
      let nano = false;

      if (magic === 0xA1B2C3D4) isLittle = false;
      else if (magic === 0xD4C3B2A1) isLittle = true;
      else if (magic === 0xA1B23C4D) { isLittle = false; nano = true; }
      else if (magic === 0x4D3CB2A1) { isLittle = true; nano = true; }
      else if (magic === 0x0A0D0D0A) { isPcapNg = true; isLittle = true; }
      else throw new Error('Unsupported PCAP format');

      if (isPcapNg) return parsePcapNg(buffer, isLittle);

      const network = dv.getUint32(20, isLittle);
      const packets = [];
      let pos = 24;
      let startTime = null;
      const MAX_PACKETS = 50000; 

      while (pos + 16 <= buffer.byteLength && packets.length < MAX_PACKETS) {
        const tsSec = dv.getUint32(pos, isLittle);
        const tsSub = dv.getUint32(pos + 4, isLittle);
        const inclLen = dv.getUint32(pos + 8, isLittle);
        const origLen = dv.getUint32(pos + 12, isLittle);
        
        if (pos + 16 + inclLen > buffer.byteLength) break;
        
        const time = tsSec + (nano ? tsSub / 1e9 : tsSub / 1e6);
        if (startTime === null) startTime = time;
        
        const data = new Uint8Array(buffer, pos + 16, inclLen);
        const decoded = decodePacket(data, network);
        
        packets.push({
          num: packets.length + 1,
          time: time - startTime,
          len: origLen,
          src: decoded.src,
          dst: decoded.dst,
          proto: decoded.proto,
          info: decoded.info,
          data: data
        });
        pos += 16 + inclLen;
      }

      return { packets };
    }

    function parsePcapNg(buffer, isLittle) {
      const dv = new DataView(buffer);
      let offset = 0;
      const packets = [];
      let startTime = null;
      let ifaceLinkType = 1;
      const MAX_PACKETS = 50000;

      while (offset + 8 <= buffer.byteLength && packets.length < MAX_PACKETS) {
        const type = dv.getUint32(offset, isLittle);
        const len = dv.getUint32(offset + 4, isLittle);
        if (len < 8 || offset + len > buffer.byteLength) break;

        if (type === 0x00000001) { 
          ifaceLinkType = dv.getUint16(offset + 8, isLittle);
        } else if (type === 0x00000006 || type === 0x00000003) { 
          const isEPB = type === 0x06;
          const tsHigh = isEPB ? dv.getUint32(offset + 12, isLittle) : 0;
          const tsLow = isEPB ? dv.getUint32(offset + 16, isLittle) : 0;
          const capLen = isEPB ? dv.getUint32(offset + 20, isLittle) : dv.getUint32(offset + 8, isLittle);
          const wireLen = isEPB ? dv.getUint32(offset + 24, isLittle) : capLen;
          
          const time = (tsHigh * 4294967296 + tsLow) / 1000000;
          if (startTime === null) startTime = time;
          
          const dataOffset = isEPB ? 28 : 12;
          if (offset + dataOffset + capLen <= buffer.byteLength) {
            const data = new Uint8Array(buffer, offset + dataOffset, capLen);
            const decoded = decodePacket(data, ifaceLinkType);
            packets.push({ 
              num: packets.length + 1, 
              time: time - startTime, 
              len: wireLen, 
              src: decoded.src, 
              dst: decoded.dst, 
              proto: decoded.proto, 
              info: decoded.info, 
              data: data 
            });
          }
        }
        offset += (len + 3) & ~3;
      }
      return { packets };
    }

    function decodePacket(data, network) {
      let res = { src: 'L2', dst: 'L2', proto: 'RAW', info: 'Unknown Packet' };
      let ethType = 0;
      let payloadOffset = 0;

      if (network === 1 && data.length >= 14) {
        ethType = (data[12] << 8) | data[13];
        payloadOffset = 14;
        res.src = formatMAC(data.slice(6, 12));
        res.dst = formatMAC(data.slice(0, 6));
        res.proto = 'ETH';
      } else if (network === 113 && data.length >= 16) {
        ethType = (data[14] << 8) | data[15];
        payloadOffset = 16;
        res.proto = 'SLL';
      } else return res;

      if (ethType === 0x0800 && data.length >= payloadOffset + 20) {
        const ihl = (data[payloadOffset] & 0x0F) * 4;
        const proto = data[payloadOffset + 9];
        res.src = data.slice(payloadOffset + 12, payloadOffset + 16).join('.');
        res.dst = data.slice(payloadOffset + 16, payloadOffset + 20).join('.');
        res.proto = 'IPv4';
        decodeL4(data, payloadOffset + ihl, proto, res);
      } else if (ethType === 0x86DD && data.length >= payloadOffset + 40) {
        const next = data[payloadOffset + 6];
        res.src = formatIPv6(data.slice(payloadOffset + 8, payloadOffset + 24));
        res.dst = formatIPv6(data.slice(payloadOffset + 24, payloadOffset + 40));
        res.proto = 'IPv6';
        decodeL4(data, payloadOffset + 40, next, res);
      } else if (ethType === 0x0806 && data.length >= payloadOffset + 28) {
        res.proto = 'ARP';
        const op = data[payloadOffset + 7];
        const spa = data.slice(payloadOffset + 14, payloadOffset + 18).join('.');
        const tpa = data.slice(payloadOffset + 24, payloadOffset + 28).join('.');
        res.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : `Reply: ${spa} is at ${formatMAC(data.slice(payloadOffset + 8, payloadOffset + 14))}`;
      }
      return res;
    }

    function decodeL4(data, offset, proto, res) {
      if (data.length < offset + 4) return;
      const sp = (data[offset] << 8) | data[offset + 1];
      const dp = (data[offset + 2] << 8) | data[offset + 3];

      if (proto === 6) { 
        res.proto = 'TCP';
        res.src += `:${sp}`;
        res.dst += `:${dp}`;
        if (data.length >= offset + 14) {
          const flags = data[offset + 13];
          const f = [];
          if (flags & 0x02) f.push('SYN');
          if (flags & 0x10) f.push('ACK');
          if (flags & 0x01) f.push('FIN');
          if (flags & 0x04) f.push('RST');
          if (flags & 0x08) f.push('PSH');
          res.info = f.join(' ');
          
          const dataOff = (data[offset + 12] >> 4) * 4;
          if (data.length > offset + dataOff) {
            const firstByte = data[offset + dataOff];
            if (dp === 80 || sp === 80) res.proto = 'HTTP';
            else if (dp === 443 || sp === 443 || firstByte === 0x16) res.proto = 'TLS';
            else if (dp === 21 || sp === 21) res.proto = 'FTP';
            else if (dp === 22 || sp === 22) res.proto = 'SSH';
          }
        }
      } else if (proto === 17) { 
        res.proto = 'UDP';
        res.src += `:${sp}`;
        res.dst += `:${dp}`;
        if (dp === 53 || sp === 53) res.proto = 'DNS';
        else if (dp === 67 || dp === 68 || sp === 67 || sp === 68) res.proto = 'DHCP';
        else if (dp === 123 || sp === 123) res.proto = 'NTP';
        else if (dp === 161 || sp === 161) res.proto = 'SNMP';
        else if (dp === 5353 || sp === 5353) res.proto = 'MDNS';
        else if (dp === 1900 || sp === 1900) res.proto = 'SSDP';
        else if (dp === 5060 || sp === 5060) res.proto = 'SIP';
      } else if (proto === 1) {
        res.proto = 'ICMP';
        const type = data[offset];
        res.info = type === 8 ? 'Echo Request' : type === 0 ? 'Echo Reply' : `Type ${type}`;
      } else if (proto === 58) {
        res.proto = 'ICMPv6';
        res.info = `Type ${data[offset]}`;
      }
    }

    // --- Utility Functions ---

    function formatIPv6(b) {
      const p = [];
      for (let i = 0; i < 16; i += 2) p.push(((b[i] << 8) | b[i + 1]).toString(16));
      return p.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
    }

    function formatMAC(b) {
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(':');
    }

    function getProtoClass(p) {
      const map = {
        'TCP': 'bg-blue-50 text-blue-600 border border-blue-100',
        'UDP': 'bg-sky-50 text-sky-600 border border-sky-100',
        'ICMP': 'bg-purple-50 text-purple-600 border border-purple-100',
        'ICMPv6': 'bg-purple-50 text-purple-600 border border-purple-100',
        'ARP': 'bg-orange-50 text-orange-600 border border-orange-100',
        'HTTP': 'bg-green-50 text-green-600 border border-green-100',
        'TLS': 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        'DNS': 'bg-indigo-50 text-indigo-600 border border-indigo-100',
        'DHCP': 'bg-yellow-50 text-yellow-600 border border-yellow-100',
        'SSH': 'bg-zinc-100 text-zinc-700 border border-zinc-200',
        'MDNS': 'bg-teal-50 text-teal-600 border border-teal-100'
      };
      return map[p] || 'bg-surface-50 text-surface-500 border border-surface-100';
    }

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
  };
})();
