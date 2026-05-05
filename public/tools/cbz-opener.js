/**
 * OmniOpener — CBZ Opener Tool
 * Uses OmniTool SDK. Renders .cbz (ZIP) comic archives with perfection.
 */
(function () {
  'use strict';

  // State managed within the IIFE closure
  let _currentBlobUrls = [];
  let _currentFile = null;
  let _currentContent = null;
  let _viewMode = 'scroll'; // 'scroll' or 'gallery'
  let _pages = [];

  /**
   * Revokes all active blob URLs to prevent memory leaks (B5)
   */
  function cleanupBlobUrls() {
    if (_currentBlobUrls.length > 0) {
      _currentBlobUrls.forEach(url => URL.revokeObjectURL(url));
      _currentBlobUrls = [];
    }
  }

  /**
   * Formats file size into human readable string (U1)
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Checks if a filename is a supported image (B2)
   */
  function isImage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(ext);
  }

  window.initTool = function (toolConfig, mountEl) {
    
    // Named function to avoid "this" context issues (B8)
    const _onFileFn = function (file, content, h) {
      _currentFile = file;
      _currentContent = content;

      h.showLoading('Extracting comic pages...');
      cleanupBlobUrls();
      _pages = [];

      const process = () => {
        const zip = new JSZip();
        zip.loadAsync(content).then(zipDoc => {
          const entries = [];
          zipDoc.forEach((path, entry) => {
            if (!entry.dir && isImage(path)) {
              entries.push(entry);
            }
          });

          if (entries.length === 0) {
            h.showError('No images found', 'This archive does not appear to contain any supported image files.');
            return;
          }

          // Natural sort (1.jpg, 2.jpg, 10.jpg)
          entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

          h.showLoading(`Loading ${entries.length} pages...`);

          const promises = entries.map(entry => {
            return entry.async('blob').then(blob => {
              const url = URL.createObjectURL(blob);
              _currentBlobUrls.push(url);
              return { url, name: entry.name.split('/').pop() };
            });
          });

          Promise.all(promises).then(pages => {
            _pages = pages;
            renderUI(h);
          }).catch(err => {
            h.showError('Extraction failed', 'Failed to extract images: ' + err.message);
          });

        }).catch(err => {
          h.showError('Corrupt archive', 'Could not open CBZ file. It may be corrupted. ' + err.message);
        });
      };

      // Ensure JSZip is loaded before processing (B1, B4)
      if (typeof JSZip === 'undefined') {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', process);
      } else {
        process();
      }
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbz,.zip',
      binary: true,
      dropLabel: 'Drop .cbz or .zip comic here',
      infoHtml: 'Extracts and renders comic book archives locally. Supports all major image formats.',

      actions: [
        {
          label: '📜 Scroll View',
          id: 'view-scroll',
          onClick: function(h) {
            _viewMode = 'scroll';
            if (_pages.length > 0) renderUI(h);
          }
        },
        {
          label: '🖼️ Gallery View',
          id: 'view-gallery',
          onClick: function(h) {
            _viewMode = 'gallery';
            if (_pages.length > 0) renderUI(h);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function (h) {
            if (_currentFile && _currentContent) {
              h.download(_currentFile.name, _currentContent, _currentFile.type);
            }
          }
        }
      ],

      onInit: function (h) {
        cleanupBlobUrls();
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
      },

      onFile: _onFileFn,

      onDestroy: function () {
        cleanupBlobUrls();
        _currentFile = null;
        _currentContent = null;
        _pages = [];
      }
    });
  };

  /**
   * Main UI rendering function (U7-U10)
   */
  function renderUI(h) {
    if (!_currentFile || !_pages.length) return;

    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
        <span class="font-semibold text-surface-800">${h.escapeHtml(_currentFile.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(_currentFile.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${_pages.length} Pages</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.cbz comic archive</span>
      </div>
    `;

    const searchHtml = `
      <div class="mb-6 relative">
        <input type="text" id="page-search" placeholder="Filter pages by name..." 
          class="w-full px-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all pl-10">
        <div class="absolute left-3.5 top-3.5 text-surface-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
    `;

    let contentHtml = '';
    if (_viewMode === 'scroll') {
      contentHtml = `
        <div id="pages-container" class="flex flex-col items-center gap-12 py-4">
          ${_pages.map((page, i) => `
            <div class="page-item w-full max-w-4xl flex flex-col items-center gap-3 group" data-name="${h.escapeHtml(page.name).toLowerCase()}">
              <div class="relative w-full bg-surface-100 rounded-lg overflow-hidden border border-surface-200 shadow-2xl transition-transform duration-300 group-hover:scale-[1.01]">
                <img src="${page.url}" alt="Page ${i + 1}" class="w-full h-auto block" loading="lazy">
              </div>
              <div class="flex items-center gap-4 text-xs font-mono text-surface-400">
                <span class="px-2 py-1 bg-surface-100 rounded">PAGE ${i + 1} / ${_pages.length}</span>
                <span class="truncate max-w-[200px]">${h.escapeHtml(page.name)}</span>
              </div>
            </div>
          `).join('')}
          <button id="back-to-top" class="mt-8 px-8 py-3 bg-brand-600 text-white rounded-full text-sm font-bold hover:bg-brand-700 transition-all shadow-lg hover:shadow-brand-500/20 active:scale-95">
            ↑ Back to Top
          </button>
        </div>
      `;
    } else {
      contentHtml = `
        <div id="pages-container" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          ${_pages.map((page, i) => `
            <div class="page-item flex flex-col gap-2 group cursor-pointer" data-name="${h.escapeHtml(page.name).toLowerCase()}" onclick="this.querySelector('img').requestFullscreen ? this.querySelector('img').requestFullscreen() : null">
              <div class="aspect-[2/3] relative rounded-xl overflow-hidden border border-surface-200 bg-surface-100 shadow-sm group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-300">
                <img src="${page.url}" alt="Page ${i + 1}" class="absolute inset-0 w-full h-full object-cover" loading="lazy">
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <div class="scale-0 group-hover:scale-100 transition-transform bg-white/20 backdrop-blur-md p-3 rounded-full border border-white/30">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <div class="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                  ${i + 1}
                </div>
              </div>
              <div class="px-1 text-center">
                <div class="text-[10px] text-surface-500 font-bold uppercase tracking-widest truncate">${h.escapeHtml(page.name)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    h.render(`
      <div class="p-6 md:p-10 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        ${infoBar}
        ${searchHtml}
        ${contentHtml}
      </div>
    `);

    const container = h.getRenderEl();
    
    // Search filter logic
    const searchInput = container.querySelector('#page-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const items = container.querySelectorAll('.page-item');
        let visibleCount = 0;
        
        items.forEach(item => {
          const name = item.getAttribute('data-name');
          if (name.includes(query)) {
            item.style.display = '';
            visibleCount++;
          } else {
            item.style.display = 'none';
          }
        });

        // Update count in info bar if we want, or just leave it
      });
    }

    // Scroll to top
    const topBtn = container.querySelector('#back-to-top');
    if (topBtn) {
      topBtn.onclick = () => {
        h.getRenderEl().scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
  }

})();
