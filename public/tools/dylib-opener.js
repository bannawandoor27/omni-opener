(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dylib',
      dropLabel: 'Drop a .dylib file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed for hex dump
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing dylib...');
        
        try {
          const bytes = new Uint8Array(content);
          const size = file.size;
          const magic = getMagicInfo(bytes);
          
          let html = `
            <div class="p-6">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
                <span class="font-medium">${escapeHtml(file.name)}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(size)}</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="p-4 border border-surface-200 rounded-xl bg-white">
                  <p class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">File Information</p>
                  <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Format</span>
                      <span class="font-mono text-brand-600 font-medium">${magic.format}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Magic Bytes</span>
                      <span class="font-mono text-surface-700">${magic.hex}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Architecture</span>
                      <span class="font-mono text-surface-700">${magic.arch}</span>
                    </div>
                  </div>
                </div>
                <div class="p-4 border border-surface-200 rounded-xl bg-white">
                  <p class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Binary Stats</p>
                  <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Total Size</span>
                      <span class="font-mono text-surface-700">${size.toLocaleString()} bytes</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-surface-500">Header Size</span>
                      <span class="font-mono text-surface-700">${Math.min(size, 32)} bytes parsed</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border border-surface-200 rounded-xl overflow-hidden bg-white">
                <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                  <span class="text-xs font-bold text-surface-500 uppercase">Hex Dump (First 256 Bytes)</span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full font-mono text-[11px] leading-tight border-collapse">
                    <thead>
                      <tr class="bg-surface-50/50 border-b border-surface-100">
                        <th class="px-3 py-2 text-left text-surface-400 font-medium w-20">Offset</th>
                        <th class="px-3 py-2 text-left text-surface-700 font-medium">Hex Bytes</th>
                        <th class="px-3 py-2 text-left text-surface-400 font-medium w-32 text-center">ASCII</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-50">
                      ${generateHexDump(bytes.slice(0, 256))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);
        } catch (e) {
          helpers.showError('Could not parse dylib file', e.message);
        }
      },
      actions: [
        { 
          label: '📋 Copy Hex', 
          id: 'copy-hex', 
          onClick: function(helpers, btn) {
            const bytes = new Uint8Array(helpers.getContent());
            const dump = generateRawHexDump(bytes.slice(0, 256));
            helpers.copyToClipboard(dump, btn);
          } 
        },
        { 
          label: '📥 Download', 
          id: 'dl', 
          onClick: function(helpers, btn) { 
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/octet-stream');
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });

    function getMagicInfo(bytes) {
      if (bytes.length < 4) return { format: 'Unknown', hex: 'N/A', arch: 'Unknown' };
      
      const magic = (bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0;
      const hex = '0x' + magic.toString(16).toUpperCase();
      
      switch (magic) {
        case 0xFEEDFACE: return { format: 'Mach-O 32-bit', hex, arch: 'PowerPC/x86' };
        case 0xFEEDFACF: return { format: 'Mach-O 64-bit', hex, arch: 'x86_64/ARM64' };
        case 0xCEFAEDFE: return { format: 'Mach-O 32-bit (LE)', hex, arch: 'x86' };
        case 0xCFFAEDFE: return { format: 'Mach-O 64-bit (LE)', hex, arch: 'x86_64/ARM64' };
        case 0xCAFEBABE: return { format: 'Mach-O Universal', hex, arch: 'Multi-Arch' };
        case 0xBEBAFECA: return { format: 'Mach-O Universal (LE)', hex, arch: 'Multi-Arch' };
        default: return { format: 'Binary / Unknown', hex, arch: 'Unknown' };
      }
    }

    function generateHexDump(bytes) {
      let html = '';
      for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        const offset = i.toString(16).padStart(8, '0').toUpperCase();
        
        let hexPart = '';
        let asciiPart = '';
        
        for (let j = 0; j < 16; j++) {
          if (j < chunk.length) {
            const b = chunk[j];
            hexPart += b.toString(16).padStart(2, '0').toUpperCase() + ' ';
            asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            hexPart += '   ';
            asciiPart += ' ';
          }
          if (j === 7) hexPart += ' ';
        }
        
        html += `
          <tr class="hover:bg-surface-50 transition-colors">
            <td class="px-3 py-1.5 text-surface-400 border-r border-surface-50">${offset}</td>
            <td class="px-3 py-1.5 text-surface-700 whitespace-pre">${hexPart}</td>
            <td class="px-3 py-1.5 text-surface-400 text-center border-l border-surface-50">${escapeHtml(asciiPart)}</td>
          </tr>
        `;
      }
      return html;
    }

    function generateRawHexDump(bytes) {
      let text = '';
      for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        const offset = i.toString(16).padStart(8, '0').toUpperCase();
        let hexPart = '';
        let asciiPart = '';
        for (let j = 0; j < 16; j++) {
          if (j < chunk.length) {
            const b = chunk[j];
            hexPart += b.toString(16).padStart(2, '0').toUpperCase() + ' ';
            asciiPart += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            hexPart += '   ';
          }
          if (j === 7) hexPart += ' ';
        }
        text += `${offset}: ${hexPart} | ${asciiPart}\n`;
      }
      return text;
    }

    function formatSize(b) {
      return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
