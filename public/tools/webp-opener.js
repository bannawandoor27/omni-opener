/**
 * OmniOpener — WebP Viewer & Converter
 * Uses OmniTool SDK. Renders .webp files and allows conversion to PNG/JPG.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.webp',
      binary: true,
      dropLabel: 'Drop a WebP image here',
      infoHtml: '<strong>Privacy:</strong> Everything runs 100% client-side in your browser. Your images never leave your computer.',

      actions: [
        {
          label: '📋 Copy as PNG',
          id: 'copy-png',
          onClick: function (h, btn) {
            const img = h.getState().currentImg;
            if (!img) return;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function (blob) {
              if (!blob) return;
              try {
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(function () {
                  const orig = btn.textContent;
                  btn.textContent = '✓ Copied!';
                  setTimeout(function () { btn.textContent = orig; }, 1500);
                }).catch(function(err) {
                  h.showError('Clipboard error', 'Failed to copy image: ' + err.message);
                });
              } catch (e) {
                h.showError('Clipboard error', 'Your browser may not support copying images.');
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
              if (blob) h.download('image.png', blob, 'image/png');
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
              if (blob) h.download('image.jpg', blob, 'image/jpeg');
            }, 'image/jpeg', 0.9);
          }
        }
      ],

      onInit: function (h) {
        // Load ExifReader for metadata support
        h.loadScript('https://cdn.jsdelivr.net/npm/exifreader@4.22.1/dist/exif-reader.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing WebP image...');

        const blob = new Blob([content], { type: 'image/webp' });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = function () {
          h.setState('currentImg', img);
          
          const oldUrl = h.getState().objectUrl;
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          h.setState('objectUrl', url);

          let metadataHtml = '';
          if (typeof ExifReader !== 'undefined') {
            try {
              const tags = ExifReader.load(content);
              const interesting = ['Make', 'Model', 'DateTime', 'Software', 'ImageWidth', 'ImageHeight'];
              const found = interesting.filter(k => tags[k]).map(k => `<strong>${k}:</strong> ${tags[k].description}`);
              if (found.length > 0) {
                metadataHtml = `<div class="mt-2 text-[10px] text-surface-400 grid grid-cols-2 gap-x-4">${found.map(f => `<span>${f}</span>`).join('')}</div>`;
              }
            } catch (e) {
              console.warn('Metadata parse error', e);
            }
          }

          const info = `
            <div class="p-4 bg-surface-50 border-b border-surface-200">
              <div class="flex justify-between text-xs text-surface-600 font-medium">
                <span>Resolution: ${img.naturalWidth} &times; ${img.naturalHeight}</span>
                <span>File Size: ${(file.size / 1024).toFixed(1)} KB</span>
              </div>
              ${metadataHtml}
            </div>
          `;

          const renderHtml = `
            <div class="flex flex-col h-full bg-surface-100">
              ${info}
              <div class="flex-1 flex items-center justify-center p-8 overflow-auto min-h-[400px]">
                <div class="relative group">
                  <img src="${url}" class="max-w-full h-auto shadow-2xl rounded-lg bg-white bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uAnP+PgsZaG95ACpCjGBxpAbBoMmoYBBgx8CAfAnS7IAABU7QAfSTC99wAAAABJRU5ErkJggg==')]">
                  <div class="absolute inset-0 border border-black/5 rounded-lg pointer-events-none"></div>
                </div>
              </div>
            </div>
          `;
          h.render(renderHtml);
        };
        img.onerror = function () {
          h.showError('Invalid WebP', 'This file does not appear to be a valid WebP image or is corrupted.');
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
