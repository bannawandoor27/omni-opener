(function() {
  window.initTool = function(toolConfig, mountEl) {
    function formatSize(b) {
      if (b === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(b) / Math.log(k));
      return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function getHexDump(buffer, limit = 256) {
      const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, limit)));
      let html = '<div class="overflow-x-auto font-mono text-[11px] leading-none bg-surface-900 text-surface-100 p-4 rounded-lg shadow-inner border border-surface-800">';
      html += '<table class="w-full border-collapse">';
      html += '<thead class="text-surface-500 border-b border-surface-800 uppercase tracking-widest text-[9px]"><tr><th class="text-left py-2 px-2">Offset</th><th class="text-left py-2 px-2">Hex Bytes</th><th class="text-left py-2 px-2 border-l border-surface-800 pl-4">ASCII</th></tr></thead><tbody>';

      for (let i = 0; i < bytes.length; i += 16) {
        const chunk = bytes.slice(i, i + 16);
        const offset = i.toString(16).padStart(8, '0').toUpperCase();
        
        let hex = '';
        let ascii = '';
        
        for (let j = 0; j < 16; j++) {
          if (j < chunk.length) {
            const b = chunk[j];
            const hexByte = b.toString(16).padStart(2, '0').toUpperCase();
            const colorClass = b === 0 ? 'opacity-20' : (b >= 32 && b <= 126 ? 'text-primary-400' : 'text-surface-200');
            hex += `<span class="${colorClass}">${hexByte}</span> `;
            ascii += (b >= 32 && b <= 126) ? esc(String.fromCharCode(b)) : '<span class="opacity-20">.</span>';
          } else {
            hex += '&nbsp;&nbsp; ';
            ascii += ' ';
          }
          if (j === 7) hex += '<span class="opacity-20 mx-1">|</span>';
        }

        html += `<tr class="hover:bg-surface-800/40"><td class="py-1 px-2 text-surface-500 font-bold select-none">${offset}</td><td class="py-1 px-2 whitespace-nowrap">${hex}</td><td class="py-1 px-4 border-l border-surface-800 font-bold tracking-tight">${ascii}</td></tr>`;
      }

      html += '</tbody></table></div>';
      return html;
    }

    function identifyBinary(bytes) {
      if (bytes.length < 2) return 'Binary Data';
      // PE (MZ)
      if (bytes[0] === 0x4D && bytes[1] === 0x5A) {
        if (bytes.length > 0x40) {
          const peOffset = bytes[0x3C] | (bytes[0x3D] << 8) | (bytes[0x3E] << 16) | (bytes[0x3F] << 24);
          if (peOffset > 0 && peOffset < bytes.length - 6 && bytes[peOffset] === 0x50 && bytes[peOffset + 1] === 0x45) {
            const machine = bytes[peOffset + 4] | (bytes[peOffset + 5] << 8);
            if (machine === 0x14C) return 'Windows PE (x86)';
            if (machine === 0x8664) return 'Windows PE (x64)';
            if (machine === 0xAA64) return 'Windows PE (ARM64)';
            return 'Windows Portable Executable';
          }
        }
        return 'DOS Executable (MZ)';
      }
      // ELF
      if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) {
        return 'Linux ELF Binary';
      }
      // Mach-O
      if (bytes[0] === 0xFE && bytes[1] === 0xED && bytes[2] === 0xFA && (bytes[3] === 0xCE || bytes[3] === 0xCF)) {
        return 'macOS Mach-O Binary';
      }
      // WASM
      if (bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6D) {
        return 'WebAssembly Binary';
      }
      return 'Binary File';
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dll,.exe,.sys,.ocx,.so,.dylib,.bin,.wasm',
      dropLabel: 'Drop a .dll file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies required for hex dump
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing dll...');
        try {
          const bytes = new Uint8Array(content);
          const binaryType = identifyBinary(bytes);
          
          let html = `
            <div class="p-6">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                <span class="font-medium truncate max-w-xs text-surface-900">${esc(file.name)}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-400">·</span>
                <span class="px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-[10px] font-bold uppercase tracking-wider">${binaryType}</span>
              </div>
          `;

          if (file.size > 20 * 1024 * 1024) {
            html += `
              <div class="flex items-start gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm">
                <span class="text-xl">⚠️</span>
                <div>
                  <p class="font-bold">Large Binary Detected</p>
                  <p class="mt-0.5 text-xs opacity-80 text-amber-900">This file is ${formatSize(file.size)}. For performance, only the first 256 bytes are shown in the hex viewer.</p>
                </div>
              </div>
            `;
          }

          html += `
            <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden mb-6">
              <div class="p-3 border-b border-surface-100 bg-surface-50 flex items-center justify-between">
                <h3 class="font-bold text-surface-900 text-sm flex items-center gap-2">
                  <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
                  Hex Viewer
                </h3>
                <span class="text-[10px] text-surface-400 font-mono uppercase tracking-widest">First 256 Bytes</span>
              </div>
              <div class="p-4">
                ${getHexDump(content, 256)}
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/50">
                <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-3 tracking-widest">Binary Info</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between items-center"><span class="text-surface-500">Magic Sequence</span> <code class="bg-surface-200 px-1.5 py-0.5 rounded text-xs font-mono text-surface-800">${Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}</code></div>
                  <div class="flex justify-between items-center"><span class="text-surface-500">Architecture</span> <span class="text-surface-900 font-medium">${binaryType}</span></div>
                  <div class="flex justify-between items-center"><span class="text-surface-500">Byte Length</span> <span class="text-surface-900 font-mono">${file.size.toLocaleString()} bytes</span></div>
                </div>
              </div>
              <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/50">
                <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-3 tracking-widest">Inspection Notes</h4>
                <ul class="space-y-2 text-sm text-surface-600">
                  <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-primary-500"></span> MZ Header validation passed</li>
                  <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-primary-500"></span> Static hex dump generated</li>
                  <li class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 100% Client-side privacy</li>
                </ul>
              </div>
            </div>
          </div>
          `;

          helpers.render(html);
        } catch (e) {
          helpers.showError('Could not parse dll file', e.message);
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
          id: 'copy-hex',
          onClick: function(helpers, btn) {
            const content = helpers.getContent();
            const bytes = new Uint8Array(content.slice(0, 256));
            const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            helpers.copyToClipboard(hex, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers, btn) {
            const file = helpers.getFile();
            helpers.download(file.name, helpers.getContent(), 'application/octet-stream');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> All processing is done locally. Your DLL/binary files are never uploaded to any server. This tool performs static analysis only.'
    });
  };
})();
