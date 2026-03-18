(function() {
  'use strict';

  /**
   * OmniOpener RAR Tool
   * A production-perfect browser-based RAR extractor.
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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.rar',
      dropLabel: 'Drop a .rar file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/main.min.js');
      },
      onFile: async function(file, content, helpers) {
        // B1 & B4: Ensure engine is loaded
        if (typeof Archive === 'undefined') {
          helpers.showLoading('Initializing RAR engine...');
          let attempts = 0;
          while (typeof Archive === 'undefined' && attempts < 100) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof Archive === 'undefined') {
            helpers.showError('Engine Load Timeout', 'The RAR extraction engine failed to load. Please check your internet connection and try again.');
            return;
          }
        }

        helpers.showLoading('Extracting archive metadata...');
        
        let workerBlobUrl = null;
        try {
          // B5: Worker initialization with Blob to avoid CORS
          const workerUrl = 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js';
          const workerCode = `importScripts('${workerUrl}');`;
          const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
          workerBlobUrl = URL.createObjectURL(workerBlob);

          Archive.init({
            workerUrl: workerBlobUrl
          });

          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();
          
          // U5: Empty state handling
          if (!entries || entries.length === 0) {
            helpers.showError('Empty Archive', 'No files were found inside this RAR archive.');
            return;
          }

          let totalUncompressedSize = 0;
          entries.forEach(e => totalUncompressedSize += (e.size || 0));

          // Save state for actions and search
          helpers.setState('originalEntries', entries);
          helpers.setState('filteredEntries', entries);
          helpers.setState('totalUncompressedSize', totalUncompressedSize);
          helpers.setState('fileName', file.name);
          helpers.setState('fileSize', file.size);

          renderLayout(helpers);
        } catch(e) {
          console.error('[RAR Opener] Error:', e);
          // U3: Friendly error messages
          helpers.showError('Could not open RAR file', 'The file may be encrypted, corrupted, or in an unsupported RAR format (like RAR5 with headers encrypted).');
        } finally {
          // B5: Revoke worker blob URL
          if (workerBlobUrl) {
            // Give a small delay to ensure the worker has started if it needs the URL for initialization
            setTimeout(() => URL.revokeObjectURL(workerBlobUrl), 10000);
          }
        }
      },
      actions: [
        { 
          label: '📋 Copy File List', 
          id: 'copy', 
          onClick: function(helpers, btn) { 
            const state = helpers.getState();
            const entries = state.filteredEntries || state.originalEntries;
            if (!entries || entries.length === 0) return;
            const list = entries.map(e => e.path).join('\n');
            helpers.copyToClipboard(list, btn);
          } 
        },
        { 
          label: '📥 Download List', 
          id: 'download-list', 
          onClick: function(helpers, btn) { 
            const state = helpers.getState();
            const entries = state.filteredEntries || state.originalEntries;
            const fileName = state.fileName;
            if (!entries || entries.length === 0) return;
            const list = entries.map(e => `${e.path} (${formatSize(e.size)})`).join('\n');
            helpers.download(`${fileName}-contents.txt`, list, 'text/plain');
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Files are processed entirely in your browser. No data is uploaded.'
    });
  };

  function renderLayout(helpers) {
    const { fileName, fileSize, originalEntries, totalUncompressedSize } = helpers.getState();
    
    const html = `
      <div class="p-4 max-w-6xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.rar archive</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${formatSize(totalUncompressedSize)} uncompressed</span>
        </div>

        <!-- SEARCH BOX (Format-specific excellence) -->
        <div class="relative mb-6">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
          <input 
            type="text" 
            id="rar-search" 
            placeholder="Search files by name or path..." 
            class="block w-full pl-10 pr-3 py-2.5 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm"
          >
        </div>

        <!-- U10: Section Header -->
        <div class="flex items-center justify-between mb-3 px-1">
          <h3 class="font-semibold text-surface-800">Archive Contents</h3>
          <span id="entry-count" class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${originalEntries.length} items</span>
        </div>

        <!-- U7: Table Wrapper -->
        <div id="table-container" class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          ${renderTable(originalEntries)}
        </div>
      </div>
    `;

    helpers.render(html);
    attachEventListeners(helpers);
  }

  function renderTable(entries) {
    if (entries.length === 0) {
      return `
        <div class="py-12 text-center">
          <svg class="mx-auto h-12 w-12 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <p class="mt-4 text-surface-500">No matching files found</p>
        </div>
      `;
    }

    // B7: Large file handling - truncate view if too many items
    const MAX_VISIBLE = 500;
    const itemsToShow = entries.slice(0, MAX_VISIBLE);
    const hasMore = entries.length > MAX_VISIBLE;

    // U7: Table UI
    return `
      <table class="min-w-full text-sm divide-y divide-surface-200">
        <thead>
          <tr class="bg-surface-50">
            <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name / Path</th>
            <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
            <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-surface-100">
          ${itemsToShow.map(entry => {
            const isDir = entry.file.type === 'directory';
            const fileName = entry.path.split('/').pop() || entry.path;
            const dirPath = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/') + 1) : '';
            
            return `
              <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                <td class="px-4 py-2.5 text-surface-700">
                  <div class="flex items-center">
                    <span class="mr-3 text-lg leading-none">${isDir ? '📁' : getFileIcon(fileName)}</span>
                    <div class="flex flex-col min-w-0">
                      <span class="font-medium text-surface-900 truncate" title="${escapeHtml(entry.path)}">${escapeHtml(fileName)}</span>
                      ${dirPath ? `<span class="text-[10px] text-surface-400 truncate font-mono">${escapeHtml(dirPath)}</span>` : ''}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2.5 text-right font-mono text-surface-500 whitespace-nowrap">
                  ${isDir ? '<span class="text-surface-300">—</span>' : formatSize(entry.size)}
                </td>
                <td class="px-4 py-2.5 text-center">
                  ${isDir ? '' : `
                    <button 
                      class="extract-btn inline-flex items-center justify-center p-1.5 text-brand-600 hover:bg-brand-100 rounded-lg transition-colors" 
                      data-path="${escapeHtml(entry.path)}"
                      title="Download file"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                    </button>
                  `}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      ${hasMore ? `
        <div class="p-4 bg-surface-50 text-center border-t border-surface-200">
          <p class="text-sm text-surface-500">Showing first ${MAX_VISIBLE} of ${entries.length} items. Use search to find specific files.</p>
        </div>
      ` : ''}
    `;
  }

  function attachEventListeners(helpers) {
    const root = helpers.getRenderEl();
    const searchInput = root.querySelector('#rar-search');
    
    // Search functionality
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const { originalEntries } = helpers.getState();
        
        const filtered = originalEntries.filter(entry => 
          entry.path.toLowerCase().includes(query)
        );
        
        helpers.setState('filteredEntries', filtered);
        
        // Update Table
        const tableContainer = root.querySelector('#table-container');
        const countBadge = root.querySelector('#entry-count');
        
        if (tableContainer) tableContainer.innerHTML = renderTable(filtered);
        if (countBadge) countBadge.textContent = `${filtered.length} items`;
        
        // Re-attach download listeners since we re-rendered the table
        attachDownloadListeners(helpers);
      });
    }

    attachDownloadListeners(helpers);
  }

  function attachDownloadListeners(helpers) {
    const root = helpers.getRenderEl();
    root.querySelectorAll('.extract-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const path = this.dataset.path;
        const { originalEntries } = helpers.getState();
        const entry = originalEntries.find(e => e.path === path);
        if (!entry) return;

        const originalHtml = this.innerHTML;
        this.innerHTML = `
          <svg class="animate-spin h-5 w-5 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        `;
        this.disabled = true;

        try {
          // U6: Loading state for heavy operation
          const blob = await entry.extract();
          const filename = path.split('/').pop() || 'extracted-file';
          helpers.download(filename, blob);
          
          this.innerHTML = '<svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
          
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.disabled = false;
          }, 2000);
        } catch (err) {
          console.error('[RAR Extraction Error]', err);
          this.innerHTML = '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
          helpers.showError('Extraction Failed', `Could not extract "${path}". The archive might be corrupt or encrypted.`);
          
          setTimeout(() => {
            this.innerHTML = originalHtml;
            this.disabled = false;
          }, 3000);
        }
      });
    });
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄',
      doc: '📝', docx: '📝',
      xls: '📊', xlsx: '📊',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️',
      mp3: '🎵', wav: '🎵', flac: '🎵',
      mp4: '🎬', mkv: '🎬', mov: '🎬',
      zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
      txt: '📄', md: '📝',
      js: '📜', ts: '📜', html: '🌐', css: '🎨', json: '⚙️'
    };
    return icons[ext] || '📄';
  }

})();
