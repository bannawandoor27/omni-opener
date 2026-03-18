(function () {
  'use strict';

  /**
   * OmniOpener — EXE (PE) Opener Tool
   * A professional browser-based Portable Executable (PE) inspector.
   */

  const PE_MACHINE_TYPES = {
    0x014c: 'i386 (Intel 386)',
    0x8664: 'AMD64 (x64)',
    0x01c0: 'ARM Little Endian',
    0xaa64: 'ARM64 Little Endian',
    0x0200: 'Intel Itanium (IA-64)',
    0x014d: 'Intel i860',
    0x0166: 'MIPS R4000',
    0x0184: 'Alpha AXP',
    0x01f0: 'PowerPC Little Endian',
    0xebc: 'EFI Byte Code'
  };

  const PE_SUBSYSTEMS = {
    0: 'Unknown',
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
    14: 'Xbox',
    16: 'Windows Boot Application'
  };

  const PE_CHARACTERISTICS = [
    [0x0001, 'Relocs Stripped'],
    [0x0002, 'Executable'],
    [0x0004, 'Line Numbers Stripped'],
    [0x0008, 'Local Symbols Stripped'],
    [0x0010, 'Aggressive Trim'],
    [0x0020, 'Large Address Aware'],
    [0x0080, 'Bytes Reversed (Lo)'],
    [0x0100, '32-bit Machine'],
    [0x0200, 'Debug Stripped'],
    [0x0400, 'Removable Run from Swap'],
    [0x0800, 'Net Run from Swap'],
    [0x1000, 'System File'],
    [0x2000, 'DLL'],
    [0x4000, 'Uniprocessor Only'],
    [0x8000, 'Bytes Reversed (Hi)']
  ];

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function toHex(val, len = 8) {
    if (typeof val === 'bigint') {
      return '0x' + val.toString(16).toUpperCase().padStart(len, '0');
    }
    return '0x' + (val >>> 0).toString(16).toUpperCase().padStart(len, '0');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.exe,.dll,.sys,.scr,.ocx,.cpl,.efi',
      dropLabel: 'Drop an EXE, DLL, or SYS file here',
      binary: true,
      onFile: async function (file, content, helpers) {
        helpers.showLoading('Analyzing Executable structure...');
        
        // Use a small timeout to let the UI update
        await new Promise(r => setTimeout(r, 50));

        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Expected binary content but received something else.');
          }

          const pe = parsePE(content);
          helpers.setState('pe', pe);
          helpers.setState('filter', '');
          render(file, pe, content, helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open executable', err.message || 'The file may be corrupted or in an unsupported variant.');
        }
      },
      actions: [
        {
          label: '📋 Copy Entry Point',
          id: 'copy-ep',
          onClick: function (helpers, btn) {
            const pe = helpers.getState().pe;
            if (pe && pe.optionalHeader) {
              helpers.copyToClipboard(toHex(pe.optionalHeader.AddressOfEntryPoint), btn);
            }
          }
        },
        {
          label: '📥 Download JSON Report',
          id: 'dl-json',
          onClick: function (helpers) {
            const pe = helpers.getState().pe;
            const file = helpers.getFile();
            if (pe) {
              const data = JSON.stringify(pe, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value, 2
              );
              helpers.download(file.name + '-report.json', data, 'application/json');
            }
          }
        }
      ],
      infoHtml: '<strong>Secure Inspection:</strong> PE headers are parsed entirely within your browser. No binary data is ever transmitted to a server.'
    });
  };

  function parsePE(buffer) {
    const view = new DataView(buffer);
    
    // 1. DOS Header (64 bytes)
    if (buffer.byteLength < 64 || view.getUint16(0, true) !== 0x5a4d) {
      throw new Error('Invalid DOS header (missing MZ signature).');
    }
    
    const e_lfanew = view.getUint32(0x3C, true);
    if (e_lfanew + 24 > buffer.byteLength) {
      throw new Error('PE header offset (e_lfanew) points outside the file.');
    }
    
    // 2. PE Signature
    if (view.getUint32(e_lfanew, true) !== 0x00004550) {
      throw new Error('Invalid PE signature (missing PE\\0\\0).');
    }
    
    // 3. COFF File Header (20 bytes)
    const coffOff = e_lfanew + 4;
    const coff = {
      Machine: view.getUint16(coffOff, true),
      NumberOfSections: view.getUint16(coffOff + 2, true),
      TimeDateStamp: view.getUint32(coffOff + 4, true),
      PointerToSymbolTable: view.getUint32(coffOff + 8, true),
      NumberOfSymbols: view.getUint32(coffOff + 12, true),
      SizeOfOptionalHeader: view.getUint16(coffOff + 16, true),
      Characteristics: view.getUint16(coffOff + 18, true)
    };
    
    // 4. Optional Header
    let optional = null;
    let is64 = false;
    if (coff.SizeOfOptionalHeader > 0) {
      const optOff = coffOff + 20;
      const magic = view.getUint16(optOff, true);
      is64 = magic === 0x20b; // PE32+ (64-bit)
      
      optional = {
        Magic: magic,
        MajorLinkerVersion: view.getUint8(optOff + 2),
        MinorLinkerVersion: view.getUint8(optOff + 3),
        SizeOfCode: view.getUint32(optOff + 4, true),
        SizeOfInitializedData: view.getUint32(optOff + 8, true),
        SizeOfUninitializedData: view.getUint32(optOff + 12, true),
        AddressOfEntryPoint: view.getUint32(optOff + 16, true),
        BaseOfCode: view.getUint32(optOff + 20, true),
        ImageBase: is64 ? view.getBigUint64(optOff + 24, true) : view.getUint32(optOff + 24, true),
        SectionAlignment: view.getUint32(optOff + 32, true),
        FileAlignment: view.getUint32(optOff + 36, true),
        MajorOperatingSystemVersion: view.getUint16(optOff + 40, true),
        SizeOfImage: view.getUint32(optOff + 56, true),
        SizeOfHeaders: view.getUint32(optOff + 60, true),
        Subsystem: view.getUint16(optOff + (is64 ? 70 : 68), true),
        DllCharacteristics: view.getUint16(optOff + (is64 ? 72 : 70), true),
      };
    }
    
    // 5. Section Table
    const sectionTableOff = coffOff + 20 + coff.SizeOfOptionalHeader;
    const sections = [];
    for (let i = 0; i < coff.NumberOfSections; i++) {
      const off = sectionTableOff + (i * 40);
      if (off + 40 > buffer.byteLength) break;
      
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

  function render(file, pe, content, helpers) {
    const filter = helpers.getState().filter || '';
    const filteredSections = pe.sections.filter(s => 
      s.Name.toLowerCase().includes(filter.toLowerCase())
    );

    const timestamp = new Date(pe.coff.TimeDateStamp * 1000).toUTCString();
    const machine = PE_MACHINE_TYPES[pe.coff.Machine] || `Unknown (${toHex(pe.coff.Machine, 4)})`;
    const subsystem = pe.optionalHeader ? (PE_SUBSYSTEMS[pe.optionalHeader.Subsystem] || 'Unknown') : 'N/A';
    
    const characteristics = PE_CHARACTERISTICS
      .filter(([bit]) => (pe.coff.Characteristics & bit))
      .map(([, label]) => label);

    const html = `
      <div class="p-6 max-w-6xl mx-auto space-y-6">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${pe.is64 ? 'PE32+ (64-bit)' : 'PE32 (32-bit)'} Executable</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- COFF Header Card -->
          <div class="lg:col-span-1 rounded-xl border border-surface-200 p-5 bg-white shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-surface-900 text-lg">COFF Header</h3>
              <span class="text-[10px] font-mono bg-surface-100 px-2 py-0.5 rounded text-surface-500">${toHex(pe.e_lfanew + 4, 4)}</span>
            </div>
            <div class="space-y-3">
              <div>
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Machine</div>
                <div class="text-sm font-medium text-surface-700">${machine}</div>
              </div>
              <div>
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Compiled At (UTC)</div>
                <div class="text-sm font-medium text-surface-700">${timestamp}</div>
              </div>
              <div>
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider mb-1">Characteristics</div>
                <div class="flex flex-wrap gap-1 mt-1">
                  ${characteristics.map(c => `<span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-[10px] font-bold">${c}</span>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Optional Header Card -->
          <div class="lg:col-span-2 rounded-xl border border-surface-200 p-5 bg-white shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-surface-900 text-lg">Optional Header</h3>
              <span class="text-[10px] font-mono bg-surface-100 px-2 py-0.5 rounded text-surface-500">PE32${pe.is64 ? '+' : ''}</span>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div class="space-y-1">
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider">Entry Point</div>
                <div class="text-sm font-mono text-brand-600 font-bold">${pe.optionalHeader ? toHex(pe.optionalHeader.AddressOfEntryPoint) : 'N/A'}</div>
              </div>
              <div class="space-y-1">
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider">Image Base</div>
                <div class="text-sm font-mono text-surface-700">${pe.optionalHeader ? toHex(pe.optionalHeader.ImageBase, pe.is64 ? 16 : 8) : 'N/A'}</div>
              </div>
              <div class="space-y-1">
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider">Subsystem</div>
                <div class="text-sm font-medium text-surface-700">${subsystem}</div>
              </div>
              <div class="space-y-1">
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider">Image Size</div>
                <div class="text-sm font-medium text-surface-700">${pe.optionalHeader ? formatBytes(pe.optionalHeader.SizeOfImage) : 'N/A'}</div>
              </div>
              <div class="space-y-1">
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider">Headers Size</div>
                <div class="text-sm font-medium text-surface-700">${pe.optionalHeader ? formatBytes(pe.optionalHeader.SizeOfHeaders) : 'N/A'}</div>
              </div>
              <div class="space-y-1">
                <div class="text-xs text-surface-400 uppercase font-bold tracking-wider">Alignment</div>
                <div class="text-sm font-mono text-surface-500 text-xs">F:${pe.optionalHeader?.FileAlignment} / S:${pe.optionalHeader?.SectionAlignment}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sections Section -->
        <div>
          <div class="flex flex-wrap items-center justify-between gap-4 mb-3">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-surface-800">Sections</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${pe.sections.length} total</span>
            </div>
            <!-- SEARCH BOX (Format-Specific Excellence) -->
            <div class="relative min-w-[240px]">
              <input type="text" 
                     id="section-filter" 
                     placeholder="Search sections..." 
                     value="${escapeHTML(filter)}"
                     class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-base">🔍</span>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">V.Address</th>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">V.Size</th>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Raw Size</th>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Raw Pointer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filteredSections.length > 0 ? filteredSections.map(s => `
                  <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-2.5 font-mono text-brand-600 font-bold border-b border-surface-100 group-last:border-b-0">${escapeHTML(s.Name)}</td>
                    <td class="px-4 py-2.5 font-mono text-surface-600 border-b border-surface-100 group-last:border-b-0">${toHex(s.VirtualAddress)}</td>
                    <td class="px-4 py-2.5 font-mono text-surface-600 border-b border-surface-100 group-last:border-b-0">${toHex(s.VirtualSize)}</td>
                    <td class="px-4 py-2.5 font-mono text-surface-600 border-b border-surface-100 group-last:border-b-0">${toHex(s.SizeOfRawData)}</td>
                    <td class="px-4 py-2.5 font-mono text-surface-600 border-b border-surface-100 group-last:border-b-0">${toHex(s.PointerToRawData)}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-surface-400 italic bg-surface-50/50">
                      No sections matching "${escapeHTML(filter)}"
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Hex Preview -->
        <div class="space-y-3">
          <h3 class="font-semibold text-surface-800">Hex Preview <span class="text-xs font-normal text-surface-400">(First 256 bytes)</span></h3>
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-5 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-gray-800">
${renderHex(content.slice(0, 256))}
            </pre>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Re-attach event listeners
    const filterInput = document.getElementById('section-filter');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        helpers.setState('filter', e.target.value);
        render(file, pe, content, helpers);
      });
      // Maintain focus after re-render
      if (filter) filterInput.focus();
      filterInput.setSelectionRange(filter.length, filter.length);
    }
  }

  function renderHex(buffer) {
    const view = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < view.length; i += 16) {
      let offset = i.toString(16).toUpperCase().padStart(8, '0');
      let line = `<span class="text-gray-600">${offset}</span>  `;
      let chars = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < view.length) {
          const byte = view[i + j];
          const byteStr = byte.toString(16).toUpperCase().padStart(2, '0');
          // Highlight interesting bytes (e.g. 00, FF, or MZ signature)
          if (byte === 0x4D || byte === 0x5A) {
            line += `<span class="text-brand-400 font-bold">${byteStr}</span> `;
          } else if (byte === 0x00) {
            line += `<span class="text-gray-800">${byteStr}</span> `;
          } else {
            line += `${byteStr} `;
          }
          chars += (byte >= 32 && byte <= 126) ? escapeHTML(String.fromCharCode(byte)) : '<span class="text-gray-800">.</span>';
        } else {
          line += '   ';
          chars += ' ';
        }
      }
      hex += line + ' <span class="text-gray-700">|</span> ' + chars + '\n';
    }
    return hex;
  }
})();

