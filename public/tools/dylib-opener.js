(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dylib',
      dropLabel: 'Drop a .dylib file here',
      binary: true,
      onInit: function(helpers) {
        // Core Mach-O parser requires no external dependencies
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Analyzing Mach-O structure...');

        try {
          const buffer = content;
          if (buffer.byteLength < 4) throw new Error('File is too small to be a valid Mach-O binary.');

          const view = new DataView(buffer);
          const magic = view.getUint32(0, false); // Read BE for magic check
          
          let results = {
            header: null,
            fat: null,
            loadCommands: [],
            error: null
          };

          if (magic === 0xCAFEBABE || magic === 0xBEBAFECA) {
            parseFatBinary(view, magic === 0xBEBAFECA, results);
          } else {
            const isLE = (magic === 0xCEFAEDFE || magic === 0xCFFAEDFE);
            const is64 = (magic === 0xFEEDFACF || magic === 0xCFFAEDFE);
            parseMachO(view, 0, isLE, is64, results);
          }

          renderResults(file, buffer, results, helpers);
        } catch (e) {
          helpers.showError('Could not open dylib file', e.message || 'The file format is unrecognized or corrupted.');
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
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function(helpers, btn) {
            const el = document.getElementById('dylib-metadata');
            if (el) {
              helpers.copyToClipboard(el.innerText, btn);
            }
          }
        },
        {
          label: '📥 Download File',
          id: 'download',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/octet-stream');
          }
        }
      ],
      infoHtml: '<strong>Secure Analysis:</strong> Mach-O parsing is performed entirely within your browser.'
    });

    const CPU_TYPES = {
      7: 'x86',
      0x01000007: 'x86_64',
      12: 'ARM',
      0x0100000C: 'ARM64',
      18: 'PowerPC',
      0x01000012: 'PowerPC64'
    };

    const FILE_TYPES = {
      1: 'Object',
      2: 'Executable',
      6: 'Dynamic Library (dylib)',
      9: 'Bundle'
    };

    const LC_TYPES = {
      0x1: 'LC_SEGMENT',
      0x2: 'LC_SYMTAB',
      0xc: 'LC_LOAD_DYLIB',
      0xd: 'LC_ID_DYLIB',
      0xe: 'LC_LOAD_DYLINKER',
      0xf: 'LC_ID_DYLINKER',
      0x11: 'LC_ROUTINES',
      0x19: 'LC_SEGMENT_64',
      0x1d: 'LC_CODE_SIGNATURE',
      0x1e: 'LC_SEGMENT_SPLIT_INFO',
      0x1f: 'LC_REEXPORT_DYLIB',
      0x21: 'LC_ENCRYPTION_INFO',
      0x22: 'LC_DYLD_INFO',
      0x24: 'LC_VERSION_MIN_MACOSX',
      0x25: 'LC_VERSION_MIN_IPHONEOS',
      0x26: 'LC_FUNCTION_STARTS',
      0x27: 'LC_DYLD_ENVIRONMENT',
      0x28: 'LC_MAIN',
      0x29: 'LC_DATA_IN_CODE',
      0x2a: 'LC_SOURCE_VERSION',
      0x2b: 'LC_DYLIB_CODE_SIGN_DRS',
      0x2c: 'LC_ENCRYPTION_INFO_64',
      0x2d: 'LC_LINKER_OPTION',
      0x2e: 'LC_LINKER_OPTIMIZATION_HINT',
      0x2f: 'LC_VERSION_MIN_TVOS',
      0x30: 'LC_VERSION_MIN_WATCHOS',
      0x31: 'LC_NOTE',
      0x32: 'LC_BUILD_VERSION'
    };

    function parseFatBinary(view, isLE, results) {
      const nfat = view.getUint32(4, isLE);
      results.fat = {
        count: nfat,
        architectures: []
      };

      for (let i = 0; i < nfat; i++) {
        const offset = 8 + (i * 20);
        const cputype = view.getUint32(offset, isLE);
        const cpusubtype = view.getUint32(offset + 4, isLE);
        const f_offset = view.getUint32(offset + 8, isLE);
        const f_size = view.getUint32(offset + 12, isLE);
        
        results.fat.architectures.push({
          cpu: CPU_TYPES[cputype] || `Unknown (${cputype})`,
          offset: f_offset,
          size: f_size
        });

        // Parse the first architecture found for details if we haven't yet
        if (i === 0 && f_offset + 4 <= view.byteLength) {
          const magic = view.getUint32(f_offset, false);
          const archIsLE = (magic === 0xCEFAEDFE || magic === 0xCFFAEDFE);
          const archIs64 = (magic === 0xFEEDFACF || magic === 0xCFFAEDFE);
          parseMachO(view, f_offset, archIsLE, archIs64, results);
        }
      }
    }

    function parseMachO(view, startOffset, isLE, is64, results) {
      if (startOffset + (is64 ? 32 : 28) > view.byteLength) return;

      const cputype = view.getUint32(startOffset + 4, isLE);
      const filetype = view.getUint32(startOffset + 12, isLE);
      const ncmds = view.getUint32(startOffset + 16, isLE);
      const sizeofcmds = view.getUint32(startOffset + 20, isLE);

      results.header = {
        cpu: CPU_TYPES[cputype] || `Unknown (${cputype})`,
        type: FILE_TYPES[filetype] || `Unknown (${filetype})`,
        ncmds,
        sizeofcmds,
        bits: is64 ? '64-bit' : '32-bit'
      };

      let cmdOffset = startOffset + (is64 ? 32 : 28);
      for (let i = 0; i < ncmds; i++) {
        if (cmdOffset + 8 > view.byteLength) break;
        const cmd = view.getUint32(cmdOffset, isLE);
        const cmdsize = view.getUint32(cmdOffset + 4, isLE);
        
        let extra = '';
        if (cmd === 0xd || cmd === 0xc) { // LC_ID_DYLIB or LC_LOAD_DYLIB
          const nameOffset = view.getUint32(cmdOffset + 8, isLE);
          extra = readString(view, cmdOffset + nameOffset, cmdsize - nameOffset);
        }

        results.loadCommands.push({
          type: LC_TYPES[cmd] || `Unknown (0x${cmd.toString(16)})`,
          size: cmdsize,
          extra
        });

        cmdOffset += cmdsize;
      }
    }

    function readString(view, offset, maxSize) {
      let str = '';
      for (let i = 0; i < maxSize; i++) {
        const char = view.getUint8(offset + i);
        if (char === 0) break;
        str += String.fromCharCode(char);
      }
      return str;
    }

    function renderResults(file, buffer, results, helpers) {
      const header = results.header;
      const hSize = formatBytes(file.size);

      let html = `
        <div class="p-4 md:p-6 max-w-5xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${hSize}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${header ? header.bits : ''} dylib file</span>
          </div>

          <div id="dylib-metadata">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <!-- U9: Content Cards -->
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Architecture</p>
                <p class="text-lg font-semibold text-surface-900">${header ? header.cpu : 'Unknown'}</p>
                <p class="text-xs text-surface-500 mt-1">${header ? header.bits : 'Format Unrecognized'}</p>
              </div>
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">File Type</p>
                <p class="text-lg font-semibold text-surface-900">${header ? header.type : 'N/A'}</p>
                <p class="text-xs text-surface-500 mt-1">${results.fat ? 'Universal/Fat Binary' : 'Single Architecture'}</p>
              </div>
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Load Commands</p>
                <div class="flex items-baseline gap-2">
                  <p class="text-lg font-semibold text-surface-900">${header ? header.ncmds : 0}</p>
                  <p class="text-xs text-surface-500">commands</p>
                </div>
                <p class="text-xs text-surface-500 mt-1">${header ? formatBytes(header.sizeofcmds) : '0 B'} total size</p>
              </div>
            </div>

            ${results.fat ? `
              <div class="mb-8">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Universal Architectures</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${results.fat.count} archs</span>
                </div>
                <div class="overflow-x-auto rounded-xl border border-surface-200">
                  <table class="min-w-full text-sm">
                    <thead>
                      <tr class="bg-surface-50 border-b border-surface-200">
                        <th class="px-4 py-3 text-left font-semibold text-surface-700">CPU Architecture</th>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700">Offset</th>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700">Size</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100">
                      ${results.fat.architectures.map(a => `
                        <tr class="hover:bg-brand-50/30 transition-colors">
                          <td class="px-4 py-3 font-medium text-surface-900">${a.cpu}</td>
                          <td class="px-4 py-3 text-surface-600 font-mono">0x${a.offset.toString(16).toUpperCase()}</td>
                          <td class="px-4 py-3 text-surface-600">${formatBytes(a.size)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : ''}

            ${results.loadCommands.length > 0 ? `
              <div class="mb-8">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Load Commands</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${results.loadCommands.length} items</span>
                </div>
                <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                  <table class="min-w-full text-sm">
                    <thead class="bg-surface-50/80 backdrop-blur">
                      <tr>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Type</th>
                        <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Details</th>
                        <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Size</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100 bg-white">
                      ${results.loadCommands.map(cmd => `
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-3 font-mono text-[13px] text-brand-700">${cmd.type}</td>
                          <td class="px-4 py-3 text-surface-600 break-all max-w-md">${cmd.extra ? `<span class="bg-surface-100 px-1.5 py-0.5 rounded text-surface-800">${escapeHtml(cmd.extra)}</span>` : '<span class="text-surface-300">—</span>'}</td>
                          <td class="px-4 py-3 text-right text-surface-500 font-mono">${cmd.size}B</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            ` : `
              <div class="p-12 text-center border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50 mb-8">
                <p class="text-surface-500">No load commands could be extracted from this file.</p>
              </div>
            `}
          </div>

          <div class="mb-4">
            <h3 class="font-semibold text-surface-800 mb-3">Binary Preview (Hex)</h3>
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
              <pre class="p-4 text-[12px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed">${generateHexDump(new Uint8Array(buffer.slice(0, 1024)))}</pre>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function generateHexDump(bytes) {
      let lines = [];
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
            ascii += ' ';
          }
          if (j === 7) hex += ' ';
        }
        
        lines.push(`${offset}  <span class="text-gray-500">${hex}</span>  <span class="text-gray-400">|${escapeHtml(ascii)}|</span>`);
      }
      return lines.join('\n');
    }

    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, function(m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[m];
      });
    }
  };
})();
