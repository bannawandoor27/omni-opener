(function() {
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
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function getHexDump(buffer) {
    const bytes = new Uint8Array(buffer.slice(0, 256));
    let hexHtml = '<table class="w-full text-[10px] font-mono border-collapse">';
    hexHtml += '<thead class="bg-surface-100 text-surface-500"><tr><th class="p-1 text-left">Offset</th><th class="p-1 text-left">Hex Bytes</th><th class="p-1 text-left">ASCII</th></tr></thead><tbody>';
    
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
      
      hexHtml += `<tr class="border-b border-surface-50 hover:bg-surface-50 transition-colors">
        <td class="p-1 text-brand-600 font-bold">${offset}</td>
        <td class="p-1 text-surface-600">${hex}</td>
        <td class="p-1 text-surface-400">${esc(ascii)}</td>
      </tr>`;
    }
    hexHtml += '</tbody></table>';
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
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Analyzing Snap package...');
        
        // Wait for JSZip if needed
        const tryProcess = () => {
          if (typeof JSZip === 'undefined') {
            setTimeout(tryProcess, 100);
            return;
          }

          const header = parseSquashfsHeader(content);
          if (header) {
            helpers.setState({ header: header, files: null });
            renderSquashFS(file, content, header, helpers);
            return;
          }

          // Try parsing as ZIP (for compatible packages)
          JSZip.loadAsync(content)
            .then(function(zip) {
              processZipSnap(file, content, zip, helpers);
            })
            .catch(function() {
              // Fallback to generic binary view
              renderGenericBinary(file, content, helpers);
            });
        };
        tryProcess();
      },
      actions: [
        {
          label: '📋 Copy Info',
          id: 'copy-info',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.files) {
              const list = state.files.map(f => f.name).join('\n');
              helpers.copyToClipboard(list, btn);
            } else if (state.header) {
              const info = JSON.stringify(state.header, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
              helpers.copyToClipboard(info, btn);
            } else {
              helpers.copyToClipboard(helpers.getFile().name, btn);
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl-pkg',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Secure Inspector:</strong> 100% client-side analysis. Supports SquashFS and Zip-compatible Snap formats.'
    });
  };

  function processZipSnap(file, content, zip, helpers) {
    const files = [];
    let metadataEntry = null;

    zip.forEach(function(relativePath, zipEntry) {
      files.push({
        name: zipEntry.name,
        size: zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0,
        date: zipEntry.date,
        dir: zipEntry.dir
      });

      const lower = zipEntry.name.toLowerCase();
      if (lower === 'meta/snap.yaml' || lower === 'snap/snapcraft.yaml') {
        metadataEntry = zipEntry;
      }
    });

    files.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    helpers.setState({ files: files });

    if (metadataEntry) {
      metadataEntry.async('string').then(text => {
        renderZipSnap(file, files, text, metadataEntry.name, helpers);
      }).catch(() => {
        renderZipSnap(file, files, null, null, helpers);
      });
    } else {
      renderZipSnap(file, files, null, null, helpers);
    }
  }

  function renderZipSnap(file, files, metaText, metaName, helpers) {
    const html = `
      <div class="max-w-6xl mx-auto p-6 animate-in fade-in duration-500">
        <div class="flex flex-wrap items-center gap-3 p-4 bg-surface-50 rounded-2xl text-sm text-surface-600 mb-8 border border-surface-200 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="text-2xl">📦</span>
            <span class="font-bold text-surface-900">${esc(file.name)}</span>
          </div>
          <span class="text-surface-300">·</span>
          <span class="font-medium">${formatSize(file.size)}</span>
          <span class="text-surface-300">·</span>
          <span class="bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Snap Package (Zip Format)</span>
        </div>

        ${metaText ? `
          <div class="mb-8 bg-white border border-brand-100 rounded-2xl shadow-sm overflow-hidden">
            <div class="bg-brand-50 px-5 py-3 border-b border-brand-100 flex items-center justify-between">
              <h3 class="text-brand-900 font-bold text-xs uppercase tracking-wider">${esc(metaName)}</h3>
              <span class="text-[10px] text-brand-600 font-mono">YAML Metadata</span>
            </div>
            <div class="p-5">
              <pre class="text-xs text-surface-700 font-mono whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed">${esc(metaText)}</pre>
            </div>
          </div>
        ` : ''}

        <div class="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
            <h3 class="font-bold text-surface-800 text-sm">Package Contents (${files.length.toLocaleString()} items)</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left border-collapse">
              <thead>
                <tr class="bg-surface-50/30 text-[10px] font-bold text-surface-400 uppercase tracking-widest border-b border-surface-100">
                  <th class="px-5 py-4">Path</th>
                  <th class="px-5 py-4 w-28 text-right">Size</th>
                  <th class="px-5 py-4 w-44 text-right">Modified</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${files.slice(0, 500).map(f => `
                  <tr class="hover:bg-brand-50/30 transition-colors group">
                    <td class="px-5 py-3 font-mono text-[11px] text-surface-600 truncate max-w-md">
                      <span class="mr-3 opacity-60">${f.dir ? '📁' : '📄'}</span>${esc(f.name)}
                    </td>
                    <td class="px-5 py-3 text-right text-surface-500 text-xs tabular-nums">
                      ${f.dir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-5 py-3 text-right text-surface-400 text-[10px] tabular-nums">
                      ${f.date ? f.date.toLocaleString() : '-'}
                    </td>
                  </tr>
                `).join('')}
                ${files.length > 500 ? `
                  <tr><td colspan="3" class="p-6 text-center text-surface-400 text-xs italic bg-surface-50/50">Showing first 500 files. Use 'Copy Info' for the complete list.</td></tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
  }

  function renderSquashFS(file, content, header, helpers) {
    const compression = COMPRESSION_TYPES[header.compression] || 'Unknown (' + header.compression + ')';
    const date = new Date(header.mkfs_time * 1000).toLocaleString();
    
    const html = `
      <div class="max-w-6xl mx-auto p-6 animate-in fade-in duration-500">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 class="text-2xl font-bold text-surface-900">${esc(file.name)}</h2>
            <p class="text-sm text-surface-500">Snap Package (SquashFS v${header.s_major}.${header.s_minor})</p>
          </div>
          <div class="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100 self-start">
            <span class="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-2">
              <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              Validated Superblock
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm transition-all hover:border-brand-300">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1">Compression</p>
            <p class="text-lg font-bold text-surface-800">${esc(compression)}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm transition-all hover:border-brand-300">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1">Inodes</p>
            <p class="text-lg font-bold text-surface-800">${header.inodes.toLocaleString()}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm transition-all hover:border-brand-300">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1">Block Size</p>
            <p class="text-lg font-bold text-surface-800">${formatSize(header.block_size)}</p>
          </div>
          <div class="bg-white p-5 rounded-2xl border border-surface-200 shadow-sm transition-all hover:border-brand-300">
            <p class="text-[10px] font-bold text-surface-400 uppercase mb-1">Created</p>
            <p class="text-sm font-bold text-surface-800">${date}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-1 space-y-6">
            <div class="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">
               <div class="px-5 py-3 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                  <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Header Metadata</h3>
               </div>
               <div class="p-5 space-y-3 text-[11px] font-mono">
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Magic</span><span class="text-brand-600">0x73717368</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Bytes Used</span><span class="text-surface-700">${header.bytes_used.toLocaleString()}</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Fragments</span><span class="text-surface-700">${header.fragments}</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">ID Count</span><span class="text-surface-700">${header.no_ids}</span></div>
                  <div class="flex justify-between border-b border-surface-50 pb-2"><span class="text-surface-400">Block Log</span><span class="text-surface-700">${header.block_log}</span></div>
                  <div class="flex justify-between pb-1"><span class="text-surface-400">Flags</span><span class="text-surface-700">0x${header.flags.toString(16)}</span></div>
               </div>
            </div>
            
            <div class="p-5 bg-surface-50 rounded-2xl border border-surface-100 text-[11px] text-surface-500 leading-relaxed italic">
              Snap packages use the read-only SquashFS filesystem for efficient storage and distribution on Linux systems. Full extraction of internal files is supported for Zip-compatible containers.
            </div>
          </div>

          <div class="lg:col-span-2">
            <div class="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">
              <div class="px-5 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                <h3 class="font-bold text-surface-800 text-sm">Superblock Hex Dump</h3>
                <button id="copy-hex" class="text-[10px] font-bold text-brand-600 hover:text-brand-700 uppercase tracking-wider">Copy Hex</button>
              </div>
              <div class="overflow-auto max-h-[500px]">
                ${getHexDump(content)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    const copyHexBtn = document.getElementById('copy-hex');
    if (copyHexBtn) {
      copyHexBtn.onclick = () => {
        const hexTable = helpers.getRenderEl().querySelector('table');
        if (hexTable) {
          const text = Array.from(hexTable.querySelectorAll('tr')).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join('\t')
          ).join('\n');
          helpers.copyToClipboard(text, copyHexBtn);
        }
      };
    }
  }

  function renderGenericBinary(file, content, helpers) {
    const html = `
      <div class="max-w-6xl mx-auto p-6 animate-in fade-in duration-500">
        <div class="flex items-center gap-3 p-4 bg-surface-50 rounded-2xl text-sm text-surface-600 mb-8 border border-surface-200 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="text-2xl">📄</span>
            <span class="font-bold text-surface-900">${esc(file.name)}</span>
          </div>
          <span class="text-surface-300">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">·</span>
          <span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Unknown Binary Format</span>
        </div>

        <div class="bg-white border border-surface-200 rounded-2xl shadow-sm overflow-hidden">
          <div class="px-5 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
            <h3 class="font-bold text-surface-800 text-sm">Hex Inspection</h3>
          </div>
          <div class="overflow-auto max-h-[600px]">
            ${getHexDump(content)}
          </div>
        </div>
      </div>
    `;
    helpers.render(html);
  }

})();
