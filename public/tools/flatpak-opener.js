(function () {
  'use strict';

  /**
   * OmniOpener Flatpak Tool
   * A production-grade browser-based viewer for Flatpak bundles (.flatpak)
   */

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(b) {
    if (!b || b < 0) return '0 B';
    if (b >= 1024 * 1024 * 1024) return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  /**
   * Basic TAR parser for POSIX/ustar/GNU formats.
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    let nextFileName = null;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512;
        continue;
      }

      let name = nextFileName || decoder.decode(header.subarray(0, 100)).split('\0')[0];
      nextFileName = null;

      const sizeStr = decoder.decode(header.subarray(124, 136)).split('\0')[0].trim();
      const size = parseInt(sizeStr, 8) || 0;
      const type = String.fromCharCode(header[156]);

      const magic = decoder.decode(header.subarray(257, 263));
      if (magic.startsWith('ustar')) {
        const prefix = decoder.decode(header.subarray(345, 500)).split('\0')[0];
        if (prefix && !nextFileName) {
          name = prefix + (prefix.endsWith('/') ? '' : '/') + name;
        }
      }

      const contentOffset = offset + 512;
      const data = bytes.subarray(contentOffset, contentOffset + size);

      if (type === 'L') {
        nextFileName = decoder.decode(data).split('\0')[0];
      } else {
        const isDir = type === '5' || name.endsWith('/');
        files.push({ name, size: isDir ? 0 : size, isDir, data: isDir ? null : data });
      }
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  function calculateEntropy(data) {
    const freq = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) freq[data[i]]++;
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (freq[i] > 0) {
        const p = freq[i] / data.length;
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  function generateHexDump(buffer, limit = 4096) {
    const bytes = new Uint8Array(buffer.slice(0, limit));
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

  window.initTool = function (toolConfig, mountEl) {
    let _revocableUrls = [];

    const cleanup = () => {
      _revocableUrls.forEach(url => URL.revokeObjectURL(url));
      _revocableUrls = [];
    };

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js'
        ]);
      },
      onDestroy: cleanup,
      onFile: function _onFile(file, content, h) {
        cleanup();
        h.showLoading('Analyzing Flatpak bundle...');

        // Use a small delay to ensure loading state shows and dependencies are checked
        setTimeout(async function() {
          try {
            let data = new Uint8Array(content);
            const isGzip = data[0] === 0x1f && data[1] === 0x8b;
            
            if (isGzip) {
              if (typeof pako === 'undefined') {
                // pako might be loading, retry once
                await new Promise(r => setTimeout(r, 500));
                if (typeof pako === 'undefined') throw new Error('Decompression library (pako) failed to load.');
              }
              try {
                data = pako.ungzip(data);
              } catch (e) {
                console.warn('GZIP detection might be a false positive or file is corrupt:', e);
              }
            }

            const hashBuffer = await crypto.subtle.digest('SHA-256', content);
            const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            
            let tarFiles = [];
            try {
              tarFiles = parseTar(data.buffer);
            } catch (e) {
              console.log('Not a valid TAR archive, treating as binary blob');
            }

            let metadata = null;
            if (tarFiles.length > 0) {
              const metaFile = tarFiles.find(f => f.name === 'metadata' || f.name.endsWith('/metadata'));
              if (metaFile && metaFile.data) {
                metadata = new TextDecoder().decode(metaFile.data);
              }
            }

            // If no metadata in TAR, search in binary for [Application] or [Runtime]
            if (!metadata) {
              const text = new TextDecoder().decode(data.slice(0, 100000)); // Search first 100KB
              const match = text.match(/\[(Application|Runtime)\][^]*?(\n\n|$)/);
              if (match) metadata = match[0];
            }

            h.setState({
              file,
              content, // Original content for hex dump
              hashHex,
              entropy: calculateEntropy(new Uint8Array(content.slice(0, 65536))), // Sample for speed
              tarFiles,
              metadata,
              activeTab: tarFiles.length > 0 ? 'files' : 'overview',
              searchTerm: ''
            });

            renderUI(h);
          } catch (err) {
            h.showError('Analysis Failed', err.message);
          }
        }, 50);
      },
      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: (h, btn) => h.copyToClipboard(h.getState().hashHex, btn)
        },
        {
          label: '📄 Export Metadata',
          id: 'export-meta',
          onClick: (h) => {
            const state = h.getState();
            if (state.metadata) {
              h.download(`${state.file.name}.metadata.txt`, state.metadata);
            } else {
              h.showError('No Metadata', 'Could not find a flatpak metadata section in this file.');
            }
          }
        }
      ]
    });

    function renderUI(h) {
      const state = h.getState();
      const { file, activeTab, tarFiles, metadata } = state;

      const html = `
        <div class="p-6 max-w-6xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-md text-[10px] font-bold uppercase tracking-wider">.flatpak bundle</span>
          </div>

          <!-- Tabs -->
          <div class="flex gap-1 mb-6 border-b border-surface-200">
            ${renderTabBtn('overview', '🏠 Overview', activeTab)}
            ${tarFiles.length > 0 ? renderTabBtn('files', '📁 Files', activeTab) : ''}
            ${metadata ? renderTabBtn('metadata', '📝 Metadata', activeTab) : ''}
            ${renderTabBtn('hex', '🔢 Hex View', activeTab)}
          </div>

          <div class="tab-content">
            ${activeTab === 'overview' ? renderOverview(state) : ''}
            ${activeTab === 'files' ? renderFiles(state, h) : ''}
            ${activeTab === 'metadata' ? renderMetadata(state) : ''}
            ${activeTab === 'hex' ? renderHex(state) : ''}
          </div>
        </div>
      `;

      h.render(html);
      attachEvents(h);
    }

    function renderTabBtn(id, label, activeId) {
      const isActive = id === activeId;
      return `
        <button 
          data-tab="${id}" 
          class="px-4 py-2 text-sm font-medium transition-all border-b-2 ${isActive ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700 hover:bg-surface-50'}">
          ${label}
        </button>
      `;
    }

    function renderOverview(state) {
      return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div class="space-y-6">
            <div class="bg-white rounded-2xl p-6 border border-surface-200 shadow-sm">
              <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Security & Integrity</h3>
              <div class="space-y-4">
                <div>
                  <label class="text-[10px] font-bold text-surface-400 uppercase">SHA-256 Fingerprint</label>
                  <div class="mt-1 font-mono text-[11px] bg-surface-50 p-3 rounded-lg break-all text-surface-700 border border-surface-100 leading-relaxed">
                    ${state.hashHex}
                  </div>
                </div>
                <div class="flex justify-between items-center py-2 border-b border-surface-50">
                  <span class="text-sm text-surface-500">Binary Entropy</span>
                  <span class="text-sm font-mono font-bold text-surface-800">${state.entropy.toFixed(4)} bits/byte</span>
                </div>
                <div class="flex justify-between items-center py-2">
                  <span class="text-sm text-surface-500">Format Detection</span>
                  <span class="text-sm font-bold text-surface-800">${state.tarFiles.length > 0 ? 'OSTree Static Delta (TAR)' : 'OSTree Data Blob'}</span>
                </div>
              </div>
            </div>

            <div class="bg-brand-50 rounded-2xl p-6 border border-brand-100">
              <h3 class="text-sm font-bold text-brand-800 mb-2">About Flatpak</h3>
              <p class="text-sm text-brand-700 leading-relaxed">
                Flatpak is a system for building, distributing, and running sandboxed desktop applications on Linux. 
                This bundle contains the application's runtime data, metadata, and potentially an OSTree repository.
              </p>
            </div>
          </div>

          <div class="bg-surface-950 rounded-2xl p-6 text-surface-200 shadow-xl overflow-hidden relative">
            <h3 class="text-xs font-bold text-surface-500 uppercase tracking-widest mb-4">Magic Byte Analysis</h3>
            <pre class="font-mono text-[10px] text-brand-400 leading-relaxed">${generateHexDump(state.content, 512)}</pre>
          </div>
        </div>
      `;
    }

    function renderFiles(state, h) {
      const filteredFiles = state.tarFiles.filter(f => 
        f.name.toLowerCase().includes(state.searchTerm.toLowerCase())
      );

      return `
        <div class="space-y-4 animate-in fade-in duration-300">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Archive Contents <span class="ml-2 text-xs font-normal text-surface-400">${state.tarFiles.length} items</span></h3>
            <div class="relative">
              <input 
                type="text" 
                id="file-search" 
                placeholder="Search files..." 
                value="${esc(state.searchTerm)}"
                class="pl-8 pr-4 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-64 shadow-sm"
              >
              <span class="absolute left-2.5 top-2 text-surface-400 text-xs">🔍</span>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
            <div class="overflow-x-auto max-h-[500px]">
              <table class="min-w-full text-sm">
                <thead class="sticky top-0 z-10">
                  <tr class="bg-surface-50 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Path</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700 w-32">Size</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredFiles.map(f => `
                    <tr class="hover:bg-brand-50 transition-colors">
                      <td class="px-4 py-2 font-mono text-[11px] text-surface-600 flex items-center gap-2">
                        <span>${f.isDir ? '📁' : '📄'}</span>
                        <span class="truncate max-w-md" title="${esc(f.name)}">${esc(f.name)}</span>
                      </td>
                      <td class="px-4 py-2 text-right text-[11px] text-surface-400 font-mono">
                        ${f.isDir ? '-' : formatSize(f.size)}
                      </td>
                    </tr>
                  `).join('')}
                  ${filteredFiles.length === 0 ? '<tr><td colspan="2" class="px-4 py-12 text-center text-surface-400 italic">No files found matching your search</td></tr>' : ''}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    function renderMetadata(state) {
      return `
        <div class="space-y-4 animate-in fade-in duration-300">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Bundle Metadata</h3>
            <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">detected flatpak spec</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-lg bg-gray-950">
            <pre class="p-6 text-sm font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[600px]">${esc(state.metadata)}</pre>
          </div>
        </div>
      `;
    }

    function renderHex(state) {
      return `
        <div class="space-y-4 animate-in fade-in duration-300">
          <div class="flex items-center justify-between text-sm">
            <h3 class="font-semibold text-surface-800">Hexadecimal Inspector</h3>
            <span class="text-surface-400 text-xs">Showing first 4KB of raw data</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 bg-white shadow-inner">
            <pre class="p-4 text-[11px] font-mono bg-white text-surface-700 overflow-x-auto leading-tight">${generateHexDump(state.content)}</pre>
          </div>
        </div>
      `;
    }

    function attachEvents(h) {
      const el = h.getRenderEl();

      // Tab switching
      el.querySelectorAll('[data-tab]').forEach(btn => {
        btn.onclick = () => {
          h.setState({ activeTab: btn.dataset.tab });
          renderUI(h);
        };
      });

      // Search
      const searchInput = el.querySelector('#file-search');
      if (searchInput) {
        searchInput.oninput = (e) => {
          h.setState({ searchTerm: e.target.value });
          renderUI(h);
          const newInp = h.getRenderEl().querySelector('#file-search');
          if (newInp) {
            newInp.focus();
            newInp.setSelectionRange(e.target.value.length, e.target.value.length);
          }
        };
      }
    }
  };
})();
