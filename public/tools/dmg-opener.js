(function () {
  'use strict';

  /**
   * OmniOpener — DMG Opener
   * Production-perfect browser-based Apple Disk Image (.dmg) viewer.
   */

  const LIBARCHIVE_VERSION = '1.3.0';
  const LIBARCHIVE_JS = `https://cdn.jsdelivr.net/npm/libarchive.js@${LIBARCHIVE_VERSION}/dist/libarchive.min.js`;
  const WORKER_URL = `https://cdn.jsdelivr.net/npm/libarchive.js@${LIBARCHIVE_VERSION}/dist/worker-bundle.js`;

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getFileIcon(path) {
    if (path.endsWith('/')) return '📁';
    const ext = path.split('.').pop().toLowerCase();
    const icons = {
      'app': '🚀', 'pkg': '📦', 'dmg': '📀',
      'txt': '📄', 'pdf': '📕', 'jpg': '🖼️', 'png': '🖼️', 'jpeg': '🖼️',
      'sh': '📜', 'tool': '📜', 'plist': '⚙️',
      'mp4': '🎬', 'mov': '🎬', 'mp3': '🎵', 'wav': '🎵', 'zip': '📦'
    };
    return icons[ext] || '📄';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.dmg',
      dropLabel: 'Drop a .dmg file here',
      binary: true,
      onInit: function (helpers) {
        helpers.loadScript(LIBARCHIVE_JS);
      },
      onFile: async function (file, content, helpers) {
        // B1: Check for globals
        if (typeof Archive === 'undefined') {
          helpers.showLoading('Initializing engine...');
          let retries = 0;
          while (typeof Archive === 'undefined' && retries < 100) {
            await new Promise(r => setTimeout(r, 50));
            retries++;
          }
          if (typeof Archive === 'undefined') {
            helpers.showError('Engine Load Failed', 'Failed to load the DMG parsing engine. Please check your connection.');
            return;
          }
        }

        helpers.showLoading('Reading disk image structure...');

        let workerBlobUrl = null;
        try {
          // B4/B5: Worker setup and cleanup
          const workerCode = `importScripts('${WORKER_URL}');`;
          const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
          workerBlobUrl = URL.createObjectURL(workerBlob);

          Archive.init({ workerUrl: workerBlobUrl });
          
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();

          if (!entries || entries.length === 0) {
            helpers.render(`
              <div class="flex flex-col items-center justify-center p-12 text-surface-400">
                <div class="text-6xl mb-6 opacity-20">📀</div>
                <h3 class="text-lg font-semibold text-surface-800 mb-2">DMG is empty or unreadable</h3>
                <p class="text-sm text-center max-w-xs">This disk image might be encrypted, compressed in an unsupported format, or empty.</p>
              </div>
            `);
            return;
          }

          // Initial sort: directories first, then alphabetical
          entries.sort((a, b) => {
            const aIsDir = a.file.type === 'directory';
            const bIsDir = b.file.type === 'directory';
            if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
            return a.path.localeCompare(b.path);
          });

          let totalBytes = 0;
          entries.forEach(e => { if (e.size) totalBytes += e.size; });

          helpers.setState('entries', entries);
          helpers.setState('file', file);
          helpers.setState('totalBytes', totalBytes);
          helpers.setState('sortKey', 'path');
          helpers.setState('sortOrder', 'asc');

          renderMainUI(helpers);

        } catch (err) {
          console.error('[DMG-Opener] Error:', err);
          helpers.showError(
            'Could not open dmg file',
            'The file may be corrupted or in an unsupported variant. DMG files can be compressed (UDIF), encrypted, or use file systems like APFS which might not be supported in all browsers. Try saving it again and re-uploading.'
          );
        } finally {
          if (workerBlobUrl) {
            // Revoke after a delay to ensure worker has started
            setTimeout(() => URL.revokeObjectURL(workerBlobUrl), 10000);
          }
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (helpers, btn) {
            const { entries } = helpers.getState();
            if (!entries) return;
            const list = entries.map(e => `${e.path} (${formatSize(e.size || 0)})`).join('\n');
            helpers.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download List',
          id: 'dl-list',
          onClick: function (helpers) {
            const { entries } = helpers.getState();
            if (!entries) return;
            const text = entries.map(e => `${e.path}\t${formatSize(e.size || 0)}`).join('\n');
            helpers.download('dmg-contents.txt', text);
          }
        }
      ]
    });
  };

  function renderMainUI(helpers) {
    const { entries, file, totalBytes } = helpers.getState();
    const count = entries.length;

    const html = `
      <div class="p-4 sm:p-6 max-w-6xl mx-auto">
        <!-- U1: File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200/50 shadow-sm">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.dmg file</span>
          <div class="ml-auto flex items-center gap-2 text-xs font-medium text-surface-400">
             <span>Contents: ${formatSize(totalBytes)}</span>
          </div>
        </div>

        <!-- Search / Filter -->
        <div class="mb-6 relative group">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </span>
          <input type="text" id="dmg-search" 
            placeholder="Search ${count.toLocaleString()} files and folders..." 
            class="w-full pl-12 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm"
          >
        </div>

        <!-- U10: Section Header -->
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Archive Entries</h3>
          <span id="result-badge" class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${count.toLocaleString()} items</span>
        </div>

        <!-- U7: Table -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="cursor-pointer select-none sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10 hover:bg-surface-100 transition-colors" data-sort="path">
                  File Path <span class="sort-icon inline-block w-4 opacity-40"></span>
                </th>
                <th class="cursor-pointer select-none sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32 z-10 hover:bg-surface-100 transition-colors" data-sort="size">
                  Size <span class="sort-icon inline-block w-4 opacity-40"></span>
                </th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-28 z-10">
                  Action
                </th>
              </tr>
            </thead>
            <tbody id="dmg-tbody" class="divide-y divide-surface-100">
              ${renderEntryRows(entries, helpers)}
            </tbody>
          </table>

          <!-- Empty search results -->
          <div id="no-results" class="hidden py-20 text-center bg-surface-50/30">
            <div class="text-5xl mb-4 opacity-20">🔍</div>
            <p class="text-surface-500 font-medium">No files matching that search</p>
            <button id="clear-dmg-search" class="mt-4 text-brand-600 hover:text-brand-700 text-sm font-semibold transition-colors">Clear filters</button>
          </div>
        </div>
        
        <p class="mt-6 text-[11px] text-surface-400 text-center flex items-center justify-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          Processed locally in-browser
        </p>
      </div>
    `;

    helpers.render(html);
    updateSortIcons(helpers);

    const searchInput = document.getElementById('dmg-search');
    const clearBtn = document.getElementById('clear-dmg-search');

    searchInput.addEventListener('input', () => updateTable(helpers));
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      updateTable(helpers);
    });

    // Header sorting
    const headers = helpers.getRenderEl().querySelectorAll('th[data-sort]');
    headers.forEach(header => {
      header.onclick = () => {
        const key = header.dataset.sort;
        let { sortKey, sortOrder } = helpers.getState();
        if (sortKey === key) {
          sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortOrder = 'asc';
        }
        helpers.setState('sortKey', sortKey);
        helpers.setState('sortOrder', sortOrder);
        updateSortIcons(helpers);
        updateTable(helpers);
      };
    });

    attachExtractEvents(entries, helpers);
  }

  function updateTable(helpers) {
    const { entries, sortKey, sortOrder } = helpers.getState();
    const query = document.getElementById('dmg-search').value.toLowerCase().trim();
    const tbody = document.getElementById('dmg-tbody');
    const noResults = document.getElementById('no-results');
    const badge = document.getElementById('result-badge');

    let filtered = entries.filter(e => e.path.toLowerCase().includes(query));

    // Sort
    filtered.sort((a, b) => {
      let valA, valB;
      if (sortKey === 'path') {
        const aIsDir = a.file.type === 'directory';
        const bIsDir = b.file.type === 'directory';
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        valA = a.path;
        valB = b.path;
      } else {
        valA = a.size || 0;
        valB = b.size || 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    tbody.innerHTML = renderEntryRows(filtered, helpers);
    badge.textContent = `${filtered.length.toLocaleString()} items`;

    if (filtered.length === 0) {
      tbody.closest('table').classList.add('hidden');
      noResults.classList.remove('hidden');
    } else {
      tbody.closest('table').classList.remove('hidden');
      noResults.classList.add('hidden');
    }

    attachExtractEvents(filtered, helpers);
  }

  function updateSortIcons(helpers) {
    const { sortKey, sortOrder } = helpers.getState();
    const el = helpers.getRenderEl();
    el.querySelectorAll('th[data-sort] .sort-icon').forEach(icon => {
      const parent = icon.closest('th');
      if (parent.dataset.sort === sortKey) {
        icon.textContent = sortOrder === 'asc' ? '▲' : '▼';
        icon.classList.remove('opacity-40');
      } else {
        icon.textContent = '';
        icon.classList.add('opacity-40');
      }
    });
  }

  function renderEntryRows(items, helpers) {
    // B7: Handle large files with truncation
    const limit = 800;
    const isTruncated = items.length > limit;
    const visible = isTruncated ? items.slice(0, limit) : items;

    if (items.length === 0) return '';

    let rows = visible.map(entry => {
      const isDir = entry.file.type === 'directory';
      const icon = getFileIcon(entry.path);
      const name = entry.path.split('/').pop() || entry.path;
      const dirPath = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/') + 1) : '';
      
      // U7: Table Row/Cell styles
      return `
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
          <td class="px-4 py-2 text-surface-700 border-b border-surface-100">
            <div class="flex items-center gap-3">
              <span class="text-xl flex-shrink-0">${icon}</span>
              <div class="flex flex-col min-w-0">
                <span class="font-mono text-xs font-bold text-surface-900 truncate" title="${escapeHtml(entry.path)}">${escapeHtml(name)}</span>
                ${dirPath ? `<span class="text-[10px] text-surface-400 truncate font-mono">${escapeHtml(dirPath)}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="px-4 py-2 text-right font-mono text-xs text-surface-600 border-b border-surface-100 whitespace-nowrap">
            ${isDir ? '<span class="text-surface-300">DIR</span>' : formatSize(entry.size || 0)}
          </td>
          <td class="px-4 py-2 text-center border-b border-surface-100">
            ${isDir ? '' : `
              <button 
                data-path="${escapeHtml(entry.path)}" 
                class="dmg-extract-btn px-3 py-1 bg-white border border-surface-200 text-brand-600 hover:bg-brand-600 hover:text-white hover:border-brand-600 rounded-lg transition-all text-[11px] font-bold shadow-sm"
              >
                Extract
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    if (isTruncated) {
      rows += `
        <tr>
          <td colspan="3" class="px-4 py-10 text-center bg-surface-50/50 text-surface-400 italic text-sm">
            Showing first ${limit.toLocaleString()} items. Use search to find specific files.
          </td>
        </tr>
      `;
    }

    return rows;
  }

  function attachExtractEvents(currentItems, helpers) {
    const el = helpers.getRenderEl();
    el.querySelectorAll('.dmg-extract-btn').forEach(btn => {
      btn.onclick = async function() {
        const path = this.dataset.path;
        const entry = currentItems.find(e => e.path === path);
        if (!entry) return;

        const originalHtml = this.innerHTML;
        try {
          this.disabled = true;
          this.innerHTML = '<span class="flex items-center gap-1"><svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>...</span>';
          
          helpers.showLoading(`Extracting ${path.split('/').pop()}...`);
          
          const blob = await entry.extract();
          const filename = path.split('/').pop() || 'extracted-file';
          helpers.download(filename, blob);
          
          this.innerHTML = 'Done!';
          this.classList.replace('text-brand-600', 'text-green-600');
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.disabled = false;
            this.classList.replace('text-green-600', 'text-brand-600');
          }, 2000);

        } catch (err) {
          console.error('[DMG-Extract] Error:', err);
          this.innerHTML = 'Error';
          this.classList.replace('text-brand-600', 'text-red-600');
          helpers.showError('Extraction failed', `Failed to extract "${path}". The file might be in an unsupported compression format.`);
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.disabled = false;
            this.classList.replace('text-red-600', 'text-brand-600');
          }, 3000);
        } finally {
          helpers.hideLoading();
        }
      };
    });
  }

})();
