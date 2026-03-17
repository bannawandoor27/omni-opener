(function () {
  'use strict';

  /**
   * OmniOpener — 7z Opener (Production Perfect)
   * High-performance browser-based 7z extraction using libarchive.js + WebAssembly.
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
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.7z',
      dropLabel: 'Drop a .7z archive here',
      binary: true,
      onInit: function (helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.min.js');
      },
      onFile: async function (file, content, helpers) {
        if (typeof Archive === 'undefined') {
          helpers.showLoading('Initializing 7z engine...');
          await new Promise((resolve) => {
            const check = setInterval(() => {
              if (typeof Archive !== 'undefined') {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
        }

        helpers.showLoading('Preparing decompression worker...');

        let workerBlobUrl = null;
        try {
          // Initialize Archive with a blob-wrapped worker to bypass CORS issues
          const workerUrl = 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js';
          const workerCode = `importScripts('${workerUrl}');`;
          const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
          workerBlobUrl = URL.createObjectURL(workerBlob);

          Archive.init({
            workerUrl: workerBlobUrl
          });

          helpers.showLoading('Reading archive structure...');
          
          // libarchive.js handles the File object efficiently
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();

          if (!entries || entries.length === 0) {
            helpers.render(`
              <div class="flex flex-col items-center justify-center p-12 text-surface-400">
                <div class="text-4xl mb-4">📭</div>
                <p class="text-lg font-medium">This 7z archive is empty</p>
                <p class="text-sm">No files or folders were found inside.</p>
              </div>
            `);
            return;
          }

          // Sort: directories first, then alphabetical path
          entries.sort((a, b) => {
            const aDir = a.file.type === 'directory' ? 0 : 1;
            const bDir = b.file.type === 'directory' ? 0 : 1;
            return aDir - bDir || a.path.localeCompare(b.path);
          });

          let totalUncompressed = 0;
          entries.forEach(e => totalUncompressed += (e.size || 0));

          helpers.setState('entries', entries);
          helpers.setState('totalUncompressed', totalUncompressed);
          
          renderUI(file, entries, totalUncompressed, helpers);

        } catch (err) {
          console.error('[7z-opener] Error:', err);
          helpers.showError(
            'Could not open 7z file',
            'The archive might be encrypted, corrupted, or use an unsupported compression method. Please ensure it is a valid .7z file.'
          );
        } finally {
          if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (helpers, btn) {
            const entries = helpers.getState().entries;
            if (!entries) return;
            const list = entries.map(e => e.path).join('\n');
            helpers.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download manifest',
          id: 'dl-manifest',
          onClick: function (helpers) {
            const entries = helpers.getState().entries;
            if (!entries) return;
            const data = entries.map(e => `${e.path}\t${formatSize(e.size)}`).join('\n');
            helpers.download('archive-contents.txt', data);
          }
        }
      ]
    });
  };

  function renderUI(file, entries, totalUncompressed, helpers) {
    const fileCount = entries.length;

    const html = `
      <div class="p-6 max-w-6xl mx-auto">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.7z archive</span>
          <span class="ml-auto flex items-center gap-2">
            <span class="text-xs text-surface-400">Expanded size:</span>
            <span class="font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">${formatSize(totalUncompressed)}</span>
          </span>
        </div>

        <!-- Search / Filter -->
        <div class="mb-6">
          <div class="relative group">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">🔍</span>
            <input type="text" id="archive-filter" 
              placeholder="Filter ${fileCount.toLocaleString()} items by name or path..." 
              class="w-full pl-11 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm"
            >
          </div>
        </div>

        <!-- U10. Section header with counts -->
        <div class="flex items-center justify-between mb-4 px-1">
          <h3 class="font-semibold text-surface-800 flex items-center gap-2">
            Archive Contents
            <span id="match-count" class="hidden text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full"></span>
          </h3>
          <span class="text-xs text-surface-400 uppercase tracking-wider font-medium">${fileCount.toLocaleString()} total items</span>
        </div>

        <!-- U7. Table structure -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50/50">
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name / Path</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
              </tr>
            </thead>
            <tbody id="archive-body" class="divide-y divide-surface-100">
              ${renderRows(entries, helpers)}
            </tbody>
          </table>
          <div id="empty-results" class="hidden py-20 text-center">
            <div class="text-4xl mb-3">🔍</div>
            <p class="text-surface-500 font-medium">No files match your filter</p>
            <button id="clear-filter" class="mt-2 text-brand-600 hover:text-brand-700 text-sm font-semibold">Clear search</button>
          </div>
        </div>

        <div class="mt-4 text-center">
          <p class="text-xs text-surface-400 italic">Processing is done entirely in your browser using WebAssembly. Your files are never uploaded.</p>
        </div>
      </div>
    `;

    helpers.render(html);

    const filterInput = document.getElementById('archive-filter');
    const archiveBody = document.getElementById('archive-body');
    const emptyResults = document.getElementById('empty-results');
    const matchCount = document.getElementById('match-count');
    const clearBtn = document.getElementById('clear-filter');

    const handleFilter = () => {
      const query = filterInput.value.toLowerCase().trim();
      const filtered = entries.filter(e => e.path.toLowerCase().includes(query));
      
      archiveBody.innerHTML = renderRows(filtered, helpers);
      
      if (query) {
        matchCount.textContent = `${filtered.length} matches`;
        matchCount.classList.remove('hidden');
      } else {
        matchCount.classList.add('hidden');
      }

      if (filtered.length === 0) {
        archiveBody.classList.add('hidden');
        emptyResults.classList.remove('hidden');
      } else {
        archiveBody.classList.remove('hidden');
        emptyResults.classList.add('hidden');
      }
      
      bindExtractButtons(filtered, helpers);
    };

    filterInput.addEventListener('input', handleFilter);
    clearBtn.addEventListener('click', () => {
      filterInput.value = '';
      handleFilter();
    });

    bindExtractButtons(entries, helpers);
  }

  function renderRows(items, helpers) {
    // Large archive optimization: truncate view to 1500 items if no filter
    const limit = 1500;
    const isTruncated = items.length > limit;
    const visibleItems = isTruncated ? items.slice(0, limit) : items;

    let rows = visibleItems.map((entry) => {
      const isDir = entry.file.type === 'directory';
      const icon = isDir ? '📁' : getFileIcon(entry.path);
      
      return `
        <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
          <td class="px-4 py-3 text-surface-700 border-b border-surface-100">
            <div class="flex items-center gap-3">
              <span class="text-lg opacity-70 group-hover:opacity-100 transition-opacity">${icon}</span>
              <div class="flex flex-col min-w-0">
                <span class="font-mono text-xs truncate" title="${escapeHtml(entry.path)}">${escapeHtml(entry.path)}</span>
                ${entry.file.lastModified ? `<span class="text-[10px] text-surface-400">${new Date(entry.file.lastModified).toLocaleDateString()}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="px-4 py-3 text-right text-surface-600 border-b border-surface-100 font-mono text-xs whitespace-nowrap">
            ${isDir ? '<span class="text-surface-300">DIR</span>' : formatSize(entry.size)}
          </td>
          <td class="px-4 py-3 text-center border-b border-surface-100">
            ${isDir ? '' : `
              <button 
                data-path="${escapeHtml(entry.path)}" 
                class="extract-trigger p-2 text-brand-600 hover:bg-brand-100 rounded-lg transition-all title="Extract file"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    if (isTruncated) {
      rows += `
        <tr>
          <td colspan="3" class="px-4 py-8 text-center bg-surface-50/50 text-surface-500 italic">
            Showing first ${limit.toLocaleString()} items. Use search to find specific files.
          </td>
        </tr>
      `;
    }

    return rows;
  }

  function bindExtractButtons(currentItems, helpers) {
    const el = helpers.getRenderEl();
    el.querySelectorAll('.extract-trigger').forEach(btn => {
      btn.onclick = async function() {
        const path = this.dataset.path;
        const entry = currentItems.find(e => e.path === path);
        if (!entry) return;

        const originalHtml = this.innerHTML;
        try {
          this.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
          this.classList.add('pointer-events-none');
          
          helpers.showLoading(`Extracting ${path.split('/').pop()}...`);
          
          const blob = await entry.extract();
          const filename = path.split('/').pop() || 'extracted-file';
          
          helpers.download(filename, blob);
          
          this.innerHTML = '<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.classList.remove('pointer-events-none');
          }, 2000);

          helpers.hideLoading();
        } catch (err) {
          console.error('[7z-extract] Error:', err);
          this.innerHTML = originalHtml;
          this.classList.remove('pointer-events-none');
          helpers.hideLoading();
          helpers.showError('Extraction failed', `Could not extract "${path}". The archive might be corrupted.`);
        }
      };
    });
  }

  function getFileIcon(path) {
    const ext = path.split('.').pop().toLowerCase();
    const icons = {
      'pdf': '📄',
      'docx': '📝', 'doc': '📝', 'odt': '📝',
      'xlsx': '📊', 'xls': '📊', 'ods': '📊', 'csv': '📊',
      'pptx': '📽️', 'ppt': '📽️',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
      'mp4': '🎬', 'webm': '🎬', 'avi': '🎬',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦',
      'js': '📜', 'ts': '📜', 'html': '🌐', 'css': '🎨', 'json': '🔑', 'xml': '🔑',
      'txt': '📄', 'md': '📄', 'log': '📄'
    };
    return icons[ext] || '📄';
  }

})();
