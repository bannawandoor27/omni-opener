(function () {
  'use strict';

  /**
   * OmniOpener — EXE (PE) Opener Tool
   * A browser-based Portable Executable (EXE) inspector.
   */

  function formatSize(b) {
    if (b > 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(2) + ' KB';
    return b + ' B';
  }

  function toHex(val, len) {
    return '0x' + val.toString(16).toUpperCase().padStart(len || 8, '0');
  }

  function getMachineType(type) {
    const types = {
      0x014c: 'i386 (Intel 386)',
      0x8664: 'AMD64 (x64)',
      0x01c0: 'ARM Little Endian',
      0xaa64: 'ARM64 Little Endian',
      0x0200: 'Intel Itanium (IA-64)'
    };
    return types[type] || `Unknown (${toHex(type, 4)})`;
  }

  function getSubsystem(sub) {
    const subs = {
      1: 'Native',
      2: 'Windows GUI',
      3: 'Windows CUI (Console)',
      5: 'OS/2 CUI',
      7: 'POSIX CUI',
      9: 'Windows CE GUI',
      10: 'EFI Application',
      11: 'EFI Boot Service Driver',
      12: 'EFI Runtime Driver',
      13: 'EFI ROM',
      14: 'Xbox'
    };
    return subs[sub] || `Unknown (${sub})`;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.exe,.dll,.sys,.scr,.ocx,.cpl',
      dropLabel: 'Drop an EXE or DLL file here',
      binary: true,
      onFile: function (file, content, helpers) {
        helpers.showLoading('Analyzing PE structure...');
        
        try {
          const peInfo = parsePE(content);
          helpers.setState('peInfo', peInfo);
          renderPE(file, peInfo, content, helpers);
        } catch (err) {
          helpers.showError('Invalid Executable', err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Entry Point',
          id: 'copy-ep',
          onClick: function (helpers, btn) {
            const pe = helpers.getState().peInfo;
            if (pe && pe.optionalHeader) {
              helpers.copyToClipboard(toHex(pe.optionalHeader.AddressOfEntryPoint), btn);
            }
          }
        },
        {
          label: '📥 Download JSON Info',
          id: 'dl-json',
          onClick: function (helpers) {
            const pe = helpers.getState().peInfo;
            if (pe) {
              const data = JSON.stringify(pe, null, 2);
              helpers.download(helpers.getFile().name + '.json', data, 'application/json');
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> This tool parses the PE (Portable Executable) header locally in your browser. No data is uploaded.'
    });
  };

  function parsePE(buffer) {
    const view = new DataView(buffer);
    
    // 1. DOS Header
    if (view.getUint16(0, true) !== 0x5a4d) { // "MZ"
      throw new Error('Not a valid DOS header (missing MZ signature)');
    }
    
    const e_lfanew = view.getUint32(0x3C, true);
    if (e_lfanew > buffer.byteLength - 4) {
      throw new Error('Invalid PE header offset');
    }
    
    // 2. PE Header
    if (view.getUint32(e_lfanew, true) !== 0x00004550) { // "PE\0\0"
      throw new Error('Not a valid PE header (missing PE signature)');
    }
    
    const coffOffset = e_lfanew + 4;
    const coff = {
      Machine: view.getUint16(coffOffset, true),
      NumberOfSections: view.getUint16(coffOffset + 2, true),
      TimeDateStamp: view.getUint32(coffOffset + 4, true),
      PointerToSymbolTable: view.getUint32(coffOffset + 8, true),
      NumberOfSymbols: view.getUint32(coffOffset + 12, true),
      SizeOfOptionalHeader: view.getUint16(coffOffset + 16, true),
      Characteristics: view.getUint16(coffOffset + 18, true)
    };
    
    // 3. Optional Header
    const optOffset = coffOffset + 20;
    const magic = view.getUint16(optOffset, true);
    const is64 = magic === 0x20b;
    
    const optional = {
      Magic: magic,
      MajorLinkerVersion: view.getUint8(optOffset + 2),
      MinorLinkerVersion: view.getUint8(optOffset + 3),
      SizeOfCode: view.getUint32(optOffset + 4, true),
      SizeOfInitializedData: view.getUint32(optOffset + 8, true),
      SizeOfUninitializedData: view.getUint32(optOffset + 12, true),
      AddressOfEntryPoint: view.getUint32(optOffset + 16, true),
      BaseOfCode: view.getUint32(optOffset + 20, true),
      ImageBase: is64 ? view.getBigUint64(optOffset + 24, true).toString() : view.getUint32(optOffset + 24, true),
      SectionAlignment: view.getUint32(optOffset + (is64 ? 32 : 32), true),
      FileAlignment: view.getUint32(optOffset + (is64 ? 36 : 36), true),
      Subsystem: view.getUint16(optOffset + (is64 ? 70 : 68), true),
      DllCharacteristics: view.getUint16(optOffset + (is64 ? 72 : 70), true),
      SizeOfImage: view.getUint32(optOffset + (is64 ? 56 : 56), true),
      SizeOfHeaders: view.getUint32(optOffset + (is64 ? 60 : 60), true)
    };
    
    // 4. Sections
    const sectionsOffset = optOffset + coff.SizeOfOptionalHeader;
    const sections = [];
    for (let i = 0; i < coff.NumberOfSections; i++) {
      const off = sectionsOffset + (i * 40);
      let name = '';
      for (let j = 0; j < 8; j++) {
        const char = view.getUint8(off + j);
        if (char === 0) break;
        name += String.fromCharCode(char);
      }
      
      sections.push({
        Name: name,
        VirtualSize: view.getUint32(off + 8, true),
        VirtualAddress: view.getUint32(off + 12, true),
        SizeOfRawData: view.getUint32(off + 16, true),
        PointerToRawData: view.getUint32(off + 20, true),
        Characteristics: view.getUint32(off + 36, true)
      });
    }
    
    return { coff, optionalHeader: optional, sections, is64, e_lfanew };
  }

  function renderPE(file, pe, content, helpers) {
    const timestamp = new Date(pe.coff.TimeDateStamp * 1000).toLocaleString();
    
    let html = `
      <div class="p-6 space-y-6">
        <div class="flex flex-wrap items-center gap-4 p-4 bg-surface-50 rounded-xl border border-surface-100">
          <div class="flex-1 min-w-[200px]">
            <h2 class="text-lg font-bold text-surface-900 truncate">${file.name}</h2>
            <p class="text-sm text-surface-500">${formatSize(file.size)} • ${pe.is64 ? 'PE32+ (64-bit)' : 'PE32 (32-bit)'}</p>
          </div>
          <div class="text-right">
            <span class="px-3 py-1 bg-brand-100 text-brand-700 rounded-full text-xs font-bold uppercase tracking-wider">
              ${getSubsystem(pe.optionalHeader.Subsystem)}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- COFF Header -->
          <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 font-semibold text-surface-700 flex items-center gap-2">
              <span>📋 COFF Header</span>
            </div>
            <table class="w-full text-sm">
              <tbody class="divide-y divide-surface-100">
                <tr><td class="px-4 py-2 text-surface-400 w-1/2">Machine</td><td class="px-4 py-2 font-mono">${getMachineType(pe.coff.Machine)}</td></tr>
                <tr><td class="px-4 py-2 text-surface-400">Sections</td><td class="px-4 py-2 font-mono">${pe.coff.NumberOfSections}</td></tr>
                <tr><td class="px-4 py-2 text-surface-400">Timestamp</td><td class="px-4 py-2 font-mono text-xs">${timestamp}</td></tr>
                <tr><td class="px-4 py-2 text-surface-400">Characteristics</td><td class="px-4 py-2 font-mono">${toHex(pe.coff.Characteristics, 4)}</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Optional Header -->
          <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 font-semibold text-surface-700">
              ⚙️ Optional Header
            </div>
            <table class="w-full text-sm">
              <tbody class="divide-y divide-surface-100">
                <tr><td class="px-4 py-2 text-surface-400 w-1/2">Entry Point</td><td class="px-4 py-2 font-mono text-brand-600 font-bold">${toHex(pe.optionalHeader.AddressOfEntryPoint)}</td></tr>
                <tr><td class="px-4 py-2 text-surface-400">Image Base</td><td class="px-4 py-2 font-mono">${typeof pe.optionalHeader.ImageBase === 'string' ? '0x' + BigInt(pe.optionalHeader.ImageBase).toString(16).toUpperCase() : toHex(pe.optionalHeader.ImageBase)}</td></tr>
                <tr><td class="px-4 py-2 text-surface-400">Size of Image</td><td class="px-4 py-2 font-mono">${formatSize(pe.optionalHeader.SizeOfImage)}</td></tr>
                <tr><td class="px-4 py-2 text-surface-400">Section Alignment</td><td class="px-4 py-2 font-mono">${toHex(pe.optionalHeader.SectionAlignment)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sections Table -->
        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 font-semibold text-surface-700">
            📦 Sections (${pe.sections.length})
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left border-collapse">
              <thead class="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-2 font-semibold text-surface-700">Name</th>
                  <th class="px-4 py-2 font-semibold text-surface-700">V.Address</th>
                  <th class="px-4 py-2 font-semibold text-surface-700">V.Size</th>
                  <th class="px-4 py-2 font-semibold text-surface-700">Raw Size</th>
                  <th class="px-4 py-2 font-semibold text-surface-700">Raw Ptr</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${pe.sections.map(s => `
                  <tr class="hover:bg-surface-50 transition-colors">
                    <td class="px-4 py-2 font-mono text-brand-600 font-bold">${s.Name}</td>
                    <td class="px-4 py-2 font-mono text-xs">${toHex(s.VirtualAddress)}</td>
                    <td class="px-4 py-2 font-mono text-xs">${toHex(s.VirtualSize)}</td>
                    <td class="px-4 py-2 font-mono text-xs">${toHex(s.SizeOfRawData)}</td>
                    <td class="px-4 py-2 font-mono text-xs">${toHex(s.PointerToRawData)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Hex Preview -->
        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 font-semibold text-surface-700">
            🔍 Hex Preview (First 256 bytes)
          </div>
          <div class="p-4 font-mono text-[10px] leading-relaxed bg-surface-900 text-surface-300 overflow-auto whitespace-pre">
${renderHex(content.slice(0, 256))}
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
  }

  function renderHex(buffer) {
    const view = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < view.length; i += 16) {
      let line = toHex(i, 4).slice(2) + '  ';
      let chars = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < view.length) {
          const byte = view[i + j];
          line += byte.toString(16).padStart(2, '0') + ' ';
          chars += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
        } else {
          line += '   ';
          chars += ' ';
        }
      }
      hex += line + ' | ' + chars + '\n';
    }
    return hex;
  }
})();
