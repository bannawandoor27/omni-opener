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
      showRawPlist: false
    };

    const MAX_ENTRIES = 1000;

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      if (!bytes) return '—';
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
        _state.file = file;
        
        // B1: Race condition & dependency check
        if (!window.JSZip || !window.plist) {
          helpers.showLoading('Loading dependencies...');
          let attempts = 0;
          while (!window.JSZip || !window.plist) {
            await new Promise(r => setTimeout(r, 100));
            if (++attempts > 100) {
              helpers.showError('Dependency Timeout', 'Failed to load required libraries. Please check your connection.');
              return;
            }
          }
        }

        helpers.showLoading('Parsing IPA package...');

        try {
          // B2: binary content is ArrayBuffer
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let infoPlistEntry = null;

          zip.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              isDirectory: entry.dir,
              _entry: entry
            });

            // Find the main Info.plist (Payload/*.app/Info.plist)
            if (!infoPlistEntry && path.match(/^Payload\/[^/]+\.app\/Info\.plist$/i)) {
              infoPlistEntry = entry;
            }
          });

          if (entries.length === 0) {
            helpers.showError('Invalid IPA', 'This file appears to be an empty archive.');
            return;
          }

          _state.entries = entries;
          _state.metadata = {
            name: 'Unknown App',
            bundleId: 'Unknown',
            version: 'N/A',
            minOS: 'N/A',
            platform: 'iOS'
          };

          if (infoPlistEntry) {
            try {
              const buffer = await infoPlistEntry.async('uint8array');
              const text = new TextDecoder().decode(buffer);
              
              if (text.includes('<?xml')) {
                const parsed = window.plist.parse(text);
                _state.fullPlist = parsed;
                _state.metadata = {
                  name: parsed.CFBundleDisplayName || parsed.CFBundleName || _state.metadata.name,
                  bundleId: parsed.CFBundleIdentifier || _state.metadata.bundleId,
                  version: parsed.CFBundleShortVersionString || parsed.CFBundleVersion || _state.metadata.version,
                  minOS: parsed.MinimumOSVersion || _state.metadata.minOS,
                  platform: 'iOS'
                };
              } else {
                // Heuristic for binary plists
                const latin = new TextDecoder('latin1').decode(buffer);
                const extract = (key) => {
                  const idx = latin.indexOf(key);
                  if (idx === -1) return null;
                  const part = latin.substring(idx + key.length, idx + key.length + 128);
                  const match = part.match(/[a-zA-Z0-9._-]{4,}/g);
                  return match ? match[0] : null;
                };
                _state.metadata.bundleId = extract('CFBundleIdentifier') || _state.metadata.bundleId;
                _state.metadata.name = extract('CFBundleDisplayName') || extract('CFBundleName') || _state.metadata.name;
                _state.metadata.version = extract('CFBundleShortVersionString') || extract('CFBundleVersion') || _state.metadata.version;
                _state.metadata.platform = 'iOS (Binary Manifest)';
              }
            } catch (e) {
              console.warn('Metadata parsing failed', e);
            }
          }

          render(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open IPA file', 'The file may be corrupted or is not a valid IPA (ZIP) archive.');
        }
      },

      onDestroy: function() {
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
          label: '📥 Metadata JSON',
          onClick: function(helpers) {
            if (!_state) return;
            const name = _state.file.name.replace(/\.[^/.]+$/, "");
            helpers.download(`${name}-info.json`, JSON.stringify(_state.metadata, null, 2));
          }
        }
      ]
    });

    function render(helpers) {
      if (!_state || !_state.file) return;

      const { file, entries, metadata, searchQuery, sortConfig, showRawPlist, fullPlist } = _state;

      // Filtering
      const query = searchQuery.toLowerCase().trim();
      let filtered = entries.filter(e => e.path.toLowerCase().includes(query));

      // Sorting
      filtered.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });

      const visible = filtered.slice(0, MAX_ENTRIES);

      // U1: File Info Bar
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.ipa file</span>
        </div>
      `;

      // Metadata Cards
      const metadataCards = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">App Name</p>
            <p class="text-sm font-bold text-surface-900 truncate" title="${escapeHtml(metadata.name)}">${escapeHtml(metadata.name)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">Bundle ID</p>
            <p class="text-sm font-mono text-surface-700 truncate" title="${escapeHtml(metadata.bundleId)}">${escapeHtml(metadata.bundleId)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">Version</p>
            <p class="text-sm font-semibold text-surface-900">${escapeHtml(metadata.version)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">Min iOS</p>
            <p class="text-sm font-semibold text-surface-900">${escapeHtml(metadata.minOS)}</p>
          </div>
        </div>
      `;

      // U8: Code Block for Plist
      const plistSection = fullPlist ? `
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Info.plist Manifest</h3>
            <button id="btn-toggle-plist" class="text-xs font-medium text-brand-600 hover:bg-brand-50 px-3 py-1 rounded-lg transition-colors border border-brand-100">
              ${showRawPlist ? 'Hide Raw Data' : 'View Raw Data'}
            </button>
          </div>
          ${showRawPlist ? `
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm animate-in fade-in zoom-in-95 duration-200">
              <pre class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[400px]">${escapeHtml(JSON.stringify(fullPlist, null, 2))}</pre>
            </div>
          ` : ''}
        </div>
      ` : '';

      // Search Box (Format excellence for Archives)
      const searchHtml = `
        <div class="relative mb-4">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <input 
            type="text" 
            id="search-input"
            placeholder="Search ${entries.length} files by path..." 
            value="${escapeHtml(searchQuery)}"
            class="block w-full pl-10 pr-4 py-2.5 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm"
          />
        </div>
      `;

      const sortIcon = (key) => {
        if (sortConfig.key !== key) return '<span class="ml-1 opacity-20">↕</span>';
        return sortConfig.direction === 'asc' ? '<span class="ml-1 text-brand-500">▲</span>' : '<span class="ml-1 text-brand-500">▼</span>';
      };

      // U7: Beautiful Table
      const tableHtml = `
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm mb-4">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="cursor-pointer sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 hover:bg-surface-100 transition-colors" data-sort="path">
                  File Path ${sortIcon('path')}
                </th>
                <th class="cursor-pointer sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 hover:bg-surface-100 transition-colors w-32" data-sort="size">
                  Size ${sortIcon('size')}
                </th>
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-24">
                  Action
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${visible.length > 0 ? visible.map(e => `
                <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 font-mono text-xs break-all">
                    <span class="inline-block w-5 text-center mr-1 text-base opacity-70">${e.isDirectory ? '📁' : '📄'}</span>
                    ${escapeHtml(e.path)}
                  </td>
                  <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 text-right tabular-nums whitespace-nowrap">
                    ${e.isDirectory ? '<span class="opacity-20">—</span>' : formatSize(e.size)}
                  </td>
                  <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 text-center">
                    ${!e.isDirectory ? `
                      <button 
                        class="extract-btn text-brand-600 hover:text-brand-700 font-medium text-xs px-2.5 py-1 rounded-lg bg-white border border-surface-200 shadow-sm hover:border-brand-200 hover:shadow transition-all" 
                        data-path="${escapeHtml(e.path)}"
                      >
                        Extract
                      </button>
                    ` : ''}
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="3" class="px-4 py-16 text-center text-surface-400 italic bg-surface-50/30">
                    No files found matching "${escapeHtml(searchQuery)}"
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      `;

      // B7: Pagination Notice
      const paginationNotice = filtered.length > MAX_ENTRIES ? `
        <div class="p-4 bg-surface-50 border border-dashed border-surface-200 rounded-xl text-center text-xs text-surface-500">
          Showing first ${MAX_ENTRIES} of ${filtered.length} items. Use search to find specific files.
        </div>
      ` : '';

      helpers.render(`
        <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          ${infoBar}
          ${metadataCards}
          ${plistSection}
          
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-surface-800">Package Files</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">${filtered.length} items</span>
          </div>

          ${searchHtml}
          ${tableHtml}
          ${paginationNotice}
        </div>
      `);

      // Event Bindings
      const searchEl = document.getElementById('search-input');
      if (searchEl) {
        searchEl.addEventListener('input', (e) => {
          _state.searchQuery = e.target.value;
          render(helpers);
        });
        if (searchQuery) searchEl.focus();
      }

      const toggleBtn = document.getElementById('btn-toggle-plist');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          _state.showRawPlist = !_state.showRawPlist;
          render(helpers);
        });
      }

      helpers.getRenderEl().querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.getAttribute('data-sort');
          if (_state.sortConfig.key === key) {
            _state.sortConfig.direction = _state.sortConfig.direction === 'asc' ? 'desc' : 'asc';
          } else {
            _state.sortConfig.key = key;
            _state.sortConfig.direction = 'asc';
          }
          render(helpers);
        });
      });

      helpers.getRenderEl().querySelectorAll('.extract-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const path = btn.getAttribute('data-path');
          const entry = _state.entries.find(e => e.path === path);
          if (!entry) return;

          const oldHtml = btn.innerHTML;
          btn.disabled = true;
          btn.textContent = '...';

          try {
            const blob = await entry._entry.async('blob');
            helpers.download(path.split('/').pop(), blob);
          } catch (err) {
            helpers.showError('Extraction failed', 'Could not read file from archive.');
          } finally {
            btn.disabled = false;
            btn.innerHTML = oldHtml;
          }
        });
      });
    }
  };
})();
