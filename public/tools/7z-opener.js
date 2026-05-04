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

    OmniTool.create(mountEl, toolConfig, {
      accept: '.7z',
      binary: true,
      
      onInit: function (h) {
        // Pre-load library for faster first use
        h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', () => {
          if (window.Archive) {
            Archive.init({
              workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
            });
          }
        });
      },

      // Use named function to avoid strict mode self-reference issues (B8)
      onFile: function _onFileHandler(file, content, h) {
        if (!window.Archive) {
          h.showLoading('Loading 7z engine (WASM)...');
          h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', () => {
            if (window.Archive) {
              Archive.init({
                workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
              });
              // Recursive call with name
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

    /**
     * Parse and display 7z contents
     */
    async function processArchive(file, content, h) {
      h.showLoading('Opening 7z archive...');
      
      try {
        // Ensure content is treated as binary (B2)
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

        // Sort: Directories first, then alphabetical
        processedFiles.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.path.localeCompare(b.path);
        });

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

    /**
     * Main Render Function
     */
    function renderUI(h) {
      const state = h.getState();
      const files = state.files || [];
      const searchTerm = (state.searchTerm || '').toLowerCase();
      const filtered = searchTerm 
        ? files.filter(f => f.path.toLowerCase().includes(searchTerm))
        : files;

      // U1: File Info Bar
      const infoBarHtml = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.7z archive</span>
          <div class="ml-auto flex items-center gap-2">
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${files.length} entries</span>
          </div>
        </div>
      `;

      // U10: Section header with search
      const searchHtml = `
        <div class="mb-4 relative">
          <input 
            type="text" 
            id="archive-search" 
            placeholder="Search files by name or path..." 
            value="${esc(state.searchTerm)}"
            class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none text-sm shadow-sm"
          >
          <span class="absolute left-3.5 top-3 text-surface-400">🔍</span>
          ${searchTerm ? `<button id="clear-search" class="absolute right-3 top-2.5 p-1 text-surface-400 hover:text-surface-600 transition-colors">✕</button>` : ''}
        </div>
      `;

      // U7: Table Wrapper
      const tableHtml = `
        <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
          <div class="overflow-x-auto max-h-[65vh]">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead class="bg-surface-50/80 backdrop-blur sticky top-0 z-10">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 uppercase tracking-wider text-[10px]">Name / Path</th>
                  <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 uppercase tracking-wider text-[10px] w-32">Size</th>
                  <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 uppercase tracking-wider text-[10px] w-40">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filtered.length > 0 ? filtered.map((f, idx) => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700 truncate max-w-md">
                      <div class="flex items-center gap-3">
                        <span class="text-lg shrink-0 w-6 text-center">${f.isDir ? '📁' : getFileIcon(f.path)}</span>
                        <div class="min-w-0">
                          <p class="font-medium truncate ${f.isDir ? 'text-surface-900' : 'text-surface-700'}" title="${esc(f.path)}">
                            ${esc(f.path)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono text-[11px] text-surface-500">
                      ${f.isDir ? '<span class="text-surface-300">DIR</span>' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-right space-x-1">
                      ${f.isDir ? '' : `
                        <button 
                          class="preview-btn px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-600 hover:bg-brand-100 rounded-lg transition-colors"
                          data-idx="${files.indexOf(f)}"
                        >Preview</button>
                        <button 
                          class="dl-btn px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
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
          ${searchHtml}
          ${tableHtml}
        </div>
      `);

      // Event Bindings
      const searchInput = document.getElementById('archive-search');
      if (searchInput) {
        searchInput.oninput = (e) => {
          h.setState('searchTerm', e.target.value);
          renderUI(h);
          // Restore focus and cursor position
          const input = document.getElementById('archive-search');
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        };
      }

      const clearBtn = document.getElementById('clear-search') || document.getElementById('reset-search');
      if (clearBtn) {
        clearBtn.onclick = () => {
          h.setState('searchTerm', '');
          renderUI(h);
        };
      }

      h.getRenderEl().querySelectorAll('.preview-btn').forEach(btn => {
        btn.onclick = () => {
          const file = files[parseInt(btn.dataset.idx)];
          handlePreview(file, h);
        };
      });

      h.getRenderEl().querySelectorAll('.dl-btn').forEach(btn => {
        btn.onclick = () => {
          const file = files[parseInt(btn.dataset.idx)];
          handleExtract(file, h);
        };
      });
    }

    /**
     * Preview extracted file
     */
    async function handlePreview(file, h) {
      h.showLoading(`Extracting ${file.name} for preview...`);
      try {
        const blob = await file.entry.extract();
        const ext = file.path.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext);
        
        // Modal UI
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12 bg-surface-900/70 backdrop-blur-md animate-in fade-in duration-300';
        modal.id = 'archive-preview-modal';
        
        let contentHtml = '';
        let showCopy = false;
        let textContent = '';

        if (isImage) {
          if (_lastPreviewUrl) URL.revokeObjectURL(_lastPreviewUrl);
          _lastPreviewUrl = URL.createObjectURL(blob);
          contentHtml = `<img src="${_lastPreviewUrl}" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl ring-1 ring-white/20">`;
        } else {
          const text = await blob.text();
          // B7: Truncate very large previews
          const isLarge = text.length > 500000;
          const displayText = isLarge ? text.slice(0, 500000) + '\n\n... [TRUNCATED DUE TO SIZE] ...' : text;
          
          const isBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 2000));
          if (isBinary) {
            contentHtml = `
              <div class="text-center p-12 bg-surface-50 rounded-2xl border border-surface-200 max-w-md">
                <div class="w-20 h-20 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">⚙️</div>
                <h5 class="text-lg font-bold text-surface-900 mb-2">Binary Content</h5>
                <p class="text-surface-500 mb-8">This file type cannot be previewed as text. You can download it to view locally.</p>
                <button id="modal-dl" class="w-full py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-all shadow-lg shadow-brand-200">Download File</button>
              </div>
            `;
          } else {
            contentHtml = `<pre class="p-6 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed rounded-xl w-full h-full whitespace-pre-wrap break-all border border-white/10">${esc(displayText)}</pre>`;
            showCopy = true;
            textContent = text;
          }
        }

        modal.innerHTML = `
          <div class="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden scale-in duration-300">
            <div class="px-6 py-5 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
              <div class="flex items-center gap-4 min-w-0">
                <span class="text-2xl shrink-0">${getFileIcon(file.path)}</span>
                <div class="min-w-0">
                  <h4 class="text-sm font-bold text-surface-900 truncate" title="${esc(file.path)}">${esc(file.path)}</h4>
                  <p class="text-[10px] text-surface-500 font-bold uppercase tracking-widest mt-0.5">${formatSize(file.size)}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                ${showCopy ? `<button id="modal-copy" class="p-2 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Copy Text Content">📋</button>` : ''}
                <button id="modal-dl-alt" class="p-2 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all" title="Download File">📥</button>
                <div class="w-px h-6 bg-surface-200 mx-1"></div>
                <button id="modal-close" class="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all text-xl">✕</button>
              </div>
            </div>
            <div class="flex-1 overflow-auto bg-surface-100/30 p-4 md:p-8 flex items-center justify-center">
              ${contentHtml}
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        h.hideLoading();

        // Modal Bindings
        const close = () => {
          document.body.removeChild(modal);
          if (_lastPreviewUrl && isImage) {
            URL.revokeObjectURL(_lastPreviewUrl);
            _lastPreviewUrl = null;
          }
        };

        document.getElementById('modal-close').onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };
        
        const dlBtn = document.getElementById('modal-dl') || document.getElementById('modal-dl-alt');
        if (dlBtn) dlBtn.onclick = () => h.download(file.name, blob);

        const copyBtn = document.getElementById('modal-copy');
        if (copyBtn) {
          copyBtn.onclick = () => h.copyToClipboard(textContent, copyBtn);
        }

      } catch (err) {
        h.hideLoading();
        h.showError('Preview Failed', 'Could not extract this file: ' + err.message);
      }
    }

    /**
     * Extract and download individual file
     */
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
