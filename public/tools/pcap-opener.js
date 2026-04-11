(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pcap,.pcapng,.cap,.gz',
      binary: true,
      dropLabel: 'Drop a packet capture (PCAP/PCAPNG)',
      infoHtml: 'Professional packet capture analyzer. Decodes Ethernet, IPv4, IPv6, TCP, UDP, ICMP, ARP, and more. Processing is 100% local and private.',

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
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        }
      },

      onFile: async function (file, content, h) {
        h.setState('fileName', file.name);
        h.setState('fileSize', formatSize(file.size));
        h.showLoading('Analyzing packet capture...');

        try {
          let buffer = content;

          // B1 & B3: Handle Pako loading for GZIP
          const magicBytes = new Uint8Array(buffer.slice(0, 2));
          if (file.name.endsWith('.gz') || (magicBytes[0] === 0x1F && magicBytes[1] === 0x8B)) {
            if (typeof pako === 'undefined') {
              h.showLoading('Loading decompression library...');
              await new Promise((resolve) => {
                const check = setInterval(() => {
                  if (typeof pako !== 'undefined') {
                    clearInterval(check);
                    resolve();
                  }
                }, 50);
                setTimeout(() => { clearInterval(check); resolve(); }, 5000);
              });
            }
            if (typeof pako !== 'undefined') {
              buffer = pako.ungzip(new Uint8Array(buffer)).buffer;
            } else {
              throw new Error('Decompression library failed to load');
            }
          }

          const result = parsePcap(buffer);
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
          h.showError('Could not open PCAP file', 'The file may be corrupted, in an unsupported variant, or too large. Try a standard PCAP or PCAPNG file.');
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

    // Filter
    let filtered = packets.filter(p => {
      const matchesText = !filter || 
        p.src.toLowerCase().includes(filter) || 
        p.dst.toLowerCase().includes(filter) || 
        p.info.toLowerCase().includes(filter) || 
        p.proto.toLowerCase().includes(filter);
      const matchesProto = protoFilter === 'ALL' || p.proto === protoFilter;
      return matchesText && matchesProto;
    });

    // Sort
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

    // Calculate protocol distribution
    const protos = {};
    packets.forEach(p => protos[p.proto] = (protos[p.proto] || 0) + 1);
    const topProtos = Object.entries(protos).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);

    let html = `
      <!-- U1. File Info Bar -->
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
        <span class="text-surface-300">|</span>
        <span>${fileSize}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">${packets.length.toLocaleString()} packets × 7 columns</span>
      </div>

      <!-- Protocol Filters (LOGS style) -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button class="proto-btn px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${protoFilter === 'ALL' ? 'bg-brand-600 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}" data-proto="ALL">ALL</button>
        ${topProtos.map(proto => `
          <button class="proto-btn px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${protoFilter === proto ? getProtoClass(proto, true) : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}" data-proto="${proto}">${proto}</button>
        `).join('')}
      </div>

      <!-- U10. Section Header -->
      <div class="flex items-center justify-between mb-3 px-1">
        <h3 class="font-semibold text-surface-800">Traffic Analysis</h3>
        <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length.toLocaleString()} matches</span>
      </div>

      <!-- DATA Excellence: Live search -->
      <div class="relative mb-4">
        <input type="text" id="pcap-search" placeholder="Search by IP, Protocol, or Info text..." 
          class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
          value="${escapeHtml(h.getState().filter || '')}">
        <div class="absolute left-3.5 top-3 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
      </div>

      <!-- U7. Table with Sorting -->
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm mb-6">
        <table class="min-w-full text-sm font-mono border-separate border-spacing-0">
          <thead>
            <tr>
              ${renderSortHeader('No.', 'num', sortCol, sortDir)}
              ${renderSortHeader('Time', 'time', sortCol, sortDir)}
              ${renderSortHeader('Source', 'src', sortCol, sortDir)}
              ${renderSortHeader('Destination', 'dst', sortCol, sortDir)}
              ${renderSortHeader('Protocol', 'proto', sortCol, sortDir)}
              ${renderSortHeader('Length', 'len', sortCol, sortDir)}
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10">Info</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100">
            ${truncated.map(p => `
              <tr class="packet-row even:bg-surface-50 hover:bg-brand-50 transition-colors cursor-pointer ${h.getState().selectedPacket?.num === p.num ? 'bg-brand-50' : ''}" data-num="${p.num}">
                <td class="px-4 py-2.5 text-surface-500 whitespace-nowrap">${p.num}</td>
                <td class="px-4 py-2.5 text-surface-600 whitespace-nowrap">${p.time.toFixed(4)}</td>
                <td class="px-4 py-2.5 font-medium text-surface-800 whitespace-nowrap">${escapeHtml(p.src)}</td>
                <td class="px-4 py-2.5 font-medium text-surface-800 whitespace-nowrap">${escapeHtml(p.dst)}</td>
                <td class="px-4 py-2.5 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${getProtoClass(p.proto)}">${p.proto}</span>
                </td>
                <td class="px-4 py-2.5 text-surface-600 whitespace-nowrap">${p.len}</td>
                <td class="px-4 py-2.5 text-surface-700 truncate max-w-[200px] md:max-w-[400px]" title="${escapeHtml(p.info)}">${escapeHtml(p.info)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      ${isTruncated ? `
        <div class="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-sm flex items-center gap-2">
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          Showing first 1,000 matches. Use search or filters to refine.
        </div>
      ` : ''}

      <div id="inspector-container" class="${h.getState().selectedPacket ? '' : 'hidden'}">
        <div class="flex items-center justify-between mb-3 px-1">
          <h3 class="font-semibold text-surface-800">Packet Inspector</h3>
          <button id="close-inspector" class="p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        
        <!-- U8. Code/Pre Blocks -->
        <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
          <div class="bg-surface-50 border-b border-surface-200 px-4 py-2 flex justify-between items-center">
            <span class="text-xs font-mono text-surface-500" id="inspector-meta"></span>
            <button id="copy-hex" class="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors">Copy Hex</button>
          </div>
          <pre id="hex-view" class="p-4 text-[10px] md:text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed select-all"></pre>
        </div>
      </div>
    `;

    h.render(html);

    // Bind Events
    const el = h.getRenderEl();
    
    const searchInput = el.querySelector('#pcap-search');
    searchInput.oninput = (e) => {
      h.setState('filter', e.target.value);
      renderUI(h);
      el.querySelector('#pcap-search').focus();
    };

    el.querySelectorAll('.proto-btn').forEach(btn => {
      btn.onclick = () => {
        const proto = btn.dataset.proto;
        h.setState('protoFilter', proto);
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
          updateInspector(packet, h);
          el.querySelector('#inspector-container').classList.remove('hidden');
          el.querySelector('#inspector-container').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          renderUI(h); // Refresh to show selection highlight
        }
      };
    });

    const closeBtn = el.querySelector('#close-inspector');
    if (closeBtn) {
      closeBtn.onclick = () => {
        h.setState('selectedPacket', null);
        el.querySelector('#inspector-container').classList.add('hidden');
        renderUI(h);
      };
    }

    if (h.getState().selectedPacket) {
      updateInspector(h.getState().selectedPacket, h);
    }
  }

  function renderSortHeader(label, col, currentCol, currentDir) {
    const isSorted = currentCol === col;
    return `
      <th class="sort-header sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10 cursor-pointer hover:bg-surface-50 transition-colors group" data-col="${col}">
        <div class="flex items-center gap-1">
          ${label}
          <span class="text-xs transition-opacity ${isSorted ? 'opacity-100 text-brand-500' : 'opacity-0 group-hover:opacity-40'}">
            ${isSorted && currentDir === -1 ? '▼' : '▲'}
          </span>
        </div>
      </th>
    `;
  }

  function updateInspector(packet, h) {
    const el = h.getRenderEl();
    const meta = el.querySelector('#inspector-meta');
    const hexView = el.querySelector('#hex-view');
    const copyBtn = el.querySelector('#copy-hex');
    
    if (!meta || !hexView) return;

    meta.innerText = `Packet #${packet.num} • ${packet.proto} • ${packet.len} bytes`;
    
    let hexContent = '';
    const data = packet.data;
    
    for (let i = 0; i < data.length; i += 16) {
      const chunk = data.slice(i, i + 16);
      const offset = i.toString(16).padStart(4, '0').toUpperCase();
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const ascii = Array.from(chunk).map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      hexContent += `<span class="text-gray-500">${offset}</span>  <span class="text-brand-400">${hex.padEnd(47)}</span>  <span class="text-gray-400">${escapeHtml(ascii)}</span>\n`;
    }
    
    hexView.innerHTML = hexContent;
    copyBtn.onclick = (e) => h.copyToClipboard(hexView.innerText, e.target);
  }

  function parsePcap(buffer) {
    const dv = new DataView(buffer);
    if (buffer.byteLength < 24) throw new Error('File too small to be a valid PCAP');

    const magic = dv.getUint32(0, true);
    let isLittle = true;
    let isPcapNg = false;
    let nano = false;

    if (magic === 0xA1B2C3D4) isLittle = false;
    else if (magic === 0xD4C3B2A1) isLittle = true;
    else if (magic === 0xA1B23C4D) { isLittle = false; nano = true; }
    else if (magic === 0x4D3CB2A1) { isLittle = true; nano = true; }
    else if (magic === 0x0A0D0D0A) { isPcapNg = true; isLittle = true; }
    else throw new Error('Unsupported PCAP magic number. Please use a standard PCAP or PCAPNG file.');

    if (isPcapNg) return parsePcapNg(buffer, isLittle);

    const network = dv.getUint32(20, isLittle);
    const MAX_PACKETS = 50000;
    const result = [];
    let pos = 24;
    let startTime = null;

    while (pos + 16 <= buffer.byteLength && result.length < MAX_PACKETS) {
      const tsSec = dv.getUint32(pos, isLittle);
      const tsSub = dv.getUint32(pos + 4, isLittle);
      const inclLen = dv.getUint32(pos + 8, isLittle);
      const origLen = dv.getUint32(pos + 12, isLittle);
      
      if (pos + 16 + inclLen > buffer.byteLength) break;
      
      const time = tsSec + (nano ? tsSub / 1e9 : tsSub / 1e6);
      if (startTime === null) startTime = time;
      
      const data = new Uint8Array(buffer, pos + 16, inclLen);
      const decoded = decodePacket(data, network);
      
      result.push({
        num: result.length + 1,
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

    return { packets: result };
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

      if (type === 0x00000001) { // IDB
        ifaceLinkType = dv.getUint16(offset + 8, isLittle);
      } else if (type === 0x00000006 || type === 0x00000003) { // EPB or SPB
        const isEPB = type === 0x06;
        const tsHigh = isEPB ? dv.getUint32(offset + 12, isLittle) : 0;
        const tsLow = isEPB ? dv.getUint32(offset + 16, isLittle) : 0;
        const capturedLen = isEPB ? dv.getUint32(offset + 20, isLittle) : dv.getUint32(offset + 8, isLittle);
        const packetLen = isEPB ? dv.getUint32(offset + 24, isLittle) : capturedLen;
        
        const time = (tsHigh * 4294967296 + tsLow) / 1000000;
        if (startTime === null) startTime = time;
        
        const dataOffset = isEPB ? 28 : 12;
        if (offset + dataOffset + capturedLen <= buffer.byteLength) {
          const data = new Uint8Array(buffer, offset + dataOffset, capturedLen);
          const decoded = decodePacket(data, ifaceLinkType);
          packets.push({ 
            num: packets.length + 1, 
            time: time - startTime, 
            len: packetLen, 
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
    let res = { src: '-', dst: '-', proto: 'LINK', info: 'Layer 2' };
    let ethType = 0;
    let payloadOffset = 0;

    // Ethernet
    if (network === 1 && data.length >= 14) {
      ethType = (data[12] << 8) | data[13];
      payloadOffset = 14;
      res.src = formatMAC(data.slice(6, 12));
      res.dst = formatMAC(data.slice(0, 6));
      res.proto = 'ETHER';
    } 
    // Linux Cooked Mode
    else if (network === 113 && data.length >= 16) {
      ethType = (data[14] << 8) | data[15];
      payloadOffset = 16;
      res.proto = 'SLL';
    } else return res;

    if (ethType === 0x0800) return decodeIPv4(data, payloadOffset);
    if (ethType === 0x86DD) return decodeIPv6(data, payloadOffset);
    if (ethType === 0x0806) {
      res.proto = 'ARP';
      if (data.length >= payloadOffset + 28) {
        const op = data[payloadOffset + 7];
        const spa = data.slice(payloadOffset + 14, payloadOffset + 18).join('.');
        const tpa = data.slice(payloadOffset + 24, payloadOffset + 28).join('.');
        res.info = op === 1 ? `Who has ${tpa}? Tell ${spa}` : `Reply: ${spa} is at ${formatMAC(data.slice(payloadOffset + 8, payloadOffset + 14))}`;
      }
      return res;
    }
    return res;
  }

  function decodeIPv4(data, offset) {
    if (data.length < offset + 20) return { src: 'IPv4', dst: '-', proto: 'IPv4', info: 'Truncated' };
    const ihl = (data[offset] & 0x0F) * 4;
    const proto = data[offset + 9];
    const src = data.slice(offset + 12, offset + 16).join('.');
    const dst = data.slice(offset + 16, offset + 20).join('.');
    let res = { src, dst, proto: 'IPv4', info: '' };
    if (proto === 6) decodeL4(data, offset + ihl, 'TCP', res);
    else if (proto === 17) decodeL4(data, offset + ihl, 'UDP', res);
    else if (proto === 1) { 
      res.proto = 'ICMP'; 
      const type = data[offset + ihl];
      res.info = type === 8 ? 'Echo Request' : type === 0 ? 'Echo Reply' : `Type ${type}`;
    } else res.proto = `IP(${proto})`;
    return res;
  }

  function decodeIPv6(data, offset) {
    if (data.length < offset + 40) return { src: 'IPv6', dst: '-', proto: 'IPv6', info: 'Truncated' };
    const nextHeader = data[offset + 6];
    const src = formatIPv6(data.slice(offset + 8, offset + 24));
    const dst = formatIPv6(data.slice(offset + 24, offset + 40));
    let res = { src, dst, proto: 'IPv6', info: '' };
    if (nextHeader === 6) decodeL4(data, offset + 40, 'TCP', res);
    else if (nextHeader === 17) decodeL4(data, offset + 40, 'UDP', res);
    else if (nextHeader === 58) { res.proto = 'ICMPv6'; res.info = `Type ${data[offset + 40]}`; }
    return res;
  }

  function decodeL4(data, offset, name, res) {
    res.proto = name;
    if (data.length < offset + 4) return;
    const sp = (data[offset] << 8) | data[offset + 1];
    const dp = (data[offset + 2] << 8) | data[offset + 3];
    res.src += ':' + sp;
    res.dst += ':' + dp;
    if (name === 'TCP' && data.length >= offset + 14) {
      const flags = data[offset + 13];
      const f = [];
      if (flags & 0x02) f.push('SYN');
      if (flags & 0x10) f.push('ACK');
      if (flags & 0x01) f.push('FIN');
      if (flags & 0x04) f.push('RST');
      if (flags & 0x08) f.push('PSH');
      res.info = f.join(' ');
      
      const dataOffset = (data[offset + 12] >> 4) * 4;
      const payloadLen = data.length - (offset + dataOffset);
      if (payloadLen > 0) {
        if (dp === 80 || sp === 80) res.proto = 'HTTP';
        else if (dp === 443 || sp === 443) res.proto = 'TLS';
      }
    } else if (name === 'UDP') {
      if (dp === 53 || sp === 53) res.proto = 'DNS';
      else if (dp === 67 || dp === 68 || sp === 67 || sp === 68) res.proto = 'DHCP';
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
      'TCP': active ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-100 text-blue-700',
      'UDP': active ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-100 text-sky-700',
      'ICMP': active ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-100 text-purple-700',
      'ICMPv6': active ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-100 text-purple-700',
      'ARP': active ? 'bg-orange-600 text-white shadow-sm' : 'bg-orange-100 text-orange-700',
      'HTTP': active ? 'bg-green-600 text-white shadow-sm' : 'bg-green-100 text-green-700',
      'TLS': active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-100 text-emerald-700',
      'DNS': active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-100 text-indigo-700',
      'DHCP': active ? 'bg-yellow-600 text-white shadow-sm' : 'bg-yellow-100 text-yellow-700'
    };
    return map[p] || (active ? 'bg-surface-600 text-white shadow-sm' : 'bg-surface-100 text-surface-600');
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
        <span>${h.getState().fileSize}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.pcap file</span>
      </div>
      <div class="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50/50">
        <div class="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 text-surface-300">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h3 class="text-lg font-semibold text-surface-900 mb-2">No packets found</h3>
        <p class="text-surface-500 max-w-sm mx-auto">The file was parsed successfully but contained no recognizable packets. It may be using an unsupported link layer or be empty.</p>
      </div>
    `;
  }

})();
