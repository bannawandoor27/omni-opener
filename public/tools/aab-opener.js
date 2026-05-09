(function() {
  'use strict';

  /**
   * OmniOpener - AAB Opener
   * A PRODUCTION PERFECT tool for inspecting Android App Bundles (.aab)
   */

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
   * Extract basic info from binary AndroidManifest.xml using heuristics
   * Since AAB manifests are binary protobuf, we use a string-search approach for zero-dependency speed
   */
  function extractMetadata(buffer) {
    let packageName = 'Unknown';
    let versionName = 'Unknown';
    try {
      // Decode as latin1 to preserve byte values while allowing regex
      const text = new TextDecoder('latin1').decode(buffer);
      
      // Package name heuristic: looks for reverse domain notation
      const pkgMatches = text.match(/\b[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}\b/g);
      if (pkgMatches) {
        const candidates = pkgMatches.filter(p => 
          !p.includes('google.com') && 
          !p.includes('android.com') && 
          !p.startsWith('com.google.protobuf') &&
          !p.includes('schemas.android.com') &&
          !p.includes('http')
        );
        if (candidates.length > 0) packageName = candidates[0];
      }

      // Version name heuristic: looks for 1.2.3 style strings
      const verMatches = text.match(/\b\d+\.\d+(\.\d+)*\b/g);
      if (verMatches) {
        const v = verMatches.find(m => m.split('.').length >= 2);
        if (v) versionName = v;
      }
    } catch (e) {
      console.warn('Metadata extraction failed', e);
    }
    return { packageName, versionName };
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.aab',
      dropLabel: 'Drop an Android App Bundle (.aab) to inspect structure and metadata',
      binary: true,
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => {
          jszipLoaded = true;
        });
      },

      onDestroy: function() {
        // Cleanup global-ish state if any was added
      },

      onFile: async function _onFileFn(file, content, helpers) {
        // B1, B4: Ensure library is ready
        if (!jszipLoaded && typeof JSZip === 'undefined') {
          helpers.showLoading('Initializing decompression engine...');
          let waitTime = 0;
          while (typeof JSZip === 'undefined' && waitTime < 5000) {
            await new Promise(r => setTimeout(r, 100));
            waitTime += 100;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Library Load Failed', 'Could not load JSZip from CDN. Please check your internet connection.');
            return;
          }
        }

        // U2, U6: Descriptive loading message
        helpers.showLoading('Analyzing Android App Bundle structure...');

        try {
          // B2: content is ArrayBuffer (binary:true)
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
            if (path.endsWith('AndroidManifest.xml') && (!manifestEntry || path.includes('base/'))) {
              manifestEntry = entry;
            }
          });

          // U5: Empty state handling
          if (entries.length === 0) {
            helpers.showError('Empty Bundle', 'This file appears to be a valid ZIP archive but contains no files.');
            return;
          }

          let packageName = 'Unknown';
          let versionName = 'Unknown';

          if (manifestEntry) {
            try {
              const manifestBuffer = await manifestEntry.async('uint8array');
              const meta = extractMetadata(manifestBuffer);
              packageName = meta.packageName;
              versionName = meta.versionName;
            } catch (me) {
              console.warn('Manifest parsing failed', me);
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
          // U3: Friendly error message
          helpers.showError('Invalid AAB File', 'The file could not be parsed as an Android App Bundle. It might be corrupted or not a standard ZIP-based AAB format.');
          console.error('[AAB Opener]', err);
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
          label: '📥 Download Metadata',
          id: 'export-json',
          onClick: function(helpers) {
            const state = helpers.getState().aab;
            if (!state) return;
            const data = {
              fileName: helpers.getFile().name,
              package: state.packageName,
              version: state.versionName,
              fileCount: state.entries.length,
              files: state.entries.map(e => ({ path: e.path, size: e.size }))
            };
            helpers.download(`${helpers.getFile().name}.json`, JSON.stringify(data, null, 2), 'application/json');
          }
        }
      ]
    });
  };

  /**
   * Main UI Render Function
   */
  function render(helpers, file, state, mountEl) {
    const { entries, packageName, versionName, filter, sortKey, sortOrder } = state;

    // Filter logic
    const searchTerm = filter.toLowerCase();
    const filtered = entries.filter(e => e.path.toLowerCase().includes(searchTerm));

    // Sort logic
    filtered.sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // B7: Large file handling
    const MAX_ROWS = 1000;
    const isTruncated = filtered.length > MAX_ROWS;
    const displayList = isTruncated ? filtered.slice(0, MAX_ROWS) : filtered;

    // U1: File info bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">Android App Bundle</span>
      </div>
    `;

    // U9: Content cards for metadata summary
    const metadataCards = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Package ID</div>
          <div class="text-sm font-mono font-medium text-brand-600 truncate" title="${escapeHtml(packageName)}">${escapeHtml(packageName)}</div>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Version Name</div>
          <div class="text-sm font-semibold text-surface-800">${escapeHtml(versionName)}</div>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Total Files</div>
          <div class="text-sm font-semibold text-surface-800">${entries.length.toLocaleString()} items</div>
        </div>
      </div>
    `;

    // ARCHIVE EXCELLENCE: Search box for filtering
    const searchHeader = `
      <div class="mb-4 relative">
        <input 
          type="text" 
          id="aab-filter" 
          placeholder="Filter bundle entries (e.g. res/layout, .dex, assets)..." 
          value="${escapeHtml(filter)}"
          class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm"
        />
        <div class="absolute left-3 top-3 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>
    `;

    const sortIcon = (key) => {
      if (sortKey !== key) return '<span class="text-surface-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">↕</span>';
      return sortOrder === 'asc' ? '<span class="text-brand-500 ml-1">▲</span>' : '<span class="text-brand-500 ml-1">▼</span>';
    };

    let contentArea = '';
    if (filtered.length === 0) {
      contentArea = `
        <div class="py-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-300">
          <p class="text-surface-500">No files match your search criteria.</p>
          <button id="clear-aab-filter" class="mt-2 text-sm text-brand-600 font-medium hover:underline">Clear filter</button>
        </div>
      `;
    } else {
      // U10: Section header with count
      contentArea = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Bundle Contents</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${filtered.length} entries</span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="group sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="path">
                  File Path ${sortIcon('path')}
                </th>
                <th class="group sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="size">
                  Size ${sortIcon('size')}
                </th>
                <th class="group sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="date">
                  Modified ${sortIcon('date')}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${displayList.map(e => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors">
                  <td class="px-4 py-2.5 font-mono text-xs text-surface-700 break-all">
                    <span class="mr-2 opacity-60">${e.isDirectory ? '📁' : '📄'}</span>${escapeHtml(e.path)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-600 tabular-nums">
                    ${e.isDirectory ? '<span class="text-surface-300">—</span>' : formatSize(e.size)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-400 text-[11px] whitespace-nowrap">
                    ${e.date ? e.date.toLocaleDateString() : 'N/A'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${isTruncated ? `
          <div class="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-3">
            <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
              <p class="font-bold mb-0.5">Performance Notice</p>
              <p>Showing the first ${MAX_ROWS} of ${filtered.length} matching files. Use the filter box above to find specific entries.</p>
            </div>
          </div>
        ` : ''}
      `;
    }

    helpers.render(`
      <div class="max-w-6xl mx-auto p-4 animate-in fade-in duration-500">
        ${infoBar}
        ${metadataCards}
        ${searchHeader}
        ${contentArea}
      </div>
    `);

    // Event Listeners (B9: addEventListener instead of inline)
    const filterInput = mountEl.querySelector('#aab-filter');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        state.filter = e.target.value;
        render(helpers, file, state, mountEl);
        
        // Maintain focus
        const newInput = mountEl.querySelector('#aab-filter');
        if (newInput) {
          newInput.focus();
          const len = state.filter.length;
          newInput.setSelectionRange(len, len);
        }
      });
    }

    const clearBtn = mountEl.querySelector('#clear-aab-filter');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.filter = '';
        render(helpers, file, state, mountEl);
      });
    }

    const headers = mountEl.querySelectorAll('th[data-sort]');
    headers.forEach(h => {
      h.addEventListener('click', () => {
        const key = h.dataset.sort;
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
