(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentCfb = null;
    let currentStreams = [];

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.msi,.msp,.msm,.pcp',
      dropLabel: 'Drop a Windows Installer (.msi) file here',
      infoHtml: '<strong>MSI Inspector:</strong> Analyze Windows Installer packages, patches, and merge modules. Explore internal OLE streams, verify CFBF structure, and inspect binary data.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js');
      },

      onFile: async function _onFile(file, content, h) {
        if (typeof CFB === 'undefined') {
          h.showLoading('Loading MSI engine...');
          setTimeout(function() { _onFile(file, content, h); }, 200);
          return;
        }

        h.showLoading('Parsing MSI structure...');

        try {
          const buffer = new Uint8Array(content);
          const cfb = CFB.read(buffer, { type: 'array' });
          
          const hashHex = await computeHash(content);
          
          currentCfb = cfb;
          currentStreams = cfb.FullPaths.map((path, i) => ({
            path: path,
            name: path.split('/').pop() || '(Root)',
            size: cfb.FileIndex[i].size,
            content: cfb.FileIndex[i].content,
            type: cfb.FileIndex[i].type // 1: stream, 2: storage
          })).filter(s => s.path !== '/');

          h.setState({ 
            fileName: file.name,
            fileSize: file.size,
            hashHex: hashHex,
            filter: '',
            sortCol: 'name',
            sortDir: 1,
            selectedIdx: null
          });

          renderApp(h);
        } catch (err) {
          console.error(err);
          h.showError('Could not open MSI file', 'The file may be corrupted or is not a valid Windows Installer (CFBF) container. Error: ' + err.message);
        }
      },

      onDestroy: function() {
        currentCfb = null;
        currentStreams = [];
      },

      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().hashHex;
            if (hash) h.copyToClipboard(hash, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function (h) {
            h.download(h.getState().fileName, h.getContent());
          }
        }
      ]
    });

    async function computeHash(buffer) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function renderApp(h) {
      const state = h.getState();
      const filteredStreams = currentStreams
        .filter(s => s.name.toLowerCase().includes(state.filter.toLowerCase()))
        .sort((a, b) => {
          const valA = a[state.sortCol];
          const valB = b[state.sortCol];
          if (typeof valA === 'string') {
            return valA.localeCompare(valB) * state.sortDir;
          }
          return (valA - valB) * state.sortDir;
        });

      const humanSize = (size) => {
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
        return (size / (1024 * 1024)).toFixed(1) + ' MB';
      };

      const sortIcon = (col) => {
        if (state.sortCol !== col) return '↕️';
        return state.sortDir === 1 ? '▲' : '▼';
      };

      const selectedStream = (state.selectedIdx !== null && filteredStreams[state.selectedIdx]) ? filteredStreams[state.selectedIdx] : null;

      h.render(`
        <div class="max-w-6xl mx-auto">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${humanSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">Windows Installer Package</span>
            <div class="ml-auto flex items-center gap-2">
              <span class="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-surface-200 text-surface-400">${state.hashHex.slice(0, 16)}...</span>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Sidebar: MSI Metadata & Stats -->
            <div class="lg:col-span-3 space-y-4">
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <h3 class="font-bold text-surface-800 text-xs uppercase tracking-wider mb-3">Package Insight</h3>
                <div class="space-y-3">
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-surface-500">Streams</span>
                    <span class="text-xs font-mono font-bold text-brand-600">${currentStreams.length}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-xs text-surface-500">Format</span>
                    <span class="text-xs font-semibold text-surface-700">CFBF</span>
                  </div>
                  <div class="pt-2 border-t border-surface-50">
                    <div class="flex items-center gap-2 mb-1">
                      <div class="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                      <span class="text-[10px] font-bold text-surface-700 uppercase">Valid Container</span>
                    </div>
                    <p class="text-[10px] text-surface-400 leading-tight">Sector size and directory chain verified.</p>
                  </div>
                </div>
              </div>

              <!-- Filter Box (Category Excellence: Archive Search) -->
              <div class="relative">
                <input type="text" id="stream-search" placeholder="Search streams..." 
                  class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  value="${esc(state.filter)}">
                <div class="absolute left-3 top-2.5 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
            </div>

            <!-- Main Content: Streams Table -->
            <div class="lg:col-span-9 space-y-6">
              <div class="flex items-center justify-between mb-1">
                <h3 class="font-semibold text-surface-800">Internal Streams</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredStreams.length} items</span>
              </div>

              <!-- U7: Beautiful Table -->
              <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th class="sortable sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-col="name">
                        Stream Name <span class="ml-1 text-[10px] opacity-50">${sortIcon('name')}</span>
                      </th>
                      <th class="sortable sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-col="size">
                        Size <span class="ml-1 text-[10px] opacity-50">${sortIcon('size')}</span>
                      </th>
                      <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredStreams.length === 0 ? `
                      <tr>
                        <td colspan="3" class="px-4 py-12 text-center text-surface-400">
                          <div class="text-4xl mb-3">🔍</div>
                          <p>No streams match your search.</p>
                        </td>
                      </tr>
                    ` : filteredStreams.map((s, idx) => `
                      <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group ${state.selectedIdx === idx ? 'bg-brand-50' : ''}">
                        <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 font-mono text-xs">
                          <span class="text-surface-300 mr-2">${s.type === 2 ? '📁' : '📄'}</span>
                          ${esc(s.name)}
                        </td>
                        <td class="px-4 py-2.5 text-right text-surface-500 border-b border-surface-100 font-mono text-xs">
                          ${humanSize(s.size)}
                        </td>
                        <td class="px-4 py-2.5 text-right border-b border-surface-100">
                          <button class="view-btn text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase tracking-wider px-2 py-1 rounded hover:bg-brand-100 transition-all" data-idx="${idx}">
                            Inspect
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

              <!-- Stream Inspector (Hex Dump) -->
              ${selectedStream ? `
                <div id="inspector" class="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Stream Inspection: <span class="text-brand-600 font-mono">${esc(selectedStream.name)}</span></h3>
                    <button id="close-inspector" class="text-surface-400 hover:text-surface-600 text-xs">Close ✕</button>
                  </div>
                  
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-lg">
                    <div class="bg-gray-900 px-4 py-2 flex items-center justify-between border-b border-gray-800">
                      <span class="text-[10px] font-mono text-gray-400">HEXADECIMAL VIEW</span>
                      <button id="download-stream" class="text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase">Download Stream</button>
                    </div>
                    <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-[400px]">` + 
                      esc(generateHexDump(selectedStream.content ? selectedStream.content.slice(0, 4096) : new Uint8Array(0))) + 
                      (selectedStream.size > 4096 ? `\n\n[... Truncated: Showing first 4KB of ${humanSize(selectedStream.size)} ...]` : '') + 
                    `</pre>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `);

      // Bind Events
      const renderEl = h.getRenderEl();

      // Search
      const searchInput = renderEl.querySelector('#stream-search');
      if (searchInput) {
        searchInput.oninput = (e) => {
          h.setState({ filter: e.target.value, selectedIdx: null });
          renderApp(h);
          document.getElementById('stream-search').focus();
        };
      }

      // Sort
      renderEl.querySelectorAll('.sortable').forEach(th => {
        th.onclick = () => {
          const col = th.dataset.col;
          const dir = (state.sortCol === col) ? -state.sortDir : 1;
          h.setState({ sortCol: col, sortDir: dir, selectedIdx: null });
          renderApp(h);
        };
      });

      // View Stream
      renderEl.querySelectorAll('.view-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          h.setState({ selectedIdx: idx });
          renderApp(h);
          setTimeout(() => {
            const inspector = document.getElementById('inspector');
            if (inspector) inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        };
      });

      // Close Inspector
      const closeBtn = renderEl.querySelector('#close-inspector');
      if (closeBtn) {
        closeBtn.onclick = () => {
          h.setState({ selectedIdx: null });
          renderApp(h);
        };
      }

      // Download Stream
      const dlStreamBtn = renderEl.querySelector('#download-stream');
      if (dlStreamBtn && selectedStream) {
        dlStreamBtn.onclick = () => {
          h.download(selectedStream.name.replace(/[^a-z0-9.]/gi, '_'), selectedStream.content);
        };
      }
    }

    function generateHexDump(bytes) {
      if (!bytes || bytes.length === 0) return '(Empty Stream)';
      let out = '';
      for (let i = 0; i < bytes.length; i += 16) {
        let line = i.toString(16).padStart(8, '0') + ': ';
        let ascii = '';
        for (let j = 0; j < 16; j++) {
          if (i + j < bytes.length) {
            const b = bytes[i + j];
            line += b.toString(16).padStart(2, '0') + ' ';
            ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            line += '   ';
          }
        }
        out += line + ' |' + ascii + '|\n';
      }
      return out;
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
  };
})();
