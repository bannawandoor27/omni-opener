(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pcap,.pcapng,.cap,.gz',
      binary: true,
      dropLabel: 'Drop a packet capture (PCAP/PCAPNG)',
      infoHtml: 'Professional packet analyzer. Decodes Ethernet, IPv4, IPv6, TCP, UDP, ICMP, ARP, DNS, HTTP, and more. 100% private, local processing.',

      actions: [
        {
          label: '📋 Copy as JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const packets = h.getState().packets;
            if (!packets || packets.length === 0) {
              h.showError('No packets to copy', 'Please load a valid PCAP file first.');
              return;
            }
            h.showLoading('Preparing JSON export...');
            setTimeout(() => {
              try {
                const data = JSON.stringify(packets.map(p => ({
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
            }, 10);
          }
        },
        {
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const packets = h.getState().packets;
            if (!packets || packets.length === 0) return;
            const headers = ['No.', 'Time', 'Source', 'Destination', 'Protocol', 'Length', 'Info'];
            const rows = packets.map(p => [
              p.num,
              p.time.toFixed(6),
              `"${p.src}"`,
              `"${p.dst}"`,
              p.proto,
              p.len,
              `"${p.info.replace(/"/g, '""')}"`
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            h.download(`${h.getState().fileName || 'capture'}.csv`, csv, 'text/csv');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onFile: async function (file, content, h) {
        h.setState('fileName', file.name);
        h.setState('fileSize', file.size);
        h.showLoading('Decompressing capture...');

        try {
          let buffer = content;

          // B1 & B4: Race condition check for pako
          const magicBytes = new Uint8Array(buffer.slice(0, 2));
          if (file.name.endsWith('.gz') || (magicBytes[0] === 0x1F && magicBytes[1] === 0x8B)) {
            if (typeof pako === 'undefined') {
              await new Promise(resolve => {
                const check = setInterval(() => {
                  if (typeof pako !== 'undefined') {
                    clearInterval(check);
                    resolve();
                  }
                }, 50);
                setTimeout(() => { clearInterval(check); resolve(); }, 10000);
              });
            }
            if (typeof pako === 'undefined') throw new Error('Decompression engine (pako) failed to load.');
            buffer = pako.ungzip(new Uint8Array(buffer)).buffer;
          }

          h.showLoading('Parsing packet structures...');
          const result = await parsePcap(buffer);
          
          if (!result.packets || result.packets.length === 0) {
            h.setState('packets', []);
            h.render(renderEmptyState(h));
            return;
          }

          h.setState('packets', result.packets);
          h.setState('filter', '');
          h.setState('protoFilter', 'ALL');
          h.setState('sortCol', 'num');
          h.setState('sortDir', 1);
          h.setState('selectedPacket', null);
          
          renderUI(h);
        } catch (err) {
          console.error('[PCAP] Error:', err);
          h.showError('Could not open PCAP file', err.message || 'The file may be corrupted or in an unsupported variant. Try a standard PCAP or PCAPNG file.');
        }
      }
    });
  };

  function renderUI(h) {
    const packets = h.getState().packets || [];
    const filter = (h.getState().filter || '').toLowerCase();
    const protoFilter = h.getState().protoFilter || 'ALL';
    const sortCol = h.getState().sortCol || 'num';
    const sortDir = h.getState().sortDir || 1;
    const fileName = h.getState().fileName;
    const fileSize = h.getState().fileSize;

    const filtered = packets.filter(p => {
      const matchesText = !filter || 
        p.src.toLowerCase().includes(filter) || 
        p.dst.toLowerCase().includes(filter) || 
        p.info.toLowerCase().includes(filter) || 
        p.proto.toLowerCase().includes(filter);
      const matchesProto = protoFilter === 'ALL' || p.proto === protoFilter;
      return matchesText && matchesProto;
    });

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

    const truncated = filtered.slice(0, 1000);
    const isTruncated = filtered.length > 1000;

    const protos = {};
    packets.forEach(p => protos[p.proto] = (protos[p.proto] || 0) + 1);
    const topProtos = Object.entries(protos).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);

    let html = `
      <!-- U1. File info bar -->
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(fileSize)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">${packets.length.toLocaleString()} packets</span>
      </div>

      <!-- DATA excellence: Search/Filter -->
      <div class="relative mb-6">
        <input type="text" id="pcap-search" placeholder="Search by IP, Protocol, or Info..." 
          class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
          value="${escapeHtml(h.getState().filter || '')}">
        <div class="absolute left-3.5 top-3 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
      </div>

      <!-- Protocol Toggles (Log style filter) -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button class="proto-btn px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${protoFilter === 'ALL' ? 'bg-surface-800 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}" data-proto="ALL">ALL</button>
        ${topProtos.map(proto => `
          <button class="proto-btn px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${protoFilter === proto ? getProtoClass(proto, true) : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}" data-proto="${proto}">${proto}</button>
        `).join('')}
      </div>

      <!-- U10. Section header with counts -->
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-surface-800">Packets</h3>
        <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length.toLocaleString()} items</span>
      </div>

      <!-- U7. Tables -->
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm mb-6">
        <table class="min-w-full text-sm font-mono">
          <thead>
            <tr class="bg-surface-50/50">
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
            ${truncated.map(p => `
              <tr class="packet-row even:bg-surface-50/30 hover:bg-brand-50 transition-colors cursor-pointer ${h.getState().selectedPacket?.num === p.num ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : ''}" data-num="${p.num}">
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100">${p.num}</td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 whitespace-nowrap">${p.time.toFixed(4)}</td>
                <td class="px-4 py-2 text-surface-900 border-b border-surface-100 font-medium whitespace-nowrap">${escapeHtml(p.src)}</td>
                <td class="px-4 py-2 text-surface-900 border-b border-surface-100 font-medium whitespace-nowrap">${escapeHtml(p.dst)}</td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${getProtoClass(p.proto)}">${p.proto}</span>
                </td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100">${p.len}</td>
                <td class="px-4 py-2 text-surface-600 border-b border-surface-100 truncate max-w-xs xl:max-w-md" title="${escapeHtml(p.info)}">${escapeHtml(p.info)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${isTruncated ? `
        <div class="mb-8 p-4 bg-surface-50 rounded-xl border border-surface-200 text-surface-600 text-sm flex items-center gap-3">
          <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Showing first 1,000 packets. Use search or protocol filters to narrow down results.</span>
        </div>
      ` : ''}

      <!-- Packet Inspector -->
      <div id="inspector" class="${h.getState().selectedPacket ? '' : 'hidden'} space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div class="flex items-center justify-between border-b border-surface-200 pb-4">
          <h3 class="text-lg font-bold text-surface-900">Packet Detail <span class="text-surface-400 font-normal ml-2">#${h.getState().selectedPacket?.num}</span></h3>
          <button id="close-inspector" class="p-2 hover:bg-surface-100 rounded-full transition-colors text-surface-400 hover:text-surface-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <!-- U8. Code/pre blocks (Hex Dump) -->
            <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950">
              <div class="px-4 py-2 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
                <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Hex Dump</span>
                <button id="copy-hex" class="text-[10px] font-bold text-brand-400 hover:text-brand-300 uppercase tracking-widest">Copy Raw</button>
              </div>
              <pre id="hex-view" class="p-4 text-[10px] sm:text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed"></pre>
            </div>
          </div>

          <div class="space-y-4">
            <!-- U9. Content cards -->
            <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
              <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Protocol Analysis</h4>
              <div id="inspector-analysis" class="space-y-3"></div>
            </div>
            
            <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
              <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Metadata</h4>
              <div id="inspector-meta" class="space-y-1.5 text-xs font-mono text-surface-500"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const el = h.getRenderEl();

    const searchInput = el.querySelector('#pcap-search');
    searchInput.oninput = (e) => {
      h.setState('filter', e.target.value);
      renderUI(h);
      const input = el.querySelector('#pcap-search');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    el.querySelectorAll('.proto-btn').forEach(btn => {
      btn.onclick = () => {
        h.setState('protoFilter', btn.dataset.proto);
        renderUI(h);
      };
    });

    el.querySelectorAll('.sort-header').forEach(header => {
      header.onclick = () => {
        const col = header.dataset.col;
        if (h.getState().sortCol === col) {
          h.setState('sortDir', h.getState().sortDir * -1);
        } else {
          h.setState('sortCol', col);
          h.setState('sortDir', 1);
        }
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
          const inspector = el.querySelector('#inspector');
          inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
    });

    const closeBtn = el.querySelector('#close-inspector');
    if (closeBtn) closeBtn.onclick = () => { h.setState('selectedPacket', null); renderUI(h); };

    if (h.getState().selectedPacket) {
      updateInspector(h.getState().selectedPacket, h);
    }
  }

  function renderHeader(label, col, currentCol, currentDir) {
    const isSorted = currentCol === col;
    return `
      <th class="sort-header sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-col="${col}">
        <div class="flex items-center gap-1">
          ${label}
          <span class="text-[10px] ${isSorted ? 'text-brand-600' : 'text-surface-300'}">
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

    let hexStr = '';
    const data = packet.data;
    for (let i = 0; i < data.length; i += 16) {
      const chunk = data.slice(i, i + 16);
      const offset = i.toString(16).padStart(4, '0').toUpperCase();
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      hexStr += `${offset}  ${hex.padEnd(47)}  ${escapeHtml(ascii)}\n`;
    }
    hexView.textContent = hexStr;

    analysis.innerHTML = `
      <div class="flex justify-between items-center text-sm">
        <span class="text-surface-500">Protocol</span>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getProtoClass(packet.proto)}">${packet.proto}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-bold text-surface-400 uppercase tracking-widest">Source</span>
        <span class="text-surface-900 font-medium font-mono bg-surface-50 px-2 py-1.5 rounded border border-surface-100">${escapeHtml(packet.src)}</span>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-bold text-surface-400 uppercase tracking-widest">Destination</span>
        <span class="text-surface-900 font-medium font-mono bg-surface-50 px-2 py-1.5 rounded border border-surface-100">${escapeHtml(packet.dst)}</span>
      </div>
      <div class="pt-2">
        <span class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1 block">Info Summary</span>
        <p class="text-sm text-surface-700 leading-relaxed">${escapeHtml(packet.info)}</p>
      </div>
    `;

    meta.innerHTML = `
      <div>Captured: ${packet.data.length} bytes</div>
      <div>Wire Length: ${packet.len} bytes</div>
      <div>Offset: ${packet.time.toFixed(6)}s</div>
    `;

    el.querySelector('#copy-hex').onclick = (e) => h.copyToClipboard(hexStr, e.target);
  }

  async function parsePcap(buffer) {
    const dv = new DataView(buffer);
    if (buffer.byteLength < 24) throw new Error('File is too small to be a valid capture.');

    const magic = dv.getUint32(0, true);
    let isLittle = true;
    let isPcapNg = false;
    let nano = false;

    if (magic === 0xA1B2C3D4) isLittle = false;
    else if (magic === 0xD4C3B2A1) isLittle = true;
    else if (magic === 0xA1B23C4D) { isLittle = false; nano = true; }
    else if (magic === 0x4D3CB2A1) { isLittle = true; nano = true; }
    else if (magic === 0x0A0D0D0A) { isPcapNg = true; isLittle = true; }
    else throw new Error('Unsupported PCAP magic number. Please use standard PCAP or PCAPNG.');

    if (isPcapNg) return parsePcapNg(buffer, isLittle);

    const network = dv.getUint32(20, isLittle);
    const packets = [];
    let pos = 24;
    let startTime = null;
    const MAX = 25000; 

    while (pos + 16 <= buffer.byteLength && packets.length < MAX) {
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
    const MAX = 25000;

    while (offset + 8 <= buffer.byteLength && packets.length < MAX) {
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
    let res = { src: 'Local', dst: 'Broadcast', proto: 'RAW', info: 'Layer 2 Frame' };
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
          if (dp === 80 || sp === 80) res.proto = 'HTTP';
          else if (dp === 443 || sp === 443) res.proto = 'TLS';
        }
      }
    } else if (proto === 17) { 
      res.proto = 'UDP';
      res.src += `:${sp}`;
      res.dst += `:${dp}`;
      if (dp === 53 || sp === 53) res.proto = 'DNS';
      else if (dp === 67 || dp === 68 || sp === 67 || sp === 68) res.proto = 'DHCP';
      else if (dp === 123 || sp === 123) res.proto = 'NTP';
    } else if (proto === 1) {
      res.proto = 'ICMP';
      const type = data[offset];
      res.info = type === 8 ? 'Echo Request' : type === 0 ? 'Echo Reply' : `Type ${type}`;
    } else if (proto === 58) {
      res.proto = 'ICMPv6';
      res.info = `Type ${data[offset]}`;
    }
  }

  function formatIPv6(b) {
    const p = [];
    for (let i = 0; i < 16; i += 2) p.push(((b[i] << 8) | b[i + 1]).toString(16));
    return p.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
  }

  function formatMAC(b) {
    return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(':');
  }

  function getProtoClass(p, active = false) {
    const map = {
      'TCP': active ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700',
      'UDP': active ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700',
      'ICMP': active ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700',
      'ICMPv6': active ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700',
      'ARP': active ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700',
      'HTTP': active ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700',
      'TLS': active ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700',
      'DNS': active ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700',
      'DHCP': active ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-700'
    };
    return map[p] || (active ? 'bg-surface-800 text-white' : 'bg-surface-100 text-surface-600');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function renderEmptyState(h) {
    return `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(h.getState().fileName)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(h.getState().fileSize)}</span>
      </div>
      <div class="flex flex-col items-center justify-center py-16 px-4 text-center border border-surface-200 rounded-2xl bg-surface-50/50 border-dashed">
        <div class="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6 text-surface-300">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h3 class="text-xl font-bold text-surface-900 mb-2">No packets detected</h3>
        <p class="text-surface-500 max-w-sm mx-auto">This file doesn't seem to contain any valid network traffic. Try another PCAP or PCAPNG capture.</p>
      </div>
    `;
  }

})();
