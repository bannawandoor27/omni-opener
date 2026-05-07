(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _pako = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pcap,.pcapng,.cap,.gz',
      binary: true,
      dropLabel: 'Drop a network capture (PCAP/PCAPNG)',
      infoHtml: 'Professional browser-based packet analyzer. Supports PCAP and PCAPNG formats with protocol decoding for Ethernet, IPv4/v6, TCP, UDP, ICMP, DNS, and more. All parsing happens locally for maximum privacy.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const { packets } = h.getState();
            if (!packets || packets.length === 0) return h.showError('No data', 'Load a capture file first.');
            
            h.showLoading('Formatting JSON (Top 5,000)...');
            // Use setTimeout to allow UI to update
            setTimeout(() => {
              try {
                const exportData = packets.slice(0, 5000).map(p => ({
                  no: p.num,
                  time: p.time.toFixed(6),
                  src: p.src,
                  dst: p.dst,
                  proto: p.proto,
                  len: p.len,
                  info: p.info
                }));
                h.copyToClipboard(JSON.stringify(exportData, null, 2), btn);
              } catch (e) {
                h.showError('Copy failed', 'The dataset is too large to copy as JSON.');
              } finally {
                h.hideLoading();
              }
            }, 50);
          }
        },
        {
          label: '📥 Download CSV',
          id: 'download-csv',
          onClick: function (h) {
            const { packets, fileName } = h.getState();
            if (!packets || packets.length === 0) return;
            
            h.showLoading('Generating CSV...');
            setTimeout(() => {
              try {
                const head = ['No.', 'Time', 'Source', 'Destination', 'Protocol', 'Length', 'Info'];
                const rows = packets.map(p => [
                  p.num,
                  p.time.toFixed(6),
                  `"${p.src}"`,
                  `"${p.dst}"`,
                  p.proto,
                  p.len,
                  `"${(p.info || '').replace(/"/g, '""')}"`
                ]);
                const csvContent = [head.join(','), ...rows.map(r => r.join(','))].join('\n');
                const name = (fileName || 'capture').replace(/\.[^/.]+$/, '') + '.csv';
                
                const blob = new Blob([csvContent], { type: 'text/csv' });
                h.download(name, blob, 'text/csv');
              } catch (e) {
                h.showError('Download failed', 'Could not generate CSV file.');
              } finally {
                h.hideLoading();
              }
            }, 50);
          }
        }
      ],

      onInit: function (h) {
        if (typeof window.pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', () => {
            _pako = window.pako;
          });
        } else {
          _pako = window.pako;
        }
      },

      onFile: async function _onFileFn(file, content, h) {
        h.showLoading('Analyzing network capture...');
        
        // B5: Revoke any previous URLs if we had them (not applicable here yet, but good practice)
        
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

        try {
          // B2: ArrayBuffer safety
          let buffer = content;
          if (!(buffer instanceof ArrayBuffer)) {
            if (buffer && buffer.buffer instanceof ArrayBuffer) {
              buffer = buffer.buffer;
            } else {
              throw new Error('Invalid binary data provided.');
            }
          }

          if (buffer.byteLength < 24) throw new Error('File is too small to be a valid PCAP capture.');

          const magicView = new Uint8Array(buffer.slice(0, 4));
          const isGzip = (magicView[0] === 0x1F && magicView[1] === 0x8B);
          
          if (isGzip) {
            h.showLoading('Decompressing GZIP capture...');
            // B1: Robust CDN check
            if (!_pako && !window.pako) {
              await new Promise((resolve, reject) => {
                let attempts = 0;
                const check = () => { 
                  if (window.pako) { _pako = window.pako; resolve(); }
                  else if (attempts++ > 100) reject(new Error('Pako decompression library failed to load.'));
                  else setTimeout(check, 50); 
                };
                check();
              });
            }
            if (!_pako) _pako = window.pako;
            
            try {
              buffer = _pako.ungzip(new Uint8Array(buffer)).buffer;
            } catch (e) {
              throw new Error('Failed to decompress GZIP file. It may be corrupted.');
            }
          }

          h.showLoading('Decoding packets...');
          // Yield to UI
          await new Promise(r => setTimeout(r, 16));
          
          const result = await parsePcapData(buffer);
          
          // U5: Empty state handling
          if (!result.packets || result.packets.length === 0) {
            h.hideLoading();
            renderEmptyView(h);
            return;
          }

          h.setState('packets', result.packets);
          h.hideLoading();
          renderMainUI(h);
        } catch (err) {
          console.error('[PCAP] Error:', err);
          // U3: Friendly error message
          h.showError('Could not open capture', err.message || 'The file may be corrupted or in an unsupported format. Try a standard PCAP or PCAPNG file.');
        }
      },

      onDestroy: function (h) {
        h.setState({ packets: [], selectedPacket: null });
      }
    });

    /**
     * UI RENDERING
     */

    function renderMainUI(h) {
      const state = h.getState();
      const packets = state.packets || [];
      const filter = (state.filter || '').toLowerCase();
      const protoFilter = state.protoFilter || 'ALL';
      const sortCol = state.sortCol || 'num';
      const sortDir = state.sortDir || 1;

      // Filtering logic
      const filtered = packets.filter(p => {
        const matchesText = !filter || 
          p.src.toLowerCase().includes(filter) || 
          p.dst.toLowerCase().includes(filter) || 
          p.info.toLowerCase().includes(filter) || 
          p.proto.toLowerCase().includes(filter);
        const matchesProto = protoFilter === 'ALL' || p.proto === protoFilter;
        return matchesText && matchesProto;
      });

      // Sorting logic
      if (sortCol) {
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
      }

      // Pagination
      const page = state.page || 1;
      const perPage = state.perPage || 100;
      const totalPages = Math.ceil(filtered.length / perPage);
      const startIdx = (page - 1) * perPage;
      const currentPackets = filtered.slice(startIdx, startIdx + perPage);

      // Protocol distribution for cards
      const protos = {};
      packets.forEach(p => protos[p.proto] = (protos[p.proto] || 0) + 1);
      const sortedProtos = Object.entries(protos).sort((a, b) => b[1] - a[1]);

      const html = `
        <div class="animate-in fade-in duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${fmtSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.pcap capture</span>
            <span class="text-surface-300 ml-auto hidden md:inline">|</span>
            <span class="font-medium text-surface-700 hidden md:inline">${packets.length.toLocaleString()} packets total</span>
          </div>

          <!-- U10. Section header with count -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Protocol Distribution</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${sortedProtos.length} types detected</span>
          </div>

          <!-- U9. Content cards for protocol filtering -->
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
            ${sortedProtos.slice(0, 6).map(([proto, count]) => {
              const isActive = protoFilter === proto;
              return `
                <div class="p-4 bg-white border ${isActive ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-surface-200'} rounded-xl shadow-sm hover:border-brand-300 hover:shadow-md transition-all cursor-pointer proto-quick-filter group" data-proto="${proto}">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest group-hover:text-brand-500 transition-colors">${proto}</div>
                  <div class="text-xl font-bold text-surface-800">${count.toLocaleString()}</div>
                  <div class="w-full bg-surface-100 h-1 mt-2 rounded-full overflow-hidden">
                    <div class="h-full bg-brand-500" style="width: ${Math.max(2, (count / packets.length) * 100)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="flex flex-col md:flex-row gap-4 mb-6">
            <!-- DATA: live search filter -->
            <div class="relative flex-grow">
              <input type="text" id="pcap-search-input" placeholder="Live search by IP, Protocol, or Info..." 
                class="block w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                value="${esc(state.filter || '')}">
              <div class="absolute left-3.5 top-3.5 text-surface-400">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
            </div>
            <div class="w-full md:w-64">
              <select id="pcap-proto-filter" class="block w-full px-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all cursor-pointer">
                <option value="ALL">All Protocols</option>
                ${sortedProtos.map(([proto, count]) => `<option value="${proto}" ${protoFilter === proto ? 'selected' : ''}>${proto} (${count})</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Capture Log</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length.toLocaleString()} matching</span>
          </div>

          <!-- U7. Table styling -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table class="min-w-full text-sm font-mono">
              <thead>
                <tr class="bg-white">
                  ${renderTh('No.', 'num', sortCol, sortDir)}
                  ${renderTh('Time', 'time', sortCol, sortDir)}
                  ${renderTh('Source', 'src', sortCol, sortDir)}
                  ${renderTh('Destination', 'dst', sortCol, sortDir)}
                  ${renderTh('Protocol', 'proto', sortCol, sortDir)}
                  ${renderTh('Length', 'len', sortCol, sortDir)}
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 font-sans">Info</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${currentPackets.length === 0 ? `
                  <tr>
                    <td colspan="7" class="px-4 py-16 text-center text-surface-400 font-sans italic">
                      <div class="mb-2">No packets match your current filters.</div>
                      <button id="pcap-clear-filters" class="text-brand-600 font-semibold text-xs hover:underline">Clear all filters</button>
                    </td>
                  </tr>
                ` : currentPackets.map(p => {
                  const isSelected = state.selectedPacket?.num === p.num;
                  return `
                    <tr class="packet-row hover:bg-brand-50/50 transition-colors cursor-pointer even:bg-surface-50/30 ${isSelected ? 'bg-brand-50 ring-2 ring-inset ring-brand-200' : ''}" data-num="${p.num}">
                      <td class="px-4 py-2.5 text-surface-400 text-[11px]">${p.num}</td>
                      <td class="px-4 py-2.5 text-surface-500 whitespace-nowrap text-[11px]">${p.time.toFixed(6)}</td>
                      <td class="px-4 py-2.5 text-surface-800 font-medium whitespace-nowrap">${esc(p.src)}</td>
                      <td class="px-4 py-2.5 text-surface-800 font-medium whitespace-nowrap">${esc(p.dst)}</td>
                      <td class="px-4 py-2.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getStyle(p.proto)}">${p.proto}</span>
                      </td>
                      <td class="px-4 py-2.5 text-surface-500">${p.len}</td>
                      <td class="px-4 py-2.5 text-surface-600 truncate max-w-xs xl:max-w-lg font-sans text-xs" title="${esc(p.info)}">${esc(p.info)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          ${totalPages > 1 ? `
            <div class="flex items-center justify-between px-6 py-4 mt-6 bg-surface-50 rounded-xl">
              <div class="text-xs text-surface-500 font-medium">
                Showing <span class="text-surface-900 font-bold">${(startIdx + 1).toLocaleString()}</span> to <span class="text-surface-900 font-bold">${Math.min(startIdx + perPage, filtered.length).toLocaleString()}</span> of <span class="text-surface-900 font-bold">${filtered.length.toLocaleString()}</span>
              </div>
              <div class="flex gap-2">
                <button id="pcap-prev-page" class="px-4 py-2 text-xs font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 disabled:opacity-40 transition-all shadow-sm" ${page === 1 ? 'disabled' : ''}>Previous</button>
                <div class="flex items-center px-4 text-xs font-bold text-surface-400">Page ${page} of ${totalPages}</div>
                <button id="pcap-next-page" class="px-4 py-2 text-xs font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 disabled:opacity-40 transition-all shadow-sm" ${page === totalPages ? 'disabled' : ''}>Next</button>
              </div>
            </div>
          ` : ''}

          <!-- Packet Inspector -->
          <div id="pcap-inspector" class="${state.selectedPacket ? 'block' : 'hidden'} mt-10 space-y-6 animate-in slide-in-from-bottom-6 duration-300 scroll-mt-8">
            <div class="flex items-center justify-between border-b border-surface-200 pb-4">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div>
                  <h3 class="text-lg font-bold text-surface-900 leading-tight">Packet Details #${state.selectedPacket?.num}</h3>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getStyle(state.selectedPacket?.proto)}">${state.selectedPacket?.proto}</span>
                    <span class="text-[10px] text-surface-400 font-medium">Captured at T+${state.selectedPacket?.time.toFixed(6)}s</span>
                  </div>
                </div>
              </div>
              <button id="pcap-close-inspector" class="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-xl transition-all">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
              <div class="xl:col-span-2 space-y-4">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-surface-500 uppercase tracking-widest">Hex & ASCII Dump</h4>
                  <div class="flex gap-2">
                    <button id="pcap-download-raw" class="px-3 py-1 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg text-[10px] font-bold uppercase transition-colors">Raw Bin</button>
                    <button id="pcap-copy-hex" class="px-3 py-1 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg text-[10px] font-bold uppercase transition-colors">Copy Hex</button>
                  </div>
                </div>
                <!-- U8. Code/pre block -->
                <div class="rounded-2xl overflow-hidden border border-surface-200 bg-gray-950 shadow-lg">
                  <pre class="p-5 text-[11px] font-mono text-gray-300 overflow-x-auto leading-relaxed selection:bg-brand-500/30" id="pcap-hex-view"></pre>
                </div>
              </div>

              <div class="space-y-6">
                <!-- U9. Content card for analysis -->
                <div class="rounded-2xl border border-surface-200 p-5 bg-white shadow-sm">
                  <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-4 border-b border-surface-50 pb-2">Analysis</h4>
                  <div class="space-y-5" id="pcap-analysis-content"></div>
                </div>
                
                <div class="rounded-2xl border border-surface-200 p-5 bg-surface-50/50">
                  <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-4 border-b border-surface-100 pb-2">Frame Metadata</h4>
                  <div id="pcap-meta-content" class="space-y-3 text-[11px] font-mono"></div>
                </div>

                <div class="p-4 bg-brand-50 rounded-2xl border border-brand-100 flex items-start gap-3">
                  <div class="text-brand-600 mt-0.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <p class="text-[11px] text-brand-800 leading-relaxed font-medium">Packet decoding is performed locally. Your network data never leaves your computer.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      // Event Listeners
      const el = h.getRenderEl();

      const searchInput = el.querySelector('#pcap-search-input');
      if (searchInput) {
        let debounceTimer;
        searchInput.oninput = (e) => {
          const val = e.target.value;
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            h.setState({ filter: val, page: 1 });
            renderMainUI(h);
            // Restore focus and cursor position after re-render
            const input = h.getRenderEl().querySelector('#pcap-search-input');
            if (input) {
              input.focus();
              input.setSelectionRange(val.length, val.length);
            }
          }, 300);
        };
      }

      el.querySelector('#pcap-proto-filter')?.addEventListener('change', (e) => {
        h.setState({ protoFilter: e.target.value, page: 1 });
        renderMainUI(h);
      });

      el.querySelector('#pcap-clear-filters')?.addEventListener('click', () => {
        h.setState({ filter: '', protoFilter: 'ALL', page: 1 });
        renderMainUI(h);
      });

      el.querySelectorAll('.proto-quick-filter').forEach(card => {
        card.onclick = () => {
          const proto = card.dataset.proto;
          h.setState({ protoFilter: proto === state.protoFilter ? 'ALL' : proto, page: 1 });
          renderMainUI(h);
        };
      });

      el.querySelectorAll('.sortable-header').forEach(header => {
        header.onclick = () => {
          const col = header.dataset.col;
          h.setState({ 
            sortCol: col, 
            sortDir: state.sortCol === col ? state.sortDir * -1 : 1,
            page: 1
          });
          renderMainUI(h);
        };
      });

      el.querySelectorAll('.packet-row').forEach(row => {
        row.onclick = () => {
          const num = parseInt(row.dataset.num);
          const packet = packets.find(x => x.num === num);
          if (packet) {
            h.setState('selectedPacket', packet);
            renderMainUI(h);
            const inspector = h.getRenderEl().querySelector('#pcap-inspector');
            if (inspector) inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
      });

      el.querySelector('#pcap-close-inspector')?.addEventListener('click', () => { 
        h.setState('selectedPacket', null); 
        renderMainUI(h); 
      });

      el.querySelector('#pcap-prev-page')?.addEventListener('click', () => { 
        h.setState('page', Math.max(1, (state.page || 1) - 1)); 
        renderMainUI(h); 
      });

      el.querySelector('#pcap-next-page')?.addEventListener('click', () => { 
        h.setState('page', Math.min(totalPages, (state.page || 1) + 1)); 
        renderMainUI(h); 
      });

      el.querySelector('#pcap-copy-hex')?.addEventListener('click', (e) => {
        if (!state.selectedPacket) return;
        const hex = Array.from(state.selectedPacket.data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        h.copyToClipboard(hex, e.target);
      });

      el.querySelector('#pcap-download-raw')?.addEventListener('click', () => {
        if (!state.selectedPacket) return;
        const p = state.selectedPacket;
        const blob = new Blob([p.data], { type: 'application/octet-stream' });
        h.download(`packet_${p.num}.bin`, blob, 'application/octet-stream');
      });

      if (state.selectedPacket) {
        updateInspector(state.selectedPacket, h);
      }
    }

    function renderTh(label, col, currentCol, currentDir) {
      const isSorted = currentCol === col;
      return `
        <th class="sortable-header sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 group transition-all font-sans" data-col="${col}">
          <div class="flex items-center gap-2">
            ${label}
            <span class="text-[10px] ${isSorted ? 'text-brand-600 opacity-100' : 'text-surface-300 opacity-0 group-hover:opacity-100'} transition-all transform ${isSorted && currentDir === -1 ? 'rotate-180' : ''}">
              ▲
            </span>
          </div>
        </th>
      `;
    }

    function updateInspector(packet, h) {
      const el = h.getRenderEl();
      const hexView = el.querySelector('#pcap-hex-view');
      const analysis = el.querySelector('#pcap-analysis-content');
      const meta = el.querySelector('#pcap-meta-content');
      
      if (!hexView) return;

      // Hex Dump Generator
      const lines = [];
      const data = packet.data;
      for (let i = 0; i < data.length; i += 16) {
        const chunk = data.slice(i, i + 16);
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
        lines.push(`<span class="text-gray-600 select-none opacity-50 font-sans">${offset}</span>  <span class="text-gray-300">${hex.padEnd(47)}</span>  <span class="text-brand-400 font-sans">${esc(ascii)}</span>`);
      }
      hexView.innerHTML = lines.join('\n');

      analysis.innerHTML = `
        <div class="group">
          <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Source</div>
          <div class="text-surface-900 font-mono text-xs p-3 bg-surface-50 rounded-xl border border-surface-100 break-all font-bold shadow-inner">${esc(packet.src)}</div>
        </div>
        <div class="group">
          <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Destination</div>
          <div class="text-surface-900 font-mono text-xs p-3 bg-surface-50 rounded-xl border border-surface-100 break-all font-bold shadow-inner">${esc(packet.dst)}</div>
        </div>
        <div class="group">
          <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Protocol Info</div>
          <div class="text-surface-700 text-xs italic leading-relaxed bg-brand-50/40 p-3 rounded-xl border border-brand-100/50">${esc(packet.info)}</div>
        </div>
      `;

      meta.innerHTML = `
        <div class="flex justify-between border-b border-surface-200/50 pb-2">
          <span class="text-surface-500">Wire Length</span>
          <span class="text-surface-900 font-bold">${packet.len} bytes</span>
        </div>
        <div class="flex justify-between border-b border-surface-200/50 py-2">
          <span class="text-surface-500">Captured Length</span>
          <span class="text-surface-900 font-bold">${packet.data.length} bytes</span>
        </div>
        <div class="flex justify-between pt-1">
          <span class="text-surface-500">Epoch Time</span>
          <span class="text-surface-900 font-bold">${packet.time.toFixed(9)}s</span>
        </div>
      `;
    }

    function renderEmptyView(h) {
      const state = h.getState();
      h.render(`
        <div class="animate-in fade-in duration-500">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-12">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${fmtSize(state.fileSize)}</span>
          </div>
          <div class="flex flex-col items-center justify-center py-24 text-center border-2 border-surface-200 border-dashed rounded-3xl bg-surface-50/30">
            <div class="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-surface-200 mb-6 shadow-sm">
              <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h3 class="text-2xl font-bold text-surface-900 mb-3">No packets found</h3>
            <p class="text-surface-500 max-w-sm mx-auto text-sm leading-relaxed">The network capture file appears to be empty or uses an unsupported format. Try a standard PCAP or PCAPNG file.</p>
          </div>
        </div>
      `);
    }

    /**
     * PCAP PARSER LOGIC
     */

    async function parsePcapData(buffer) {
      const dv = new DataView(buffer);
      if (buffer.byteLength < 8) throw new Error('File too short to be a valid capture.');
      
      const magic = dv.getUint32(0, true);
      let isLittle = true;
      let isNg = false;
      let isNano = false;

      if (magic === 0xA1B2C3D4) isLittle = false;
      else if (magic === 0xD4C3B2A1) isLittle = true;
      else if (magic === 0xA1B23C4D) { isLittle = false; isNano = true; }
      else if (magic === 0x4D3CB2A1) { isLittle = true; isNano = true; }
      else if (magic === 0x0A0D0D0A) { isNg = true; isLittle = true; }
      else throw new Error('Unsupported PCAP magic: 0x' + magic.toString(16).toUpperCase());

      if (isNg) return parseNg(buffer, isLittle);

      if (buffer.byteLength < 24) throw new Error('Invalid PCAP global header.');
      const linkType = dv.getUint32(20, isLittle);
      const packets = [];
      let offset = 24;
      let firstTs = null;
      // B7: Truncate very large files for stability
      const MAX_PACKETS = 50000;

      while (offset + 16 <= buffer.byteLength && packets.length < MAX_PACKETS) {
        const tsSec = dv.getUint32(offset, isLittle);
        const tsSub = dv.getUint32(offset + 4, isLittle);
        const capLen = dv.getUint32(offset + 8, isLittle);
        const origLen = dv.getUint32(offset + 12, isLittle);
        
        if (offset + 16 + capLen > buffer.byteLength) break;
        
        const time = tsSec + (isNano ? tsSub / 1e9 : tsSub / 1e6);
        if (firstTs === null) firstTs = time;
        
        const data = new Uint8Array(buffer, offset + 16, capLen);
        const decoded = decodePacket(data, linkType);
        
        packets.push({
          num: packets.length + 1,
          time: time - firstTs,
          len: origLen,
          src: decoded.src,
          dst: decoded.dst,
          proto: decoded.proto,
          info: decoded.info,
          data: data
        });
        offset += 16 + capLen;
      }
      return { packets };
    }

    function parseNg(buffer, isLittle) {
      const dv = new DataView(buffer);
      let offset = 0;
      const packets = [];
      let firstTs = null;
      let linkType = 1;
      const MAX_PACKETS = 50000;

      while (offset + 8 <= buffer.byteLength && packets.length < MAX_PACKETS) {
        const type = dv.getUint32(offset, isLittle);
        const len = dv.getUint32(offset + 4, isLittle);
        if (len < 8 || offset + len > buffer.byteLength) break;

        if (type === 0x01) { // Interface Description Block
          linkType = dv.getUint16(offset + 8, isLittle);
        } else if (type === 0x06 || type === 0x03) { // Enhanced Packet Block or Simple Packet Block
          const isEpb = type === 0x06;
          const tsH = isEpb ? dv.getUint32(offset + 12, isLittle) : 0;
          const tsL = isEpb ? dv.getUint32(offset + 16, isLittle) : 0;
          const capL = isEpb ? dv.getUint32(offset + 20, isLittle) : dv.getUint32(offset + 8, isLittle);
          const wireL = isEpb ? dv.getUint32(offset + 24, isLittle) : capL;
          
          const time = (tsH * 4294967296 + tsL) / 1000000;
          if (firstTs === null) firstTs = time;
          
          const dataOffset = isEpb ? 28 : 12;
          if (offset + dataOffset + capL <= buffer.byteLength) {
            const data = new Uint8Array(buffer, offset + dataOffset, capL);
            const decoded = decodePacket(data, linkType);
            packets.push({ 
              num: packets.length + 1, 
              time: time - firstTs, 
              len: wireL, 
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

    function decodePacket(data, link) {
      let res = { src: 'Unknown', dst: 'Unknown', proto: 'DATA', info: 'Raw payload' };
      let ethType = 0;
      let offset = 0;

      // Link Layers
      if (link === 1 && data.length >= 14) { // Ethernet
        ethType = (data[12] << 8) | data[13];
        offset = 14;
        res.src = fmtMAC(data.slice(6, 12));
        res.dst = fmtMAC(data.slice(0, 6));
        res.proto = 'ETH';
      } else if (link === 113 && data.length >= 16) { // Linux Cooked (SLL)
        ethType = (data[14] << 8) | data[15];
        offset = 16;
        res.proto = 'SLL';
      } else {
        return res;
      }

      // Network Layer
      if (ethType === 0x0800 && data.length >= offset + 20) { // IPv4
        const ihl = (data[offset] & 0x0F) * 4;
        const proto = data[offset + 9];
        res.src = data.slice(offset + 12, offset + 16).join('.');
        res.dst = data.slice(offset + 16, offset + 20).join('.');
        res.proto = 'IPv4';
        decodeL4(data, offset + ihl, proto, res);
      } else if (ethType === 0x86DD && data.length >= offset + 40) { // IPv6
        const nextHeader = data[offset + 6];
        res.src = fmtIPv6(data.slice(offset + 8, offset + 24));
        res.dst = fmtIPv6(data.slice(offset + 24, offset + 40));
        res.proto = 'IPv6';
        decodeL4(data, offset + 40, nextHeader, res);
      } else if (ethType === 0x0806 && data.length >= offset + 28) { // ARP
        res.proto = 'ARP';
        const op = data[offset + 7];
        const spa = data.slice(offset + 14, offset + 18).join('.');
        const tpa = data.slice(offset + 24, offset + 28).join('.');
        res.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : `Reply: ${spa} is at ${fmtMAC(data.slice(offset + 8, offset + 14))}`;
      }
      return res;
    }

    function decodeL4(data, offset, proto, res) {
      if (data.length < offset + 4) return;
      const srcPort = (data[offset] << 8) | data[offset + 1];
      const dstPort = (data[offset + 2] << 8) | data[offset + 3];

      if (proto === 6) { // TCP
        res.proto = 'TCP';
        res.src += `:${srcPort}`;
        res.dst += `:${dstPort}`;
        if (data.length >= offset + 14) {
          const f = data[offset + 13];
          const flags = [];
          if (f & 0x02) flags.push('SYN');
          if (f & 0x10) flags.push('ACK');
          if (f & 0x01) flags.push('FIN');
          if (f & 0x04) flags.push('RST');
          if (f & 0x08) flags.push('PSH');
          res.info = flags.join(' ') || 'TCP Segment';
          
          const tcpDataOffset = (data[offset + 12] >> 4) * 4;
          if (data.length > offset + tcpDataOffset) {
            const firstByte = data[offset + tcpDataOffset];
            if (dstPort === 80 || srcPort === 80) res.proto = 'HTTP';
            else if (dstPort === 443 || srcPort === 443 || firstByte === 0x16) res.proto = 'TLS';
            else if (dstPort === 21 || srcPort === 21) res.proto = 'FTP';
            else if (dstPort === 22 || srcPort === 22) res.proto = 'SSH';
          }
        }
      } else if (proto === 17) { // UDP
        res.proto = 'UDP';
        res.src += `:${srcPort}`;
        res.dst += `:${dstPort}`;
        if (dstPort === 53 || srcPort === 53) res.proto = 'DNS';
        else if (dstPort === 67 || dstPort === 68 || srcPort === 67 || srcPort === 68) res.proto = 'DHCP';
        else if (dstPort === 123 || srcPort === 123) res.proto = 'NTP';
        else if (dstPort === 5353 || srcPort === 5353) res.proto = 'mDNS';
        else res.info = 'UDP Payload';
      } else if (proto === 1) { // ICMP
        res.proto = 'ICMP';
        const type = data[offset];
        res.info = type === 8 ? 'Echo Request' : type === 0 ? 'Echo Reply' : `Type ${type}`;
      } else if (proto === 58) { // ICMPv6
        res.proto = 'ICMPv6';
        res.info = `Type ${data[offset]}`;
      }
    }

    /**
     * HELPERS
     */

    function fmtIPv6(bytes) {
      const parts = [];
      for (let i = 0; i < 16; i += 2) {
        parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
      }
      return parts.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
    }

    function fmtMAC(bytes) {
      return Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join(':');
    }

    function getStyle(p) {
      const styles = {
        'TCP': 'bg-blue-50 text-blue-600 border border-blue-200',
        'UDP': 'bg-sky-50 text-sky-600 border border-sky-200',
        'ICMP': 'bg-purple-50 text-purple-600 border border-purple-200',
        'ARP': 'bg-orange-50 text-orange-600 border border-orange-200',
        'HTTP': 'bg-green-50 text-green-600 border border-green-200',
        'TLS': 'bg-emerald-50 text-emerald-600 border border-emerald-200',
        'DNS': 'bg-indigo-50 text-indigo-600 border border-indigo-200',
        'DHCP': 'bg-yellow-50 text-yellow-600 border border-yellow-200',
        'SSH': 'bg-slate-50 text-slate-600 border border-slate-200'
      };
      return styles[p] || 'bg-surface-50 text-surface-500 border border-surface-200';
    }

    function fmtSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }
  };
})();
