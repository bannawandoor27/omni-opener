(function() {
  'use strict';

  // Library loading state tracked in closure
  let jszipLoaded = false;

  /**
   * Helper to format bytes into human readable sizes
   */
  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Escape HTML to prevent XSS (B6)
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Heuristic to extract manifest info from binary proto AndroidManifest.xml
   */
  function extractManifestInfo(buffer) {
    let packageName = 'com.example.app';
    let versionName = '1.0.0';
    try {
      const text = new TextDecoder('latin1').decode(buffer);
      // Heuristic for package names
      const pkgMatches = text.match(/\b[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}\b/g);
      if (pkgMatches) {
        const candidates = pkgMatches.filter(p => 
          !p.includes('google.com') && 
          !p.includes('android.com') && 
          !p.startsWith('com.google.protobuf') &&
          !p.includes('schema') &&
          !p.includes('http')
        );
        if (candidates.length > 0) packageName = candidates[0];
      }
      // Heuristic for version names
      const verMatches = text.match(/\b\d+\.\d+(\.\d+)*\b/g);
      if (verMatches) {
        const v = verMatches.find(m => m.split('.').length >= 2);
        if (v) versionName = v;
      }
    } catch (e) {
      console.warn('Metadata heuristic failed', e);
    }
    return { packageName, versionName };
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.aab',
      dropLabel: 'Drop an Android App Bundle (.aab) to inspect',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => {
          jszipLoaded = true;
        });
      },
      onDestroy: function() {
        // Cleanup routine for any listeners or objects if needed (B5)
      },
      onFile: async function _onFileFn(file, content, helpers) {
        // Ensure library is available (B1, B4)
        if (!jszipLoaded && typeof JSZip === 'undefined') {
          helpers.showLoading('Preparing inspection engine...');
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 100) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Engine Load Error', 'The decompression library failed to load. Please check your connection and refresh.');
            return;
          }
        }

        helpers.showLoading('Analyzing App Bundle contents...');

        try {
          // AAB is a ZIP archive structure (B2, B3)
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let manifestEntry = null;

          zip.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              date: entry.date,
              isDirectory: entry.dir
            });
            // Main manifest is usually in base/manifest/AndroidManifest.xml
            if (path.endsWith('AndroidManifest.xml')) {
              if (!manifestEntry || path.includes('base/')) manifestEntry = entry;
            }
          });

          if (entries.length === 0) {
            helpers.showError('Empty Bundle', 'This file appears to be a valid ZIP but contains no entries.');
            return;
          }

          let packageName = 'Unknown';
          let versionName = 'Unknown';

          if (manifestEntry) {
            try {
              const manifestBuffer = await manifestEntry.async('uint8array');
              const info = extractManifestInfo(manifestBuffer);
              packageName = info.packageName;
              versionName = info.versionName;
            } catch (me) {
              console.warn('Manifest read error', me);
            }
          }

          const state = {
            entries,
            packageName,
            versionName,
            filter: '',
            sortKey: 'path',
            sortOrder: 'asc'
          };

          helpers.setState('aab', state);
          render(helpers, file, state, mountEl);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open AAB', 'This file may be corrupted, encrypted, or not a standard Android App Bundle. ' + err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const state = helpers.getState().aab;
            if (!state) return;
            const text = state.entries
              .map(e => `${e.isDirectory ? '[DIR]' : '     '} ${e.path} (${formatSize(e.size)})`)
              .join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Export Metadata',
          id: 'export-meta',
          onClick: function(helpers) {
            const state = helpers.getState().aab;
            if (!state) return;
            const meta = {
              file: helpers.getFile().name,
              package: state.packageName,
              version: state.versionName,
              fileCount: state.entries.length,
              structure: state.entries.map(e => ({ path: e.path, size: e.size }))
            };
            helpers.download(`${helpers.getFile().name}-metadata.json`, JSON.stringify(meta, null, 2), 'application/json');
          }
        }
      ]
    });
  };

  /**
   * Main render function
   */
  function render(helpers, file, state, mountEl) {
    const { entries, packageName, versionName, filter, sortKey, sortOrder } = state;

    // Filter logic
    const searchTerm = filter.toLowerCase();
    let filtered = entries.filter(e => e.path.toLowerCase().includes(searchTerm));

    // Sort logic
    filtered.sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const MAX_ROWS = 500; // Large file handling (B7)
    const isTruncated = filtered.length > MAX_ROWS;
    const displayList = isTruncated ? filtered.slice(0, MAX_ROWS) : filtered;

    // U1: File info bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 animate-in fade-in">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.aab bundle</span>
      </div>
    `;

    // U9: Content cards for metadata
    const statsCards = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-in slide-in-from-bottom-2 duration-300">
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Package Name</div>
          <div class="text-sm font-mono font-medium text-brand-700 truncate" title="${escapeHtml(packageName)}">${escapeHtml(packageName)}</div>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Version</div>
          <div class="text-sm font-semibold text-surface-800">${escapeHtml(versionName)}</div>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <div class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Bundle Contents</div>
          <div class="text-sm font-semibold text-surface-800">${entries.length.toLocaleString()} files</div>
        </div>
      </div>
    `;

    // Search Box for Archives excellence
    const searchBox = `
      <div class="mb-4 relative">
        <input 
          type="text" 
          id="aab-search-input" 
          placeholder="Search files in bundle (e.g. res/, .dex, assets/)..." 
          value="${escapeHtml(filter)}"
          class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm"
        />
        <div class="absolute left-3 top-3 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>
    `;

    const sortIndicator = (key) => {
      if (sortKey !== key) return '<span class="text-surface-300 ml-1">↕</span>';
      return sortOrder === 'asc' ? '<span class="text-brand-500 ml-1">↑</span>' : '<span class="text-brand-500 ml-1">↓</span>';
    };

    let tableArea = '';
    if (filtered.length === 0) {
      // U5: Empty state
      tableArea = `
        <div class="py-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-300 animate-in fade-in">
          <p class="text-surface-500 italic">No entries match "${escapeHtml(filter)}"</p>
          <button id="clear-search" class="mt-2 text-xs text-brand-600 font-medium hover:underline">Clear filter</button>
        </div>
      `;
    } else {
      // U7: Beautiful Tables
      tableArea = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Files</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length} items</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="path">
                  File Path ${sortIndicator('path')}
                </th>
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="size">
                  Size ${sortIndicator('size')}
                </th>
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="date">
                  Modified ${sortIndicator('date')}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${displayList.map(e => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors">
                  <td class="px-4 py-2 font-mono text-xs text-surface-700 break-all">
                    <span class="inline-block w-5 text-center mr-1">${e.isDirectory ? '📁' : '📄'}</span>${escapeHtml(e.path)}
                  </td>
                  <td class="px-4 py-2 text-right text-surface-600 tabular-nums">
                    ${e.isDirectory ? '-' : formatSize(e.size)}
                  </td>
                  <td class="px-4 py-2 text-right text-surface-400 text-xs whitespace-nowrap">
                    ${e.date ? e.date.toLocaleDateString() : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${isTruncated ? `
          <div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 text-xs text-center font-medium">
            Showing first ${MAX_ROWS} of ${filtered.length} matching entries. Use the search box above to narrow results.
          </div>
        ` : ''}
      `;
    }

    helpers.render(`
      <div class="max-w-6xl mx-auto p-2">
        ${infoBar}
        ${statsCards}
        ${searchBox}
        ${tableArea}
      </div>
    `);

    // Attach listeners after render (B9)
    const searchInput = mountEl.querySelector('#aab-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.filter = e.target.value;
        render(helpers, file, state, mountEl);
      });
      // Maintain focus and cursor position during re-renders
      if (filter) {
        searchInput.focus();
        searchInput.setSelectionRange(filter.length, filter.length);
      }
    }

    const clearBtn = mountEl.querySelector('#clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.filter = '';
        render(helpers, file, state, mountEl);
      });
    }

    const sortHeaders = mountEl.querySelectorAll('th[data-sort]');
    sortHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (state.sortKey === key) {
          state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortOrder = 'asc';
        }
        render(helpers, file, state, mountEl);
      });
    });
  }

})();
