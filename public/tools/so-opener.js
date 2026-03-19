(function() {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.so,.dylib',
      dropLabel: 'Drop a .so file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed for hex dump and basic ELF parsing
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing shared object...');
        
        try {
          const bytes = new Uint8Array(content);
          const isElf = bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;
          
          let html = `
            <div class="p-6">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
                <span class="font-medium">${escapeHtml(file.name)}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-400">·</span>
                <span class="px-2 py-0.5 bg-surface-200 rounded text-[10px] font-bold uppercase tracking-wider">
                  ${isElf ? 'ELF Binary' : 'Binary File'}
                </span>
              </div>
          `;

          if (isElf) {
            const elfInfo = parseElfHeader(bytes);
            html += `
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                ${renderInfoCard('Class', elfInfo.class)}
                ${renderInfoCard('Data', elfInfo.data)}
                ${renderInfoCard('OS/ABI', elfInfo.osAbi)}
                ${renderInfoCard('Type', elfInfo.type)}
                ${renderInfoCard('Machine', elfInfo.machine)}
                ${renderInfoCard('Version', elfInfo.version)}
              </div>
            `;
          }

          html += `
            <h3 class="text-lg font-bold text-surface-900 mb-4 flex items-center gap-2">
              <span class="text-brand-500">#</span> Hex Dump (First 256 bytes)
            </h3>
            <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
              <table class="w-full text-[13px] font-mono text-left border-collapse min-w-max">
                <thead>
                  <tr class="bg-surface-50 border-b border-surface-200">
                    <th class="px-4 py-2 text-surface-400 font-bold border-r border-surface-200 w-24">Offset</th>
                    <th class="px-4 py-2 text-surface-700 font-bold">Hex Bytes</th>
                    <th class="px-4 py-2 text-surface-500 font-bold border-l border-surface-200">ASCII</th>
                  </tr>
                </thead>
                <tbody>
                  ${renderHexDump(bytes.slice(0, 256))}
                </tbody>
              </table>
            </div>
          </div>`;

          helpers.render(html);
          helpers.setState('hexDump', generateFullHexDump(bytes.slice(0, 1024)));
        } catch(e) {
          helpers.showError('Could not parse shared object', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getFile().name, btn);
          }
        },

        {
          label: '📋 Copy Hex',
          id: 'copy',
          onClick: function(helpers, btn) {
            const hex = helpers.getState().hexDump || '';
            helpers.copyToClipboard(hex, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Shared Object (.so) files are parsed entirely in your browser. No binary data is uploaded.'
    });
  };

  function renderInfoCard(label, value) {
    return `
      <div class="p-4 bg-white border border-surface-200 rounded-xl shadow-sm">
        <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">${label}</div>
        <div class="text-surface-700 font-medium">${escapeHtml(value || 'Unknown')}</div>
      </div>
    `;
  }

  function renderHexDump(bytes) {
    let html = '';
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const offset = i.toString(16).padStart(8, '0');
      
      let hex = '';
      let ascii = '';
      
      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          const b = chunk[j];
          hex += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          hex += '   ';
        }
        if (j === 7) hex += ' ';
      }
      
      html += `
        <tr class="hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-0">
          <td class="px-4 py-1.5 text-surface-300 border-r border-surface-200 bg-surface-50/30">${offset}</td>
          <td class="px-4 py-1.5 text-surface-600 whitespace-pre">${hex}</td>
          <td class="px-4 py-1.5 text-surface-400 border-l border-surface-200">${escapeHtml(ascii)}</td>
        </tr>
      `;
    }
    return html;
  }

  function generateFullHexDump(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const offset = i.toString(16).padStart(8, '0');
      let hex = '';
      let ascii = '';
      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          const b = chunk[j];
          hex += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          hex += '   ';
        }
      }
      out += offset + '  ' + hex + ' |' + ascii + '|\n';
    }
    return out;
  }

  function parseElfHeader(bytes) {
    const ei_class = bytes[4];
    const ei_data = bytes[5];
    const ei_osabi = bytes[7];
    
    // We need to know endianness to read multi-byte values
    const isLittleEndian = ei_data === 1;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    
    // e_type is 2 bytes at offset 16
    const e_type = view.getUint16(16, isLittleEndian);
    // e_machine is 2 bytes at offset 18
    const e_machine = view.getUint16(18, isLittleEndian);

    const classes = { 1: 'ELF32', 2: 'ELF64' };
    const datas = { 1: 'Little Endian', 2: 'Big Endian' };
    const abis = {
      0: 'System V', 1: 'HP-UX', 2: 'NetBSD', 3: 'Linux', 4: 'GNU Hurd',
      6: 'Solaris', 7: 'AIX', 8: 'IRIX', 9: 'FreeBSD', 10: 'Tru64',
      11: 'Novell Modesto', 12: 'OpenBSD', 13: 'OpenVMS', 14: 'NonStop Kernel',
      15: 'AROS', 16: 'FenixOS', 17: 'CloudABI', 18: 'Stratus Technologies OpenVOS'
    };
    const types = {
      0: 'None', 1: 'Relocatable (ET_REL)', 2: 'Executable (ET_EXEC)',
      3: 'Shared Object (ET_DYN)', 4: 'Core (ET_CORE)'
    };
    const machines = {
      0: 'None', 1: 'AT&T WE 32100', 2: 'SPARC', 3: 'x86', 4: 'Motorola 68000',
      5: 'Motorola 88000', 7: 'Intel 80860', 8: 'MIPS', 19: 'Intel 80960',
      20: 'PowerPC', 21: 'PowerPC 64-bit', 22: 'S390', 40: 'ARM', 42: 'SuperH',
      50: 'SPARC V9', 62: 'x86-64', 183: 'AArch64', 243: 'RISC-V'
    };

    return {
      class: classes[ei_class] || 'Unknown',
      data: datas[ei_data] || 'Unknown',
      osAbi: abis[ei_osabi] || 'Unknown',
      type: types[e_type] || `Unknown (${e_type})`,
      machine: machines[e_machine] || `Unknown (${e_machine})`,
      version: bytes[6] === 1 ? '1 (Current)' : bytes[6]
    };
  }
})();
