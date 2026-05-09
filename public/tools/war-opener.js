(function() {
  'use strict';

  /**
   * OmniOpener .war File Tool
   * A production-perfect browser-based explorer for Java Web Archives.
   */

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(date));
    } catch (e) {
      return '-';
    }
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  };

  const getFileIcon = (name, isDirectory) => {
    if (isDirectory) return '📁';
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      'xml': '🧩',
      'class': '☕',
      'jar': '📦',
      'properties': '⚙️',
      'jsp': '📄',
      'html': '🌐',
      'js': '📜',
      'css': '🎨',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🖼️',
      'json': '{}',
      'txt': '📄',
      'yml': '⚙️',
      'yaml': '⚙️'
    };
    return icons[ext] || '📄';
  };

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.war',
      dropLabel: 'Drop a .war file here',
      binary: true,
      onInit: (helpers) => {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: async function _onFile(file, content, helpers) {
        // B1: Race condition check for CDN script
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Loading libraries...');
          let retries = 0;
          const checkJSZip = setInterval(async function() {
            retries++;
            if (typeof JSZip !== 'undefined') {
              clearInterval(checkJSZip);
              _onFile(file, content, helpers);
            } else if (retries > 100) {
              clearInterval(checkJSZip);
              helpers.showError('Library Load Failed', 'JSZip could not be loaded. Please check your internet connection.');
            }
          }, 50);
          return;
        }

        helpers.showLoading('Analyzing WAR archive...');
        
        try {
          // B3: Proper await for JSZip
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let totalUncompressedSize = 0;
          let webXmlContent = null;

          // Collect entries
          const entryPromises = [];
          zip.forEach((path, entry) => {
            entries.push({
              name: path,
              size: entry._data.uncompressedSize || 0,
              date: entry.date,
              isDirectory: entry.dir,
              entry: entry
            });
            if (!entry.dir) {
              totalUncompressedSize += (entry._data.uncompressedSize || 0);
            }
          });

          if (entries.length === 0) {
            // U5: Empty state
            helpers.render(`
              <div class="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50">
                <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 text-3xl shadow-sm">📦</div>
                <h3 class="text-xl font-semibold text-surface-900">Empty WAR Archive</h3>
                <p class="text-surface-500 mt-2 max-w-sm">This Java Web Archive doesn't contain any files or directories.</p>
              </div>
            `);
            return;
          }

          // Try to find web.xml
          const webXmlEntry = zip.file('WEB-INF/web.xml');
          if (webXmlEntry) {
            webXmlContent = await webXmlEntry.async('string');
          }

          // Initial sort: directories first, then alphabetical
          entries.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          helpers.setState('allEntries', entries);
          helpers.setState('webXml', webXmlContent);
          helpers.setState('totalUncompressedSize', totalUncompressedSize);
          helpers.setState('sortCol', 'name');
          helpers.setState('sortDir', 'asc');
          
          renderMainView(helpers);
        } catch (err) {
          // U3: Friendly error message
          helpers.showError('Could not parse WAR file', 'The archive might be encrypted, corrupted, or not a valid ZIP format. Error: ' + err.message);
        }
      },
      onDestroy: (helpers) => {
        // Cleanup if necessary
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: (helpers, btn) => {
            const entries = helpers.getState('allEntries') || [];
            if (entries.length === 0) return;
            const text = entries.map(e => `${e.isDirectory ? '[DIR] ' : ''}${e.name} (${formatSize(e.size)})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Manifest',
          id: 'dl-manifest',
          onClick: (helpers) => {
            const entries = helpers.getState('allEntries') || [];
            if (entries.length === 0) return;
            const text = entries.map(e => `${e.isDirectory ? '[DIR] ' : ''}${e.name} (${formatSize(e.size)})`).join('\n');
            const fileName = helpers.getFile().name.replace(/\.[^/.]+$/, "") + '-manifest.txt';
            helpers.download(fileName, text);
          }
        }
      ],
      infoHtml: '<strong>WAR Explorer:</strong> Inspect Java Web Archive contents, view deployment descriptors, and extract files. 100% client-side.'
    });
  };

  function renderMainView(helpers) {
    const file = helpers.getFile();
    const allEntries = helpers.getState('allEntries') || [];
    const webXml = helpers.getState('webXml');
    const totalSize = helpers.getState('totalUncompressedSize') || 0;
    const searchTerm = (helpers.getState('searchTerm') || '').toLowerCase();
    const sortCol = helpers.getState('sortCol');
    const sortDir = helpers.getState('sortDir');

    // Filter
    let filtered = searchTerm 
      ? allEntries.filter(e => e.name.toLowerCase().includes(searchTerm))
      : allEntries;

    // Sort
    filtered.sort((a, b) => {
      let valA = a[sortCol];
      let valB = b[sortCol];
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    // B7: Large file handling - pagination/truncation
    const MAX_ROWS = 1000;
    const visibleEntries = filtered.slice(0, MAX_ROWS);
    const isTruncated = filtered.length > MAX_ROWS;

    const html = `
      <div class="space-y-6 animate-in fade-in duration-300">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
          <span class="font-bold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)} (packed)</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-medium text-xs">WAR ARCHIVE</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- U9: Content Card (Summary) -->
          <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-surface-800">Archive Stats</h3>
              <span class="text-[10px] uppercase tracking-wider font-bold text-surface-400">Metadata</span>
            </div>
            <div class="space-y-3">
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Uncompressed Size</span>
                <span class="font-semibold text-surface-800">${formatSize(totalSize)}</span>
              </div>
              <div class="flex justify-between text-sm pt-2 border-t border-surface-50">
                <span class="text-surface-500">Total Entries</span>
                <span class="font-semibold text-surface-800">${allEntries.length}</span>
              </div>
              <div class="flex justify-between text-sm pt-2 border-t border-surface-50">
                <span class="text-surface-500">Files / Folders</span>
                <span class="font-semibold text-surface-800">
                  ${allEntries.filter(e => !e.isDirectory).length} / ${allEntries.filter(e => e.isDirectory).length}
                </span>
              </div>
              <div class="flex justify-between text-sm pt-2 border-t border-surface-50">
                <span class="text-surface-500">Compression</span>
                <span class="font-bold text-brand-600">
                  ${totalSize > 0 ? Math.round((1 - (file.size / totalSize)) * 100) : 0}% saved
                </span>
              </div>
            </div>
          </div>

          <!-- U8: Code Block (web.xml) -->
          <div class="lg:col-span-2 rounded-xl border border-surface-200 bg-white p-5 shadow-sm overflow-hidden flex flex-col">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-surface-800 flex items-center gap-2">
                <span>Deployment Descriptor</span>
                <span class="text-[10px] font-mono bg-surface-100 text-surface-500 px-1.5 py-0.5 rounded">WEB-INF/web.xml</span>
              </h3>
              ${webXml ? `
                <button id="copy-xml" class="text-xs font-semibold text-brand-600 hover:bg-brand-50 px-2.5 py-1 rounded-lg transition-colors">
                  Copy XML
                </button>
              ` : ''}
            </div>
            <div class="flex-grow">
              ${webXml ? `
                <div class="rounded-xl overflow-hidden border border-surface-200">
                  <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[160px] scrollbar-thin scrollbar-thumb-gray-800">${escapeHtml(webXml)}</pre>
                </div>
              ` : `
                <div class="h-[160px] rounded-xl bg-surface-50 border border-dashed border-surface-200 flex flex-col items-center justify-center text-surface-400">
                  <span class="text-2xl mb-1">📄</span>
                  <p class="text-xs italic text-center px-4">Deployment descriptor not found in this archive</p>
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- SEARCH & FILTER BAR -->
        <div class="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div class="relative w-full md:max-w-md group">
            <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <span class="text-surface-400 group-focus-within:text-brand-500 transition-colors">🔍</span>
            </div>
            <input type="text" id="war-filter" value="${escapeHtml(searchTerm)}" 
                   placeholder="Search entries by name, path or extension..." 
                   class="block w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all shadow-sm">
          </div>
          <div class="flex items-center gap-2 text-xs font-medium text-surface-500">
            <span class="bg-surface-100 px-2 py-1 rounded-full">${filtered.length} matches</span>
            <span class="text-surface-300">|</span>
            <span>Sorted by ${sortCol} (${sortDir})</span>
          </div>
        </div>

        <!-- U7: Table Wrapper -->
        <div class="space-y-4">
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/50">
                  <th class="sortable sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-col="name">
                    Entry Path ${renderSortIcon('name', sortCol, sortDir)}
                  </th>
                  <th class="sortable sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 w-32 cursor-pointer hover:bg-surface-100 transition-colors" data-col="size">
                    Size ${renderSortIcon('size', sortCol, sortDir)}
                  </th>
                  <th class="sortable sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-bold text-surface-700 border-b border-surface-200 w-48 cursor-pointer hover:bg-surface-100 transition-colors" data-col="date">
                    Modified ${renderSortIcon('date', sortCol, sortDir)}
                  </th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-bold text-surface-700 border-b border-surface-200 w-24">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${visibleEntries.length > 0 ? visibleEntries.map((e, idx) => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                    <td class="px-4 py-2.5">
                      <div class="flex items-center gap-3">
                        <span class="text-lg opacity-60 group-hover:opacity-100 transition-opacity transform group-hover:scale-110 duration-200">${getFileIcon(e.name, e.isDirectory)}</span>
                        <div class="flex flex-col min-w-0">
                          <span class="${e.isDirectory ? 'font-semibold text-surface-900' : 'text-surface-700'} truncate" title="${escapeHtml(e.name)}">
                            ${escapeHtml(e.name)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 font-mono text-xs whitespace-nowrap">
                      ${e.isDirectory ? '<span class="text-surface-300">—</span>' : formatSize(e.size)}
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 text-xs whitespace-nowrap">
                      ${formatDate(e.date)}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      ${e.isDirectory ? '' : `
                        <button class="extract-btn text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase tracking-wider bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-all"
                                data-name="${escapeHtml(e.name)}">
                          Extract
                        </button>
                      `}
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" class="px-4 py-16 text-center">
                      <div class="flex flex-col items-center">
                        <span class="text-3xl mb-2">🔍</span>
                        <p class="text-surface-500 font-medium">No files matching "${escapeHtml(searchTerm)}"</p>
                        <button id="clear-search" class="mt-2 text-brand-600 text-xs font-bold hover:underline">Clear search</button>
                      </div>
                    </td>
                  </tr>
                `}
                ${isTruncated ? `
                  <tr>
                    <td colspan="4" class="px-4 py-6 text-center bg-surface-50/50">
                      <p class="text-sm text-surface-500">
                        Showing first ${MAX_ROWS} of ${filtered.length} entries. 
                        Use the search box to find specific files.
                      </p>
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Event Listeners
    const root = helpers.getRenderEl();

    // Search
    const searchInput = root.querySelector('#war-filter');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        helpers.setState('searchTerm', e.target.value);
        // Using a debounce-like behavior but immediate for local lists is usually fine
        renderMainView(helpers);
        // Restore focus and cursor
        const input = helpers.getRenderEl().querySelector('#war-filter');
        if (input) {
          input.focus();
          const val = e.target.value;
          input.setSelectionRange(val.length, val.length);
        }
      });
    }

    // Clear search
    const clearBtn = root.querySelector('#clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        helpers.setState('searchTerm', '');
        renderMainView(helpers);
      });
    }

    // Sort
    root.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-col');
        const currentCol = helpers.getState('sortCol');
        const currentDir = helpers.getState('sortDir');
        
        let nextDir = 'asc';
        if (col === currentCol) {
          nextDir = currentDir === 'asc' ? 'desc' : 'asc';
        }
        
        helpers.setState('sortCol', col);
        helpers.setState('sortDir', nextDir);
        renderMainView(helpers);
      });
    });

    // Copy XML
    const copyXmlBtn = root.querySelector('#copy-xml');
    if (copyXmlBtn) {
      copyXmlBtn.addEventListener('click', () => {
        helpers.copyToClipboard(webXml, copyXmlBtn);
      });
    }

    // Extraction - B8: Named function to avoid strict mode context issues if using timeouts
    root.querySelectorAll('.extract-btn').forEach(btn => {
      btn.addEventListener('click', async function handleExtract() {
        const name = btn.getAttribute('data-name');
        const entries = helpers.getState('allEntries');
        const entryObj = entries.find(e => e.name === name);
        if (!entryObj) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="animate-pulse">...</span>';
        btn.disabled = true;

        try {
          const blob = await entryObj.entry.async('blob');
          helpers.download(name.split('/').pop(), blob);
        } catch (err) {
          console.error(err);
          helpers.showError('Extraction failed', 'Could not extract ' + name + '. The archive might be corrupt.');
        } finally {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      });
    });
  }

  function renderSortIcon(col, currentCol, currentDir) {
    if (col !== currentCol) return '<span class="text-surface-300 opacity-20 ml-1">⇅</span>';
    return `<span class="text-brand-600 ml-1">${currentDir === 'asc' ? '▲' : '▼'}</span>`;
  }

})();
