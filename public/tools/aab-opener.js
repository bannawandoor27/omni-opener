(function() {
  'use strict';

  /**
   * OmniOpener AAB Tool
   * A production-perfect browser-based Android App Bundle (AAB) inspector.
   */

  const MAX_VISIBLE_ROWS = 500;

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

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.aab',
      dropLabel: 'Drop an Android App Bundle (.aab) file to inspect',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: async function(file, content, helpers) {
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Initializing engine...');
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Library Load Failed', 'JSZip could not be loaded from CDN. Please check your connection.');
            return;
          }
        }

        helpers.showLoading('Decompressing App Bundle...');

        try {
          const zip = await JSZip.loadAsync(content);
          const files = [];
          let totalUncompressedSize = 0;
          let manifestFile = null;

          zip.forEach((relativePath, zipEntry) => {
            const entry = {
              name: relativePath,
              size: zipEntry._data.uncompressedSize || 0,
              date: zipEntry.date,
              isDirectory: zipEntry.dir
            };
            files.push(entry);
            totalUncompressedSize += entry.size;
            
            // AAB manifests are typically at base/manifest/AndroidManifest.xml
            if (relativePath.endsWith('AndroidManifest.xml')) {
              if (!manifestFile || relativePath.includes('base/')) {
                manifestFile = zipEntry;
              }
            }
          });

          files.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          const aabData = {
            files,
            totalUncompressedSize,
            fileCount: files.length,
            packageName: 'Searching...',
            versionName: 'Unknown',
            filter: ''
          };

          helpers.setState('aabData', aabData);

          if (manifestFile) {
            try {
              const manifestBuffer = await manifestFile.async('uint8array');
              const info = extractHeuristicInfo(manifestBuffer);
              aabData.packageName = info.packageName || 'com.example.app';
              aabData.versionName = info.versionName || '1.0.0';
            } catch (e) {
              console.warn('Manifest extraction failed', e);
              aabData.packageName = 'Unknown Package';
            }
          } else {
            aabData.packageName = 'No Manifest Found';
          }

          render(helpers, file, aabData);
        } catch (err) {
          helpers.showError('Could not open AAB file', 'This file might be corrupted or not a valid ZIP-based AAB. ' + err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const data = helpers.getState().aabData;
            if (!data || !data.files) return;
            const text = data.files
              .map(f => `${f.isDirectory ? '[DIR] ' : ''}${f.name} (${formatSize(f.size)})`)
              .join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Export Bundle Metadata',
          id: 'export-meta',
          onClick: function(helpers) {
            const data = helpers.getState().aabData;
            if (!data) return;
            const meta = {
              packageName: data.packageName,
              version: data.versionName,
              fileCount: data.fileCount,
              uncompressedSize: data.totalUncompressedSize,
              files: data.files.map(f => ({ name: f.name, size: f.size }))
            };
            helpers.download(`${helpers.getFile().name}-metadata.json`, JSON.stringify(meta, null, 2), 'application/json');
          }
        }
      ],
      infoHtml: '<strong>AAB Inspector:</strong> Securely view the internal structure of an Android App Bundle. AABs use Protocol Buffers for resources, so some files may appear as binary. All processing is local.'
    });
  };

  function render(helpers, file, data) {
    const searchTerm = (data.filter || '').toLowerCase();
    const filteredFiles = data.files.filter(f => f.name.toLowerCase().includes(searchTerm));
    const isTruncated = filteredFiles.length > MAX_VISIBLE_ROWS;
    const displayFiles = filteredFiles.slice(0, MAX_VISIBLE_ROWS);

    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">Android App Bundle</span>
      </div>
    `;

    const statsCards = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 transition-all bg-white shadow-sm">
          <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Package Name</h3>
          <p class="text-base font-mono font-semibold text-brand-700 truncate" title="${escapeHtml(data.packageName)}">${escapeHtml(data.packageName)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 transition-all bg-white shadow-sm">
          <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Version</h3>
          <p class="text-base font-semibold text-surface-800">${escapeHtml(data.versionName)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 transition-all bg-white shadow-sm">
          <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-1">Contents</h3>
          <p class="text-base font-semibold text-surface-800">${data.fileCount.toLocaleString()} items (${formatSize(data.totalUncompressedSize)} uncompressed)</p>
        </div>
      </div>
    `;

    const searchHtml = `
      <div class="mb-4 relative">
        <input 
          type="text" 
          id="aab-search" 
          placeholder="Filter bundle entries (e.g. base/, .pb, assets/)..." 
          value="${escapeHtml(data.filter || '')}"
          class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
        />
        <div class="absolute left-3 top-2.5 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>
    `;

    let tableHtml = '';
    if (filteredFiles.length === 0) {
      tableHtml = `
        <div class="text-center py-12 bg-surface-50 rounded-xl border border-dashed border-surface-300">
          <p class="text-surface-500">No files found matching "${escapeHtml(data.filter)}"</p>
        </div>
      `;
    } else {
      tableHtml = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Bundle Entries</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredFiles.length} matched</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">File Path</th>
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Size</th>
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Modified</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${displayFiles.map(f => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-2.5 text-surface-700 font-mono text-xs break-all">
                    ${f.isDirectory ? '<span class="text-brand-500 mr-1">📁</span>' : '<span class="text-surface-400 mr-1">📄</span>'}
                    ${escapeHtml(f.name)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-600 whitespace-nowrap tabular-nums">
                    ${f.isDirectory ? '-' : formatSize(f.size)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-400 text-xs whitespace-nowrap">
                    ${f.date.toLocaleDateString()}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${isTruncated ? `
          <div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-700 text-xs text-center">
            Showing first ${MAX_VISIBLE_ROWS} of ${filteredFiles.length} matching entries. Use search to narrow down results.
          </div>
        ` : ''}
      `;
    }

    helpers.render(`
      <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
        ${infoBar}
        ${statsCards}
        ${searchHtml}
        ${tableHtml}
      </div>
    `);

    const searchInput = document.getElementById('aab-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        data.filter = e.target.value;
        render(helpers, file, data);
      });
      if (data.filter) {
        searchInput.focus();
        searchInput.setSelectionRange(data.filter.length, data.filter.length);
      }
    }
  }

  function extractHeuristicInfo(buffer) {
    const info = { packageName: '', versionName: '' };
    try {
      // In AAB, AndroidManifest.xml is often in Protocol Buffer format (Binary)
      // but it still contains the package name strings.
      const text = new TextDecoder('latin1').decode(buffer);
      
      const pkgMatches = text.match(/[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}/g);
      if (pkgMatches) {
        const candidates = pkgMatches.filter(p => !p.includes('android.schema') && !p.includes('google.com') && !p.includes('http'));
        if (candidates.length > 0) info.packageName = candidates[0];
      }

      const verMatches = text.match(/\d+\.\d+\.\d+/g);
      if (verMatches) {
        info.versionName = verMatches[0];
      }
    } catch (e) {
      console.error('Heuristic parsing failed', e);
    }
    return info;
  }

})();
