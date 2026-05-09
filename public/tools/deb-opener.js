(function () {
  'use strict';

  /**
   * OmniOpener - .deb (Debian Package) Tool
   * Robust AR/TAR parsing, metadata extraction, and security analysis.
   */

  // --- Helpers ---
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function calculateEntropy(data) {
    if (data.length === 0) return 0;
    const freq = new Uint32Array(256);
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
   * AR Parser - Deb files are AR archives
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
      if (offset % 2 !== 0) offset++; // Padding byte
    }
    return members;
  }

  /**
   * TAR Parser - Used for control.tar.gz and data.tar.gz
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      // Check for end of archive (two empty blocks)
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512; continue;
      }

      const name = decoder.decode(header.subarray(0, 100)).split('\0')[0];
      const size = parseInt(decoder.decode(header.subarray(124, 136)).trim(), 8);
      
      if (isNaN(size)) {
        offset += 512;
        continue;
      }

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
    let pakoPromise = null;

    function loadPako(h) {
      if (typeof pako !== 'undefined') return Promise.resolve();
      if (pakoPromise) return pakoPromise;
      pakoPromise = new Promise((resolve, reject) => {
        h.loadScripts(['https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js'], () => {
          if (typeof pako !== 'undefined') resolve();
          else reject(new Error('Failed to load pako library'));
        });
      });
      return pakoPromise;
    }

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onInit: function (h) {
        loadPako(h).catch(console.error);
      },
      onFile: async function _onFile(file, content, h) {
        h.showLoading('Parsing Debian package...');

        try {
          if (!(content instanceof ArrayBuffer)) {
            throw new Error('Expected ArrayBuffer for binary file');
          }

          const members = parseAr(content);
          let packageMeta = null;
          let debBinaryVersion = 'Unknown';
          let innerFiles = [];

          // Process AR members
          for (const member of members) {
            if (member.name === 'debian-binary') {
              debBinaryVersion = new TextDecoder().decode(member.data).trim();
            }

            // Extract control metadata
            if (member.name.startsWith('control.tar')) {
              await loadPako(h);
              let tarData = member.data;
              if (member.name.endsWith('.gz')) {
                try {
                  tarData = pako.ungzip(member.data);
                } catch (e) {
                  console.error('Failed to ungzip control', e);
                }
              }
              
              const tarFiles = parseTar(tarData.buffer.slice(tarData.byteOffset, tarData.byteOffset + tarData.byteLength));
              const controlFile = tarFiles.find(f => f.name === 'control' || f.name.endsWith('/control'));
              if (controlFile) {
                packageMeta = parseControlFile(new TextDecoder().decode(controlFile.data));
              }
            }

            // List data files if uncompressed or gz
            if (member.name.startsWith('data.tar')) {
              if (member.name.endsWith('.gz')) {
                try {
                  await loadPako(h);
                  const unzipped = pako.ungzip(member.data);
                  const dataFiles = parseTar(unzipped.buffer.slice(unzipped.byteOffset, unzipped.byteOffset + unzipped.byteLength));
                  innerFiles = innerFiles.concat(dataFiles.map(f => ({ ...f, origin: member.name })));
                } catch (e) {
                  console.warn('Could not decompress data.tar.gz', e);
                }
              } else if (member.name === 'data.tar') {
                 const dataFiles = parseTar(member.data.buffer.slice(member.data.byteOffset, member.data.byteOffset + member.data.byteLength));
                 innerFiles = innerFiles.concat(dataFiles.map(f => ({ ...f, origin: member.name })));
              }
            }
          }

          // Security & Analysis
          const hashBuffer = await crypto.subtle.digest('SHA-256', content);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');

          const entropy = calculateEntropy(new Uint8Array(content));
          const hexDump = generateHexDump(content.slice(0, 4096));

          h.setState({
            file,
            members,
            innerFiles,
            packageMeta,
            debBinaryVersion,
            hashHex,
            entropy,
            hexDump,
            searchTerm: '',
            view: 'archive' // 'archive' or 'security'
          });

          _render(h);
        } catch (err) {
          console.error(err);
          h.showError('Could not open deb file', 'The file might be corrupted or in an unsupported format. ' + err.message);
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
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            const state = h.getState();
            if (state.file && state.content) {
              h.download(state.file.name, state.content);
            }
          }
        }
      ],
      onDestroy: function () {
        // No object URLs to revoke in this tool
      }
    });

    function _render(h) {
      const state = h.getState();
      const { file, members, innerFiles, packageMeta, hashHex, entropy, hexDump, searchTerm, view } = state;

      const filteredMembers = members.filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      const filteredInner = innerFiles.filter(f => 
        f.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const html = `
        <div class="p-6 max-w-7xl mx-auto space-y-6">
          
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">Debian Package</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            <!-- Sidebar: Package Info -->
            <div class="lg:col-span-1 space-y-6">
              <div class="rounded-xl border border-surface-200 bg-white p-5 shadow-sm space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-surface-900 text-lg">${esc(packageMeta?.Package || 'Unknown')}</h3>
                  <span class="text-[10px] font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full uppercase">v${esc(state.debBinaryVersion)}</span>
                </div>
                
                <div class="space-y-3 text-sm">
                  <div>
                    <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Version</label>
                    <div class="text-surface-700 font-medium">${esc(packageMeta?.Version || 'N/A')}</div>
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Architecture</label>
                    <div class="text-surface-700 font-medium">${esc(packageMeta?.Architecture || 'N/A')}</div>
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Maintainer</label>
                    <div class="text-surface-700 break-words leading-tight">${esc(packageMeta?.Maintainer || 'Unknown')}</div>
                  </div>
                </div>

                <div class="pt-4 border-t border-surface-100">
                  <p class="text-xs text-surface-500 leading-relaxed italic">
                    ${esc(packageMeta?.Description?.split('\n')[0] || 'No description available.')}
                  </p>
                </div>
              </div>

              <!-- View Switcher -->
              <div class="flex flex-col gap-2">
                <button id="view-archive" class="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'archive' ? 'bg-brand-600 text-white shadow-md' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}">
                  📦 Archive Contents
                </button>
                <button id="view-security" class="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'security' ? 'bg-brand-600 text-white shadow-md' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}">
                  🛡️ Security Analysis
                </button>
              </div>
            </div>

            <!-- Main Content Area -->
            <div class="lg:col-span-3 space-y-6">
              
              ${view === 'archive' ? `
                <!-- SEARCH -->
                <div class="relative group">
                  <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">🔍</span>
                  <input type="text" id="deb-search" placeholder="Search archive members or inner files..." 
                         value="${esc(searchTerm)}"
                         class="w-full pl-11 pr-4 py-3 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
                </div>

                <!-- Archive Members (AR) -->
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Archive Members (AR)</h3>
                    <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${members.length} items</span>
                  </div>
                  <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
                    <table class="min-w-full text-sm">
                      <thead class="bg-surface-50 border-b border-surface-200">
                        <tr>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                          <th class="px-4 py-3 text-right font-semibold text-surface-700">Size</th>
                          <th class="px-4 py-3 text-right font-semibold text-surface-700">Modified</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-100">
                        ${filteredMembers.map(m => `
                          <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                            <td class="px-4 py-2.5 font-mono text-xs text-surface-800">${esc(m.name)}</td>
                            <td class="px-4 py-2.5 text-right font-mono text-xs text-surface-500">${formatSize(m.size)}</td>
                            <td class="px-4 py-2.5 text-right text-xs text-surface-400">${m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString() : 'N/A'}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Inner Files (Extracted from data.tar.gz) -->
                ${innerFiles.length > 0 ? `
                  <div class="space-y-3">
                    <div class="flex items-center justify-between">
                      <h3 class="font-semibold text-surface-800">Installed Files Preview</h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${innerFiles.length} items</span>
                    </div>
                    <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white max-h-[500px] overflow-y-auto">
                      <table class="min-w-full text-sm">
                        <thead class="sticky top-0 bg-white/95 backdrop-blur z-10 border-b border-surface-200 shadow-sm">
                          <tr>
                            <th class="px-4 py-3 text-left font-semibold text-surface-700">Path</th>
                            <th class="px-4 py-3 text-right font-semibold text-surface-700">Size</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100">
                          ${filteredInner.map(f => `
                            <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                              <td class="px-4 py-2 font-mono text-xs text-surface-700">
                                <span class="text-surface-300 mr-1">${f.type === '5' ? '📁' : '📄'}</span>
                                ${esc(f.name)}
                              </td>
                              <td class="px-4 py-2 text-right font-mono text-xs text-surface-500">${formatSize(f.size)}</td>
                            </tr>
                          `).join('')}
                          ${filteredInner.length === 0 ? `<tr><td colspan="2" class="p-8 text-center text-surface-400 italic">No files match your search.</td></tr>` : ''}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ` : `
                  <div class="p-8 rounded-xl border border-dashed border-surface-300 text-center text-surface-500 bg-surface-50">
                    <p>Installed files (data.tar) are compressed or in an unsupported format (.xz/.zst) for browser preview.</p>
                  </div>
                `}

              ` : `
                <!-- Security View -->
                <div class="grid grid-cols-1 gap-6">
                  
                  <!-- Hash Card -->
                  <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between">
                      <h3 class="font-bold text-surface-800">File Signature</h3>
                      <button id="copy-hash" class="text-xs text-brand-600 font-semibold hover:text-brand-700">📋 Copy Hash</button>
                    </div>
                    <div>
                      <label class="block text-[10px] font-bold text-surface-400 uppercase mb-1">SHA-256</label>
                      <div class="p-3 bg-surface-900 rounded-lg font-mono text-xs text-brand-300 break-all leading-relaxed">
                        ${hashHex}
                      </div>
                    </div>
                  </div>

                  <!-- Entropy Card -->
                  <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm space-y-4">
                    <h3 class="font-bold text-surface-800">Data Density (Entropy)</h3>
                    <div class="space-y-4">
                      <div class="flex items-center gap-4">
                        <div class="flex-1 h-3 bg-surface-100 rounded-full overflow-hidden">
                          <div class="h-full bg-brand-500 transition-all duration-1000" style="width: ${(entropy / 8) * 100}%"></div>
                        </div>
                        <span class="text-lg font-mono font-bold text-surface-900">${entropy.toFixed(4)}</span>
                      </div>
                      <div class="p-3 rounded-lg ${entropy > 7.5 ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-green-50 text-green-700 border border-green-100'} text-xs">
                        <strong>Result:</strong> ${entropy > 7.5 ? 'High entropy detected. This file is likely compressed or contains encrypted binary data.' : 'Moderate entropy. File contains significant uncompressed or structured data blocks.'}
                      </div>
                    </div>
                  </div>

                  <!-- Hex Preview -->
                  <div class="rounded-xl border border-surface-200 overflow-hidden shadow-sm">
                    <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                      <span class="text-xs font-bold text-surface-500 uppercase tracking-widest">Hexadecimal Preview (First 4KB)</span>
                    </div>
                    <div class="bg-gray-950 p-4 overflow-x-auto">
                      <pre class="text-[11px] font-mono text-gray-400 leading-relaxed">${esc(hexDump)}</pre>
                    </div>
                  </div>
                </div>
              `}

            </div>
          </div>
        </div>
      `;

      h.render(html);

      // --- Event Listeners ---
      const search = document.getElementById('deb-search');
      if (search) {
        search.addEventListener('input', (e) => {
          h.setState('searchTerm', e.target.value);
          _render(h);
          const s = document.getElementById('deb-search');
          if (s) {
            s.focus();
            s.setSelectionRange(s.value.length, s.value.length);
          }
        });
      }

      document.getElementById('view-archive')?.addEventListener('click', () => {
        h.setState('view', 'archive');
        _render(h);
      });

      document.getElementById('view-security')?.addEventListener('click', () => {
        h.setState('view', 'security');
        _render(h);
      });

      document.getElementById('copy-hash')?.addEventListener('click', (e) => {
        h.copyToClipboard(hashHex, e.target);
      });
    }
  };

})();
