(function () {
  'use strict';

  /**
   * OmniOpener — MSI (Microsoft Installer) Opener Tool
   * A high-performance, browser-based inspector for MSI (OLE2 Compound File) packages.
   */

  const CFB_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.msi,.msp,.msm,.mst',
      dropLabel: 'Drop an MSI or MSP file here',
      binary: true,
      onInit: function (helpers) {
        if (typeof XLSX === 'undefined') {
          helpers.loadScript(CFB_URL);
        }
      },
      onFile: async function (file, content, helpers) {
        helpers.showLoading('Analyzing MSI structure...');

        try {
          // Ensure CFB library is loaded
          await new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
              if (typeof XLSX !== 'undefined' && XLSX.CFB) return resolve();
              if (++attempts > 50) return reject(new Error('MSI parser (CFB) timed out loading.'));
              setTimeout(check, 100);
            };
            check();
          });

          const cfb = XLSX.CFB.read(new Uint8Array(content), { type: 'array' });
          
          if (!cfb || !cfb.FullPaths || cfb.FullPaths.length === 0) {
            throw new Error('Empty or invalid MSI container');
          }

          const streams = cfb.FullPaths.map((path, i) => {
            const entry = cfb.FileIndex[i];
            return {
              path: path,
              name: path.split('/').pop() || '/',
              size: entry ? entry.size : 0,
              type: entry ? (entry.type === 2 ? 'Stream' : 'Storage') : 'Unknown'
            };
          }).filter(s => s.path !== '/');

          helpers.setState({
            file,
            cfb,
            streams,
            filteredStreams: streams,
            sortKey: 'name',
            sortDir: 'asc',
            filter: '',
            selectedStream: null
          });

          renderMSI(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError(
            'Could not open MSI file',
            'The file may be corrupted, encrypted, or not a valid Microsoft Installer package. (Error: ' + err.message + ')'
          );
        }
      },
      actions: [
        {
          label: '📥 Export Summary',
          id: 'export-summary',
          onClick: function (helpers) {
            const { file, streams } = helpers.getState();
            const summary = {
              filename: file.name,
              size: file.size,
              exportedAt: new Date().toISOString(),
              streams: streams.map(s => ({
                path: s.path,
                type: s.type,
                size: s.size
              }))
            };
            helpers.download(`${file.name}-summary.json`, JSON.stringify(summary, null, 2), 'application/json');
          }
        },
        {
          label: '📋 Copy Paths',
          id: 'copy-paths',
          onClick: function (helpers, btn) {
            const { streams } = helpers.getState();
            const paths = streams.map(s => s.path).join('\n');
            helpers.copyToClipboard(paths, btn);
          }
        }
      ]
    });
  };

  function renderMSI(helpers) {
    const state = helpers.getState();
    const { file, filteredStreams, sortKey, sortDir, filter, selectedStream } = state;

    const streamCount = filteredStreams.filter(s => s.type === 'Stream').length;
    const storageCount = filteredStreams.filter(s => s.type === 'Storage').length;

    const html = `
      <div class="p-6 max-w-7xl mx-auto space-y-6">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${filteredStreams.length} entries (${streamCount} streams, ${storageCount} storages)</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">OLE2 Container</span>
        </div>

        <!-- SEARCH & FILTER -->
        <div class="relative group">
          <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg class="h-4 w-4 text-surface-400 group-focus-within:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input 
            type="text" 
            id="msi-search"
            placeholder="Search streams by name or path..." 
            class="w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none text-surface-800"
            value="${escapeHTML(filter)}"
          >
        </div>

        <!-- STREAMS TABLE -->
        <div class="space-y-3">
          <!-- U10: Section header -->
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Package Contents</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredStreams.length} items</span>
          </div>

          <!-- U7: Beautiful Table -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
            <table class="min-w-full text-sm border-collapse">
              <thead>
                <tr class="bg-surface-50/50">
                  ${renderSortHeader('Name / Path', 'path', sortKey, sortDir)}
                  ${renderSortHeader('Type', 'type', sortKey, sortDir)}
                  ${renderSortHeader('Size', 'size', sortKey, sortDir)}
                  <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filteredStreams.length === 0 ? `
                  <tr>
                    <td colspan="4" class="px-4 py-12 text-center text-surface-400">
                      <div class="flex flex-col items-center gap-2">
                        <svg class="w-8 h-8 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                        No streams match your search
                      </div>
                    </td>
                  </tr>
                ` : filteredStreams.map((s, idx) => `
                  <tr class="group even:bg-surface-50/30 hover:bg-brand-50 transition-colors cursor-pointer" onclick="window.msi_selectStream(${idx})">
                    <td class="px-4 py-3 border-b border-surface-100">
                      <div class="flex items-center gap-2">
                        <span class="text-surface-400">
                          ${s.type === 'Stream' ? '📄' : '📁'}
                        </span>
                        <span class="font-mono text-xs text-surface-700 truncate max-w-md" title="${escapeHTML(s.path)}">
                          ${escapeHTML(s.path)}
                        </span>
                      </div>
                    </td>
                    <td class="px-4 py-3 border-b border-surface-100">
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.type === 'Stream' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}">
                        ${s.type}
                      </span>
                    </td>
                    <td class="px-4 py-3 border-b border-surface-100 font-mono text-xs text-surface-500">
                      ${s.type === 'Stream' ? formatSize(s.size) : '--'}
                    </td>
                    <td class="px-4 py-3 border-b border-surface-100 text-right">
                      ${s.type === 'Stream' ? `
                        <button class="text-brand-600 hover:text-brand-800 font-medium px-2 py-1 rounded hover:bg-brand-100 transition-colors text-xs" onclick="event.stopPropagation(); window.msi_downloadStream(${idx})">
                          Download
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- U8: Hex Preview for Selected Stream -->
        <div id="msi-preview-container" class="${selectedStream ? '' : 'hidden'}">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Stream Preview: <span class="font-mono text-brand-600">${selectedStream ? escapeHTML(selectedStream.name) : ''}</span></h3>
            <button class="text-surface-400 hover:text-surface-600" onclick="window.msi_selectStream(null)">✕ Close</button>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre id="msi-hex-viewer" class="p-4 text-sm font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-[400px]">
              ${selectedStream ? renderHex(selectedStream.data) : ''}
            </pre>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Attach event listeners
    const searchInput = document.getElementById('msi-search');
    if (searchInput) {
      searchInput.oninput = (e) => handleFilter(helpers, e.target.value);
    }
  }

  function renderSortHeader(label, key, currentKey, currentDir) {
    const isActive = key === currentKey;
    const arrow = currentDir === 'asc' ? '▲' : '▼';
    return `
      <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:text-brand-600 transition-colors" onclick="window.msi_sort('${key}')">
        <div class="flex items-center gap-1">
          ${label}
          <span class="text-[10px] ${isActive ? 'text-brand-500' : 'text-surface-300 opacity-0 group-hover:opacity-100'}">${isActive ? arrow : '▲'}</span>
        </div>
      </th>
    `;
  }

  function handleFilter(helpers, query) {
    const state = helpers.getState();
    const filter = query.toLowerCase();
    const filtered = state.streams.filter(s => 
      s.path.toLowerCase().includes(filter) || 
      s.name.toLowerCase().includes(filter)
    );
    helpers.setState({ 
      ...state, 
      filter: query, 
      filteredStreams: sortData(filtered, state.sortKey, state.sortDir)
    });
    renderMSI(helpers);
  }

  window.msi_sort = function(key) {
    const helpers = window.OmniTool.getHelpers();
    const state = helpers.getState();
    const dir = (state.sortKey === key && state.sortDir === 'asc') ? 'desc' : 'asc';
    
    helpers.setState({
      ...state,
      sortKey: key,
      sortDir: dir,
      filteredStreams: sortData(state.filteredStreams, key, dir)
    });
    renderMSI(helpers);
  };

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

  window.msi_selectStream = function(idx) {
    const helpers = window.OmniTool.getHelpers();
    const state = helpers.getState();
    
    if (idx === null) {
      helpers.setState({ ...state, selectedStream: null });
      renderMSI(helpers);
      return;
    }

    const streamInfo = state.filteredStreams[idx];
    if (streamInfo.type !== 'Stream') return;

    helpers.showLoading(`Reading stream: ${streamInfo.name}...`);

    // CFB streams are read from the FileIndex
    const cfb = state.cfb;
    const path = streamInfo.path;
    
    try {
      // Find the entry in FileIndex by path
      const entryIdx = cfb.FullPaths.indexOf(path);
      const entry = cfb.FileIndex[entryIdx];
      
      if (!entry || !entry.content) {
        throw new Error('Stream content not found');
      }

      helpers.setState({
        ...state,
        selectedStream: {
          name: streamInfo.name,
          data: entry.content
        }
      });
      renderMSI(helpers);
      
      // Scroll to preview
      setTimeout(() => {
        document.getElementById('msi-preview-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      helpers.showError('Could not read stream', err.message);
    }
  };

  window.msi_downloadStream = function(idx) {
    const helpers = window.OmniTool.getHelpers();
    const state = helpers.getState();
    const streamInfo = state.filteredStreams[idx];
    const cfb = state.cfb;
    
    try {
      const entryIdx = cfb.FullPaths.indexOf(streamInfo.path);
      const entry = cfb.FileIndex[entryIdx];
      if (!entry || !entry.content) throw new Error('Stream content missing');
      
      helpers.download(streamInfo.name.replace(/[^\w.-]/g, '_'), entry.content, 'application/octet-stream');
    } catch (err) {
      helpers.showError('Download failed', err.message);
    }
  };

  function renderHex(data) {
    if (!data) return '';
    const view = new Uint8Array(data);
    const limit = 4096; // Only show first 4KB for performance
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
      hex += `\n... [Truncated: showing first ${formatSize(limit)} of ${formatSize(view.length)}]`;
    }
    
    return escapeHTML(hex);
  }

})();

