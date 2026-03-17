(function () {
  'use strict';

  /**
   * OmniOpener — ISO Opener
   * Production-grade ISO image viewer using libarchive.js + WebAssembly.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getFileIcon(path) {
    if (path.endsWith('/')) return '📁';
    const ext = path.split('.').pop().toLowerCase();
    const icons = {
      'exe': '⚙️', 'dll': '⚙️', 'sys': '⚙️',
      'txt': '📄', 'inf': '📄', 'xml': '📄',
      'bin': '📦', 'img': '📀', 'iso': '📀',
      'sh': '📜', 'bat': '📜', 'ini': '⚙️',
      'jpg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
      'mp4': '🎬', 'mkv': '🎬', 'avi': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'pdf': '📕'
    };
    return icons[ext] || '📄';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.iso',
      dropLabel: 'Drop an ISO image here',
      binary: true,
      onInit: function (helpers) {
        // Load libarchive.js from CDN
        helpers.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.min.js');
      },
      onFile: async function (file, content, helpers) {
        // B1: Race condition check for CDN scripts
        if (typeof Archive === 'undefined') {
          helpers.showLoading('Initializing ISO engine...');
          let retries = 0;
          while (typeof Archive === 'undefined' && retries < 100) {
            await new Promise(r => setTimeout(r, 50));
            retries++;
          }
          if (typeof Archive === 'undefined') {
            helpers.showError('Engine Load Timeout', 'Failed to load the ISO parsing engine. Please check your internet connection.');
            return;
          }
        }

        helpers.showLoading('Reading ISO structure...');

        let workerBlobUrl = null;
        try {
          // B4: CDN load order and worker setup
          // We create a blob for the worker to avoid CORS issues with cross-origin worker scripts
          const workerUrl = 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js';
          const workerCode = `importScripts('${workerUrl}');`;
          const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
          workerBlobUrl = URL.createObjectURL(workerBlob);

          Archive.init({ workerUrl: workerBlobUrl });
          
          // B2: Ensure we pass the file object or ArrayBuffer correctly
          // Archive.open accepts a File/Blob
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();

          // U5: Empty state handling
          if (!entries || entries.length === 0) {
            helpers.render(`
              <div class="flex flex-col items-center justify-center p-12 text-surface-400">
                <div class="text-6xl mb-6 opacity-20">📀</div>
                <h3 class="text-lg font-semibold text-surface-800 mb-2">ISO is empty</h3>
                <p class="text-sm text-center max-w-xs">This disk image doesn't contain any visible files or directories.</p>
              </div>
            `);
            return;
          }

          // Sort: directories first, then alphabetical
          entries.sort((a, b) => {
            const aIsDir = a.file.type === 'directory';
            const bIsDir = b.file.type === 'directory';
            if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
            return a.path.localeCompare(b.path);
          });

          // Pre-calculate stats
          let totalBytes = 0;
          entries.forEach(e => { if (e.size) totalBytes += e.size; });

          helpers.setState('entries', entries);
          helpers.setState('fileName', file.name);
          helpers.setState('fileSize', file.size);
          helpers.setState('totalBytes', totalBytes);

          renderMainUI(helpers);

        } catch (err) {
          console.error('[ISO-Opener] Error:', err);
          // U3: Friendly error message
          helpers.showError(
            'Could not open ISO file',
            'The file might be corrupted, encrypted, or in an unsupported ISO format (e.g., UDF-only or multi-session). Try another tool if this persists.'
          );
        } finally {
          // B5: Revoke worker URL safely
          if (workerBlobUrl) {
            setTimeout(() => URL.revokeObjectURL(workerBlobUrl), 5000);
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
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function (helpers) {
            const { entries } = helpers.getState();
            if (!entries) return;
            const csv = 'Path,Type,Size,Modified\n' + entries.map(e => 
              `"${e.path.replace(/"/g, '""')}",${e.file.type},${e.size || 0},"${e.file.lastModified || ''}"`
            ).join('\n');
            helpers.download('iso-inventory.csv', csv);
          }
        }
      ]
    });
  };

  function renderMainUI(helpers) {
    const { entries, fileName, fileSize, totalBytes } = helpers.getState();
    const count = entries.length;

    // U1: File Info Bar
    // U7-U10: Beautiful UI elements
    const html = `
      <div class="p-6 max-w-6xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200/50 shadow-sm">
          <span class="font-bold text-surface-900">${escapeHtml(fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500 font-medium">.iso archive</span>
          <div class="ml-auto flex items-center gap-4">
            <div class="hidden sm:flex flex-col items-end">
              <span class="text-[10px] uppercase tracking-wider text-surface-400 font-bold leading-none mb-1">Total Uncompressed</span>
              <span class="font-mono text-xs text-brand-700">${formatSize(totalBytes)}</span>
            </div>
          </div>
        </div>

        <!-- Format Excellence: Search/Filter -->
        <div class="mb-6 relative group">
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </span>
          <input type="text" id="iso-search" 
            placeholder="Search through ${count.toLocaleString()} files..." 
            class="w-full pl-12 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm"
          >
        </div>

        <!-- U10: Section Header -->
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-surface-800">Contents</h3>
          <span id="result-badge" class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${count.toLocaleString()} items</span>
        </div>

        <!-- U7: Table Wrapper -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          <table class="min-w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr class="bg-surface-50/80">
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10">File Path</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32 z-10">Size</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-28 z-10">Action</th>
              </tr>
            </thead>
            <tbody id="iso-tbody" class="divide-y divide-surface-100">
              ${renderEntryRows(entries, helpers)}
            </tbody>
          </table>

          <div id="no-results" class="hidden py-16 text-center bg-surface-50/30">
            <div class="text-4xl mb-3">🔍</div>
            <p class="text-surface-500 font-medium">No files matching that search</p>
            <button id="clear-iso-search" class="mt-2 text-brand-600 hover:underline text-sm font-medium">Clear search</button>
          </div>
        </div>
        
        <p class="mt-4 text-[11px] text-surface-400 text-center italic">
          Tip: Click "Extract" to download individual files from the image. Large files may take a moment to decompress.
        </p>
      </div>
    `;

    helpers.render(html);

    // Search Logic
    const searchInput = document.getElementById('iso-search');
    const tbody = document.getElementById('iso-tbody');
    const noResults = document.getElementById('no-results');
    const badge = document.getElementById('result-badge');
    const clearBtn = document.getElementById('clear-iso-search');

    const updateSearch = () => {
      const query = searchInput.value.toLowerCase().trim();
      const filtered = entries.filter(e => e.path.toLowerCase().includes(query));
      
      tbody.innerHTML = renderEntryRows(filtered, helpers);
      badge.textContent = `${filtered.length.toLocaleString()} items`;
      
      if (filtered.length === 0) {
        tbody.parentElement.classList.add('hidden');
        noResults.classList.remove('hidden');
      } else {
        tbody.parentElement.classList.remove('hidden');
        noResults.classList.add('hidden');
      }
      
      attachExtractEvents(filtered, helpers);
    };

    searchInput.addEventListener('input', updateSearch);
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      updateSearch();
    });

    attachExtractEvents(entries, helpers);
  }

  function renderEntryRows(items, helpers) {
    // B7: Large file handling - truncate visual list for performance
    const limit = 1000;
    const isTruncated = items.length > limit;
    const visible = isTruncated ? items.slice(0, limit) : items;

    let rows = visible.map(entry => {
      const isDir = entry.file.type === 'directory';
      const icon = getFileIcon(entry.path);
      const name = entry.path.split('/').pop() || entry.path;
      const dirPath = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/') + 1) : '';
      
      return `
        <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
          <td class="px-4 py-3 border-b border-surface-100">
            <div class="flex items-center gap-3">
              <span class="text-xl opacity-80 group-hover:opacity-100 transition-opacity flex-shrink-0">${icon}</span>
              <div class="flex flex-col min-w-0">
                <span class="font-mono text-xs font-bold text-surface-900 truncate" title="${escapeHtml(entry.path)}">${escapeHtml(name)}</span>
                ${dirPath ? `<span class="text-[10px] text-surface-400 truncate opacity-60 font-mono">${escapeHtml(dirPath)}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="px-4 py-3 text-right font-mono text-xs text-surface-500 border-b border-surface-100 whitespace-nowrap">
            ${isDir ? '<span class="text-surface-300">DIR</span>' : formatSize(entry.size || 0)}
          </td>
          <td class="px-4 py-3 text-center border-b border-surface-100">
            ${isDir ? '' : `
              <button 
                data-path="${escapeHtml(entry.path)}" 
                class="iso-extract-btn px-3 py-1 bg-white border border-surface-200 text-brand-600 hover:bg-brand-600 hover:text-white hover:border-brand-600 rounded-lg transition-all text-[11px] font-bold shadow-sm"
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
          <td colspan="3" class="px-4 py-8 text-center bg-surface-50/50 text-surface-400 italic text-xs">
            Listing truncated to first ${limit.toLocaleString()} items. Use search to find specific files.
          </td>
        </tr>
      `;
    }

    return rows;
  }

  function attachExtractEvents(currentItems, helpers) {
    const el = helpers.getRenderEl();
    el.querySelectorAll('.iso-extract-btn').forEach(btn => {
      btn.onclick = async function() {
        const path = this.dataset.path;
        const entry = currentItems.find(e => e.path === path);
        if (!entry) return;

        const originalHtml = this.innerHTML;
        try {
          this.disabled = true;
          this.innerHTML = '<span class="flex items-center gap-1"><svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ...</span>';
          
          helpers.showLoading(`Extracting ${path.split('/').pop()}...`);
          
          // B3: await async library function
          const blob = await entry.extract();
          const filename = path.split('/').pop() || 'extracted-file';
          
          helpers.download(filename, blob);
          
          this.innerHTML = 'Done!';
          this.classList.replace('text-brand-600', 'text-green-600');
          this.classList.replace('hover:bg-brand-600', 'hover:bg-green-600');
          
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.disabled = false;
            this.classList.replace('text-green-600', 'text-brand-600');
            this.classList.replace('hover:bg-green-600', 'hover:bg-brand-600');
          }, 2000);

        } catch (err) {
          console.error('[ISO-Extract] Error:', err);
          this.innerHTML = 'Error';
          this.classList.replace('text-brand-600', 'text-red-600');
          helpers.showError('Extraction failed', `Failed to extract "${path}". The file may be in an unsupported format or corrupted.`);
          
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
