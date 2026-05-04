/**
 * OmniOpener — WebP Opener Tool
 * Uses OmniTool SDK. A browser-based WebP viewer and converter.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.webp',
      binary: true,
      infoHtml: '<strong>WebP Opener:</strong> View, zoom, rotate, and convert WebP images. All processing is 100% local in your browser.',

      actions: [
        {
          label: '➕ Zoom In',
          id: 'zoom-in',
          onClick: function (h) {
            const s = h.getState();
            const newZoom = Math.min((s.zoom || 1) + 0.25, 5);
            h.setState('zoom', newZoom);
            applyTransform(h);
          }
        },
        {
          label: '➖ Zoom Out',
          id: 'zoom-out',
          onClick: function (h) {
            const s = h.getState();
            const newZoom = Math.max((s.zoom || 1) - 0.25, 0.1);
            h.setState('zoom', newZoom);
            applyTransform(h);
          }
        },
        {
          label: '🔄 Rotate',
          id: 'rotate',
          onClick: function (h) {
            const s = h.getState();
            const newRotate = ((s.rotate || 0) + 90) % 360;
            h.setState('rotate', newRotate);
            applyTransform(h);
          }
        },
        {
          label: '⊞ Fit',
          id: 'fit',
          onClick: function (h) {
            h.setState({ zoom: 1, rotate: 0 });
            applyTransform(h);
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const s = h.getState();
            if (s.metadata) h.copyToClipboard(JSON.stringify(s.metadata, null, 2), btn);
            else h.copyToClipboard('No metadata found in this image.', btn);
          }
        },
        {
          label: '🖼️ Save PNG',
          id: 'save-png',
          onClick: function (h) { exportAs(h, 'image/png', 'png'); }
        },
        {
          label: '📷 Save JPG',
          id: 'save-jpg',
          onClick: function (h) { exportAs(h, 'image/jpeg', 'jpg'); }
        },
        {
          label: '📥 Original WebP',
          id: 'dl-webp',
          onClick: function (h) { h.download(h.getState().filename, h.getContent(), 'image/webp'); }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/exif-js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Loading WebP image...');
        
        const s = h.getState();
        if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);

        const blob = new Blob([content], { type: 'image/webp' });
        const url = URL.createObjectURL(blob);

        h.setState({
          previewUrl: url,
          zoom: 1,
          rotate: 0,
          filename: file.name,
          metadata: null
        });

        const img = new Image();
        img.onload = function () {
          h.setState({ width: img.width, height: img.height });
          if (window.EXIF) {
            EXIF.getData(img, function () {
              const tags = EXIF.getAllTags(this);
              if (tags && Object.keys(tags).length > 0) h.setState('metadata', tags);
              renderUI(h);
            });
          } else {
            renderUI(h);
          }
        };
        img.onerror = function () {
          h.showError('Load Error', 'The file is either corrupted or not a valid WebP image.');
        };
        img.src = url;
      }
    });
  };

  function renderUI(h) {
    const s = h.getState();
    const metaHtml = s.metadata ? 
      '<div class="mt-8 w-full border-t border-surface-100 pt-6 text-left">' +
        '<h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-3">Image Metadata</h3>' +
        '<div class="bg-surface-50 rounded-xl p-4 text-[11px] font-mono text-surface-600 overflow-auto max-h-60 shadow-inner">' +
          formatMeta(s.metadata) +
        '</div>' +
      '</div>' : '';

    h.render(
      '<div class="flex flex-col items-center p-6 md:p-10">' +
        '<div class="flex flex-wrap justify-center gap-3 mb-8 text-[11px]">' +
          '<div class="px-3 py-1.5 bg-white border border-surface-200 rounded-lg shadow-sm text-surface-600 font-medium"><strong>File:</strong> ' + esc(s.filename) + '</div>' +
          '<div class="px-3 py-1.5 bg-white border border-surface-200 rounded-lg shadow-sm text-surface-600 font-medium"><strong>Size:</strong> ' + s.width + ' × ' + s.height + ' px</div>' +
          '<div class="px-3 py-1.5 bg-white border border-surface-200 rounded-lg shadow-sm text-surface-600 font-medium"><strong>Format:</strong> WebP</div>' +
        '</div>' +
        '<div class="relative w-full flex justify-center bg-[url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAAAAAA6mKC9AAAAGElEQVQYV2N4DwX/oYBhgDE8BOn4S8VfWAMA6as8f9zEAn8AAAAASUVORK5CYII=\')] rounded-2xl shadow-xl border border-surface-200 overflow-hidden" style="min-height: 360px;">' +
          '<img id="webp-preview-img" src="' + s.previewUrl + '" ' +
            'style="display: block; max-width: 100%; height: auto; transform: scale(1) rotate(0deg); transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); filter: drop-shadow(0 10px 25px rgba(0,0,0,0.1));" ' +
            'class="m-auto">' +
        '</div>' +
        metaHtml +
      '</div>'
    );
  }

  function applyTransform(h) {
    const s = h.getState();
    const el = h.getRenderEl().querySelector('#webp-preview-img');
    if (el) {
      el.style.transform = 'scale(' + (s.zoom || 1) + ') rotate(' + (s.rotate || 0) + 'deg)';
    }
  }

  function exportAs(h, mime, ext) {
    const s = h.getState();
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL(mime, 0.92);
      const name = s.filename.replace(/\.[^/.]+$/, "") + "." + ext;
      h.download(name, dataUrl, mime);
    };
    img.src = s.previewUrl;
  }

  function formatMeta(meta) {
    const lines = [];
    for (const key in meta) {
      if (Object.prototype.hasOwnProperty.call(meta, key)) {
        const val = meta[key];
        if (typeof val !== 'function' && typeof val !== 'object') {
          lines.push('<div class="flex justify-between py-1 border-b border-surface-100 last:border-0 hover:bg-white transition-colors px-1">' +
                     '<span class="font-bold text-surface-400">' + esc(key) + '</span>' +
                     '<span class="text-surface-700">' + esc(val) + '</span>' +
                   '</div>');
        }
      }
    }
    return lines.join('') || '<p class="text-surface-400 italic">No viewable metadata tags found.</p>';
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }
})();
