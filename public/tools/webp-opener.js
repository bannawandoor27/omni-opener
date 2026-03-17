/**
 * OmniOpener — WebP Viewer & Converter
 * Production-grade WebP tool with metadata extraction and conversion capabilities.
 */
(function () {
  'use strict';

  // Helper for human-readable file sizes
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Helper for XSS prevention
  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.webp',
      binary: true,
      dropLabel: 'Drop a WebP image here',
      infoHtml: '<strong>Privacy:</strong> Conversion and metadata extraction happen entirely in your browser.',

      actions: [
        {
          label: '📋 Copy as PNG',
          id: 'copy-png',
          onClick: function (h, btn) {
            const img = h.getState().currentImg;
            if (!img) return;
            h.showLoading('Preparing clipboard...');
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function (blob) {
              if (!blob) {
                h.showError('Conversion Failed', 'Could not convert image for clipboard.');
                return;
              }
              try {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(function () {
                  const orig = btn.textContent;
                  btn.textContent = '✓ Copied!';
                  setTimeout(function () { btn.textContent = orig; }, 2000);
                  h.hideLoading();
                }).catch(function(err) {
                  h.showError('Clipboard error', 'Failed to copy image: ' + err.message);
                });
              } catch (e) {
                h.showError('Clipboard error', 'Your browser may not support copying images to the clipboard.');
              }
            }, 'image/png');
          }
        },
        {
          label: '📥 Download PNG',
          id: 'dl-png',
          onClick: function (h) {
            const img = h.getState().currentImg;
            if (!img) return;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function (blob) {
              if (blob) h.download('converted.png', blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📥 Download JPG',
          id: 'dl-jpg',
          onClick: function (h) {
            const img = h.getState().currentImg;
            if (!img) return;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function (blob) {
              if (blob) h.download('converted.jpg', blob, 'image/jpeg');
            }, 'image/jpeg', 0.9);
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/exifreader@4.22.1/dist/exif-reader.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Rendering WebP image...');

        // Handle ArrayBuffer content
        if (!(content instanceof ArrayBuffer)) {
          h.showError('File Error', 'Invalid file content received. Expected binary data.');
          return;
        }

        const blob = new Blob([content], { type: 'image/webp' });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = function () {
          h.setState('currentImg', img);
          
          const oldUrl = h.getState().objectUrl;
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          h.setState('objectUrl', url);

          // Extract Metadata
          let metadata = [];
          if (typeof ExifReader !== 'undefined') {
            try {
              const tags = ExifReader.load(content);
              // Clean up and format tags
              for (const [key, value] of Object.entries(tags)) {
                if (value && value.description && typeof value.description === 'string' && value.description.length < 500) {
                  metadata.push({ name: key, value: value.description });
                }
              }
            } catch (e) {
              console.warn('Metadata extraction failed', e);
            }
          }

          const fileInfoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">${img.naturalWidth} × ${img.naturalHeight} px</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.webp file</span>
            </div>
          `;

          const metadataSection = metadata.length > 0 ? `
            <div class="mt-8">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800 text-base">Metadata & EXIF</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${metadata.length} tags found</span>
              </div>
              <div class="overflow-x-auto rounded-xl border border-surface-200">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50">
                      <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Tag</th>
                      <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${metadata.map(m => `
                      <tr class="even:bg-surface-50/50 hover:bg-brand-50/30 transition-colors">
                        <td class="px-4 py-2 font-medium text-surface-600 border-b border-surface-100">${escapeHtml(m.name)}</td>
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100">${escapeHtml(m.value)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : `
            <div class="mt-8 p-6 text-center border-2 border-dashed border-surface-200 rounded-xl">
              <p class="text-surface-400 text-sm">No EXIF or metadata tags found in this image.</p>
            </div>
          `;

          const renderHtml = `
            <div class="p-1">
              ${fileInfoBar}
              
              <div class="rounded-2xl overflow-hidden border border-surface-200 bg-surface-100 shadow-sm relative group">
                <div class="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div class="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg border border-surface-200 text-xs font-medium text-surface-600 shadow-sm">
                    Resolution: ${img.naturalWidth} × ${img.naturalHeight}
                  </div>
                </div>
                
                <div class="flex items-center justify-center p-4 sm:p-12 min-h-[300px] max-h-[80vh] overflow-auto">
                  <div class="relative">
                    <img src="${url}" 
                         class="max-w-full h-auto shadow-2xl rounded-lg bg-white bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uAnP+PgsZaG95ACpCjGBxpAbBoMmoYBBgx8CAfAnS7IAABU7QAfSTC99wAAAABJRU5ErkJggg==')] select-none"
                         style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;">
                    <div class="absolute inset-0 border border-black/5 rounded-lg pointer-events-none"></div>
                  </div>
                </div>
              </div>

              ${metadataSection}
            </div>
          `;
          
          h.render(renderHtml);
          h.hideLoading();
        };

        img.onerror = function () {
          h.showError('Could not open WebP file', 'The file may be corrupted, encrypted, or in an unsupported WebP variant. Try another image or re-exporting it.');
        };

        img.src = url;
      },

      onDestroy: function (h) {
        const url = h.getState().objectUrl;
        if (url) URL.revokeObjectURL(url);
      }
    });
  };
})();
