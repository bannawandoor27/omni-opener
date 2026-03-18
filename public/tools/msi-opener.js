(function () {
  'use strict';

  /**
   * OmniOpener — MSI (Microsoft Installer) Opener Tool
   * A production-grade inspector for MSI (OLE2 Compound File) packages.
   */

  const CFB_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.msi,.msp,.msm,.mst',
      dropLabel: 'Drop an MSI, MSP, or MSM file here',
      binary: true,
      onInit: function (helpers) {
        if (typeof XLSX === 'undefined' || !XLSX.CFB) {
          helpers.loadScript(CFB_URL);
        }
      },
      onFile: async function (file, content, helpers) {
        helpers.showLoading('Analyzing MSI structure...');

        try {
          // B1: Race condition check for CDN script
          await new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
              if (typeof XLSX !== 'undefined' && XLSX.CFB) return resolve();
              if (++attempts > 100) return reject(new Error('MSI parser library failed to load.'));
              setTimeout(check, 50);
            };
            check();
          });

          // B2: content is ArrayBuffer because binary: true
          const cfb = XLSX.CFB.read(new Uint8Array(content), { type: 'array' });
          
          if (!cfb || !cfb.FullPaths || cfb.FullPaths.length === 0) {
            throw new Error('This file does not appear to be a valid OLE2/MSI container.');
          }

          const streams = cfb.FullPaths.map((path, i) => {
            const entry = cfb.FileIndex[i];
            const name = path.split('/').pop() || '/';
            return {
              path: path,
              name: name,
              size: entry ? entry.size : 0,
              type: entry ? (entry.type === 2 ? 'Stream' : 'Storage') : 'Unknown',
              content: entry ? entry.content : null
            };
          }).filter(s => s.path !== '/');

          if (streams.length === 0) {
            helpers.setState({ file, empty: true });
            render(helpers);
            return;
          }

          helpers.setState({
            file,
            streams,
            filteredStreams: streams,
            sortKey: 'name',
            sortDir: 'asc',
            filter: '',
            selectedStream: null,
            empty: false
          });

          render(helpers);
        } catch (err) {
          console.error('[MSI Opener Error]', err);
          helpers.showError(
            'Could not open MSI file',
            'The file may be corrupted, encrypted, or an unsupported variant. ' + err.message
          );
        }
      },
      actions: [
        {
          label: '📥 Export Summary',
          id: 'export-summary',
          onClick: function (helpers) {
            const state = helpers.getState();
            if (!state.streams) return;
            const summary = {
              filename: state.file.name,
              size: state.file.size,
              exportedAt: new Date().toISOString(),
              entries: state.streams.map(s => ({
                path: s.path,
                type: s.type,
                size: s.size
              }))
            };
            helpers.download(`${state.file.name}-inventory.json`, JSON.stringify(summary, null, 2), 'application/json');
          }
        },
        {
          label: '📋 Copy Paths',
          id: 'copy-paths',
          onClick: function (helpers, btn) {
            const state = helpers.getState();
            if (!state.streams) return;
            const paths = state.streams.map(s => s.path).join('\n');
            helpers.copyToClipboard(paths, btn);
          }
        }
      ]
    });
  };

  function render(helpers) {
    const state = helpers.getState();
    const { file, empty, filteredStreams, sortKey, sortDir, filter, selectedStream } = state;

    if (empty) {
      helpers.render(`
        <div class="flex flex-col items-center justify-center py-20 text-surface-500">
          <svg class="w-16 h-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p class="text-lg font-medium">Empty MSI Package</p>
          <p class="text-sm">This file contains no streams or storages.</p>
        </div>
      `);
      return;
    }

    const streamCount = filteredStreams.filter(s => s.type === 'Stream').length;
    const storageCount = filteredStreams.filter(s => s.type === 'Storage').length;

    const html = `
      <div class="p-4 md:p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">MSI (OLE2) Package</span>
          <span class="ml-auto hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider">
            Detected
          </span>
        </div>

        <!-- SEARCH BOX -->
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg class="h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input 
            type="text" 
            id="msi-search-input"
            placeholder="Search streams or storages by name..." 
            class="w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none text-surface-800"
            value="${escapeHTML(filter)}"
          >
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- MAIN TABLE (LHS) -->
          <div class="${selectedStream ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4">
            <!-- U10: Section header with counts -->
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-surface-800">Container Entries</h3>
              <div class="flex gap-2">
                <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">${streamCount} Streams</span>
                <span class="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold uppercase">${storageCount} Storages</span>
              </div>
            </div>

            <!-- U7: Beautiful Table -->
            <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50">
                      ${renderSortHeader('Name', 'name', sortKey, sortDir)}
                      ${renderSortHeader('Type', 'type', sortKey, sortDir)}
                      ${renderSortHeader('Size', 'size', sortKey, sortDir)}
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${filteredStreams.length === 0 ? `
                      <tr>
                        <td colspan="3" class="px-4 py-12 text-center text-surface-400">
                          No matching entries found
                        </td>
                      </tr>
                    ` : filteredStreams.map((s, idx) => `
                      <tr 
                        class="group cursor-pointer transition-colors ${selectedStream && selectedStream.path === s.path ? 'bg-brand-50' : 'hover:bg-surface-50'}"
                        onclick="window.msi_toggleStream(${idx})"
                      >
                        <td class="px-4 py-3 border-b border-surface-50">
                          <div class="flex items-center gap-2">
                            <span class="text-lg">${s.type === 'Stream' ? '📄' : '📁'}</span>
                            <span class="font-mono text-xs text-surface-700 break-all" title="${escapeHTML(s.path)}">
                              ${escapeHTML(s.name)}
                            </span>
                          </div>
                        </td>
                        <td class="px-4 py-3 border-b border-surface-50">
                          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${s.type === 'Stream' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}">
                            ${s.type}
                          </span>
                        </td>
                        <td class="px-4 py-3 border-b border-surface-50 font-mono text-xs text-surface-500 whitespace-nowrap text-right">
                          ${s.type === 'Stream' ? formatSize(s.size) : '--'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- DETAIL VIEW (RHS) -->
          ${selectedStream ? `
            <div class="lg:col-span-5 space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-surface-800">Stream Inspector</h3>
                <button 
                  class="text-surface-400 hover:text-surface-600 transition-colors"
                  onclick="window.msi_toggleStream(null)"
                >
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <!-- U9: Content Card for stream details -->
              <div class="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-3">
                <div class="space-y-1">
                  <div class="text-[10px] font-bold text-brand-600 uppercase tracking-wider">Stream Name</div>
                  <div class="font-mono text-sm text-surface-800 break-all bg-white p-2 rounded border border-brand-100">
                    ${escapeHTML(selectedStream.path)}
                  </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                  <div class="space-y-1">
                    <div class="text-[10px] font-bold text-surface-500 uppercase tracking-wider">Size</div>
                    <div class="text-sm font-semibold text-surface-700">${formatSize(selectedStream.size)}</div>
                  </div>
                  <div class="space-y-1">
                    <div class="text-[10px] font-bold text-surface-500 uppercase tracking-wider">Action</div>
                    <button 
                      class="text-xs font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                      onclick="window.msi_downloadCurrent()"
                    >
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Download Stream
                    </button>
                  </div>
                </div>
              </div>

              <!-- U8: Hex Preview -->
              <div class="space-y-2">
                <div class="text-xs font-semibold text-surface-500">Hex View (First 4KB)</div>
                <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950 shadow-inner">
                  <pre class="p-4 text-[11px] md:text-xs font-mono text-gray-400 overflow-x-auto leading-relaxed max-h-[500px] select-all scrollbar-thin scrollbar-thumb-gray-800">
                    ${renderHex(selectedStream.content)}
                  </pre>
                </div>
              </div>
            </div>
          ` : `
            <div class="lg:col-span-5 hidden lg:flex flex-col items-center justify-center border-2 border-dashed border-surface-200 rounded-2xl p-8 text-surface-400">
              <svg class="w-12 h-12 mb-3 opacity-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p class="text-sm font-medium text-center">Select an entry from the left<br>to inspect its raw data.</p>
            </div>
          `}
        </div>
      </div>
    `;

    helpers.render(html);

    // B1: Input event binding
    const searchInput = document.getElementById('msi-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const state = helpers.getState();
        const filtered = state.streams.filter(s => 
          s.name.toLowerCase().includes(query) || 
          s.path.toLowerCase().includes(query)
        );
        helpers.setState({
          ...state,
          filter: e.target.value,
          filteredStreams: sortData(filtered, state.sortKey, state.sortDir)
        });
        render(helpers);
        // Put focus back after render
        const inp = document.getElementById('msi-search-input');
        if (inp) {
          inp.focus();
          inp.setSelectionRange(inp.value.length, inp.value.length);
        }
      };
    }
  }

  function renderSortHeader(label, key, currentKey, currentDir) {
    const isActive = key === currentKey;
    const arrow = currentDir === 'asc' ? '▲' : '▼';
    return `
      <th 
        class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors"
        onclick="window.msi_sort('${key}')"
      >
        <div class="flex items-center gap-1">
          ${label}
          <span class="text-[10px] ${isActive ? 'text-brand-600' : 'text-surface-300'}">${isActive ? arrow : '↕'}</span>
        </div>
      </th>
    `;
  }

  function sortData(data, key, dir) {
    return [...data].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  window.msi_sort = function (key) {
    const helpers = OmniTool.getHelpers();
    const state = helpers.getState();
    const dir = (state.sortKey === key && state.sortDir === 'asc') ? 'desc' : 'asc';
    helpers.setState({
      ...state,
      sortKey: key,
      sortDir: dir,
      filteredStreams: sortData(state.filteredStreams, key, dir)
    });
    render(helpers);
  };

  window.msi_toggleStream = function (idx) {
    const helpers = OmniTool.getHelpers();
    const state = helpers.getState();
    
    if (idx === null) {
      helpers.setState({ ...state, selectedStream: null });
      render(helpers);
      return;
    }

    const stream = state.filteredStreams[idx];
    if (stream.type !== 'Stream') return;

    helpers.setState({ ...state, selectedStream: stream });
    render(helpers);
  };

  window.msi_downloadCurrent = function () {
    const helpers = OmniTool.getHelpers();
    const { selectedStream } = helpers.getState();
    if (!selectedStream || !selectedStream.content) return;
    
    const safeName = selectedStream.name.replace(/[^\w.-]/g, '_') || 'stream.bin';
    helpers.download(safeName, selectedStream.content, 'application/octet-stream');
  };

  function renderHex(data) {
    if (!data) return 'No data available.';
    const view = new Uint8Array(data);
    const limit = 4096; // B7: Truncate large streams
    let hex = '';
    
    for (let i = 0; i < Math.min(view.length, limit); i += 16) {
      let line = i.toString(16).toUpperCase().padStart(4, '0') + '  ';
      let chars = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < view.length) {
          const byte = view[i + j];
          line += byte.toString(16).toUpperCase().padStart(2, '0') + ' ';
          chars += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
        } else {
          line += '   ';
          chars += ' ';
        }
      }
      hex += line + ' | ' + chars + '\n';
    }
    
    if (view.length > limit) {
      hex += `\n... [Truncated: showing first 4KB of ${formatSize(view.length)}]`;
    }
    
    return escapeHTML(hex);
  }

})();
