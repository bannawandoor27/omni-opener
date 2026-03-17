(function() {
  'use strict';

  /**
   * OmniOpener IPA Tool
   * A production-grade iOS App Package (.ipa) inspector.
   */

  const MAX_VISIBLE_ENTRIES = 1000;
  const SCRIPTS = [
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/plist@3.1.0/dist/plist.min.js'
  ];

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
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

  async function waitForGlobals(globals, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (globals.every(g => typeof window[g] !== 'undefined')) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ipa',
      dropLabel: 'Drop an iOS IPA file to inspect',
      binary: true,
      onInit: function(helpers) {
        SCRIPTS.forEach(src => helpers.loadScript(src));
      },
      onFile: async function(file, content, helpers) {
        helpers.showLoading('Preparing environment...');
        
        const loaded = await waitForGlobals(['JSZip', 'plist']);
        if (!loaded) {
          helpers.showError('Dependency Error', 'Failed to load required libraries. Please check your connection and try again.');
          return;
        }

        helpers.showLoading('Extracting package metadata...');

        try {
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let infoPlistEntry = null;
          let appPath = '';

          zip.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              isDirectory: entry.dir,
              entry: entry,
              date: entry.date
            });

            if (!infoPlistEntry && path.toLowerCase().endsWith('.app/info.plist')) {
              infoPlistEntry = entry;
              appPath = path.substring(0, path.lastIndexOf('/') + 1);
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

          const ipaData = {
            entries,
            totalSize: entries.reduce((acc, e) => acc + e.size, 0),
            metadata: {
              name: 'Unknown App',
              bundleId: 'Unknown',
              version: '1.0',
              minOS: 'Unknown',
              sdk: 'Unknown',
              platform: 'iOS'
            },
            searchQuery: ''
          };

          if (infoPlistEntry) {
            try {
              const buffer = await infoPlistEntry.async('uint8array');
              const text = new TextDecoder().decode(buffer);
              
              if (text.trim().startsWith('<?xml')) {
                const parsed = window.plist.parse(text);
                ipaData.metadata.name = parsed.CFBundleDisplayName || parsed.CFBundleName || ipaData.metadata.name;
                ipaData.metadata.bundleId = parsed.CFBundleIdentifier || ipaData.metadata.bundleId;
                ipaData.metadata.version = parsed.CFBundleShortVersionString || parsed.CFBundleVersion || ipaData.metadata.version;
                ipaData.metadata.minOS = parsed.MinimumOSVersion || ipaData.metadata.minOS;
                ipaData.metadata.sdk = parsed.DTSDKName || ipaData.metadata.sdk;
                ipaData.fullPlist = parsed;
              } else {
                // Heuristic for binary plist if needed, but usually we just show what we can
                const latinText = new TextDecoder('latin1').decode(buffer);
                ipaData.metadata.bundleId = extractStringHeuristic(latinText, 'CFBundleIdentifier') || ipaData.metadata.bundleId;
                ipaData.metadata.version = extractStringHeuristic(latinText, 'CFBundleShortVersionString') || extractStringHeuristic(latinText, 'CFBundleVersion') || ipaData.metadata.version;
                ipaData.metadata.name = extractStringHeuristic(latinText, 'CFBundleDisplayName') || extractStringHeuristic(latinText, 'CFBundleName') || ipaData.metadata.name;
              }
            } catch (e) {
              console.warn('Plist parsing failed', e);
            }
          }

          helpers.setState('ipaData', ipaData);
          render(helpers, file, ipaData);

        } catch (err) {
          console.error(err);
          helpers.showError('Invalid IPA File', 'Could not parse the iOS package. It might be corrupted or encrypted.');
        }
      },
      actions: [
        {
          label: '📋 Copy Bundle ID',
          id: 'copy-bundle-id',
          onClick: function(helpers, btn) {
            const data = helpers.getState().ipaData;
            if (data?.metadata?.bundleId) {
              helpers.copyToClipboard(data.metadata.bundleId, btn);
            }
          }
        },
        {
          label: '📥 Download Metadata',
          id: 'dl-meta',
          onClick: function(helpers) {
            const data = helpers.getState().ipaData;
            if (!data) return;
            const filename = `${helpers.getFile().name.replace(/\.[^/.]+$/, "")}-metadata.json`;
            helpers.download(filename, JSON.stringify(data.metadata, null, 2), 'application/json');
          }
        }
      ]
    });
  };

  function extractStringHeuristic(text, key) {
    const idx = text.indexOf(key);
    if (idx === -1) return null;
    const sub = text.substring(idx + key.length, idx + key.length + 120);
    const match = sub.match(/[a-zA-Z0-9._-]{3,}/);
    return match ? match[0] : null;
  }

  function render(helpers, file, data) {
    const query = (data.searchQuery || '').toLowerCase();
    const filtered = data.entries.filter(e => e.path.toLowerCase().includes(query));
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
          <p class="text-sm font-semibold text-surface-900 truncate" title="${escapeHtml(data.metadata.name)}">${escapeHtml(data.metadata.name)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <p class="text-xs font-medium text-surface-400 uppercase mb-1">Bundle ID</p>
          <p class="text-sm font-mono text-surface-700 truncate" title="${escapeHtml(data.metadata.bundleId)}">${escapeHtml(data.metadata.bundleId)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <p class="text-xs font-medium text-surface-400 uppercase mb-1">Version</p>
          <p class="text-sm font-semibold text-surface-900">${escapeHtml(data.metadata.version)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
          <p class="text-xs font-medium text-surface-400 uppercase mb-1">Minimum OS</p>
          <p class="text-sm font-semibold text-surface-900">${escapeHtml(data.metadata.minOS)}</p>
        </div>
      </div>
    `;

    const searchBox = `
      <div class="relative mb-6">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        </div>
        <input 
          type="text" 
          id="ipa-filter"
          placeholder="Search files by path or name..." 
          value="${escapeHtml(data.searchQuery)}"
          class="block w-full pl-10 pr-3 py-2 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all"
        />
        ${data.searchQuery ? `
          <button id="clear-search" class="absolute inset-y-0 right-0 pr-3 flex items-center text-surface-400 hover:text-surface-600">
            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>
          </button>
        ` : ''}
      </div>
    `;

    const tableHeader = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-surface-800">Package Contents</h3>
        <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length} entries</span>
      </div>
    `;

    const table = `
      <div class="overflow-x-auto rounded-xl border border-surface-200">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">File Path</th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Size</th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white">
            ${visible.length > 0 ? visible.map((e, idx) => `
              <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-mono text-xs truncate max-w-md" title="${escapeHtml(e.path)}">
                  <span class="inline-block w-5 text-center mr-1">${e.isDirectory ? '📁' : '📄'}</span>
                  ${escapeHtml(e.path)}
                </td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 text-right tabular-nums">
                  ${e.isDirectory ? '-' : formatSize(e.size)}
                </td>
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 text-right">
                  ${!e.isDirectory ? `
                    <button 
                      class="extract-btn text-brand-600 hover:text-brand-700 font-medium text-xs transition-colors" 
                      data-path="${escapeHtml(e.path)}"
                    >
                      Extract
                    </button>
                  ` : ''}
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="3" class="px-4 py-8 text-center text-surface-500 bg-surface-50">
                  ${data.entries.length === 0 ? 'This package is empty.' : 'No files match your search filter.'}
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
      ${filtered.length > MAX_VISIBLE_ENTRIES ? `
        <div class="mt-4 p-3 bg-surface-50 rounded-lg text-center text-xs text-surface-500 border border-dashed border-surface-200">
          Showing first ${MAX_VISIBLE_ENTRIES} of ${filtered.length} entries. Use search to find specific files.
        </div>
      ` : ''}
    `;

    helpers.render(`
      <div class="max-w-6xl mx-auto p-4 md:p-6">
        ${infoBar}
        ${summaryCards}
        ${searchBox}
        ${tableHeader}
        ${table}
      </div>
    `);

    // Event Bindings
    const input = document.getElementById('ipa-filter');
    if (input) {
      input.addEventListener('input', (e) => {
        data.searchQuery = e.target.value;
        render(helpers, file, data);
        // Maintain focus
        const newInput = document.getElementById('ipa-filter');
        newInput.focus();
        newInput.setSelectionRange(newInput.value.length, newInput.value.length);
      });
    }

    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        data.searchQuery = '';
        render(helpers, file, data);
      });
    }

    helpers.getRenderEl().querySelectorAll('.extract-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const path = btn.getAttribute('data-path');
        const entry = data.entries.find(e => e.path === path);
        if (!entry) return;

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '...';

        try {
          const blob = await entry.entry.async('blob');
          const fileName = path.split('/').pop();
          helpers.download(fileName, blob);
        } catch (err) {
          console.error('Extraction failed', err);
          alert('Failed to extract file.');
        } finally {
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    });
  }

})();
