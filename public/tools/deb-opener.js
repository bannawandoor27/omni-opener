(function () {
  'use strict';

  /**
   * OmniOpener - .deb (Debian Package) Tool
   * Robust AR/TAR parsing, metadata extraction, and hex analysis.
   */

  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function calculateEntropy(data) {
    const freq = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) freq[data[i]]++;
    let entropy = 0;
    const len = data.length;
    for (let i = 0; i < 256; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / len;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  function generateHexDump(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i += 16) {
      let line = i.toString(16).padStart(8, '0') + '  ';
      let ascii = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < bytes.length) {
          const b = bytes[i + j];
          line += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          line += '   ';
        }
        if (j === 7) line += ' ';
      }
      out += line + ' |' + ascii + '|\n';
    }
    return out;
  }

  /**
   * Basic AR Parser
   */
  function parseAr(buffer) {
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder();
    if (decoder.decode(bytes.subarray(0, 8)) !== '!<arch>\n') {
      throw new Error('Not a valid AR archive (missing !<arch> signature)');
    }

    const members = [];
    let offset = 8;

    while (offset + 60 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 60);
      const name = decoder.decode(header.subarray(0, 16)).trim().replace(/\/$/, '');
      const size = parseInt(decoder.decode(header.subarray(48, 60)).trim(), 10);
      
      if (isNaN(size)) break;

      const dataOffset = offset + 60;
      const data = bytes.subarray(dataOffset, dataOffset + size);

      members.push({
        name,
        size,
        data,
        timestamp: parseInt(decoder.decode(header.subarray(16, 28)).trim(), 10)
      });

      offset += 60 + size;
      if (offset % 2 !== 0) offset++; // Padding byte if size is odd
    }
    return members;
  }

  /**
   * Basic TAR Parser (for control.tar.gz)
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512; continue;
      }

      const name = decoder.decode(header.subarray(0, 100)).split('\0')[0];
      const size = parseInt(decoder.decode(header.subarray(124, 136)).trim(), 8) || 0;
      const type = String.fromCharCode(header[156]);
      const data = bytes.subarray(offset + 512, offset + 512 + size);

      files.push({ name, size, type, data });
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  function parseControlFile(content) {
    const lines = content.split('\n');
    const metadata = {};
    let currentKey = null;

    for (let line of lines) {
      if (line.startsWith(' ')) {
        if (currentKey) metadata[currentKey] += '\n' + line.trim();
      } else {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          currentKey = line.substring(0, colonIndex).trim();
          metadata[currentKey] = line.substring(colonIndex + 1).trim();
        }
      }
    }
    return metadata;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js'
        ]);
      },
      onFile: async function _onFile(file, content, h) {
        h.showLoading('Analyzing Debian package...');

        try {
          const buffer = content;
          const members = parseAr(buffer);
          
          let packageMeta = null;
          let debBinaryVersion = 'Unknown';

          // Extract metadata from control.tar.gz
          for (const member of members) {
            if (member.name === 'debian-binary') {
              debBinaryVersion = new TextDecoder().decode(member.data).trim();
            }
            if (member.name === 'control.tar.gz' || member.name === 'control.tar') {
              let tarData = member.data;
              if (member.name.endsWith('.gz')) {
                if (typeof pako === 'undefined') {
                  // Wait a bit if pako is still loading
                  await new Promise(r => setTimeout(r, 200));
                }
                if (typeof pako !== 'undefined') {
                  try {
                    tarData = pako.ungzip(member.data);
                  } catch (e) {
                    console.error('Failed to ungzip control.tar.gz', e);
                  }
                }
              }
              
              const tarFiles = parseTar(tarData.buffer.slice(tarData.byteOffset, tarData.byteOffset + tarData.byteLength));
              const controlFile = tarFiles.find(f => f.name.includes('control') && !f.name.includes('control.'));
              if (controlFile) {
                packageMeta = parseControlFile(new TextDecoder().decode(controlFile.data));
              }
            }
          }

          // Compute Hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');

          // Entropy and Hex
          const entropy = calculateEntropy(new Uint8Array(buffer));
          const hexDump = generateHexDump(buffer.slice(0, 4096));

          h.setState({
            members,
            packageMeta,
            debBinaryVersion,
            hashHex,
            entropy,
            hexDump,
            file,
            searchTerm: ''
          });

          renderDeb(h);
        } catch (err) {
          h.showError('Could not parse DEB file', err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.members) return;
            const list = state.members.map(m => `${m.name} (${formatSize(m.size)})`).join('\n');
            h.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download DEB',
          id: 'dl',
          onClick: function (h) {
            const state = h.getState();
            if (state.file && state.content) {
              h.download(state.file.name, state.content, 'application/vnd.debian.binary-package');
            }
          }
        }
      ],
      onDestroy: function () {
        // Clean up any resources if necessary
      }
    });
  };

  function renderDeb(h) {
    const state = h.getState();
    const { file, members, packageMeta, hashHex, entropy, hexDump, searchTerm } = state;

    const filteredMembers = searchTerm 
      ? members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : members;

    const html = `
      <div class="p-6 space-y-6">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.deb file</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Package Summary Card -->
          <div class="lg:col-span-2 space-y-6">
            <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h2 class="text-xl font-bold text-surface-900">${esc(packageMeta?.Package || 'Unknown Package')}</h2>
                  <p class="text-sm text-surface-500">Version: ${esc(packageMeta?.Version || 'N/A')} • Architecture: ${esc(packageMeta?.Architecture || 'N/A')}</p>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-brand-100 text-brand-700 text-xs font-bold uppercase tracking-wider">
                  DEB v${esc(state.debBinaryVersion)}
                </span>
              </div>
              
              <div class="space-y-4">
                <p class="text-sm text-surface-700 leading-relaxed">
                  ${esc(packageMeta?.Description?.split('\n')[0] || 'No description available.')}
                </p>
                
                <div class="grid grid-cols-2 gap-4 text-xs">
                  <div class="p-3 bg-surface-50 rounded-lg">
                    <span class="block text-surface-400 mb-1 uppercase font-bold tracking-tighter">Maintainer</span>
                    <span class="text-surface-800 truncate block font-medium" title="${esc(packageMeta?.Maintainer || '')}">${esc(packageMeta?.Maintainer || 'Unknown')}</span>
                  </div>
                  <div class="p-3 bg-surface-50 rounded-lg">
                    <span class="block text-surface-400 mb-1 uppercase font-bold tracking-tighter">Section</span>
                    <span class="text-surface-800 font-medium">${esc(packageMeta?.Section || 'Unknown')}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- AR Members Table -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                  Archive Members
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-normal">${members.length}</span>
                </h3>
                <div class="relative w-48">
                  <input type="text" id="deb-search" placeholder="Filter members..." 
                         value="${esc(searchTerm)}"
                         class="w-full pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                  <span class="absolute left-2.5 top-2 text-surface-400">🔍</span>
                </div>
              </div>

              <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                <table class="min-w-full text-sm">
                  <thead class="bg-surface-50 border-b border-surface-200">
                    <tr>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700 uppercase text-[10px] tracking-wider">Member Name</th>
                      <th class="px-4 py-3 text-right font-semibold text-surface-700 uppercase text-[10px] tracking-wider w-24">Size</th>
                      <th class="px-4 py-3 text-right font-semibold text-surface-700 uppercase text-[10px] tracking-wider w-32">Modified</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${filteredMembers.map(m => `
                      <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                        <td class="px-4 py-2.5 font-mono text-xs text-surface-700 flex items-center gap-2">
                          <span class="text-surface-400 group-hover:text-brand-500">📦</span>
                          ${esc(m.name)}
                        </td>
                        <td class="px-4 py-2.5 text-right font-mono text-xs text-surface-500 whitespace-nowrap">
                          ${formatSize(m.size)}
                        </td>
                        <td class="px-4 py-2.5 text-right text-xs text-surface-400 whitespace-nowrap">
                          ${m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    `).join('')}
                    ${filteredMembers.length === 0 ? `
                      <tr><td colspan="3" class="px-4 py-8 text-center text-surface-400 italic">No members found matching your search.</td></tr>
                    ` : ''}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Sidebar: Analysis -->
          <div class="space-y-6">
            <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm space-y-4">
              <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Security Analysis</h3>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-[10px] font-bold text-surface-400 uppercase mb-1">SHA-256 Hash</label>
                  <div class="p-2 bg-surface-50 rounded border border-surface-100 break-all font-mono text-[10px] text-surface-600 relative group">
                    ${hashHex}
                    <button id="copy-hash-btn" class="absolute right-1 top-1 p-1 bg-white border border-surface-200 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      📋
                    </button>
                  </div>
                </div>

                <div>
                  <label class="block text-[10px] font-bold text-surface-400 uppercase mb-1">Shannon Entropy</label>
                  <div class="flex items-center gap-3">
                    <div class="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                      <div class="h-full bg-brand-500" style="width: ${(entropy / 8) * 100}%"></div>
                    </div>
                    <span class="text-sm font-mono text-surface-700">${entropy.toFixed(4)}</span>
                  </div>
                  <p class="text-[10px] text-surface-400 mt-1 italic">
                    ${entropy > 7.5 ? 'Highly compressed or encrypted.' : 'Likely contains uncompressed data.'}
                  </p>
                </div>
              </div>
            </div>

            <!-- Hex Dump Preview -->
            <div class="rounded-xl border border-surface-200 overflow-hidden shadow-sm">
              <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                <span class="text-[10px] font-bold text-surface-500 uppercase tracking-widest">Hex Preview</span>
              </div>
              <div class="bg-gray-950 p-4 overflow-x-auto">
                <pre class="text-[10px] font-mono text-gray-400 leading-tight">${hexDump}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    // Event listeners
    const searchInput = document.getElementById('deb-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        h.setState('searchTerm', e.target.value);
        renderDeb(h);
        const input = document.getElementById('deb-search');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }

    const copyHashBtn = document.getElementById('copy-hash-btn');
    if (copyHashBtn) {
      copyHashBtn.onclick = (e) => h.copyToClipboard(hashHex, e.target);
    }
  }

})();
