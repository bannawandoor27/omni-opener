(function() {
  'use strict';

  /**
   * OmniOpener IPA Tool
   * A production-grade iOS App Package (.ipa) inspector.
   */

  window.initTool = function(toolConfig, mountEl) {
    let _state = {
      file: null,
      entries: [],
      metadata: {},
      fullPlist: null,
      searchQuery: '',
      sortConfig: { key: 'path', direction: 'asc' },
      showRawPlist: false,
      appIconUrl: null
    };

    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function revokeIcon() {
      if (_state.appIconUrl) {
        URL.revokeObjectURL(_state.appIconUrl);
        _state.appIconUrl = null;
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ipa',
      dropLabel: 'Drop an iOS IPA file to inspect',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScripts([
          'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
          'https://cdn.jsdelivr.net/npm/plist@3.0.1/dist/plist.min.js'
        ]);
      },

      onFile: async function _onFileFn(file, content, helpers) {
        // B5: Memory management - revoke previous icon
        revokeIcon();
        
        // Reset state for new file
        _state.file = file;
        _state.entries = [];
        _state.metadata = {};
        _state.fullPlist = null;
        _state.searchQuery = '';
        _state.showRawPlist = false;

        // B1: Dependency & Race condition check
        if (!window.JSZip || !window.plist) {
          helpers.showLoading('Loading bundle inspectors...');
          let attempts = 0;
          while (!window.JSZip || !window.plist) {
            await new Promise(r => setTimeout(r, 100));
            if (++attempts > 60) {
              helpers.showError('Timeout', 'Failed to load required libraries. Please check your connection.');
              return;
            }
          }
        }

        // U2, U6: Descriptive loading state
        helpers.showLoading('Decompressing IPA package...');

        try {
          // B2: Handle binary content as ArrayBuffer
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let infoPlistEntry = null;
          let possibleIcons = [];

          zip.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              isDirectory: entry.dir,
              _entry: entry
            });

            // Find the main Info.plist (Payload/*.app/Info.plist)
            if (path.match(/^Payload\/[^/]+\.app\/Info\.plist$/i)) {
              infoPlistEntry = entry;
            }
            
            // Collect potential app icons
            if (path.match(/\.png$/i) && (path.includes('AppIcon') || path.includes('Icon'))) {
              possibleIcons.push({ path, entry });
            }
          });

          // U5: Empty state handling
          if (entries.length === 0) {
            helpers.showError('Empty Archive', 'This .ipa file appears to be empty or invalid.');
            return;
          }

          _state.entries = entries;
          
          // Default metadata from filename
          _state.metadata = {
            name: file.name.replace(/\.ipa$/i, ''),
            bundleId: 'Unknown',
            version: 'N/A',
            minOS: 'N/A',
            team: 'N/A'
          };

          if (infoPlistEntry) {
            helpers.showLoading('Parsing application manifest...');
            try {
              // B3: Properly await async zip operations
              const buffer = await infoPlistEntry.async('uint8array');
              const text = new TextDecoder().decode(buffer);
              
              if (text.includes('<?xml')) {
                const parsed = window.plist.parse(text);
                _state.fullPlist = parsed;
                _state.metadata = {
                  name: parsed.CFBundleDisplayName || parsed.CFBundleName || _state.metadata.name,
                  bundleId: parsed.CFBundleIdentifier || 'Unknown',
                  version: parsed.CFBundleShortVersionString || parsed.CFBundleVersion || 'N/A',
                  minOS: parsed.MinimumOSVersion || 'N/A',
                  team: parsed.TeamIdentifier || 'N/A'
                };

                // Attempt to find the best icon based on plist definitions
                let iconName = null;
                if (parsed.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconFiles) {
                  iconName = parsed.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconFiles.slice(-1)[0];
                } else if (parsed.CFBundleIconFiles) {
                  iconName = parsed.CFBundleIconFiles.slice(-1)[0];
                }

                if (iconName) {
                  const match = possibleIcons.find(i => i.path.includes(iconName));
                  if (match) {
                    const blob = await match.entry.async('blob');
                    _state.appIconUrl = URL.createObjectURL(blob);
                  }
                }
              }
            } catch (e) {
              console.warn('Metadata parsing failed', e);
            }
          }

          // Fallback icon detection
          if (!_state.appIconUrl && possibleIcons.length > 0) {
            // Choose the one that looks most like a standard icon
            const fallback = possibleIcons.sort((a, b) => b.path.length - a.path.length)[0];
            const blob = await fallback.entry.async('blob');
            _state.appIconUrl = URL.createObjectURL(blob);
          }

          render(helpers);
        } catch (err) {
          console.error(err);
          // U3: Friendly error message
          helpers.showError('Could not open IPA', 'The file may be encrypted (FairPlay DRM) or corrupted. Only decrypted IPAs can be inspected.');
        }
      },

      onDestroy: function() {
        revokeIcon();
        _state = null;
      },

      actions: [
        {
          label: '📋 Copy Bundle ID',
          onClick: function(helpers, btn) {
            if (_state?.metadata?.bundleId && _state.metadata.bundleId !== 'Unknown') {
              helpers.copyToClipboard(_state.metadata.bundleId, btn);
            }
          }
        },
        {
          label: '📥 Download Metadata',
          onClick: function(helpers) {
            if (!_state) return;
            const data = {
              metadata: _state.metadata,
              manifest: _state.fullPlist
            };
            helpers.download('ipa-metadata.json', JSON.stringify(data, null, 2));
          }
        }
      ]
    });

    function render(helpers) {
      if (!_state || !_state.file) return;

      const { file, entries, metadata, searchQuery, sortConfig, showRawPlist, fullPlist, appIconUrl } = _state;

      // Filter and sort logic
      const query = searchQuery.toLowerCase().trim();
      const filtered = entries.filter(e => e.path.toLowerCase().includes(query));

      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });

      // B7: Truncation for large file lists
      const MAX_VISIBLE = 1000;
      const visible = filtered.slice(0, MAX_VISIBLE);

      // U1: File info bar
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">iOS App Package</span>
        </div>
      `;

      // U9: Header content card
      const header = `
        <div class="flex flex-col md:flex-row gap-6 mb-8 p-6 rounded-2xl border border-surface-200 bg-white shadow-sm transition-all">
          <div class="flex-shrink-0 mx-auto md:mx-0">
            ${appIconUrl ? `
              <img src="${appIconUrl}" class="w-24 h-24 rounded-[22.5%] shadow-md border border-surface-100 bg-white p-0.5" alt="App Icon">
            ` : `
              <div class="w-24 h-24 rounded-[22.5%] bg-surface-50 border border-surface-100 flex items-center justify-center text-surface-300">
                <svg class="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.1 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.97 12.57 4.62 9.72c.82-1.42 2.29-2.31 3.88-2.34 1.23-.02 2.38.83 3.14.83.75 0 2.13-.97 3.57-.83 1.44.02 2.7.53 3.52 1.73-3.08 1.81-2.58 5.7.47 7.39zM12 6.72c.64-1.02.53-2.33.02-3.41 1.13.06 2.3.83 2.98 1.83.67 1.01.66 2.26.01 3.39-1.2-.1-2.3-.92-3.01-1.81z"/></svg>
              </div>
            `}
          </div>
          <div class="flex-grow min-w-0">
            <h2 class="text-2xl font-bold text-surface-900 truncate mb-1 text-center md:text-left">${escapeHtml(metadata.name)}</h2>
            <p class="text-brand-600 font-mono text-sm mb-4 text-center md:text-left">${escapeHtml(metadata.bundleId)}</p>
            
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div class="bg-surface-50/50 p-2.5 rounded-xl border border-surface-100">
                <span class="block text-[10px] uppercase font-bold text-surface-400 tracking-tight mb-0.5">Version</span>
                <span class="text-sm font-semibold text-surface-700">${escapeHtml(metadata.version)}</span>
              </div>
              <div class="bg-surface-50/50 p-2.5 rounded-xl border border-surface-100">
                <span class="block text-[10px] uppercase font-bold text-surface-400 tracking-tight mb-0.5">Min iOS</span>
                <span class="text-sm font-semibold text-surface-700">${escapeHtml(metadata.minOS)}</span>
              </div>
              <div class="bg-surface-50/50 p-2.5 rounded-xl border border-surface-100">
                <span class="block text-[10px] uppercase font-bold text-surface-400 tracking-tight mb-0.5">Bundle Size</span>
                <span class="text-sm font-semibold text-surface-700">${formatSize(file.size)}</span>
              </div>
              <div class="bg-surface-50/50 p-2.5 rounded-xl border border-surface-100">
                <span class="block text-[10px] uppercase font-bold text-surface-400 tracking-tight mb-0.5">Signer</span>
                <span class="text-sm font-semibold text-surface-700 truncate" title="${escapeHtml(metadata.team)}">${escapeHtml(metadata.team)}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // U8: Code block for Plist
      const manifestSection = fullPlist ? `
        <div class="mb-8">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Info.plist Manifest</h3>
            <button id="toggle-raw-btn" class="text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg border border-brand-200 transition-all">
              ${showRawPlist ? 'Hide Source' : 'View Source'}
            </button>
          </div>
          ${showRawPlist ? `
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
              <pre class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-96">${escapeHtml(JSON.stringify(fullPlist, null, 2))}</pre>
            </div>
          ` : ''}
        </div>
      ` : '';

      // ARCHIVES: Search box
      const searchSection = `
        <div class="relative mb-6">
          <input 
            type="text" 
            id="path-search" 
            placeholder="Search through ${entries.length} bundle files..." 
            value="${escapeHtml(searchQuery)}"
            class="w-full pl-4 pr-12 py-3.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm"
          >
          <div class="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
        </div>
      `;

      const sortIco = (k) => {
        if (sortConfig.key !== k) return '<span class="ml-1 opacity-20 text-[10px]">↕</span>';
        return sortConfig.direction === 'asc' ? '<span class="ml-1 text-brand-500 text-[10px]">▲</span>' : '<span class="ml-1 text-brand-500 text-[10px]">▼</span>';
      };

      // U10: Section header with count
      const listHeader = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Package Files</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">${filtered.length} items</span>
        </div>
      `;

      // U7: Table implementation
      const table = `
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="path">
                  File Path ${sortIco('path')}
                </th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 w-32" data-sort="size">
                  Size ${sortIco('size')}
                </th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-24">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              ${visible.length > 0 ? visible.map(e => `
                <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-mono text-[11px] break-all">
                    <span class="inline-block mr-2 opacity-50">${e.isDirectory ? '📁' : '📄'}</span>
                    ${escapeHtml(e.path)}
                  </td>
                  <td class="px-4 py-2 text-surface-700 border-b border-surface-100 text-right tabular-nums whitespace-nowrap">
                    ${e.isDirectory ? '-' : formatSize(e.size)}
                  </td>
                  <td class="px-4 py-2 text-surface-700 border-b border-surface-100 text-center">
                    ${!e.isDirectory ? `
                      <button data-path="${escapeHtml(e.path)}" class="extract-trigger text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                        Extract
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="3" class="px-4 py-16 text-center text-surface-400 italic bg-surface-50/20">
                    No files found matching your search.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      `;

      const paginationNotice = filtered.length > MAX_VISIBLE ? `
        <div class="mt-4 p-4 bg-surface-50 border border-dashed border-surface-200 rounded-xl text-center text-xs text-surface-500">
          Showing first ${MAX_VISIBLE} of ${filtered.length} entries. Refine your search to find specific files.
        </div>
      ` : '';

      helpers.render(`
        <div class="max-w-6xl mx-auto p-4 md:p-8 animate-in fade-in duration-500">
          ${infoBar}
          ${header}
          ${manifestSection}
          ${listHeader}
          ${searchSection}
          ${table}
          ${paginationNotice}
        </div>
      `);

      // Event Bindings
      const searchInput = document.getElementById('path-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          _state.searchQuery = e.target.value;
          render(helpers);
        });
        if (searchQuery) searchInput.focus();
      }

      const toggleBtn = document.getElementById('toggle-raw-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          _state.showRawPlist = !_state.showRawPlist;
          render(helpers);
        });
      }

      helpers.getRenderEl().querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const k = th.getAttribute('data-sort');
          if (_state.sortConfig.key === k) {
            _state.sortConfig.direction = _state.sortConfig.direction === 'asc' ? 'desc' : 'asc';
          } else {
            _state.sortConfig.key = k;
            _state.sortConfig.direction = 'asc';
          }
          render(helpers);
        });
      });

      helpers.getRenderEl().querySelectorAll('.extract-trigger').forEach(btn => {
        btn.addEventListener('click', async () => {
          const path = btn.getAttribute('data-path');
          const entry = entries.find(e => e.path === path);
          if (!entry) return;

          const originalText = btn.textContent;
          btn.textContent = '...';
          btn.disabled = true;

          try {
            const blob = await entry._entry.async('blob');
            helpers.download(path.split('/').pop(), blob);
          } catch (err) {
            helpers.showError('Extraction failed', 'Could not extract the file from the package.');
          } finally {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        });
      });
    }
  };
})();
