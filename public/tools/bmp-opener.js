(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.bmp',
      dropLabel: 'Drop a .bmp file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies needed for native BMP support
      },
      onFile: function(file, content, helpers) {
        const formatSize = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';

        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Processing may be slow. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Parsing bmp...');

        try {
          const blob = new Blob([content], { type: 'image/bmp' });
          const url = URL.createObjectURL(blob);
          const img = new Image();

          img.onload = function() {
            const width = img.naturalWidth;
            const height = img.naturalHeight;

            const html = `
              <div class="p-4 md:p-6">
                <!-- File Info Bar -->
                <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
                  <span class="font-medium">${file.name}</span>
                  <span class="text-surface-400">·</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-400">·</span>
                  <span>${width} × ${height} px</span>
                </div>

                <!-- Image Preview -->
                <div class="flex items-center justify-center bg-surface-100 rounded-xl overflow-hidden border border-surface-200 shadow-inner" style="min-height: 400px;">
                  <img src="${url}" alt="${file.name}" class="max-w-full h-auto shadow-lg" style="image-rendering: pixelated;" />
                </div>

                <div class="mt-4 text-xs text-surface-400 text-center">
                  Image rendering mode: High Quality / Pixelated
                </div>
              </div>
            `;
            helpers.render(html);
            helpers.setState('imageUrl', url);
            helpers.setState('dimensions', { width, height });
          };

          img.onerror = function() {
            helpers.showError('Could not parse bmp file', 'The file may be corrupted or in an unsupported BMP sub-format.');
          };

          img.src = url;

        } catch(e) {
          helpers.showError('Could not parse bmp file', e.message);
        }
      },
      actions: [
        {
          label: '📥 Download PNG',
          id: 'dl-png',
          onClick: function(helpers, btn) {
            const img = helpers.getRenderEl().querySelector('img');
            if (!img) return;

            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob(function(blob) {
              const name = helpers.getFile().name.replace(/\.bmp$/i, '') + '.png';
              helpers.download(name, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl-orig',
          onClick: function(helpers, btn) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'image/bmp');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device. BMP images are rendered natively by your browser.'
    });
  };
})();
