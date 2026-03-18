(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ico',
      dropLabel: 'Drop a .ico file here',
      binary: true,
      onInit: function(helpers) {
        if (typeof ICO === 'undefined') {
          helpers.loadScript('https://cdn.jsdelivr.net/npm/icojs@0.19.1/dist/icojs.browser.js');
        }
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing ICO file...');

        const processICO = () => {
          if (typeof ICO === 'undefined') {
            helpers.showError('Library not loaded', 'Failed to load the ICO parsing library.');
            return;
          }

          ICO.parse(content).then(images => {
            if (!images || images.length === 0) {
              helpers.showError('No images found', 'The file might be corrupted or not a valid ICO.');
              return;
            }
            helpers.setState('images', images);
            renderICO(images, file, helpers);
          }).catch(err => {
            helpers.showError('Failed to parse ICO', err.message);
          });
        };

        if (typeof ICO === 'undefined') {
          helpers.loadScript('https://cdn.jsdelivr.net/npm/icojs@0.19.1/dist/icojs.browser.js', processICO);
        } else {
          processICO();
        }
      },
      actions: [
        {
          label: '📥 Download All as PNG',
          id: 'dl-all',
          onClick: function(helpers) {
            const images = helpers.getState().images;
            if (!images) return;
            images.forEach((img) => {
              const blob = new Blob([img.buffer], { type: 'image/png' });
              helpers.download(`${helpers.getFile().name.replace(/\.ico$/i, '')}-${img.width}x${img.height}.png`, blob, 'image/png');
            });
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl-orig',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'image/x-icon');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device. ICO files are parsed and extracted in your browser.'
    });
  };

  function renderICO(images, file, helpers) {
    const formatSize = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
    
    // Inject checkered background CSS
    helpers.loadCSS('data:text/css;base64,LmJnLWNoZWNrZXJlZCB7IGJhY2tncm91bmQtaW1hZ2U6IGNvbmljLWdyYWRpZW50KCNmMWY1ZjkgMjVkZWcsIHdoaXRlIDAgNTBkZWcsICNmMWY1ZjkgMCA3NWRlZywgd2hpdGUgMCApOyBiYWNrZ3JvdW5kLXNpemU6IDIwcHggMjBweDsgfQ==');

    let html = `
      <div class="p-4 md:p-6">
        <!-- File Info Bar -->
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
          <span class="font-medium">${file.name}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${images.length} icon sizes</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    `;

    images.forEach((img, i) => {
      const blob = new Blob([img.buffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      
      html += `
        <div class="flex flex-col items-center p-4 border border-surface-200 rounded-xl bg-white hover:bg-surface-50 transition-all shadow-sm">
          <div class="w-full aspect-square flex items-center justify-center bg-checkered rounded-lg mb-4 overflow-hidden border border-surface-100 p-2">
            <img src="${url}" class="max-w-full max-h-full object-contain" style="image-rendering: pixelated;" alt="${img.width}x${img.height}" />
          </div>
          <div class="text-center w-full">
            <p class="text-sm font-bold text-surface-900 mb-1">${img.width} × ${img.height}</p>
            <p class="text-xs text-surface-500 mb-3">${img.bpp || 32} bpp</p>
            <div class="flex flex-col gap-2">
              <button class="dl-single w-full px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-700 transition-colors" data-idx="${i}">Download PNG</button>
              <button class="copy-data w-full px-3 py-1.5 bg-white border border-surface-200 text-surface-700 rounded-lg text-xs font-medium hover:bg-surface-50 transition-colors" data-idx="${i}">Copy Data URL</button>
            </div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    helpers.render(html);

    // Bind events
    const renderEl = helpers.getRenderEl();
    renderEl.querySelectorAll('.dl-single').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        const img = images[idx];
        const blob = new Blob([img.buffer], { type: 'image/png' });
        helpers.download(`${file.name.replace(/\.ico$/i, '')}-${img.width}x${img.height}.png`, blob, 'image/png');
      });
    });

    renderEl.querySelectorAll('.copy-data').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        const img = images[idx];
        const reader = new FileReader();
        reader.onloadend = () => {
          helpers.copyToClipboard(reader.result, btn);
        };
        reader.readAsDataURL(new Blob([img.buffer], { type: 'image/png' }));
      });
    });
  }
})();
