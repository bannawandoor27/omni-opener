(function () {
  'use strict';

  /**
   * OmniOpener — Snap Package Opener Tool
   * Professional browser-based inspector for SquashFS and Zip-compatible Snap packages.
   */

  const COMPRESSION_TYPES = {
    1: 'zlib',
    2: 'lzo',
    3: 'lzma',
    4: 'xz',
    5: 'lz4',
    6: 'zstd'
  };

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getHexDump(buffer) {
    const bytes = new Uint8Array(buffer.slice(0, 1024));
    let hexHtml = '<div class="overflow-x-auto rounded-xl border border-surface-200"><table class="min-w-full text-[11px] font-mono border-collapse">';
    hexHtml += '<thead class="bg-surface-50 text-surface-500 border-b border-surface-200"><tr><th class="px-4 py-2 text-left font-semibold">Offset</th><th class="px-4 py-2 text-left font-semibold">Hex Bytes</th><th class="px-4 py-2 text-left font-semibold">ASCII</th></tr></thead><tbody class="divide-y divide-surface-100">';
    
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, i + 16);
      const offset = i.toString(16).padStart(8, '0');
      let hex = '';
      let ascii = '';
      
      for (let j = 0; j < 16; j++) {
        if (j < chunk.length) {
          hex += chunk[j].toString(16).padStart(2, '0') + ' ';
          ascii += (chunk[j] >= 32 && chunk[j] <= 126) ? String.fromCharCode(chunk[j]) : '.';
        } else {
          hex += '   ';
          ascii += ' ';
        }
        if (j === 7) hex += ' ';
      }
      
      hexHtml += `<tr class="hover:bg-brand-50 transition-colors">
        <td class="px-4 py-1.5 text-brand-600 font-bold bg-surface-50/30">${offset}</td>
        <td class="px-4 py-1.5 text-surface-700 whitespace-pre">${hex}</td>
        <td class="px-4 py-1.5 text-surface-500 whitespace-pre border-l border-surface-100">${esc(ascii)}</td>
      </tr>`;
    }
    hexHtml += '</tbody></table></div>';
    return hexHtml;
  }

  function parseSquashfsHeader(buffer) {
    if (buffer.byteLength < 96) return null;
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    // Magic for SquashFS is 'hsqs' (0x73717368 in little-endian)
    if (magic !== 0x73717368) return null;

    return {
      inodes: view.getUint32(4, true),
      mkfs_time: view.getUint32(8, true),
      block_size: view.getUint32(12, true),
      fragments: view.getUint32(16, true),
      compression: view.getUint16(20, true),
      block_log: view.getUint16(22, true),
      flags: view.getUint16(24, true),
      no_ids: view.getUint16(26, true),
      s_major: view.getUint16(28, true),
      s_minor: view.getUint16(30, true),
      root_inode: view.getBigUint64(32, true),
      bytes_used: view.getBigUint64(40, true),
    };
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.snap',
      dropLabel: 'Drop a .snap package here to inspect',
      binary: true,
      onInit: function(h) {
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
        }
      },
      onFile: function(file, content, h) {
        h.showLoading('Analyzing Snap architecture...');
        
        const process = () => {
          try {
            const header = parseSquashfsHeader(content);
            if (header) {
              h.setState({ type: 'squashfs', header, files: [], filtered: [], sort: { key: 'name', dir: 1 } });
              renderSquashFS(file, content, header, h);
              return;
            }

            if (typeof JSZip === 'undefined') {
              h.showLoading('Loading extraction engine...');
              h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => {
                analyzeZip(file, content, h);
              });
              return;
            }

            analyzeZip(file, content, h);
          } catch (err) {
            h.showError('Could not open snap file', 'The file may be corrupted or in an unsupported variant. ' + err.message);
          }
        };

        // Small delay to ensure loading UI shows
        setTimeout(process, 50);
      },
      actions: [
        {
          label: '📋 Copy Details',
          id: 'copy-details',
          onClick: function(h, btn) {
            const state = h.getState();
            let text = '';
            if (state.type === 'zip' && state.files) {
              text = state.files.map(f => `${f.dir ? '[DIR] ' : ''}${f.name} (${formatSize(f.size)})`).join('\n');
            } else if (state.header) {
              text = JSON.stringify(state.header, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
            }
            h.copyToClipboard(text || h.getFile().name, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'dl-pkg',
          onClick: function(h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],
      infoHtml: '<strong>Pro Inspector:</strong> 100% private, client-side analysis of SquashFS and Zip-based Snap packages.'
    });
  };

  async function analyzeZip(file, content, h) {
    try {
      const zip = await JSZip.loadAsync(content);
      const files = [];
      let metaText = null;
      let metaName = null;

      zip.forEach((path, entry) => {
        files.push({
          name: entry.name,
          size: entry._data ? (entry._data.uncompressedSize || 0) : 0,
          date: entry.date || new Date(),
          dir: entry.dir
        });

        const lower = entry.name.toLowerCase();
        if (lower === 'meta/snap.yaml' || lower === 'snap/snapcraft.yaml') {
          metaName = entry.name;
        }
      });

      if (metaName) {
        metaText = await zip.file(metaName).async('string');
      }

      files.sort((a, b) => a.name.localeCompare(b.name));
      
      h.setState({ 
        type: 'zip', 
        files, 
        filtered: files, 
        metaText, 
        metaName,
        sort: { key: 'name', dir: 1 },
        query: ''
      });

      renderZipView(h);
    } catch (err) {
      renderGenericBinary(h);
    }
  }

  function renderFileInfo(file, typeLabel, h) {
    return `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
        <span class="font-semibold text-surface-800">${esc(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-md text-[10px] font-bold uppercase tracking-wider">${typeLabel}</span>
      </div>
    `;
  }

  function renderZipView(h) {
    const { files, filtered, metaText, metaName, query, sort } = h.getState();
    const file = h.getFile();

    let html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        ${renderFileInfo(file, 'Snap Package (Zip)', h)}

        ${metaText ? `
          <div class="mb-8 rounded-xl overflow-hidden border border-brand-200 bg-white shadow-sm">
            <div class="bg-brand-50 px-4 py-2 border-b border-brand-100 flex items-center justify-between">
              <h3 class="font-bold text-brand-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                ${esc(metaName)}
              </h3>
              <span class="text-[10px] text-brand-500 font-mono">YAML Metadata</span>
            </div>
            <div class="p-0">
              <pre class="p-4 text-[13px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-80">${esc(metaText)}</pre>
            </div>
          </div>
        ` : ''}

        <div class="flex items-center justify-between mb-4 gap-4">
          <div class="relative flex-1 max-w-md">
            <input type="text" id="file-search" value="${esc(query)}" placeholder="Search files in package..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
            <svg class="w-4 h-4 absolute left-3.5 top-3 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <div class="flex items-center gap-2">
             <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-bold">${filtered.length.toLocaleString()} items</span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50/80 backdrop-blur-sm sticky top-0 z-10">
                <th class="px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="name">
                  File Path ${sort.key === 'name' ? (sort.dir === 1 ? '▲' : '▼') : ''}
                </th>
                <th class="px-4 py-3 text-right font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-32" data-sort="size">
                  Size ${sort.key === 'size' ? (sort.dir === 1 ? '▲' : '▼') : ''}
                </th>
                <th class="px-4 py-3 text-right font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-48" data-sort="date">
                  Modified ${sort.key === 'date' ? (sort.dir === 1 ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${filtered.length === 0 ? `
                <tr><td colspan="3" class="px-4 py-12 text-center text-surface-400 italic">No files match your search criteria.</td></tr>
              ` : filtered.slice(0, 500).map(f => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-2.5 text-surface-700 font-mono text-[11px] flex items-center gap-3">
                    <span class="text-lg leading-none grayscale group-hover:grayscale-0 transition-all">${f.dir ? '📁' : '📄'}</span>
                    <span class="truncate max-w-xl">${esc(f.name)}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-500 tabular-nums">
                    ${f.dir ? '<span class="text-surface-300">—</span>' : formatSize(f.size)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-400 text-xs tabular-nums">
                    ${f.date ? f.date.toLocaleString() : '—'}
                  </td>
                </tr>
              `).join('')}
              ${filtered.length > 500 ? `
                <tr><td colspan="3" class="px-4 py-4 text-center text-surface-500 bg-surface-50 text-xs font-medium">Showing first 500 of ${filtered.length} items. Narrow your search to find specific files.</td></tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    h.render(html);
    attachZipEvents(h);
  }

  function attachZipEvents(h) {
    const el = h.getRenderEl();
    const searchInput = el.querySelector('#file-search');
    
    searchInput.oninput = (e) => {
      const query = e.target.value.toLowerCase();
      const state = h.getState();
      const filtered = state.files.filter(f => f.name.toLowerCase().includes(query));
      h.setState({ query, filtered });
      renderZipView(h);
      // Refocus and set cursor to end
      const newInput = h.getRenderEl().querySelector('#file-search');
      newInput.focus();
      newInput.setSelectionRange(query.length, query.length);
    };

    el.querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const key = th.dataset.sort;
        const state = h.getState();
        const dir = state.sort.key === key ? -state.sort.dir : 1;
        
        const sorted = [...state.filtered].sort((a, b) => {
          let vA = a[key];
          let vB = b[key];
          if (typeof vA === 'string') return vA.localeCompare(vB) * dir;
          return (vA - vB) * dir;
        });

        h.setState({ filtered: sorted, sort: { key, dir } });
        renderZipView(h);
      };
    });
  }

  function renderSquashFS(file, content, header, h) {
    const compression = COMPRESSION_TYPES[header.compression] || 'Unknown (' + header.compression + ')';
    const date = new Date(Number(header.mkfs_time) * 1000).toLocaleString();
    
    const html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
        ${renderFileInfo(file, `Snap Package (SquashFS v${header.s_major}.${header.s_minor})`, h)}

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm hover:border-brand-300 transition-all">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Compression</p>
            <p class="text-xl font-bold text-surface-900">${esc(compression)}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm hover:border-brand-300 transition-all">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Inodes</p>
            <p class="text-xl font-bold text-surface-900">${header.inodes.toLocaleString()}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm hover:border-brand-300 transition-all">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Block Size</p>
            <p class="text-xl font-bold text-surface-900">${formatSize(header.block_size)}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm hover:border-brand-300 transition-all">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Created</p>
            <p class="text-sm font-bold text-surface-900">${date}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-1 space-y-6">
            <div class="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">
               <div class="px-5 py-3 border-b border-surface-100 bg-surface-50/50">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Superblock Metadata</h3>
               </div>
               <div class="p-5 space-y-3 text-[12px] font-mono">
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Magic</span><span class="text-brand-600 font-bold">0x73717368</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Bytes Used</span><span class="text-surface-900">${header.bytes_used.toLocaleString()}</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Fragments</span><span class="text-surface-900">${header.fragments}</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">ID Count</span><span class="text-surface-900">${header.no_ids}</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Block Log</span><span class="text-surface-900">${header.block_log}</span></div>
                  <div class="flex justify-between"><span class="text-surface-400">Flags</span><span class="text-brand-700 font-bold">0x${header.flags.toString(16).toUpperCase()}</span></div>
               </div>
            </div>
            
            <div class="p-5 bg-blue-50 rounded-2xl border border-blue-100 text-xs text-blue-800 leading-relaxed">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                <span class="font-bold">Did you know?</span>
              </div>
              SquashFS is a highly compressed read-only filesystem. Snap packages use it to keep installation footprints small while maintaining high performance.
            </div>
          </div>

          <div class="lg:col-span-2">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Header Hex Inspection</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">First 1024 bytes</span>
            </div>
            ${getHexDump(content)}
          </div>
        </div>
      </div>
    `;

    h.render(html);
  }

  function renderGenericBinary(h) {
    const file = h.getFile();
    const content = h.getContent();
    const html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
        ${renderFileInfo(file, 'Unknown Binary', h)}
        
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-start gap-3">
          <svg class="w-5 h-5 text-amber-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <div>
            <h4 class="text-sm font-bold text-amber-900 mb-1">Unsupported Snap Variant</h4>
            <p class="text-xs text-amber-800 leading-relaxed">This .snap file does not appear to be a standard SquashFS or Zip package. We can only show the binary header.</p>
          </div>
        </div>

        <div class="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50">
            <h3 class="font-bold text-surface-800 text-sm">Hex Inspection</h3>
          </div>
          <div class="p-0">
            ${getHexDump(content)}
          </div>
        </div>
      </div>
    `;
    h.render(html);
  }

})();
