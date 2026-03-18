(function() {
  'use strict';

  /**
   * OmniOpener — AVIF Image Viewer
   * Production-grade AVIF renderer with zoom, metadata analysis, and export tools.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avif',
      dropLabel: 'Drop an AVIF image here',
      binary: true,
      onInit: function(helpers) {
        // Initialize persistent state
        helpers.setState('objectUrl', null);
        helpers.setState('currentImg', null);
        helpers.setState('confirmedLarge', false);
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Preparing image...');

        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'This AVIF file contains no data.');
          return;
        }

        // B7: Large file handling (> 30MB)
        if (file.size > 30 * 1024 * 1024 && !helpers.getState().confirmedLarge) {
          helpers.render(`
            <div class="p-12 text-center max-w-lg mx-auto">
              <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 text-amber-500 mb-6">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <h3 class="text-xl font-bold text-surface-900 mb-3">Large Image File</h3>
              <p class="text-surface-600 mb-8">This AVIF image is ${formatSize(file.size)}. High-resolution images may consume significant memory and slow down your browser.</p>
              <button id="proceed-large-btn" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 transition-all shadow-sm">
                Load Image Anyway
              </button>
            </div>
          `);

          const btn = document.getElementById('proceed-large-btn');
          if (btn) {
            btn.onclick = () => {
              helpers.setState('confirmedLarge', true);
              processAvif(file, content, helpers);
            };
          }
          return;
        }

        processAvif(file, content, helpers);
      },
      actions: [
        {
          label: '📥 Download as PNG',
          id: 'dl-png',
          onClick: function(helpers) {
            const img = helpers.getState().currentImg;
            if (!img) return;
            
            helpers.showLoading('Converting to PNG...');
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob(function(blob) {
              if (blob) {
                const name = (helpers.getFile().name || 'image').replace(/\.avif$/i, '') + '.png';
                helpers.download(name, blob, 'image/png');
              }
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy to Clipboard',
          id: 'copy-img',
          onClick: function(helpers, btn) {
            const img = helpers.getState().currentImg;
            if (!img) return;

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(function(blob) {
              if (!blob) return;
              try {
                const data = [new ClipboardItem({ 'image/png': blob })];
                navigator.clipboard.write(data).then(() => {
                  const originalText = btn.innerHTML;
                  btn.innerHTML = '✓ Copied!';
                  setTimeout(() => { btn.innerHTML = originalText; }, 2000);
                }).catch(err => {
                  helpers.showError('Clipboard Error', 'Failed to copy image: ' + err.message);
                });
              } catch (err) {
                helpers.showError('Not Supported', 'Your browser does not support direct image copying.');
              }
            }, 'image/png');
          }
        }
      ]
    });
  };

  /**
   * Main processing logic
   */
  function processAvif(file, content, helpers) {
    // U2: Descriptive loading message
    helpers.showLoading('Rendering AVIF image...');

    // B5: Memory leak prevention - Revoke old object URL
    const oldUrl = helpers.getState().objectUrl;
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    const blob = new Blob([content], { type: 'image/avif' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    // B3: Proper callback/async chain
    img.onload = function() {
      helpers.setState('currentImg', img);
      helpers.setState('objectUrl', url);
      renderView(file, img, url, helpers);
    };

    img.onerror = function() {
      URL.revokeObjectURL(url);
      // U3: Friendly error message
      helpers.showError(
        'Could not open AVIF file',
        'The file may be corrupted or your browser does not support the AVIF format. Try using a modern browser like Chrome or Firefox.'
      );
    };

    img.src = url;
  }

  /**
   * Render the main tool UI
   */
  function renderView(file, img, url, helpers) {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const aspectRatio = (width / height).toFixed(2);
    const megaPixels = ((width * height) / 1000000).toFixed(1);

    const html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.avif image</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <!-- Main Preview Area -->
          <div class="lg:col-span-3 space-y-4">
            <div class="rounded-2xl border border-surface-200 overflow-hidden bg-surface-100 flex items-center justify-center p-4 md:p-8 min-h-[500px] shadow-inner">
              <div class="relative shadow-2xl rounded-lg overflow-hidden bg-white bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uAnP+PgsZaG95ACpCjGBxpAbBoMmoYBBgx8CAfAnS7IAABU7QAfSTC99wAAAABJRU5ErkJggg==')] transition-all duration-300" style="line-height: 0;">
                <img src="${url}" id="view-preview-img" class="max-w-full h-auto transition-transform duration-200" style="display: block; transform: scale(1); transform-origin: center;">
                <div class="absolute inset-0 border border-black/5 pointer-events-none"></div>
              </div>
            </div>

            <!-- U4: At least 2 action buttons (Zoom In/Out/Reset) -->
            <div class="flex items-center justify-center gap-3 bg-white p-2 rounded-2xl border border-surface-100 shadow-sm w-fit mx-auto">
              <button id="view-zoom-out" class="p-2.5 rounded-xl bg-surface-50 text-surface-600 hover:bg-surface-100 transition-colors" title="Zoom Out">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
              </button>
              <div class="px-2 min-w-[60px] text-center">
                <span id="view-zoom-text" class="text-sm font-bold text-surface-700">100%</span>
              </div>
              <button id="view-zoom-in" class="p-2.5 rounded-xl bg-surface-50 text-surface-600 hover:bg-surface-100 transition-colors" title="Zoom In">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              </button>
              <div class="w-px h-6 bg-surface-200 mx-1"></div>
              <button id="view-zoom-reset" class="px-4 py-2 rounded-xl bg-surface-50 text-xs font-bold text-surface-700 hover:bg-surface-100 transition-colors uppercase tracking-wider">
                Reset
              </button>
            </div>
          </div>

          <!-- Metadata Sidebar -->
          <div class="space-y-6">
            <!-- U10: Section Header with Counts -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-surface-900 tracking-tight">Image Details</h3>
                <span class="text-[10px] uppercase font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded-md tracking-widest">Properties</span>
              </div>
              
              <div class="space-y-3">
                <!-- U9: Content Cards -->
                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                  <div class="text-[10px] text-surface-400 uppercase tracking-widest font-bold mb-1 group-hover:text-brand-500 transition-colors">Dimensions</div>
                  <div class="text-surface-800 font-semibold text-lg tracking-tight">${width} × ${height} <span class="text-surface-400 font-normal text-sm ml-1">px</span></div>
                </div>

                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                  <div class="text-[10px] text-surface-400 uppercase tracking-widest font-bold mb-1 group-hover:text-brand-500 transition-colors">Aspect Ratio</div>
                  <div class="text-surface-800 font-semibold text-lg tracking-tight">${aspectRatio}:1</div>
                </div>

                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                  <div class="text-[10px] text-surface-400 uppercase tracking-widest font-bold mb-1 group-hover:text-brand-500 transition-colors">Resolution</div>
                  <div class="text-surface-800 font-semibold text-lg tracking-tight">${megaPixels} <span class="text-surface-400 font-normal text-sm ml-1">Megapixels</span></div>
                </div>
              </div>
            </div>

            <!-- Format Information -->
            <div class="p-5 bg-surface-900 rounded-2xl text-white shadow-xl shadow-surface-200/50">
              <div class="flex items-center gap-2 mb-3">
                <div class="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <h4 class="font-bold text-sm tracking-tight">AVIF Format</h4>
              </div>
              <p class="text-xs text-surface-300 leading-relaxed font-medium">
                AVIF is a modern image format based on the AV1 video codec. It provides superior compression and higher image quality compared to JPEG, PNG, or WebP.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Zoom Logic
    let currentZoom = 100;
    const previewImg = document.getElementById('view-preview-img');
    const zoomText = document.getElementById('view-zoom-text');
    
    const updateZoom = (val) => {
      currentZoom = Math.max(10, Math.min(400, val));
      if (previewImg) {
        previewImg.style.transform = `scale(${currentZoom / 100})`;
      }
      if (zoomText) {
        zoomText.textContent = `${Math.round(currentZoom)}%`;
      }
    };

    document.getElementById('view-zoom-in')?.addEventListener('click', () => updateZoom(currentZoom * 1.2));
    document.getElementById('view-zoom-out')?.addEventListener('click', () => updateZoom(currentZoom * 0.8));
    document.getElementById('view-zoom-reset')?.addEventListener('click', () => updateZoom(100));
  }

})();
