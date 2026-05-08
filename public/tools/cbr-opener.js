/**
 * OmniOpener — CBR/CBZ Comic Archive Viewer
 * Uses OmniTool SDK. Supports viewing CBZ (ZIP) and CBR (RAR) archives.
 */
(function () {
  'use strict';

  let _blobUrls = [];

  /**
   * Cleans up blob URLs to prevent memory leaks.
   */
  function cleanup() {
    _blobUrls.forEach(url => URL.revokeObjectURL(url));
    _blobUrls = [];
  }

  /**
   * Simple HTML escaping.
   */
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Formats bytes into human-readable string.
   */
  function fmtBytes(b) {
    if (b === 0) return '0 B';
    if (!b || isNaN(b)) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Tool Initialization
   */
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbr,.cbz,.rar,.zip',
      binary: true,
      dropLabel: 'Drop a CBR or CBZ comic here',
      infoHtml: '<strong>Privacy:</strong> All comic processing happens in your browser using WebAssembly. Files are never uploaded.',

      actions: [
        {
          label: '🖼️ Gallery View',
          id: 'view-gallery',
          onClick: function (h) {
            h.setState('view', 'gallery');
            renderUI(h);
          }
        },
        {
          label: '📜 Scroll View',
          id: 'view-scroll',
          onClick: function (h) {
            h.setState('view', 'scroll');
            renderUI(h);
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function (h) {
            const f = h.getFile();
            if (f) h.download(f.name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.setState({ view: 'gallery', pages: [] });
        return loadDeps(h);
      },

      onFile: function _onFile(file, content, h) {
        if (typeof JSZip === 'undefined' || typeof Archive === 'undefined') {
          h.showLoading('Loading comic engines...');
          loadDeps(h).then(() => _onFile(file, content, h));
          return;
        }
        processArchive(file, content, h);
      },

      onDestroy: cleanup
    });
  };

  /**
   * Loads required libraries from CDN.
   */
  function loadDeps(h) {
    return Promise.all([
      h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'),
      h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js').then(() => {
        if (window.Archive) {
          Archive.init({
            workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
          });
        }
      })
    ]);
  }

  /**
   * Analyzes and extracts images from the archive.
   */
  async function processArchive(file, content, h) {
    cleanup();
    h.setState({ pages: [], fileName: file.name, fileSize: file.size });
    h.showLoading('Analyzing comic archive...');

    try {
      const bytes = new Uint8Array(content);
      const isZip = (bytes[0] === 0x50 && bytes[1] === 0x4B);
      const isRar = (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72);

      let pages = [];
      if (isZip) {
        pages = await extractZip(content, h);
      } else if (isRar) {
        pages = await extractRar(content, h);
      } else {
        // Fallback: try ZIP first, then RAR
        try {
          pages = await extractZip(content, h);
        } catch (e) {
          pages = await extractRar(content, h);
        }
      }

      if (!pages || pages.length === 0) {
        throw new Error('No images found in the archive. Supported: JPG, PNG, WEBP, GIF, BMP, AVIF.');
      }

      _blobUrls = pages.map(p => p.url);
      h.setState('pages', pages);
      renderUI(h);
    } catch (err) {
      console.error('[cbr-opener] Error:', err);
      h.showError('Failed to open comic', err.message);
    }
  }

  /**
   * Extracts images from a ZIP (CBZ) archive.
   */
  async function extractZip(content, h) {
    const zip = await JSZip.loadAsync(content);
    const entries = [];
    zip.forEach((path, entry) => {
      if (!entry.dir && /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(path)) {
        entries.push({ path, entry });
      }
    });
    
    if (entries.length === 0) return [];
    
    // Natural sort by path
    entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

    const pages = [];
    for (let i = 0; i < entries.length; i++) {
      if (i % 5 === 0) h.showLoading(`Extracting page ${i + 1} of ${entries.length}...`);
      const blob = await entries[i].entry.async('blob');
      pages.push({
        url: URL.createObjectURL(blob),
        name: entries[i].path.split('/').pop()
      });
    }
    return pages;
  }

  /**
   * Extracts images from a RAR (CBR) archive.
   */
  async function extractRar(content, h) {
    const blob = new Blob([content]);
    const archive = await Archive.open(blob);
    const list = await archive.getFilesArray();
    const entries = list.filter(item => {
      const isDir = item.path.endsWith('/') || (item.file.size === 0 && !item.path.includes('.'));
      return !isDir && /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(item.path);
    });

    if (entries.length === 0) return [];

    // Natural sort by path
    entries.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

    const pages = [];
    for (let i = 0; i < entries.length; i++) {
      if (i % 5 === 0) h.showLoading(`Extracting page ${i + 1} of ${entries.length}...`);
      const extractedBlob = await entries[i].file.extract();
      pages.push({
        url: URL.createObjectURL(extractedBlob),
        name: entries[i].path.split('/').pop()
      });
    }
    return pages;
  }

  /**
   * Renders the interactive comic viewer UI.
   */
  function renderUI(h) {
    const state = h.getState();
    const pages = state.pages || [];
    if (pages.length === 0) return;

    const view = state.view || 'gallery';

    let html = `
      <div class="p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-surface-200 pb-6">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600 shadow-inner">
              <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
            <div>
              <h3 class="text-xl font-black text-surface-900 tracking-tight">${esc(state.fileName)}</h3>
              <p class="text-sm text-surface-500 font-medium">${pages.length} Pages • ${fmtBytes(state.fileSize)}</p>
            </div>
          </div>
        </div>
    `;

    if (view === 'gallery') {
      html += `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          ${pages.map((p, i) => `
            <div class="group relative aspect-[2/3] bg-surface-50 rounded-xl overflow-hidden border border-surface-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-zoom-in" onclick="window.open('${p.url}')">
              <img src="${p.url}" class="w-full h-full object-cover" loading="lazy" alt="Page ${i + 1}">
              <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <p class="text-[10px] text-white text-center truncate font-bold tracking-wide">${esc(p.name)}</p>
              </div>
              <div class="absolute top-2 right-2 bg-brand-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black shadow-lg shadow-brand-500/50 backdrop-blur-sm">#${i + 1}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="flex flex-col items-center gap-12 max-w-4xl mx-auto">
          ${pages.map((p, i) => `
            <div class="w-full space-y-4">
              <div class="bg-white rounded-2xl overflow-hidden border border-surface-200 shadow-2xl ring-1 ring-surface-900/5">
                <img src="${p.url}" class="w-full h-auto block" loading="lazy">
              </div>
              <div class="flex items-center justify-center gap-4">
                <span class="h-px bg-surface-200 flex-grow"></span>
                <p class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] whitespace-nowrap">Page ${i + 1} of ${pages.length}</p>
                <span class="h-px bg-surface-200 flex-grow"></span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `</div>`;
    h.render(html);
  }

})();
