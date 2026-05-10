(function() {
  'use strict';

  /**
   * OmniOpener ZIP Opener
   * A production-perfect browser-based ZIP tool using the OmniTool SDK.
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
    if (isNaN(bytes) || bytes === null) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    const JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    let _lastPreviewUrl = null;
    let _zipFiles = [];
    let _searchTerm = '';
    let _sortKey = 'name';
    let _sortDesc = false;

    function revokePreviewUrl() {
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
        revokePreviewUrl();
      },
      onFile: function _onFileFn(file, content, helpers) {
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Loading ZIP engine...');
          helpers.loadScript(JSZIP_CDN, function() {
            _onFileFn(file, content, helpers);
          });
          return;
        }

        if (!(content instanceof ArrayBuffer)) {
          helpers.showError('Invalid Content', 'The file content is not a valid binary buffer.');
          return;
        }

        processArchive(file, content, helpers);
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
            const blob = new Blob([list], { type: 'text/plain' });
            helpers.download('archive-file-list.txt', blob);
          }
        }
      ]
    });

    async function processArchive(file, content, helpers) {
      helpers.showLoading('Analyzing ZIP structure...');
      revokePreviewUrl();
      _searchTerm = '';

      try {
        const zip = await JSZip.loadAsync(content);
        const files = [];
        let totalUncompressed = 0;

        zip.forEach((path, entry) => {
          // JSZip v3 internal size access
          const uncompressedSize = entry._data ? entry._data.uncompressedSize : 0;
          files.push({
            name: entry.name,
            size: uncompressedSize,
            date: entry.date,
            dir: entry.dir,
            entry: entry
          });
          if (!entry.dir) totalUncompressed += uncompressedSize;
        });

        _zipFiles = files;
        
        helpers.setState('info', {
          name: file.name,
          size: file.size,
          uncompressed: totalUncompressed,
          count: files.length
        });

        renderTool(helpers);
      } catch (err) {
        helpers.showError('Failed to parse ZIP', 'The archive might be corrupted or uses an unsupported compression method. ' + err.message);
      }
    }

    function renderTool(helpers) {
      const info = helpers.getState('info');
      if (!info) return;

      const filtered = _zipFiles.filter(f => 
        f.name.toLowerCase().includes(_searchTerm.toLowerCase())
      );

      filtered.sort((a, b) => {
        let valA = a[_sortKey];
        let valB = b[_sortKey];
        
        if (typeof valA === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }
        
        if (valA < valB) return _sortDesc ? 1 : -1;
        if (valA > valB) return _sortDesc ? -1 : 1;
        return 0;
      });

      const maxDisplay = 1000;
      const displayList = filtered.slice(0, maxDisplay);

      const html = `
        <div class="p-4 md:p-6 max-w-6xl mx-auto">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(info.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(info.size)} compressed</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(info.uncompressed)} uncompressed</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">ZIP Archive</span>
          </div>

          <!-- Controls Header -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-surface-800">Archive Contents</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${info.count} items</span>
            </div>
            
            <div class="relative w-full md:w-80">
              <input 
                type="text" 
                id="zip-filter" 
                placeholder="Search files..." 
                value="${esc(_searchTerm)}"
                class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
              >
              <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
          </div>

          <!-- U7. Table -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/50">
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="name">
                    File Path ${getSortIcon('name')}
                  </th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-32" data-sort="size">
                    Size ${getSortIcon('size')}
                  </th>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-40">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${displayList.length === 0 ? `
                  <tr>
                    <td colspan="3" class="px-4 py-16 text-center text-surface-400">
                      ${_searchTerm ? 'No files match your search filter.' : 'This archive is empty.'}
                    </td>
                  </tr>
                ` : displayList.map(f => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700 truncate max-w-lg">
                      <div class="flex items-center gap-2">
                        <span class="text-lg flex-shrink-0">${f.dir ? '📁' : getFileIcon(f.name)}</span>
                        <span class="font-mono text-xs ${f.dir ? 'text-surface-900 font-bold' : 'text-surface-600'}" title="${esc(f.name)}">${esc(f.name)}</span>
                      </div>
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 font-mono text-[11px]">
                      ${f.dir ? '—' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-right space-x-1">
                      ${f.dir ? '' : `
                        <button class="preview-file px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600 hover:bg-brand-100 rounded-lg transition-colors" data-path="${esc(f.name)}">Preview</button>
                        <button class="download-file px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-surface-600 hover:bg-surface-200 rounded-lg transition-colors" data-path="${esc(f.name)}">Download</button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          ${filtered.length > maxDisplay ? `
            <div class="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-center text-xs font-medium">
              Showing first ${maxDisplay} of ${filtered.length} files. Use the search box to find specific entries.
            </div>
          ` : ''}

          <!-- Preview Modal -->
          <div id="zip-preview-modal" class="fixed inset-0 z-[100] hidden flex items-center justify-center p-4 bg-surface-950/40 backdrop-blur-sm">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-surface-200">
              <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                <div class="flex items-center gap-4 min-w-0">
                  <span id="preview-icon" class="text-2xl flex-shrink-0">📄</span>
                  <div class="min-w-0">
                    <h4 id="preview-name" class="text-sm font-bold text-surface-900 truncate"></h4>
                    <p id="preview-size" class="text-[10px] text-surface-500 font-bold uppercase tracking-widest"></p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button id="preview-copy" class="hidden p-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Copy Content">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                  </button>
                  <button id="preview-close" class="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
              <div id="preview-content" class="flex-1 overflow-auto bg-white p-6 min-h-[400px]"></div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      // Event Listeners
      const el = helpers.getRenderEl();
      
      const filterInput = el.querySelector('#zip-filter');
      if (filterInput) {
        filterInput.addEventListener('input', (e) => {
          _searchTerm = e.target.value;
          renderTool(helpers);
          // Maintain focus
          const input = document.getElementById('zip-filter');
          if (input) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        });
      }

      el.querySelectorAll('th[data-sort]').forEach(th => {
        th.onclick = () => {
          const key = th.dataset.sort;
          if (_sortKey === key) {
            _sortDesc = !_sortDesc;
          } else {
            _sortKey = key;
            _sortDesc = false;
          }
          renderTool(helpers);
        };
      });

      el.querySelectorAll('.preview-file').forEach(btn => {
        btn.onclick = () => handlePreview(btn.dataset.path, helpers);
      });

      el.querySelectorAll('.download-file').forEach(btn => {
        btn.onclick = () => handleDownload(btn.dataset.path, helpers);
      });

      const modal = el.querySelector('#zip-preview-modal');
      const closeBtn = el.querySelector('#preview-close');
      if (closeBtn) closeBtn.onclick = () => {
        modal.classList.add('hidden');
        revokePreviewUrl();
      };
      if (modal) {
        modal.onclick = (e) => {
          if (e.target === modal) {
            modal.classList.add('hidden');
            revokePreviewUrl();
          }
        };
      }
    }

    async function handlePreview(path, helpers) {
      const fileObj = _zipFiles.find(f => f.name === path);
      if (!fileObj) return;

      const modal = document.getElementById('zip-preview-modal');
      const content = document.getElementById('preview-content');
      const nameEl = document.getElementById('preview-name');
      const sizeEl = document.getElementById('preview-size');
      const iconEl = document.getElementById('preview-icon');
      const copyBtn = document.getElementById('preview-copy');

      modal.classList.remove('hidden');
      nameEl.textContent = path.split('/').pop();
      sizeEl.textContent = formatSize(fileObj.size);
      iconEl.textContent = getFileIcon(path);
      copyBtn.classList.add('hidden');
      
      content.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full py-20 text-surface-400">
          <div class="animate-spin mb-4 text-brand-500">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </div>
          <p class="text-sm font-medium">Extracting content...</p>
        </div>
      `;

      try {
        const ext = path.split('.').pop().toLowerCase();
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg'];
        
        if (imageExts.includes(ext)) {
          const blob = await fileObj.entry.async('blob');
          revokePreviewUrl();
          _lastPreviewUrl = URL.createObjectURL(blob);
          content.innerHTML = `
            <div class="flex items-center justify-center min-h-full">
              <img src="${_lastPreviewUrl}" class="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm border border-surface-100 bg-surface-50">
            </div>
          `;
        } else {
          const arrayBuffer = await fileObj.entry.async('arraybuffer');
          const isText = checkIfText(new Uint8Array(arrayBuffer.slice(0, 4096)));

          if (isText) {
            const text = new TextDecoder().decode(arrayBuffer);
            content.innerHTML = `
              <div class="rounded-xl overflow-hidden border border-surface-200">
                <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[65vh]">${esc(text)}</pre>
              </div>
            `;
            copyBtn.classList.remove('hidden');
            copyBtn.onclick = (e) => helpers.copyToClipboard(text, e.currentTarget);
          } else {
            content.innerHTML = `
              <div class="space-y-4">
                <div class="p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-xs flex gap-2 items-center">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                  Binary file detected. Showing hex dump (first 8KB).
                </div>
                <div class="rounded-xl overflow-hidden border border-surface-200">
                  <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-tight">${generateHex(arrayBuffer.slice(0, 8192))}</pre>
                </div>
              </div>
            `;
          }
        }
      } catch (err) {
        content.innerHTML = `
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <h5 class="text-surface-900 font-bold mb-1">Preview Failed</h5>
            <p class="text-surface-500 text-sm max-w-md">${esc(err.message)}</p>
          </div>
        `;
      }
    }

    async function handleDownload(path, helpers) {
      const fileObj = _zipFiles.find(f => f.name === path);
      if (!fileObj) return;

      helpers.showLoading(`Extracting ${path.split('/').pop()}...`);
      try {
        const blob = await fileObj.entry.async('blob');
        helpers.download(path.split('/').pop(), blob);
      } catch (err) {
        helpers.showError('Download Failed', err.message);
      }
    }

    function getSortIcon(key) {
      if (_sortKey !== key) return '<span class="opacity-20">⇅</span>';
      return _sortDesc ? '▼' : '▲';
    }

    function getFileIcon(name) {
      const ext = name.split('.').pop().toLowerCase();
      const map = {
        'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗', 'ppt': '📙', 'pptx': '📙',
        'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️', 'ico': '🖼️',
        'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'm4a': '🎵', 'flac': '🎵',
        'mp4': '🎬', 'webm': '🎬', 'mov': '🎬', 'avi': '🎬',
        'js': '📜', 'ts': '📜', 'html': '🌐', 'css': '🎨', 'json': '📦', 'xml': '📄', 'md': '📝', 'txt': '📄',
        'zip': '📚', 'rar': '📚', '7z': '📚', 'tar': '📚', 'gz': '📚'
      };
      return map[ext] || '📄';
    }

    function checkIfText(uint8) {
      for (let i = 0; i < uint8.length; i++) {
        if (uint8[i] === 0) return false;
      }
      return true;
    }

    function generateHex(buffer) {
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
      if (buffer.byteLength >= 8192) out += '\n... (truncated)';
      return out;
    }
  };
})();
