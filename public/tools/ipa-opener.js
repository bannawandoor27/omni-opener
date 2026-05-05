(function() {
  'use strict';

  /**
   * OmniOpener IPA Tool
   * A production-grade iOS App Package (.ipa) inspector.
   */

  function formatSize(bytes) {
    if (!bytes) return '0 B';
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

  window.initTool = function(toolConfig, mountEl) {
    let _ipaData = null;
    const MAX_VISIBLE_ENTRIES = 500;

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

      onFile: async function _onFile(file, content, helpers) {
        if (!window.JSZip || !window.plist) {
          helpers.showLoading('Loading dependencies...');
          let attempts = 0;
          while (!window.JSZip || !window.plist) {
            await new Promise(r => setTimeout(r, 100));
            if (++attempts > 50) {
              helpers.showError('Dependency Error', 'Failed to load required libraries. Please refresh and try again.');
              return;
            }
          }
        }

        helpers.showLoading('Extracting package metadata...');

        try {
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let infoPlistEntry = null;

          zip.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              isDirectory: entry.dir,
              entry: entry
            });

            // Find the main Info.plist (usually in Payload/AppName.app/Info.plist)
            if (!infoPlistEntry && path.toLowerCase().match(/^payload\/[^/]+\.app\/info\.plist$/i)) {
              infoPlistEntry = entry;
            }
          });

          if (entries.length === 0) {
            helpers.showError('Empty Archive', 'The IPA file contains no files.');
            return;
          }

          entries.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.path.localeCompare(b.path);
          });

          _ipaData = {
            entries,
            metadata: {
              name: 'Unknown App',
              bundleId: 'Unknown',
              version: '1.0',
              minOS: 'Unknown',
              sdk: 'Unknown',
              platform: 'iOS'
            },
            searchQuery: '',
            fullPlist: null,
            showPlist: false
          };

          if (infoPlistEntry) {
            try {
              const buffer = await infoPlistEntry.async('uint8array');
              const text = new TextDecoder().decode(buffer);
              
              if (text.trim().startsWith('<?xml')) {
                const parsed = window.plist.parse(text);
                _ipaData.metadata.name = parsed.CFBundleDisplayName || parsed.CFBundleName || _ipaData.metadata.name;
                _ipaData.metadata.bundleId = parsed.CFBundleIdentifier || _ipaData.metadata.bundleId;
                _ipaData.metadata.version = parsed.CFBundleShortVersionString || parsed.CFBundleVersion || _ipaData.metadata.version;
                _ipaData.metadata.minOS = parsed.MinimumOSVersion || _ipaData.metadata.minOS;
                _ipaData.metadata.sdk = parsed.DTSDKName || _ipaData.metadata.sdk;
                _ipaData.fullPlist = parsed;
              } else {
                // Handle binary plist or encrypted content with a simple heuristic for display
                const latinText = new TextDecoder('latin1').decode(buffer);
                const extract = (key) => {
                  const idx = latinText.indexOf(key);
                  if (idx === -1) return null;
                  // Binary plists have strings following the key, usually prefixed by length byte
                  const sub = latinText.substring(idx + key.length, idx + key.length + 128);
                  const match = sub.match(/[a-zA-Z0-9._-]{4,}/g);
                  // The first match after the key is usually the value
                  return match ? match[0] : null;
                };
                _ipaData.metadata.bundleId = extract('CFBundleIdentifier') || _ipaData.metadata.bundleId;
                _ipaData.metadata.version = extract('CFBundleShortVersionString') || extract('CFBundleVersion') || _ipaData.metadata.version;
                _ipaData.metadata.name = extract('CFBundleDisplayName') || extract('CFBundleName') || _ipaData.metadata.name;
                _ipaData.metadata.platform = 'iOS (Binary Plist)';
              }
            } catch (e) {
              console.warn('Metadata extraction failed', e);
            }
          }

          render(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open ipa file', 'The file may be corrupted, encrypted, or in an unsupported format. IPA files must be valid ZIP archives.');
        }
      },

      onDestroy: function() {
        _ipaData = null;
      },

      actions: [
        {
          label: '📋 Copy Bundle ID',
          id: 'copy-bundle-id',
          onClick: function(helpers, btn) {
            if (_ipaData?.metadata?.bundleId) {
              helpers.copyToClipboard(_ipaData.metadata.bundleId, btn);
            }
          }
        },
        {
          label: '📥 Download Metadata',
          id: 'dl-meta',
          onClick: function(helpers) {
            if (!_ipaData) return;
            const filename = `${helpers.getFile().name.replace(/\.[^/.]+$/, "")}-metadata.json`;
            helpers.download(filename, JSON.stringify(_ipaData.metadata, null, 2), 'application/json');
          }
        }
      ]
    });

    function render(helpers) {
      const file = helpers.getFile();
      if (!_ipaData) return;

      const query = (_ipaData.searchQuery || '').toLowerCase();
      const filtered = _ipaData.entries.filter(e => e.path.toLowerCase().includes(query));
      const visible = filtered.slice(0, MAX_VISIBLE_ENTRIES);

      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.ipa file</span>
        </div>
      `;

      const summaryCards = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">App Name</p>
            <p class="text-sm font-semibold text-surface-900 truncate" title="${escapeHtml(_ipaData.metadata.name)}">${escapeHtml(_ipaData.metadata.name)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">Bundle ID</p>
            <p class="text-sm font-mono text-surface-700 truncate" title="${escapeHtml(_ipaData.metadata.bundleId)}">${escapeHtml(_ipaData.metadata.bundleId)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">Version</p>
            <p class="text-sm font-semibold text-surface-900">${escapeHtml(_ipaData.metadata.version)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
            <p class="text-xs font-medium text-surface-400 uppercase mb-1">Min OS</p>
            <p class="text-sm font-semibold text-surface-900">${escapeHtml(_ipaData.metadata.minOS)}</p>
          </div>
        </div>
      `;

      const plistSection = _ipaData.fullPlist ? `
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Application Manifest (Info.plist)</h3>
            <button id="toggle-plist" class="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 rounded-md hover:bg-brand-50 transition-colors">
              ${_ipaData.showPlist ? 'Hide Raw Data' : 'View Raw Data'}
            </button>
          </div>
          ${_ipaData.showPlist ? `
            <div class="rounded-xl overflow-hidden border border-surface-200">
              <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-96">${escapeHtml(JSON.stringify(_ipaData.fullPlist, null, 2))}</pre>
            </div>
          ` : ''}
        </div>
      ` : '';

      const searchBox = `
        <div class="relative mb-6">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <input 
            type="text" 
            id="ipa-search"
            placeholder="Search package files..." 
            value="${escapeHtml(_ipaData.searchQuery)}"
            class="block w-full pl-10 pr-10 py-2.5 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm"
          />
          ${_ipaData.searchQuery ? `
            <button id="clear-search" class="absolute inset-y-0 right-0 pr-3 flex items-center text-surface-400 hover:text-surface-600">
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
            </button>
          ` : ''}
        </div>
      `;

      const tableContent = visible.length > 0 ? visible.map(e => `
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
          <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 font-mono text-xs truncate max-w-md" title="${escapeHtml(e.path)}">
            <span class="inline-block w-5 text-center mr-1 text-base opacity-70">${e.isDirectory ? '📁' : '📄'}</span>
            ${escapeHtml(e.path)}
          </td>
          <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 text-right tabular-nums whitespace-nowrap">
            ${e.isDirectory ? '<span class="opacity-30">—</span>' : formatSize(e.size)}
          </td>
          <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 text-right">
            ${!e.isDirectory ? `
              <button 
                class="extract-btn text-brand-600 hover:text-brand-700 font-medium text-xs transition-colors bg-brand-50 group-hover:bg-brand-100 px-2.5 py-1 rounded-lg" 
                data-path="${escapeHtml(e.path)}"
              >
                Extract
              </button>
            ` : ''}
          </td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="3" class="px-4 py-12 text-center text-surface-500 bg-surface-50/50 italic">
            ${_ipaData.entries.length === 0 ? 'This package contains no files.' : 'No files matching your search.'}
          </td>
        </tr>
      `;

      helpers.render(`
        <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          ${infoBar}
          ${summaryCards}
          ${plistSection}
          
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Package Contents</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">${filtered.length} items</span>
          </div>

          ${searchBox}

          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50">
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">File Path</th>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Size</th>
                  <th class="sticky top-0 bg-surface-50 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${tableContent}
              </tbody>
            </table>
          </div>

          ${filtered.length > MAX_VISIBLE_ENTRIES ? `
            <div class="mt-4 p-4 bg-surface-50 rounded-xl text-center text-xs text-surface-500 border border-dashed border-surface-200">
              Showing first ${MAX_VISIBLE_ENTRIES} of ${filtered.length} entries. Use search to narrow down results.
            </div>
          ` : ''}
        </div>
      `);

      // Event Bindings
      const searchInput = document.getElementById('ipa-search');
      if (searchInput) {
        searchInput.focus();
        // Move cursor to end
        const val = searchInput.value;
        searchInput.value = '';
        searchInput.value = val;
        
        searchInput.addEventListener('input', (e) => {
          _ipaData.searchQuery = e.target.value;
          render(helpers);
        });
      }

      const clearBtn = document.getElementById('clear-search');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          _ipaData.searchQuery = '';
          render(helpers);
        });
      }

      const togglePlist = document.getElementById('toggle-plist');
      if (togglePlist) {
        togglePlist.addEventListener('click', () => {
          _ipaData.showPlist = !_ipaData.showPlist;
          render(helpers);
        });
      }

      helpers.getRenderEl().querySelectorAll('.extract-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const path = btn.getAttribute('data-path');
          const entry = _ipaData.entries.find(e => e.path === path);
          if (!entry) return;

          const originalContent = btn.innerHTML;
          btn.disabled = true;
          btn.textContent = '...';

          try {
            const blob = await entry.entry.async('blob');
            const fileName = path.split('/').pop();
            helpers.download(fileName, blob);
          } catch (err) {
            console.error('Extraction failed', err);
            helpers.showError('Extraction Failed', 'Could not extract the file. The archive might be corrupted.');
          } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
          }
        });
      });
    }
  };
})();
