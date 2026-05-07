(function () {
  'use strict';

  /**
   * OmniOpener PCAP Analyzer
   * Professional browser-based network capture tool.
   * Logic: Research -> Strategy -> Execution
   */

  window.initTool = function (toolConfig, mountEl) {
    // Closure variables to avoid global pollution
    let _pako = null;
    let _pakoLoadingPromise = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pcap,.pcapng,.cap,.gz',
      binary: true,
      dropLabel: 'Drop a PCAP or PCAPNG capture file',
      infoHtml: 'Analyze network traffic directly in your browser. Supports PCAP, PCAPNG, and GZipped captures. Protocol decoding for Ethernet, IPv4/v6, TCP, UDP, ICMP, DNS, HTTP, and more. All processing is 100% local and private.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const { packets } = h.getState();
            if (!packets || packets.length === 0) return h.showError('No packets loaded', 'Please upload a valid capture file first.');

            h.showLoading('Preparing JSON (limited to 5,000 packets)...');
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
                h.showError('Export failed', 'The dataset is too large to process as JSON.');
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

            h.showLoading('Generating CSV report...');
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
                const name = (fileName || 'capture').replace(/\.[^/.]+$/, '') + '_report.csv';
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                h.download(name, blob, 'text/csv');
              } catch (e) {
                h.showError('Download failed', 'Could not generate the CSV file.');
              } finally {
                h.hideLoading();
              }
            }, 50);
          }
        }
      ],

      onInit: function (h) {
        // B1, B4: Load pako for .gz support with a promise to avoid race conditions
        if (typeof window.pako === 'undefined' && !_pakoLoadingPromise) {
          _pakoLoadingPromise = new Promise((resolve) => {
            h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', () => {
              _pako = window.pako;
              resolve(_pako);
            });
          });
        } else if (window.pako) {
          _pako = window.pako;
        }
      },

      onFile: async function _onFileFn(file, content, h) {
        // B5: Cleanup previous state/URLs
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

        h.showLoading('Reading capture file...');

        try {
          // B2: Binary safety check
          let buffer = content;
          if (!(buffer instanceof ArrayBuffer)) {
            if (buffer && buffer.buffer instanceof ArrayBuffer) {
              buffer = buffer.buffer;
            } else {
              throw new Error('Expected binary data but received string.');
            }
          }

          if (buffer.byteLength < 24) throw new Error('File is too small to be a valid PCAP capture.');

          // Detect GZIP
          const magicView = new Uint8Array(buffer.slice(0, 2));
          if (magicView[0] === 0x1F && magicView[1] === 0x8B) {
            h.showLoading('Decompressing GZIP capture...');
            if (!_pako) {
              if (_pakoLoadingPromise) {
                _pako = await _pakoLoadingPromise;
              } else {
                throw new Error('Decompression library failed to load.');
              }
            }
            try {
              buffer = _pako.ungzip(new Uint8Array(buffer)).buffer;
            } catch (e) {
              throw new Error('Failed to decompress GZIP stream.');
            }
          }

          h.showLoading('Analyzing network packets...');
          // Yield to UI for smoother loading state
          await new Promise(r => setTimeout(r, 50));

          const result = await parsePcapData(buffer);

          if (!result.packets || result.packets.length === 0) {
            h.hideLoading();
            renderEmptyView(h);
            return;
          }

          h.setState('packets', result.packets);
          h.hideLoading();
          renderMainUI(h);
        } catch (err) {
          console.error('[PCAP] Load Error:', err);
          h.showError('Could not open capture', err.message || 'Unsupported or corrupted packet capture format.');
        }
      },

      onDestroy: function (h) {
        // B5: Cleanup
        h.setState({ packets: [], selectedPacket: null });
        _pako = null;
        _pakoLoadingPromise = null;
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

      // Stats
      const protos = {};
      packets.forEach(p => protos[p.proto] = (protos[p.proto] || 0) + 1);
      const sortedProtos = Object.entries(protos).sort((a, b) => b[1] - a[1]);

      const html = `
        <div class="animate-in fade-in slide-in-from-top-4 duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${fmtSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.pcap capture</span>
            <span class="text-surface-300 ml-auto hidden md:inline">|</span>
            <span class="font-medium text-surface-700 hidden md:inline">${packets.length.toLocaleString()} packets detected</span>
          </div>

          <!-- U10. Section header with counts -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-surface-800">Protocol Breakdown</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${sortedProtos.length} Protocols</span>
          </div>

          <!-- U9. Content cards -->
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
            ${sortedProtos.slice(0, 6).map(([proto, count]) => {
              const isActive = protoFilter === proto;
              const percent = Math.round((count / packets.length) * 100);
              return `
                <div class="p-4 bg-white border ${isActive ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-surface-200'} rounded-xl shadow-sm hover:border-brand-300 hover:shadow-md transition-all cursor-pointer proto-chip group" data-proto="${proto}">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest group-hover:text-brand-500 transition-colors">${proto}</div>
                  <div class="text-xl font-bold text-surface-800">${count.toLocaleString()}</div>
                  <div class="w-full bg-surface-100 h-1.5 mt-3 rounded-full overflow-hidden">
                    <div class="h-full ${getBarColor(proto)}" style="width: ${Math.max(4, percent)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Search & Filter Controls -->
          <div class="flex flex-col md:flex-row gap-4 mb-6">
            <div class="relative flex-grow">
              <input type="text" id="pcap-search" placeholder="Search by IP address, protocol name, or payload info..." 
                class="block w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm"
                value="${esc(state.filter || '')}">
              <div class="absolute left-3.5 top-3.5 text-surface-400">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
            </div>
            <div class="w-full md:w-64">
              <select id="pcap-proto-select" class="block w-full px-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all cursor-pointer shadow-sm">
                <option value="ALL">All Traffic Types</option>
                ${sortedProtos.map(([proto, count]) => `<option value="${proto}" ${protoFilter === proto ? 'selected' : ''}>${proto} (${count})</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-surface-800">Packet Sequence</h3>
            <span class="text-xs text-surface-500 font-medium">${filtered.length.toLocaleString()} matching records</span>
          </div>

          <!-- U7. Beautiful Table -->
          <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm font-mono">
                <thead>
                  <tr class="bg-surface-50/50">
                    ${renderSortTh('No.', 'num', sortCol, sortDir)}
                    ${renderSortTh('Time', 'time', sortCol, sortDir)}
                    ${renderSortTh('Source', 'src', sortCol, sortDir)}
                    ${renderSortTh('Destination', 'dst', sortCol, sortDir)}
                    ${renderSortTh('Protocol', 'proto', sortCol, sortDir)}
                    ${renderSortTh('Length', 'len', sortCol, sortDir)}
                    <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 font-sans">Info</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${currentPackets.length === 0 ? `
                    <tr>
                      <td colspan="7" class="px-4 py-20 text-center text-surface-400 font-sans italic">
                        <div class="mb-2">No packets match the current filter criteria.</div>
                        <button id="pcap-reset" class="text-brand-600 font-semibold text-xs hover:underline">Clear all filters</button>
                      </td>
                    </tr>
                  ` : currentPackets.map(p => {
                    const isSelected = state.selectedPacket?.num === p.num;
                    return `
                      <tr class="pcap-row hover:bg-brand-50/50 transition-colors cursor-pointer even:bg-surface-50/30 ${isSelected ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : ''}" data-num="${p.num}">
                        <td class="px-4 py-2.5 text-surface-400 text-[11px]">${p.num}</td>
                        <td class="px-4 py-2.5 text-surface-500 whitespace-nowrap text-[11px]">${p.time.toFixed(6)}</td>
                        <td class="px-4 py-2.5 text-surface-800 font-medium whitespace-nowrap">${esc(p.src)}</td>
                        <td class="px-4 py-2.5 text-surface-800 font-medium whitespace-nowrap">${esc(p.dst)}</td>
                        <td class="px-4 py-2.5">
                          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeStyle(p.proto)}">${p.proto}</span>
                        </td>
                        <td class="px-4 py-2.5 text-surface-500">${p.len}</td>
                        <td class="px-4 py-2.5 text-surface-600 truncate max-w-xs xl:max-w-lg font-sans text-xs" title="${esc(p.info)}">${esc(p.info)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Pagination -->
          ${totalPages > 1 ? `
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 mt-6 bg-surface-50 rounded-xl">
              <div class="text-xs text-surface-500 font-medium">
                Showing <span class="text-surface-900 font-bold">${(startIdx + 1).toLocaleString()}</span> to <span class="text-surface-900 font-bold">${Math.min(startIdx + perPage, filtered.length).toLocaleString()}</span> of <span class="text-surface-900 font-bold">${filtered.length.toLocaleString()}</span> packets
              </div>
              <div class="flex gap-2">
                <button id="pcap-prev" class="px-4 py-2 text-xs font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 disabled:opacity-40 transition-all shadow-sm" ${page === 1 ? 'disabled' : ''}>Previous</button>
                <div class="flex items-center px-4 text-xs font-bold text-surface-400">Page ${page} / ${totalPages}</div>
                <button id="pcap-next" class="px-4 py-2 text-xs font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 disabled:opacity-40 transition-all shadow-sm" ${page === totalPages ? 'disabled' : ''}>Next</button>
              </div>
            </div>
          ` : ''}

          <!-- Packet Inspector -->
          <div id="pcap-inspector" class="${state.selectedPacket ? 'block' : 'hidden'} mt-12 space-y-6 animate-in slide-in-from-bottom-8 duration-500 scroll-mt-10">
            <div class="flex items-center justify-between border-b border-surface-200 pb-5">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-xl shadow-brand-500/20">
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div>
                  <h3 class="text-xl font-bold text-surface-900 tracking-tight">Packet Detail #${state.selectedPacket?.num}</h3>
                  <div class="flex items-center gap-3 mt-1.5">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getBadgeStyle(state.selectedPacket?.proto)}">${state.selectedPacket?.proto}</span>
                    <span class="text-[11px] text-surface-400 font-medium">Capture Offset: +${state.selectedPacket?.time.toFixed(6)}s</span>
                  </div>
                </div>
              </div>
              <button id="pcap-close" class="p-2.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-2xl transition-all">
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div class="lg:col-span-8 space-y-4">
                <div class="flex items-center justify-between">
                  <h4 class="text-[11px] font-bold text-surface-500 uppercase tracking-widest">Hex & ASCII Payload</h4>
                  <div class="flex gap-2">
                    <button id="pcap-copy-hex" class="px-4 py-1.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl text-[10px] font-bold uppercase transition-all">Copy Hex</button>
                    <button id="pcap-raw-dl" class="px-4 py-1.5 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl text-[10px] font-bold uppercase transition-all">Download Bin</button>
                  </div>
                </div>
                <!-- U8. Code block -->
                <div class="rounded-2xl overflow-hidden border border-surface-200 bg-gray-950 shadow-2xl">
                  <pre class="p-6 text-[11px] font-mono text-gray-300 overflow-x-auto leading-relaxed selection:bg-brand-500/40" id="hex-dump-target"></pre>
                </div>
              </div>

              <div class="lg:col-span-4 space-y-6">
                <!-- Analysis Card -->
                <div class="rounded-2xl border border-surface-200 p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-5 border-b border-surface-50 pb-2">Traffic Analysis</h4>
                  <div class="space-y-6" id="inspector-analysis"></div>
                </div>
                
                <!-- Metadata Panel -->
                <div class="rounded-2xl border border-surface-200 p-6 bg-surface-50/50">
                  <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-4 border-b border-surface-100 pb-2">Frame Info</h4>
                  <div id="inspector-meta" class="space-y-3.5 text-[11px] font-mono"></div>
                </div>

                <div class="p-5 bg-brand-50 rounded-2xl border border-brand-100 flex items-start gap-4">
                  <div class="text-brand-600 mt-0.5">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </div>
                  <p class="text-[11px] text-brand-800 leading-relaxed font-medium">Privacy Notice: Decoding is performed locally in your browser's memory. No network data is uploaded to our servers.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      // Event Binding
      const el = h.getRenderEl();

      // Search with debounce
      const searchBox = el.querySelector('#pcap-search');
      if (searchBox) {
        let timer;
        searchBox.oninput = (e) => {
          const val = e.target.value;
          clearTimeout(timer);
          timer = setTimeout(() => {
            h.setState({ filter: val, page: 1 });
            renderMainUI(h);
            const input = h.getRenderEl().querySelector('#pcap-search');
            if (input) {
              input.focus();
              input.setSelectionRange(val.length, val.length);
            }
          }, 300);
        };
      }

      el.querySelector('#pcap-proto-select')?.addEventListener('change', (e) => {
        h.setState({ protoFilter: e.target.value, page: 1 });
        renderMainUI(h);
      });

      el.querySelector('#pcap-reset')?.addEventListener('click', () => {
        h.setState({ filter: '', protoFilter: 'ALL', page: 1 });
        renderMainUI(h);
      });

      el.querySelectorAll('.proto-chip').forEach(card => {
        card.onclick = () => {
          const p = card.dataset.proto;
          h.setState({ protoFilter: p === state.protoFilter ? 'ALL' : p, page: 1 });
          renderMainUI(h);
        };
      });

      el.querySelectorAll('.pcap-sortable').forEach(th => {
        th.onclick = () => {
          const col = th.dataset.col;
          h.setState({ 
            sortCol: col, 
            sortDir: state.sortCol === col ? state.sortDir * -1 : 1,
            page: 1
          });
          renderMainUI(h);
        };
      });

      el.querySelectorAll('.pcap-row').forEach(row => {
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

      el.querySelector('#pcap-close')?.addEventListener('click', () => { 
        h.setState('selectedPacket', null); 
        renderMainUI(h); 
      });

      el.querySelector('#pcap-prev')?.addEventListener('click', () => { 
        h.setState('page', Math.max(1, (state.page || 1) - 1)); 
        renderMainUI(h); 
      });

      el.querySelector('#pcap-next')?.addEventListener('click', () => { 
        h.setState('page', Math.min(totalPages, (state.page || 1) + 1)); 
        renderMainUI(h); 
      });

      el.querySelector('#pcap-copy-hex')?.addEventListener('click', (e) => {
        if (!state.selectedPacket) return;
        const hex = Array.from(state.selectedPacket.data).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        h.copyToClipboard(hex, e.target);
      });

      el.querySelector('#pcap-raw-dl')?.addEventListener('click', () => {
        if (!state.selectedPacket) return;
        const p = state.selectedPacket;
        const blob = new Blob([p.data], { type: 'application/octet-stream' });
        h.download(`frame_${p.num}.bin`, blob, 'application/octet-stream');
      });

      if (state.selectedPacket) {
        updateInspectorView(state.selectedPacket, h);
      }
    }

    function renderSortTh(label, col, currentCol, currentDir) {
      const isSorted = currentCol === col;
      return `
        <th class="pcap-sortable sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 group transition-all font-sans" data-col="${col}">
          <div class="flex items-center gap-2">
            ${label}
            <span class="text-[10px] ${isSorted ? 'text-brand-600 opacity-100' : 'text-surface-300 opacity-0 group-hover:opacity-100'} transition-all transform ${isSorted && currentDir === -1 ? 'rotate-180' : ''}">
              ▲
            </span>
          </div>
        </th>
      `;
    }

    function updateInspectorView(packet, h) {
      const el = h.getRenderEl();
      const dump = el.querySelector('#hex-dump-target');
      const analysis = el.querySelector('#inspector-analysis');
      const meta = el.querySelector('#inspector-meta');
      if (!dump) return;

      // Hex Dump Engine
      const lines = [];
      const data = packet.data;
      for (let i = 0; i < data.length; i += 16) {
        const chunk = data.slice(i, i + 16);
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
        lines.push(`<span class="text-gray-600 select-none opacity-50 font-sans">${offset}</span>  <span class="text-gray-300">${hex.padEnd(47)}</span>  <span class="text-brand-400 font-sans">${esc(ascii)}</span>`);
      }
      dump.innerHTML = lines.join('\n');

      analysis.innerHTML = `
        <div class="group">
          <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Source Address</div>
          <div class="text-surface-900 font-mono text-xs p-3 bg-surface-50 rounded-xl border border-surface-100 break-all font-bold shadow-inner">${esc(packet.src)}</div>
        </div>
        <div class="group">
          <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Destination Address</div>
          <div class="text-surface-900 font-mono text-xs p-3 bg-surface-50 rounded-xl border border-surface-100 break-all font-bold shadow-inner">${esc(packet.dst)}</div>
        </div>
        <div class="group">
          <div class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1.5 group-hover:text-brand-500 transition-colors">Protocol Specifics</div>
          <div class="text-surface-700 text-xs italic leading-relaxed bg-brand-50/40 p-3 rounded-xl border border-brand-100/50">${esc(packet.info)}</div>
        </div>
      `;

      meta.innerHTML = `
        <div class="flex justify-between border-b border-surface-200/50 pb-2">
          <span class="text-surface-500">Wire Length</span>
          <span class="text-surface-900 font-bold">${packet.len} B</span>
        </div>
        <div class="flex justify-between border-b border-surface-200/50 py-2">
          <span class="text-surface-500">Captured Data</span>
          <span class="text-surface-900 font-bold">${packet.data.length} B</span>
        </div>
        <div class="flex justify-between pt-1">
          <span class="text-surface-500">Epoch Timestamp</span>
          <span class="text-surface-900 font-bold">${packet.time.toFixed(9)}</span>
        </div>
      `;
    }

    function renderEmptyView(h) {
      const state = h.getState();
      h.render(`
        <div class="animate-in fade-in duration-700">
          <div class="flex items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-12">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${fmtSize(state.fileSize)}</span>
          </div>
          <div class="flex flex-col items-center justify-center py-32 text-center border-2 border-surface-200 border-dashed rounded-[2rem] bg-surface-50/20">
            <div class="w-24 h-24 bg-white rounded-3xl flex items-center justify-center text-surface-200 mb-8 shadow-sm">
              <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </div>
            <h3 class="text-2xl font-bold text-surface-900 mb-3">No Packets Found</h3>
            <p class="text-surface-500 max-w-sm mx-auto text-sm leading-relaxed px-6">This file either contains no packets or is in an unsupported capture format variant. Standard PCAP and PCAPNG are recommended.</p>
          </div>
        </div>
      `);
    }

    /**
     * PCAP PARSER ENGINE
     */

    async function parsePcapData(buffer) {
      const dv = new DataView(buffer);
      if (buffer.byteLength < 8) throw new Error('File too short.');
      
      const magic = dv.getUint32(0, true);
      let isLittle = true;
      let isNg = false;
      let isNano = false;

      if (magic === 0xA1B2C3D4) isLittle = false;
      else if (magic === 0xD4C3B2A1) isLittle = true;
      else if (magic === 0xA1B23C4D) { isLittle = false; isNano = true; }
      else if (magic === 0x4D3CB2A1) { isLittle = true; isNano = true; }
      else if (magic === 0x0A0D0D0A) { isNg = true; isLittle = true; }
      else throw new Error('Unsupported magic identifier.');

      if (isNg) return parseNg(buffer, isLittle);

      // Legacy PCAP
      if (buffer.byteLength < 24) throw new Error('Invalid PCAP header.');
      const linkType = dv.getUint32(20, isLittle);
      const packets = [];
      let offset = 24;
      let firstTs = null;
      // B7: Cap processing for stability
      const MAX_P = 100000;

      while (offset + 16 <= buffer.byteLength && packets.length < MAX_P) {
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
      let linkType = 1; // Default Ethernet
      const MAX_P = 100000;

      while (offset + 8 <= buffer.byteLength && packets.length < MAX_P) {
        const type = dv.getUint32(offset, isLittle);
        const len = dv.getUint32(offset + 4, isLittle);
        if (len < 8 || offset + len > buffer.byteLength) break;

        if (type === 0x01) { // Interface Description Block
          linkType = dv.getUint16(offset + 8, isLittle);
        } else if (type === 0x06 || type === 0x03) { // EPB or SPB
          const isEpb = type === 0x06;
          const tsH = isEpb ? dv.getUint32(offset + 12, isLittle) : 0;
          const tsL = isEpb ? dv.getUint32(offset + 16, isLittle) : 0;
          const capL = isEpb ? dv.getUint32(offset + 20, isLittle) : dv.getUint32(offset + 8, isLittle);
          const wireL = isEpb ? dv.getUint32(offset + 24, isLittle) : capL;
          
          const time = (tsH * 4294967296 + tsL) / 1000000;
          if (firstTs === null) firstTs = time;
          
          const dataOff = isEpb ? 28 : 12;
          if (offset + dataOff + capL <= buffer.byteLength) {
            const data = new Uint8Array(buffer, offset + dataOff, capL);
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
      let res = { src: '?', dst: '?', proto: 'RAW', info: 'Binary frame' };
      let ethType = 0;
      let off = 0;

      // Link Layer
      if (link === 1 && data.length >= 14) { // Ethernet
        ethType = (data[12] << 8) | data[13];
        off = 14;
        res.src = fmtMAC(data.slice(6, 12));
        res.dst = fmtMAC(data.slice(0, 6));
        res.proto = 'ETH';
      } else if (link === 113 && data.length >= 16) { // Linux SLL
        ethType = (data[14] << 8) | data[15];
        off = 16;
        res.proto = 'SLL';
      } else if (link === 101) { // Raw IP
        ethType = (data[0] >> 4 === 4) ? 0x0800 : 0x86DD;
        off = 0;
      } else return res;

      // Network Layer
      if (ethType === 0x0800 && data.length >= off + 20) { // IPv4
        const ihl = (data[off] & 0x0F) * 4;
        const proto = data[off + 9];
        res.src = data.slice(off + 12, off + 16).join('.');
        res.dst = data.slice(off + 16, off + 20).join('.');
        res.proto = 'IPv4';
        decodeTransport(data, off + ihl, proto, res);
      } else if (ethType === 0x86DD && data.length >= off + 40) { // IPv6
        const next = data[off + 6];
        res.src = fmtIPv6(data.slice(off + 8, off + 24));
        res.dst = fmtIPv6(data.slice(off + 24, off + 40));
        res.proto = 'IPv6';
        decodeTransport(data, off + 40, next, res);
      } else if (ethType === 0x0806 && data.length >= off + 28) { // ARP
        res.proto = 'ARP';
        const op = data[off + 7];
        const spa = data.slice(off + 14, off + 18).join('.');
        const tpa = data.slice(off + 24, off + 28).join('.');
        res.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : `Reply: ${spa} is at ${fmtMAC(data.slice(off + 8, off + 14))}`;
      }
      return res;
    }

    function decodeTransport(data, off, proto, res) {
      if (data.length < off + 4) return;
      const sp = (data[off] << 8) | data[off + 1];
      const dp = (data[off + 2] << 8) | data[off + 3];

      if (proto === 6) { // TCP
        res.proto = 'TCP';
        res.src += `:${sp}`;
        res.dst += `:${dp}`;
        if (data.length >= off + 14) {
          const f = data[off + 13];
          const fl = [];
          if (f & 0x02) fl.push('SYN');
          if (f & 0x10) fl.push('ACK');
          if (f & 0x01) fl.push('FIN');
          if (f & 0x04) fl.push('RST');
          if (f & 0x08) fl.push('PSH');
          res.info = fl.join(' ') || 'TCP Payload';
          
          const tOff = (data[off + 12] >> 4) * 4;
          if (data.length > off + tOff) {
            const first = data[off + tOff];
            if (dp === 80 || sp === 80) res.proto = 'HTTP';
            else if (dp === 443 || sp === 443 || first === 0x16) res.proto = 'TLS';
            else if (dp === 21 || sp === 21) res.proto = 'FTP';
            else if (dp === 22 || sp === 22) res.proto = 'SSH';
          }
        }
      } else if (proto === 17) { // UDP
        res.proto = 'UDP';
        res.src += `:${sp}`;
        res.dst += `:${dp}`;
        if (dp === 53 || sp === 53) {
          res.proto = 'DNS';
          res.info = 'DNS Query/Response';
        } else if (dp === 67 || dp === 68 || sp === 67 || sp === 68) res.proto = 'DHCP';
        else if (dp === 123 || sp === 123) res.proto = 'NTP';
        else res.info = 'UDP Data';
      } else if (proto === 1) { // ICMP
        res.proto = 'ICMP';
        const type = data[off];
        res.info = type === 8 ? 'Echo Request' : type === 0 ? 'Echo Reply' : `Type ${type}`;
      }
    }

    /**
     * UTILS
     */

    function fmtIPv6(b) {
      const p = [];
      for (let i = 0; i < 16; i += 2) p.push(((b[i] << 8) | b[i + 1]).toString(16));
      return p.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
    }

    function fmtMAC(b) {
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(':');
    }

    function getBadgeStyle(p) {
      const s = {
        'TCP': 'bg-blue-50 text-blue-600 border border-blue-200',
        'UDP': 'bg-sky-50 text-sky-600 border border-sky-200',
        'ICMP': 'bg-purple-50 text-purple-600 border border-purple-200',
        'ARP': 'bg-orange-50 text-orange-600 border border-orange-200',
        'HTTP': 'bg-green-50 text-green-600 border border-green-200',
        'TLS': 'bg-emerald-50 text-emerald-600 border border-emerald-200',
        'DNS': 'bg-indigo-50 text-indigo-600 border border-indigo-200',
        'SSH': 'bg-slate-50 text-slate-600 border border-slate-200'
      };
      return s[p] || 'bg-surface-50 text-surface-500 border border-surface-200';
    }

    function getBarColor(p) {
      const c = {
        'TCP': 'bg-blue-500',
        'UDP': 'bg-sky-500',
        'HTTP': 'bg-green-500',
        'TLS': 'bg-emerald-500',
        'DNS': 'bg-indigo-500'
      };
      return c[p] || 'bg-surface-400';
    }

    function fmtSize(b) {
      if (!b) return '0 B';
      const k = 1024, i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    }

    function esc(s) {
      if (!s) return '';
      return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
  };
})();
