(function() {
  'use strict';

  /**
   * OmniOpener ZIP Opener
   * A high-performance, browser-side ZIP extraction and inspection tool.
   */

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    let _lastPreviewUrl = null;
    let _zipInstance = null;
    let _zipFiles = [];
    let _searchTerm = '';

    const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';

    function revokeLastUrl() {
      if (_lastPreviewUrl) {
        URL.revokeObjectURL(_lastPreviewUrl);
        _lastPreviewUrl = null;
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.zip,.jar,.apk,.ipa,.war,.ear,.whl,.nupkg,.crate',
      dropLabel: 'Drop ZIP archive here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript(JSZIP_CDN);
      },
      onDestroy: function() {
        revokeLastUrl();
      },
      onFile: function _onFile(file, content, helpers) {
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Loading ZIP engine...');
          helpers.loadScript(JSZIP_CDN, function() {
            _onFile(file, content, helpers);
          });
          return;
        }

        if (!(content instanceof ArrayBuffer)) {
          helpers.showError('Invalid Content', 'The file content is not a valid binary buffer.');
          return;
        }

        processZip(file, content, helpers);
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            if (!_zipFiles.length) return;
            const list = _zipFiles.map(f => f.name).join('\n');
            helpers.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download List',
          id: 'dl-list',
          onClick: function(helpers) {
            if (!_zipFiles.length) return;
            const list = _zipFiles.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.download('file-list.txt', list, 'text/plain');
          }
        }
      ],
      infoHtml: '<strong>Security:</strong> Archive contents are processed entirely in your browser. No data is uploaded.'
    });

    async function processZip(file, content, helpers) {
      helpers.showLoading('Reading archive structure...');
      revokeLastUrl();

      try {
        const zip = await JSZip.loadAsync(content);
        _zipInstance = zip;
        
        const files = [];
        let totalUncompressedSize = 0;

        zip.forEach((relativePath, zipEntry) => {
          // JSZip internal uncompressed size access
          const size = zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0;
          files.push({
            name: zipEntry.name,
            size: size,
            date: zipEntry.date,
            dir: zipEntry.dir,
            entry: zipEntry
          });
          totalUncompressedSize += size;
        });

        // Sort: Directories first, then alphabetical
        files.sort((a, b) => {
          if (a.dir !== b.dir) return a.dir ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        _zipFiles = files;
        helpers.setState('fileName', file.name);
        helpers.setState('fileSize', file.size);
        helpers.setState('totalUncompressedSize', totalUncompressedSize);
        
        renderZip(helpers);
      } catch (err) {
        helpers.showError('Could not open ZIP file', 'The archive may be corrupted or in an unsupported format. Error: ' + err.message);
      }
    }

    function renderZip(helpers) {
      const state = helpers.getState();
      const filteredFiles = _searchTerm 
        ? _zipFiles.filter(f => f.name.toLowerCase().includes(_searchTerm.toLowerCase()))
        : _zipFiles;

      const maxRows = 1000;
      const displayFiles = filteredFiles.slice(0, maxRows);
      const isTruncated = filteredFiles.length > maxRows;

      const html = `
        <div class="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">ZIP Archive</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${formatSize(state.totalUncompressedSize)} uncompressed</span>
          </div>

          <!-- Search and Header -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-lg text-surface-800">Archive Contents</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">${_zipFiles.length} items</span>
            </div>
            
            <div class="relative group max-w-md w-full">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
              <input 
                type="text" 
                id="zip-search" 
                placeholder="Filter files by name..." 
                value="${esc(_searchTerm)}"
                class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none"
              >
            </div>
          </div>

          <!-- U7. Table Wrapper -->
          <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm text-left">
                <thead>
                  <tr class="bg-surface-50/50">
                    <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700 border-b border-surface-200">Name</th>
                    <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                    <th class="sticky top-0 px-4 py-3 font-semibold text-surface-700 border-b border-surface-200 w-40 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${displayFiles.length === 0 ? `
                    <tr>
                      <td colspan="3" class="px-4 py-12 text-center">
                        <div class="text-surface-400 mb-2">
                          <svg class="w-12 h-12 mx-auto opacity-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                        </div>
                        <p class="text-surface-500 font-medium">${_searchTerm ? 'No matches found for your search' : 'This archive appears to be empty'}</p>
                      </td>
                    </tr>
                  ` : displayFiles.map((f, i) => `
                    <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                      <td class="px-4 py-2.5 text-surface-700 truncate max-w-md flex items-center gap-3">
                        <span class="text-lg opacity-70">${f.dir ? '📁' : getFileIcon(f.name)}</span>
                        <span class="font-mono text-xs ${f.dir ? 'font-bold text-surface-900' : 'text-surface-600'}" title="${esc(f.name)}">${esc(f.name)}</span>
                      </td>
                      <td class="px-4 py-2.5 text-surface-500 font-mono text-[11px]">
                        ${f.dir ? '<span class="text-surface-300">—</span>' : formatSize(f.size)}
                      </td>
                      <td class="px-4 py-2.5 text-right space-x-1">
                        ${f.dir ? '' : `
                          <button 
                            class="preview-btn inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600 hover:bg-brand-100 rounded-lg transition-colors"
                            data-name="${esc(f.name)}"
                          >Preview</button>
                          <button 
                            class="download-btn inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-surface-600 hover:bg-surface-200 rounded-lg transition-colors"
                            data-name="${esc(f.name)}"
                          >Download</button>
                        `}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ${isTruncated ? `
              <div class="px-4 py-3 bg-amber-50 border-t border-surface-200 text-center text-xs text-amber-700 font-medium">
                Showing first ${maxRows} of ${filteredFiles.length} files. Use search to find specific items.
              </div>
            ` : ''}
          </div>

          <!-- Preview Container (Hidden by default) -->
          <div id="preview-overlay" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 bg-surface-950/40 backdrop-blur-sm">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-surface-200">
              <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                <div class="flex items-center gap-4">
                  <span id="preview-icon-lg" class="text-2xl">📄</span>
                  <div>
                    <h4 id="preview-filename-lg" class="text-sm font-bold text-surface-900 truncate max-w-md"></h4>
                    <p id="preview-meta-lg" class="text-[10px] text-surface-500 font-bold uppercase tracking-widest"></p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button id="preview-copy-btn" class="hidden p-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Copy Content">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                  </button>
                  <button id="preview-close-btn" class="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
              <div id="preview-body" class="flex-1 overflow-auto bg-white p-6 min-h-[400px]">
                <!-- Dynamic Content -->
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      // Search functionality
      const searchInput = document.getElementById('zip-search');
      if (searchInput) {
        searchInput.focus();
        // Restore cursor position
        const val = searchInput.value;
        searchInput.setSelectionRange(val.length, val.length);

        searchInput.addEventListener('input', (e) => {
          _searchTerm = e.target.value;
          renderZip(helpers);
        });
      }

      // Action Listeners
      const renderEl = helpers.getRenderEl();
      renderEl.querySelectorAll('.preview-btn').forEach(btn => {
        btn.onclick = () => showPreview(btn.dataset.name, helpers);
      });

      renderEl.querySelectorAll('.download-btn').forEach(btn => {
        btn.onclick = () => downloadIndividualFile(btn.dataset.name, helpers);
      });

      // Modal management
      const overlay = document.getElementById('preview-overlay');
      const closeBtn = document.getElementById('preview-close-btn');
      if (closeBtn) closeBtn.onclick = hidePreview;
      if (overlay) {
        overlay.onclick = (e) => {
          if (e.target === overlay) hidePreview();
        };
      }
    }

    async function showPreview(name, helpers) {
      const file = _zipFiles.find(f => f.name === name);
      if (!file || file.dir) return;

      const overlay = document.getElementById('preview-overlay');
      const body = document.getElementById('preview-body');
      const title = document.getElementById('preview-filename-lg');
      const meta = document.getElementById('preview-meta-lg');
      const icon = document.getElementById('preview-icon-lg');
      const copyBtn = document.getElementById('preview-copy-btn');

      overlay.classList.remove('hidden');
      title.textContent = file.name;
      meta.textContent = formatSize(file.size);
      icon.textContent = getFileIcon(file.name);
      body.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full py-20 text-surface-400">
          <div class="animate-spin mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </div>
          <p class="text-sm font-medium">Extracting file content...</p>
        </div>
      `;
      copyBtn.classList.add('hidden');

      const ext = name.split('.').pop().toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg'].includes(ext);

      try {
        if (isImage) {
          const blob = await file.entry.async('blob');
          revokeLastUrl();
          _lastPreviewUrl = URL.createObjectURL(blob);
          body.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
              <img src="${_lastPreviewUrl}" class="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm border border-surface-100 bg-surface-50">
            </div>
          `;
        } else {
          // Check for likely text or binary
          const buffer = await file.entry.async('arraybuffer');
          const uint8 = new Uint8Array(buffer);
          
          let isText = true;
          // Sample first 1024 bytes for null bytes or high density of non-printable chars
          for (let i = 0; i < Math.min(uint8.length, 1024); i++) {
            if (uint8[i] === 0) {
              isText = false;
              break;
            }
          }

          if (isText) {
            const text = new TextDecoder().decode(buffer);
            body.innerHTML = `
              <div class="rounded-xl overflow-hidden border border-surface-200">
                <pre class="p-4 text-[13px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[65vh] whitespace-pre-wrap break-all">${esc(text)}</pre>
              </div>
            `;
            copyBtn.classList.remove('hidden');
            copyBtn.onclick = (e) => helpers.copyToClipboard(text, e.currentTarget);
          } else {
            body.innerHTML = `
              <div class="space-y-4">
                <div class="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-xs">
                  <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                  <span>Binary file detected. Showing hex dump of first 8KB.</span>
                </div>
                <div class="rounded-xl overflow-hidden border border-surface-200">
                  <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-tight">${generateHexDump(buffer.slice(0, 8192))}</pre>
                </div>
              </div>
            `;
          }
        }
      } catch (err) {
        body.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h5 class="text-surface-900 font-bold mb-1">Preview failed</h5>
            <p class="text-surface-500 text-sm max-w-md">${esc(err.message)}</p>
          </div>
        `;
      }
    }

    function hidePreview() {
      const overlay = document.getElementById('preview-overlay');
      if (overlay) overlay.classList.add('hidden');
      revokeLastUrl();
      const body = document.getElementById('preview-body');
      if (body) body.innerHTML = '';
    }

    async function downloadIndividualFile(name, helpers) {
      const file = _zipFiles.find(f => f.name === name);
      if (!file) return;
      helpers.showLoading(`Preparing ${name.split('/').pop()}...`);
      try {
        const blob = await file.entry.async('blob');
        helpers.download(name.split('/').pop(), blob);
      } catch (err) {
        helpers.showError('Download failed', err.message);
      }
    }

    function getFileIcon(name) {
      const ext = name.split('.').pop().toLowerCase();
      const icons = {
        'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'ico': '🖼️',
        'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵', 'm4a': '🎵',
        'mp4': '🎬', 'webm': '🎬', 'mov': '🎬', 'avi': '🎬', 'mkv': '🎬',
        'js': '📜', 'ts': '📜', 'py': '📜', 'java': '📜', 'c': '📜', 'cpp': '📜', 'rs': '📜', 'go': '📜',
        'php': '📜', 'rb': '📜', 'swift': '📜', 'kt': '📜', 'cs': '📜',
        'html': '🌐', 'css': '🎨', 'json': '📦', 'xml': '📄', 'md': '📝', 'txt': '📄',
        'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗', 'ppt': '📙', 'pptx': '📙',
        'exe': '⚙️', 'dll': '⚙️', 'so': '⚙️', 'dylib': '⚙️', 'bin': '⚙️',
        'zip': '📚', 'rar': '📚', '7z': '📚', 'tar': '📚', 'gz': '📚'
      };
      return icons[ext] || '📄';
    }

    function generateHexDump(buffer) {
      const bytes = new Uint8Array(buffer);
      let out = '';
      for (let i = 0; i < bytes.length; i += 16) {
        let line = i.toString(16).padStart(8, '0') + '  ';
        let ascii = '';
        for (let j = 0; j < 16; j++) {
          if (i + j < bytes.length) {
            const b = bytes[i + j];
            line += b.toString(16).padStart(2, '0') + ' ';
            ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            line += '   ';
          }
          if (j === 7) line += ' ';
        }
        out += line + ' |' + ascii + '|\n';
      }
      if (buffer.byteLength > 8192) out += '\n... (truncated for performance)';
      return out;
    }
  };

})();
