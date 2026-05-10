/**
 * OmniOpener — 7z Archive Toolkit
 * A high-performance, browser-based 7z extraction and viewing tool.
 * Powered by libarchive.js (WASM).
 */
(function () {
  'use strict';

  // Helper: Escape HTML to prevent XSS (B6)
  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Helper: Format Size (U1)
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes || isNaN(bytes)) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Helper: Get File Icon
  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      'pdf': '📕', 'doc': '📄', 'docx': '📄', 'xls': '📊', 'xlsx': '📊',
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️',
      'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
      'mp4': '🎬', 'webm': '🎬', 'mov': '🎬', 'avi': '🎬',
      'js': '📜', 'ts': '📜', 'json': '📦', 'xml': '📜', 'html': '🌐', 'css': '🎨', 'md': '📝',
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦', 'exe': '⚙️', 'dll': '⚙️'
    };
    return icons[ext] || '📄';
  }

  window.initTool = function (toolConfig, mountEl) {
    let _lastPreviewUrl = null;
    let _sortCol = 'path';
    let _sortDir = 1;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.7z',
      binary: true,
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', () => {
          if (window.Archive) {
            Archive.init({
              workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
            });
          }
        });
      },

      onFile: function _onFileHandler(file, content, h) {
        if (!window.Archive) {
          h.showLoading('Loading 7z engine (WASM)...');
          h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', function() {
            if (window.Archive) {
              Archive.init({
                workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
              });
              _onFileHandler(file, content, h);
            } else {
              h.showError('Engine Load Failed', 'The 7z extraction engine could not be loaded. Please check your internet connection.');
            }
          });
          return;
        }

        processArchive(file, content, h);
      },

      onDestroy: function() {
        if (_lastPreviewUrl) {
          URL.revokeObjectURL(_lastPreviewUrl);
          _lastPreviewUrl = null;
        }
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            const files = h.getState().files || [];
            if (files.length === 0) return;
            const list = files.map(f => f.path).join('\n');
            h.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Save Archive',
          id: 'download-archive',
          onClick: function (h) {
            const state = h.getState();
            h.download(state.fileName, state.content);
          }
        }
      ],
      
      infoHtml: '<strong>Secure & Private:</strong> Extraction happens entirely in your browser using WebAssembly. No files are uploaded to any server.'
    });

    async function processArchive(file, content, h) {
      h.showLoading('Opening 7z archive...');
      
      try {
        if (!(content instanceof ArrayBuffer)) {
          throw new Error('Invalid file content received. Expected ArrayBuffer.');
        }

        const blob = new Blob([content]);
        const archive = await Archive.open(blob);
        
        h.showLoading('Reading archive entries...');
        const list = await archive.getFilesArray();
        
        const processedFiles = list.map(item => ({
          name: item.file.name,
          path: item.path,
          size: item.file.size,
          entry: item.file,
          isDir: item.path.endsWith('/') || (item.file.size === 0 && !item.path.includes('.'))
        }));

        h.setState({
          files: processedFiles,
          fileName: file.name,
          fileSize: file.size,
          content: content,
          searchTerm: ''
        });

        renderUI(h);
      } catch (err) {
        console.error('[7z-opener] Error:', err);
        h.showError('Could not open 7z file', 'The archive may be corrupted, encrypted with a password, or in an unsupported format. Error: ' + err.message);
      }
    }

    function renderUI(h) {
      const state = h.getState();
      const files = state.files || [];
      const searchTerm = (state.searchTerm || '').toLowerCase();
      
      let filtered = searchTerm 
        ? files.filter(f => f.path.toLowerCase().includes(searchTerm))
        : [...files];

      // Sort logic
      filtered.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        let valA = a[_sortCol];
        let valB = b[_sortCol];
        if (typeof valA === 'string') {
          return valA.localeCompare(valB) * _sortDir;
        }
        return (valA - valB) * _sortDir;
      });

      // U1: File Info Bar
      const infoBarHtml = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.7z archive</span>
        </div>
      `;

      // U10: Section Header with Count and Search (Format Specific: Search box)
      const headerHtml = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-surface-800 text-lg">Archive Contents</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-bold">${files.length} items</span>
          </div>
          <div class="relative w-full md:w-80">
            <input 
              type="text" 
              id="archive-search" 
              placeholder="Filter by name or path..." 
              value="${esc(state.searchTerm)}"
              class="w-full pl-10 pr-10 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none text-sm shadow-sm"
            >
            <span class="absolute left-3.5 top-2.5 text-surface-400">🔍</span>
            ${searchTerm ? `<button id="clear-search" class="absolute right-3 top-2.5 p-1 text-surface-400 hover:text-surface-600 transition-colors">✕</button>` : ''}
          </div>
        </div>
      `;

      // U7: Table Implementation
      const tableHtml = `
        <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
          <div class="overflow-x-auto max-h-[60vh]">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead class="bg-surface-50/90 backdrop-blur-sm sticky top-0 z-10">
                <tr>
                  <th class="sortable px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-col="path">
                    Name / Path ${_sortCol === 'path' ? (_sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                  <th class="sortable px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-32" data-col="size">
                    Size ${_sortCol === 'size' ? (_sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                  <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-40">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filtered.length > 0 ? filtered.map((f, idx) => `
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700">
                      <div class="flex items-center gap-3">
                        <span class="text-lg shrink-0 w-6 text-center">${f.isDir ? '📁' : getFileIcon(f.path)}</span>
                        <div class="min-w-0">
                          <p class="font-medium truncate ${f.isDir ? 'text-surface-900 font-semibold' : 'text-surface-700'}" title="${esc(f.path)}">
                            ${esc(f.path)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono text-xs text-surface-500 whitespace-nowrap">
                      ${f.isDir ? '<span class="text-surface-300">DIR</span>' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-right space-x-1 whitespace-nowrap">
                      ${f.isDir ? '' : `
                        <button 
                          class="preview-btn px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600 hover:bg-brand-100 rounded-lg transition-colors"
                          data-idx="${files.indexOf(f)}"
                        >Preview</button>
                        <button 
                          class="dl-btn px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
                          data-idx="${files.indexOf(f)}"
                        >Get</button>
                      `}
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="3" class="px-4 py-16 text-center">
                      <div class="flex flex-col items-center">
                        <span class="text-4xl mb-4">📭</span>
                        <p class="text-surface-500 font-medium">${searchTerm ? 'No entries match your search' : 'This archive is empty'}</p>
                        ${searchTerm ? `<button id="reset-search" class="mt-4 text-brand-600 font-bold text-xs uppercase tracking-widest hover:underline">Clear Search</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;

      h.render(`
        <div class="p-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500">
          ${infoBarHtml}
          ${headerHtml}
          ${tableHtml}
        </div>
      `);

      // Event Bindings
      const searchInput = document.getElementById('archive-search');
      if (searchInput) {
        searchInput.oninput = function(e) {
          h.setState('searchTerm', e.target.value);
          renderUI(h);
          const input = document.getElementById('archive-search');
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        };
      }

      const clearBtn = document.getElementById('clear-search') || document.getElementById('reset-search');
      if (clearBtn) {
        clearBtn.onclick = function() {
          h.setState('searchTerm', '');
          renderUI(h);
        };
      }

      h.getRenderEl().querySelectorAll('.sortable').forEach(th => {
        th.onclick = function() {
          const col = th.dataset.col;
          if (_sortCol === col) {
            _sortDir *= -1;
          } else {
            _sortCol = col;
            _sortDir = 1;
          }
          renderUI(h);
        };
      });

      h.getRenderEl().querySelectorAll('.preview-btn').forEach(btn => {
        btn.onclick = function() {
          const file = files[parseInt(btn.dataset.idx)];
          handlePreview(file, h);
        };
      });

      h.getRenderEl().querySelectorAll('.dl-btn').forEach(btn => {
        btn.onclick = function() {
          const file = files[parseInt(btn.dataset.idx)];
          handleExtract(file, h);
        };
      });
    }

    async function handlePreview(file, h) {
      h.showLoading(`Extracting ${file.name} for preview...`);
      try {
        const blob = await file.entry.extract();
        const ext = file.path.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext);
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 bg-surface-900/80 backdrop-blur-sm animate-in fade-in duration-300';
        modal.id = 'archive-preview-modal';
        
        let contentHtml = '';
        let showCopy = false;
        let textContent = '';

        if (isImage) {
          if (_lastPreviewUrl) URL.revokeObjectURL(_lastPreviewUrl);
          _lastPreviewUrl = URL.createObjectURL(blob);
          contentHtml = `<img src="${_lastPreviewUrl}" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl">`;
        } else {
          const text = await blob.text();
          // B7: Truncate large content
          const isLarge = text.length > 500000;
          const displayText = isLarge ? text.slice(0, 500000) + '\n\n... [TRUNCATED DUE TO SIZE] ...' : text;
          
          const isBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 2000));
          if (isBinary) {
            contentHtml = `
              <div class="text-center p-12 bg-white rounded-3xl border border-surface-200 max-w-sm shadow-xl">
                <div class="w-16 h-16 bg-surface-100 text-surface-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">⚙️</div>
                <h5 class="text-lg font-bold text-surface-900 mb-2">Binary Content</h5>
                <p class="text-surface-500 mb-8 text-sm">This file cannot be previewed as text. Please download to view.</p>
                <button id="modal-dl" class="w-full py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-all">Download File</button>
              </div>
            `;
          } else {
            // U8: Code Blocks
            contentHtml = `
              <div class="rounded-xl overflow-hidden border border-surface-200 w-full h-full flex flex-col">
                <pre class="flex-1 p-6 text-xs font-mono bg-gray-950 text-gray-100 overflow-auto leading-relaxed whitespace-pre-wrap break-all">${esc(displayText)}</pre>
              </div>
            `;
            showCopy = true;
            textContent = text;
          }
        }

        modal.innerHTML = `
          <div class="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
              <div class="flex items-center gap-4 min-w-0">
                <span class="text-2xl shrink-0">${getFileIcon(file.path)}</span>
                <div class="min-w-0">
                  <h4 class="text-sm font-bold text-surface-900 truncate" title="${esc(file.path)}">${esc(file.path)}</h4>
                  <p class="text-[10px] text-surface-500 font-bold uppercase tracking-widest mt-0.5">${formatSize(file.size)}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                ${showCopy ? `<button id="modal-copy" class="p-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Copy text">📋</button>` : ''}
                <button id="modal-dl-alt" class="p-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Download">📥</button>
                <div class="w-px h-6 bg-surface-200 mx-1"></div>
                <button id="modal-close" class="p-2 text-surface-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all text-xl">✕</button>
              </div>
            </div>
            <div class="flex-1 overflow-hidden bg-surface-100/30 p-4 md:p-8 flex items-center justify-center">
              ${contentHtml}
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        h.hideLoading();

        const close = function() {
          document.body.removeChild(modal);
          if (_lastPreviewUrl && isImage) {
            URL.revokeObjectURL(_lastPreviewUrl);
            _lastPreviewUrl = null;
          }
        };

        document.getElementById('modal-close').onclick = close;
        modal.onclick = function(e) { if (e.target === modal) close(); };
        
        const dlBtn = document.getElementById('modal-dl') || document.getElementById('modal-dl-alt');
        if (dlBtn) dlBtn.onclick = function() { h.download(file.name, blob); };

        const copyBtn = document.getElementById('modal-copy');
        if (copyBtn) {
          copyBtn.onclick = function() { h.copyToClipboard(textContent, copyBtn); };
        }

      } catch (err) {
        h.hideLoading();
        h.showError('Preview Failed', 'Could not extract this file: ' + err.message);
      }
    }

    async function handleExtract(file, h) {
      h.showLoading(`Extracting ${file.name}...`);
      try {
        const blob = await file.entry.extract();
        h.download(file.name, blob);
        h.hideLoading();
      } catch (err) {
        h.hideLoading();
        h.showError('Extraction Failed', 'Failed to extract file: ' + err.message);
      }
    }
  };
})();
