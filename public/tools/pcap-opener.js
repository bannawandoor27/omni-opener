(function () {
  'use strict';

  /**
   * OmniOpener PCAP/PCAPNG Analyzer
   * High-performance browser-based network traffic analysis.
   */

  window.initTool = function (toolConfig, mountEl) {
    let _pakoPromise = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pcap,.pcapng,.cap,.gz',
      binary: true,
      dropLabel: 'Drop network capture file (PCAP, PCAPNG)',
      infoHtml: 'Analyze network packets with full protocol decoding. Supports standard PCAP, PCAPNG, and GZipped captures. All processing occurs locally in your browser.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            const packets = state.packets || [];
            if (!packets.length) return h.showError('No packets to copy', 'Please load a valid capture file first.');

            h.showLoading('Preparing JSON export...');
            setTimeout(function() {
              try {
                const limit = 5000;
                const data = packets.slice(0, limit).map(p => ({
                  no: p.num,
                  time: p.time.toFixed(6),
                  source: p.src,
                  destination: p.dst,
                  protocol: p.proto,
                  length: p.len,
                  info: p.info
                }));
                h.copyToClipboard(JSON.stringify(data, null, 2), btn);
                if (packets.length > limit) {
                  h.showError('Export Note', `Exported the first ${limit} packets. Large captures are truncated for performance.`);
                }
              } catch (e) {
                h.showError('Export Failed', 'The packet data is too large for the clipboard.');
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
            const state = h.getState();
            const packets = state.packets || [];
            if (!packets.length) return h.showError('No packets to export', 'Please load a valid capture file first.');

            h.showLoading('Generating CSV...');
            setTimeout(function() {
              try {
                const headers = ['No.', 'Time', 'Source', 'Destination', 'Protocol', 'Length', 'Info'];
                const rows = packets.map(p => [
                  p.num,
                  p.time.toFixed(6),
                  `"${p.src}"`,
                  `"${p.dst}"`,
                  p.proto,
                  p.len,
                  `"${(p.info || '').replace(/"/g, '""')}"`
                ]);
                const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                const outName = (state.fileName || 'capture').replace(/\.[^/.]+$/, '') + '_analysis.csv';
                h.download(outName, new Blob([csv], { type: 'text/csv' }), 'text/csv');
              } catch (e) {
                h.showError('Export Failed', 'Could not generate CSV. The capture might be too large for browser memory.');
              } finally {
                h.hideLoading();
              }
            }, 50);
          }
        }
      ],

      onInit: function (h) {
        if (typeof window.pako === 'undefined' && !_pakoPromise) {
          _pakoPromise = new Promise((resolve) => {
            h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', () => {
              resolve(window.pako);
            });
          });
        }
      },

      onFile: async function _onFileFn(file, content, h) {
        h.setState({
          fileName: file.name,
          fileSize: file.size,
          packets: [],
          selectedPacket: null,
          searchQuery: '',
          protoFilter: 'ALL',
          sortCol: 'num',
          sortDir: 1,
          page: 1,
          perPage: 100,
          isTruncated: false
        });

        h.showLoading('Initializing capture buffer...');

        try {
          let buffer = content;
          if (!(buffer instanceof ArrayBuffer)) {
            if (buffer && buffer.buffer instanceof ArrayBuffer) buffer = buffer.buffer;
            else throw new Error('Invalid binary format received.');
          }

          if (buffer.byteLength < 24) throw new Error('File is too small to be a valid network capture.');

          const magicCheck = new Uint8Array(buffer.slice(0, 2));
          if (magicCheck[0] === 0x1F && magicCheck[1] === 0x8B) {
            h.showLoading('Decompressing GZIP capture...');
            if (!_pakoPromise && typeof window.pako === 'undefined') {
              throw new Error('Decompression library failed to load.');
            }
            const pako = window.pako || (await _pakoPromise);
            buffer = pako.ungzip(new Uint8Array(buffer)).buffer;
          }

          h.showLoading('Parsing packet structures...');
          // Give UI thread a chance to update
          await new Promise(r => setTimeout(r, 10));
          
          const result = await parseCapture(buffer);

          if (!result.packets || result.packets.length === 0) {
            h.hideLoading();
            renderEmptyState(h);
            return;
          }

          h.setState({
            packets: result.packets,
            isTruncated: result.isTruncated
          });
          
          h.hideLoading();
          renderDashboard(h);
        } catch (err) {
          console.error('[PCAP] Error:', err);
          h.showError('Could not open capture', err.message || 'The file format is unrecognized or the data is corrupted.');
        }
      },

      onDestroy: function (h) {
        h.setState({ packets: [], selectedPacket: null });
        _pakoPromise = null;
      }
    });

    /**
     * UI COMPONENTS
     */

    function renderDashboard(h) {
      const state = h.getState();
      const packets = state.packets || [];
      const search = (state.searchQuery || '').toLowerCase();
      const protoFilter = state.protoFilter || 'ALL';
      const sortCol = state.sortCol || 'num';
      const sortDir = state.sortDir || 1;

      // Filtering logic
      const filtered = packets.filter(p => {
        const matchesSearch = !search || 
          p.src.toLowerCase().includes(search) || 
          p.dst.toLowerCase().includes(search) || 
          p.info.toLowerCase().includes(search) || 
          p.proto.toLowerCase().includes(search);
        const matchesProto = protoFilter === 'ALL' || p.proto === protoFilter;
        return matchesSearch && matchesProto;
      });

      // Sorting logic
      if (sortCol) {
        filtered.sort((a, b) => {
          let vA = a[sortCol], vB = b[sortCol];
          if (typeof vA === 'string') { vA = vA.toLowerCase(); vB = vB.toLowerCase(); }
          return (vA < vB ? -1 : vA > vB ? 1 : 0) * sortDir;
        });
      }

      // Pagination
      const page = state.page || 1;
      const perPage = state.perPage || 100;
      const totalPages = Math.ceil(filtered.length / perPage) || 1;
      const start = (page - 1) * perPage;
      const visible = filtered.slice(start, start + perPage);

      // Protocol Statistics
      const stats = {};
      packets.forEach(p => stats[p.proto] = (stats[p.proto] || 0) + 1);
      const topProtos = Object.entries(stats).sort((a, b) => b[1] - a[1]);

      const html = `
        <div class="space-y-6 animate-in fade-in duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">PCAP Capture</span>
            ${state.isTruncated ? `
              <span class="text-surface-300">|</span>
              <span class="text-amber-600 font-medium flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                Showing first 100k packets
              </span>` : ''}
          </div>

          <!-- U10. Section header with counts -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Protocol Overview</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${topProtos.length} distinct protocols</span>
          </div>

          <!-- Protocol Cards (U9) -->
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            ${topProtos.slice(0, 12).map(([proto, count]) => {
              const active = protoFilter === proto;
              const pct = Math.round((count / packets.length) * 100);
              return `
                <div class="rounded-xl border ${active ? 'border-brand-500 ring-2 ring-brand-500/10 bg-brand-50/30' : 'border-surface-200'} p-4 hover:border-brand-300 hover:shadow-sm transition-all cursor-pointer proto-toggle" data-proto="${proto}">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">${proto}</div>
                  <div class="text-lg font-bold text-surface-800">${count.toLocaleString()}</div>
                  <div class="w-full bg-surface-100 h-1 mt-2 rounded-full overflow-hidden">
                    <div class="h-full ${getProtoColor(proto)}" style="width: ${Math.max(2, pct)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Live Search / Filter -->
          <div class="relative group">
            <input type="text" id="pcap-search-input" placeholder="Search by IP, Protocol, or Packet Content..." 
              class="block w-full pl-11 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm group-hover:border-surface-300"
              value="${esc(state.searchQuery || '')}">
            <div class="absolute left-4 top-3.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
            ${state.searchQuery || protoFilter !== 'ALL' ? `
              <button id="clear-filters" class="absolute right-4 top-3 text-xs font-bold text-brand-600 hover:text-brand-700 bg-brand-50 px-2 py-1 rounded">CLEAR</button>
            ` : ''}
          </div>

          <!-- U7. Table -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-white">
                  ${renderHeader('No.', 'num', sortCol, sortDir)}
                  ${renderHeader('Time', 'time', sortCol, sortDir)}
                  ${renderHeader('Source', 'src', sortCol, sortDir)}
                  ${renderHeader('Destination', 'dst', sortCol, sortDir)}
                  ${renderHeader('Protocol', 'proto', sortCol, sortDir)}
                  ${renderHeader('Length', 'len', sortCol, sortDir)}
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Info</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100 font-mono text-[11px]">
                ${visible.length === 0 ? `
                  <tr><td colspan="7" class="px-4 py-16 text-center text-surface-400 font-sans italic bg-surface-50/30">No packets match your criteria</td></tr>
                ` : visible.map(p => {
                  const isSelected = state.selectedPacket?.num === p.num;
                  return `
                    <tr class="packet-row group cursor-pointer hover:bg-brand-50/50 transition-colors ${isSelected ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'even:bg-surface-50/30'}" data-num="${p.num}">
                      <td class="px-4 py-2 text-surface-400 font-sans border-b border-surface-100">${p.num}</td>
                      <td class="px-4 py-2 text-surface-500 whitespace-nowrap border-b border-surface-100">${p.time.toFixed(6)}</td>
                      <td class="px-4 py-2 text-surface-700 font-bold whitespace-nowrap border-b border-surface-100">${esc(p.src)}</td>
                      <td class="px-4 py-2 text-surface-700 font-bold whitespace-nowrap border-b border-surface-100">${esc(p.dst)}</td>
                      <td class="px-4 py-2 border-b border-surface-100">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${getBadgeStyle(p.proto)}">${p.proto}</span>
                      </td>
                      <td class="px-4 py-2 text-surface-500 border-b border-surface-100">${p.len}</td>
                      <td class="px-4 py-2 text-surface-600 truncate max-w-[200px] lg:max-w-md font-sans border-b border-surface-100" title="${esc(p.info)}">${esc(p.info)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          ${totalPages > 1 ? `
            <div class="flex items-center justify-between gap-4 px-4 py-3 bg-surface-50 rounded-xl border border-surface-200">
              <div class="text-xs text-surface-500">
                Displaying <span class="font-bold text-surface-700">${(start + 1).toLocaleString()}</span> - <span class="font-bold text-surface-700">${Math.min(start + perPage, filtered.length).toLocaleString()}</span> of ${filtered.length.toLocaleString()}
              </div>
              <div class="flex gap-2">
                <button id="btn-prev" class="px-3 py-1.5 text-xs font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm" ${page === 1 ? 'disabled' : ''}>Prev</button>
                <div class="flex items-center px-3 text-xs font-semibold text-surface-600 bg-white border border-surface-200 rounded-lg shadow-sm">Page ${page} / ${totalPages}</div>
                <button id="btn-next" class="px-3 py-1.5 text-xs font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-sm" ${page === totalPages ? 'disabled' : ''}>Next</button>
              </div>
            </div>
          ` : ''}

          <!-- Packet Inspector -->
          <div id="inspector-pane" class="${state.selectedPacket ? 'block' : 'hidden'} mt-12 border-t border-surface-200 pt-8 animate-in slide-in-from-bottom-4 duration-500">
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg">
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                </div>
                <div>
                  <h4 class="text-xl font-bold text-surface-900">Packet Details #${state.selectedPacket?.num}</h4>
                  <p class="text-xs text-surface-500 font-medium">${state.selectedPacket?.proto} Protocol • Offset: ${state.selectedPacket?.time.toFixed(9)}s</p>
                </div>
              </div>
              <button id="close-inspector" class="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-all">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-4">
                <div class="flex items-center justify-between">
                  <h5 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Hex / ASCII Dump</h5>
                  <button id="btn-copy-hex" class="text-[10px] font-bold text-brand-600 hover:bg-brand-50 px-2 py-1 rounded border border-brand-200 transition-colors">COPY RAW HEX</button>
                </div>
                <!-- U8. Code/pre block -->
                <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm bg-gray-950">
                  <pre class="p-4 text-[11px] font-mono text-gray-100 overflow-x-auto leading-relaxed" id="hex-view"></pre>
                </div>
              </div>

              <div class="space-y-4">
                <h5 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Decoded Fields</h5>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm space-y-4" id="packet-details"></div>
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
        let timer;
        searchInput.oninput = (e) => {
          const val = e.target.value;
          clearTimeout(timer);
          timer = setTimeout(() => {
            h.setState({ searchQuery: val, page: 1 });
            renderDashboard(h);
            const fresh = h.getRenderEl().querySelector('#pcap-search-input');
            if (fresh) {
              fresh.focus();
              fresh.setSelectionRange(val.length, val.length);
            }
          }, 400);
        };
      }

      el.querySelector('#clear-filters')?.addEventListener('click', () => {
        h.setState({ searchQuery: '', protoFilter: 'ALL', page: 1 });
        renderDashboard(h);
      });

      el.querySelectorAll('.proto-toggle').forEach(btn => {
        btn.onclick = () => {
          const p = btn.dataset.proto;
          h.setState({ protoFilter: p === state.protoFilter ? 'ALL' : p, page: 1 });
          renderDashboard(h);
        };
      });

      el.querySelectorAll('.packet-row').forEach(row => {
        row.onclick = () => {
          const num = parseInt(row.dataset.num);
          const p = packets.find(x => x.num === num);
          if (p) {
            h.setState('selectedPacket', p);
            renderDashboard(h);
            el.querySelector('#inspector-pane')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        };
      });

      el.querySelectorAll('.sortable-th').forEach(th => {
        th.onclick = () => {
          const col = th.dataset.col;
          h.setState({ 
            sortCol: col, 
            sortDir: state.sortCol === col ? state.sortDir * -1 : 1, 
            page: 1 
          });
          renderDashboard(h);
        };
      });

      el.querySelector('#btn-prev')?.addEventListener('click', () => {
        h.setState('page', Math.max(1, state.page - 1));
        renderDashboard(h);
      });
      el.querySelector('#btn-next')?.addEventListener('click', () => {
        h.setState('page', Math.min(totalPages, state.page + 1));
        renderDashboard(h);
      });
      el.querySelector('#close-inspector')?.addEventListener('click', () => {
        h.setState('selectedPacket', null);
        renderDashboard(h);
      });

      el.querySelector('#btn-copy-hex')?.addEventListener('click', (e) => {
        if (!state.selectedPacket) return;
        const hex = Array.from(state.selectedPacket.data)
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join('');
        h.copyToClipboard(hex, e.target);
      });

      if (state.selectedPacket) populateInspector(state.selectedPacket, el);
    }

    function renderHeader(label, col, currCol, currDir) {
      const active = currCol === col;
      return `
        <th class="sortable-th sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors group" data-col="${col}">
          <div class="flex items-center gap-1.5">
            ${label}
            <span class="text-[9px] ${active ? 'text-brand-600' : 'text-surface-300 opacity-0 group-hover:opacity-100'} transition-all ${active && currDir === -1 ? 'rotate-180' : ''}">▲</span>
          </div>
        </th>
      `;
    }

    function populateInspector(p, el) {
      const hexEl = el.querySelector('#hex-view');
      const detailEl = el.querySelector('#packet-details');
      if (!hexEl || !detailEl) return;

      // Hex Dump Generator
      const lines = [];
      const d = p.data;
      for (let i = 0; i < d.length; i += 16) {
        const chunk = d.slice(i, i + 16);
        const offset = i.toString(16).padStart(4, '0').toUpperCase();
        const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
        lines.push(`<span class="opacity-30">${offset}</span>  ${hex.padEnd(47)}  <span class="text-emerald-400/80 font-sans">${esc(ascii)}</span>`);
      }
      hexEl.innerHTML = lines.join('\n');

      // Decoded Fields (U9)
      detailEl.innerHTML = `
        <div class="space-y-1">
          <div class="text-[9px] font-bold text-surface-400 uppercase">Source Address</div>
          <div class="font-mono text-xs font-bold text-surface-900 bg-surface-50 p-2 rounded border border-surface-100 break-all">${esc(p.src)}</div>
        </div>
        <div class="space-y-1">
          <div class="text-[9px] font-bold text-surface-400 uppercase">Destination Address</div>
          <div class="font-mono text-xs font-bold text-surface-900 bg-surface-50 p-2 rounded border border-surface-100 break-all">${esc(p.dst)}</div>
        </div>
        <div class="space-y-1">
          <div class="text-[9px] font-bold text-surface-400 uppercase">Protocol Payload Info</div>
          <div class="text-xs text-surface-600 bg-surface-50 p-3 rounded border border-surface-100 italic leading-relaxed">${esc(p.info)}</div>
        </div>
        <div class="grid grid-cols-2 gap-3 pt-2">
          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
            <div class="text-[9px] font-bold text-surface-400 uppercase">Wire Length</div>
            <div class="text-sm font-black text-surface-800">${p.len.toLocaleString()} <span class="text-[10px] font-normal text-surface-400">BYTES</span></div>
          </div>
          <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
            <div class="text-[9px] font-bold text-surface-400 uppercase">Captured</div>
            <div class="text-sm font-black text-surface-800">${p.data.length.toLocaleString()} <span class="text-[10px] font-normal text-surface-400">BYTES</span></div>
          </div>
        </div>
      `;
    }

    function renderEmptyState(h) {
      h.render(`
        <div class="flex flex-col items-center justify-center py-24 text-center border-2 border-surface-100 border-dashed rounded-3xl bg-surface-50/30">
          <div class="w-20 h-20 bg-white rounded-2xl flex items-center justify-center text-surface-200 mb-6 shadow-sm">
            <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-surface-900 mb-2">No network packets found</h3>
          <p class="text-surface-500 max-w-xs mx-auto text-sm">This file doesn't seem to contain any valid network traffic or is in an unsupported capture format.</p>
        </div>
      `);
    }

    /**
     * CORE PCAP PARSER
     */

    async function parseCapture(buffer) {
      const dv = new DataView(buffer);
      if (buffer.byteLength < 24) throw new Error('Capture file header too short.');

      const magic = dv.getUint32(0, true);
      let isLe = true, isNg = false, isNano = false;

      if (magic === 0xA1B2C3D4) isLe = false;
      else if (magic === 0xD4C3B2A1) isLe = true;
      else if (magic === 0xA1B23C4D) { isLe = false; isNano = true; }
      else if (magic === 0x4D3CB2A1) { isLe = true; isNano = true; }
      else if (magic === 0x0A0D0D0A) { isNg = true; isLe = true; }
      else throw new Error('Unrecognized capture file signature.');

      const packets = [];
      const PACKET_LIMIT = 100000;
      let startTs = null;
      let isTruncated = false;

      if (isNg) {
        let off = 0;
        let linkType = 1;
        while (off + 8 <= buffer.byteLength) {
          if (packets.length >= PACKET_LIMIT) { isTruncated = true; break; }
          const blockType = dv.getUint32(off, isLe);
          const blockLen = dv.getUint32(off + 4, isLe);
          if (blockLen < 8 || off + blockLen > buffer.byteLength) break;

          if (blockType === 0x01) { // IDB
            linkType = dv.getUint16(off + 8, isLe);
          } else if (blockType === 0x06 || blockType === 0x03) { // EPB or SPB
            const isEpb = blockType === 0x06;
            const tsHigh = isEpb ? dv.getUint32(off + 12, isLe) : 0;
            const tsLow = isEpb ? dv.getUint32(off + 16, isLe) : 0;
            const capLen = isEpb ? dv.getUint32(off + 20, isLe) : dv.getUint32(off + 8, isLe);
            const wireLen = isEpb ? dv.getUint32(off + 24, isLe) : capLen;
            
            const time = (tsHigh * 4294967296 + tsLow) / 1000000;
            if (startTs === null) startTs = time;

            const dataOffset = isEpb ? 28 : 12;
            if (off + dataOffset + capLen <= buffer.byteLength) {
              const data = new Uint8Array(buffer, off + dataOffset, capLen);
              const decoded = decodePacket(data, linkType);
              packets.push({ 
                num: packets.length + 1, time: time - startTs, len: wireLen, 
                src: decoded.src, dst: decoded.dst, proto: decoded.proto, info: decoded.info, data 
              });
            }
          }
          off += (blockLen + 3) & ~3;
        }
      } else {
        const linkType = dv.getUint32(20, isLe);
        let off = 24;
        while (off + 16 <= buffer.byteLength) {
          if (packets.length >= PACKET_LIMIT) { isTruncated = true; break; }
          const tsSec = dv.getUint32(off, isLe);
          const tsSub = dv.getUint32(off + 4, isLe);
          const capLen = dv.getUint32(off + 8, isLe);
          const wireLen = dv.getUint32(off + 12, isLe);
          if (off + 16 + capLen > buffer.byteLength) break;

          const time = tsSec + (isNano ? tsSub / 1e9 : tsSub / 1e6);
          if (startTs === null) startTs = time;

          const data = new Uint8Array(buffer, off + 16, capLen);
          const decoded = decodePacket(data, linkType);
          packets.push({ 
            num: packets.length + 1, time: time - startTs, len: wireLen, 
            src: decoded.src, dst: decoded.dst, proto: decoded.proto, info: decoded.info, data 
          });
          off += 16 + capLen;
        }
      }

      return { packets, isTruncated };
    }

    function decodePacket(data, link) {
      let res = { src: '-', dst: '-', proto: 'RAW', info: 'Unparsed payload' };
      let type = 0, off = 0;

      if (link === 1 && data.length >= 14) { // Ethernet
        type = (data[12] << 8) | data[13];
        off = 14;
        res.src = formatMac(data.slice(6, 12));
        res.dst = formatMac(data.slice(0, 6));
        res.proto = 'ETH';
      } else if (link === 113 && data.length >= 16) { // Linux Cooked
        type = (data[14] << 8) | data[15];
        off = 16;
        res.proto = 'SLL';
      } else if (link === 101) { // Raw IP
        type = (data[0] >> 4 === 4) ? 0x0800 : 0x86DD;
        off = 0;
      } else return res;

      if (type === 0x0800 && data.length >= off + 20) { // IPv4
        const ihl = (data[off] & 0x0F) * 4;
        const proto = data[off + 9];
        res.src = data.slice(off + 12, off + 16).join('.');
        res.dst = data.slice(off + 16, off + 20).join('.');
        res.proto = 'IPv4';
        decodeTransport(data, off + ihl, proto, res);
      } else if (type === 0x86DD && data.length >= off + 40) { // IPv6
        const next = data[off + 6];
        res.src = formatIPv6(data.slice(off + 8, off + 24));
        res.dst = formatIPv6(data.slice(off + 24, off + 40));
        res.proto = 'IPv6';
        decodeTransport(data, off + 40, next, res);
      } else if (type === 0x0806 && data.length >= off + 28) { // ARP
        res.proto = 'ARP';
        const op = data[off + 7];
        const spa = data.slice(off + 14, off + 18).join('.');
        const tpa = data.slice(off + 24, off + 28).join('.');
        res.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : `Reply: ${spa} at ${formatMac(data.slice(off + 8, off + 14))}`;
      }
      return res;
    }

    function decodeTransport(data, off, proto, res) {
      if (data.length < off + 4) return;
      const sp = (data[off] << 8) | data[off + 1];
      const dp = (data[off + 2] << 8) | data[off + 3];

      if (proto === 6) { // TCP
        res.proto = 'TCP';
        res.src += `:${sp}`; res.dst += `:${dp}`;
        if (data.length >= off + 14) {
          const f = data[off + 13], fl = [];
          if (f & 0x02) fl.push('SYN'); 
          if (f & 0x10) fl.push('ACK'); 
          if (f & 0x01) fl.push('FIN');
          if (f & 0x04) fl.push('RST'); 
          if (f & 0x08) fl.push('PSH');
          res.info = fl.join(' ') || 'TCP Segment';
          
          const tOff = (data[off + 12] >> 4) * 4;
          if (data.length > off + tOff) {
            const b0 = data[off + tOff];
            if (dp === 80 || sp === 80) res.proto = 'HTTP';
            else if (dp === 443 || sp === 443 || b0 === 0x16) res.proto = 'TLS';
            else if (dp === 22 || sp === 22) res.proto = 'SSH';
          }
        }
      } else if (proto === 17) { // UDP
        res.proto = 'UDP';
        res.src += `:${sp}`; res.dst += `:${dp}`;
        if (dp === 53 || sp === 53) { res.proto = 'DNS'; res.info = 'DNS Query/Response'; }
        else if (dp === 67 || dp === 68 || sp === 67 || sp === 68) res.proto = 'DHCP';
        else if (dp === 123 || sp === 123) res.proto = 'NTP';
        else res.info = 'UDP Datagram';
      } else if (proto === 1) { // ICMP
        res.proto = 'ICMP';
        const type = data[off];
        res.info = type === 8 ? 'Echo Request' : (type === 0 ? 'Echo Reply' : `Type ${type}`);
      }
    }

    /**
     * UTILS
     */

    function formatIPv6(b) {
      const p = []; 
      for (let i = 0; i < 16; i += 2) p.push(((b[i] << 8) | b[i + 1]).toString(16));
      return p.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
    }
    
    function formatMac(b) { 
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(':'); 
    }
    
    function formatBytes(b) { 
      if (!b) return '0 B'; 
      const k = 1024, i = Math.floor(Math.log(b) / Math.log(k)); 
      return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + ['B', 'KB', 'MB', 'GB'][i]; 
    }
    
    function esc(s) { 
      if (!s) return ''; 
      return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); 
    }
    
    function getProtoColor(p) {
      const colors = { 
        'TCP': 'bg-blue-500', 'UDP': 'bg-sky-500', 'HTTP': 'bg-green-500', 
        'TLS': 'bg-emerald-500', 'DNS': 'bg-indigo-500', 'ARP': 'bg-orange-500',
        'ICMP': 'bg-red-500', 'SSH': 'bg-slate-700'
      };
      return colors[p] || 'bg-slate-400';
    }
    
    function getBadgeStyle(p) {
      const styles = {
        'TCP': 'bg-blue-50 text-blue-600 border-blue-100', 
        'UDP': 'bg-sky-50 text-sky-600 border-sky-100',
        'HTTP': 'bg-green-50 text-green-600 border-green-100', 
        'TLS': 'bg-emerald-50 text-emerald-600 border-emerald-100',
        'DNS': 'bg-indigo-50 text-indigo-600 border-indigo-100', 
        'ARP': 'bg-orange-50 text-orange-600 border-orange-100',
        'ICMP': 'bg-red-50 text-red-600 border-red-100',
        'SSH': 'bg-slate-100 text-slate-700 border-slate-200'
      };
      return (styles[p] || 'bg-slate-50 text-slate-500 border-slate-200') + ' border';
    }
  };
})();
