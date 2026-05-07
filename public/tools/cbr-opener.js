/**
 * OmniOpener — CBR/CBZ Comic Archive Viewer
 * Uses OmniTool SDK. Supports viewing CBZ (ZIP) archives and inspecting CBR (RAR) archives.
 */
(function () {
  'use strict';

  let _blobUrls = [];
  let _pages = [];
  let _currentFile = null;
  let _currentContent = null;

  /**
   * Cleans up blob URLs to prevent memory leaks.
   */
  function cleanup() {
    _blobUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    _blobUrls = [];
    _pages = [];
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
      infoHtml: '<strong>Privacy:</strong> All comic processing happens in your browser. Files are never uploaded.',

      actions: [
        {
          label: '🖼️ Gallery View',
          id: 'view-gallery',
          onClick: function (h) {
            h.setState('view', 'gallery');
            if (_pages.length) renderComicUI(h);
          }
        },
        {
          label: '📜 Scroll View',
          id: 'view-scroll',
          onClick: function (h) {
            h.setState('view', 'scroll');
            if (_pages.length) renderComicUI(h);
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function (h) {
            const f = h.getFile();
            if (f) h.download(f.name, h.getContent(), f.type);
          }
        }
      ],

      onInit: function (h) {
        h.setState('view', 'gallery');
        // Pre-load dependencies
        return h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: async function (file, content, h) {
        cleanup();
        _currentFile = file;
        _currentContent = content;
        
        h.showLoading('Analyzing comic archive...');
        
        const bytes = new Uint8Array(content);
        const isZip = (bytes[0] === 0x50 && bytes[1] === 0x4B);
        const isRar = (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72);

        if (isZip) {
          try {
            const zip = await JSZip.loadAsync(content);
            const imageEntries = [];
            zip.forEach(function (path, entry) {
              if (!entry.dir && /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(path)) {
                imageEntries.push({ path: path, entry: entry });
              }
            });

            // Natural sort pages
            imageEntries.sort(function (a, b) {
              return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
            });

            if (imageEntries.length === 0) {
              h.showError('No images found', 'The ZIP archive does not contain any supported images.');
              return;
            }

            for (const img of imageEntries) {
              const blob = await img.entry.async('blob');
              const url = URL.createObjectURL(blob);
              _blobUrls.push(url);
              _pages.push({ url: url, name: img.path.split('/').pop() });
            }

            renderComicUI(h);
          } catch (e) {
            h.showError('Archive Error', 'Failed to read ZIP archive: ' + e.message);
          }
        } else if (isRar) {
          renderRarMetadata(file, bytes, h);
        } else {
          h.showError('Unknown Format', 'The file magic bytes do not match a valid ZIP (CBZ) or RAR (CBR) archive.');
        }
      },

      onDestroy: cleanup
    });
  };

  /**
   * Renders the interactive comic viewer.
   */
  function renderComicUI(h) {
    if (!_pages.length) return;
    const view = h.getState().view || 'gallery';

    let html = `
      <div class="p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-surface-200 pb-4">
          <div>
            <h3 class="text-lg font-bold text-surface-900 truncate max-w-md">${esc(_currentFile.name)}</h3>
            <p class="text-xs text-surface-500 font-medium">${_pages.length} Pages • ${fmtBytes(_currentFile.size)} • CBZ Archive</p>
          </div>
        </div>
    `;

    if (view === 'gallery') {
      html += `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          ${_pages.map(function (p, i) {
            return `
              <div class="group relative aspect-[2/3] bg-surface-100 rounded-lg overflow-hidden border border-surface-200 shadow-sm hover:shadow-md transition-all cursor-zoom-in" onclick="window.open('${p.url}')">
                <img src="${p.url}" class="w-full h-full object-cover" loading="lazy" alt="Page ${i + 1}">
                <div class="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p class="text-[9px] text-white text-center truncate font-medium">${esc(p.name)}</p>
                </div>
                <div class="absolute top-1.5 right-1.5 bg-black/50 text-white text-[9px] px-2 py-0.5 rounded-full font-bold backdrop-blur-sm">#${i + 1}</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="flex flex-col items-center gap-10">
          ${_pages.map(function (p, i) {
            return `
              <div class="w-full max-w-3xl space-y-3">
                <div class="bg-surface-100 rounded-xl overflow-hidden border border-surface-200 shadow-2xl">
                  <img src="${p.url}" class="w-full h-auto block" loading="lazy">
                </div>
                <div class="flex items-center justify-center gap-3">
                  <span class="h-px bg-surface-200 flex-grow"></span>
                  <p class="text-[10px] font-black text-surface-400 uppercase tracking-widest whitespace-nowrap">Page ${i + 1} of ${_pages.length} — ${esc(p.name)}</p>
                  <span class="h-px bg-surface-200 flex-grow"></span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    html += `</div>`;
    h.render(html);
  }

  /**
   * Renders metadata and inspection tools for RAR-based CBR files.
   */
  async function renderRarMetadata(file, bytes, h) {
    const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
    const hashHex = Array.from(new Uint8Array(hashBuf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    
    h.render(`
      <div class="p-8 space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto">
        <div class="flex items-center gap-5 border-b border-surface-200 pb-8">
          <div class="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center text-brand-600 shadow-inner">
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div>
            <h3 class="text-2xl font-black text-surface-900 tracking-tight">${esc(file.name)}</h3>
            <p class="text-sm text-surface-500 font-medium">CBR (RAR Comic Archive) • ${fmtBytes(file.size)}</p>
          </div>
        </div>

        <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900 flex gap-4 shadow-sm">
          <div class="shrink-0 w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div class="text-sm space-y-2">
            <p class="font-bold">RAR extraction is limited in browsers.</p>
            <p class="leading-relaxed opacity-90">This file is a genuine RAR archive. Browser-based extraction for RAR (especially RAR5) is complex. For viewing, we recommend desktop apps like <strong>YACReader</strong> or <strong>CDisplay Ex</strong>. You can also convert this to <strong>CBZ</strong> using an offline tool to view it here.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div class="bg-surface-50 p-5 rounded-2xl border border-surface-200 shadow-sm">
            <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] mb-3">Archive Hash</h4>
            <div>
              <p class="text-[10px] text-surface-400 font-bold uppercase mb-1.5">SHA-256 Fingerprint</p>
              <p class="font-mono text-[11px] break-all bg-white p-3 rounded-lg border border-surface-100 shadow-sm text-surface-700">${hashHex}</p>
            </div>
          </div>
          <div class="bg-surface-50 p-5 rounded-2xl border border-surface-200 shadow-sm">
            <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-[0.2em] mb-3">Format Specs</h4>
            <div class="space-y-2.5 text-sm">
              <div class="flex justify-between border-b border-surface-100 pb-1.5">
                <span class="text-surface-500 font-medium">Archive Type</span>
                <span class="font-bold text-surface-700">RAR</span>
              </div>
              <div class="flex justify-between border-b border-surface-100 pb-1.5">
                <span class="text-surface-500 font-medium">Extension</span>
                <span class="font-bold text-surface-700">.cbr</span>
              </div>
              <div class="flex justify-between">
                <span class="text-surface-500 font-medium">Magic Bytes</span>
                <span class="font-mono text-xs text-surface-700 font-bold">52 61 72 21</span>
              </div>
            </div>
          </div>
        </div>

        <div class="border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
          <div class="bg-surface-100 px-5 py-3 text-[10px] font-black text-surface-600 uppercase tracking-widest border-b">Header Preview (Hex Dump)</div>
          <pre class="p-6 font-mono text-[11px] leading-relaxed bg-white overflow-auto max-h-64 scrollbar-thin text-surface-700">${esc(generateHexDump(bytes.slice(0, 512)))}</pre>
        </div>
      </div>
    `);
  }

  /**
   * Generates a standard hex dump for data inspection.
   */
  function generateHexDump(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 16) {
      let line = i.toString(16).padStart(6, '0') + '  ';
      let ascii = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < bytes.length) {
          const b = bytes[i + j];
          line += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          line += '   ';
        }
      }
      out += line + ' |' + ascii + '|\n';
    }
    return out;
  }

})();
