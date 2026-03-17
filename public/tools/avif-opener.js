(function() {
  'use strict';

  /**
   * OmniOpener — AVIF File Viewer
   * Renders .avif files using native browser decoding.
   */

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.avif',
      dropLabel: 'Drop a .avif file here',
      binary: true,
      onInit: function(helpers) {
        // AVIF is supported natively in modern browsers.
      },
      onFile: function(file, content, helpers) {
        // Large file warning (> 20MB)
        if (file.size > 20 * 1024 * 1024) {
          helpers.render([
            '<div class="p-12 text-center">',
              '<div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 text-amber-500 mb-4">',
                '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
              '</div>',
              '<h3 class="text-lg font-semibold text-surface-900 mb-2">Large File Warning</h3>',
              '<p class="text-surface-600 mb-6">This AVIF file is ' + formatSize(file.size) + '. Processing very large images may slow down your browser.</p>',
              '<button id="proceed-btn" class="px-6 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors">Process Anyway</button>',
            '</div>'
          ].join(''));

          const proceedBtn = document.getElementById('proceed-btn');
          if (proceedBtn) {
            proceedBtn.onclick = function() {
              renderAvif(file, content, helpers);
            };
          }
          return;
        }

        renderAvif(file, content, helpers);
      },
      actions: [
        {
          label: '📥 Download as PNG',
          id: 'dl-png',
          onClick: function(helpers) {
            const img = helpers.getState().currentImg;
            if (!img) return;
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(function(blob) {
              if (blob) {
                const name = helpers.getFile().name.replace(/\.avif$/i, '') + '.png';
                helpers.download(name, blob, 'image/png');
              }
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy as PNG',
          id: 'copy-png',
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
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(function() {
                  const orig = btn.textContent;
                  btn.textContent = '✓ Copied!';
                  setTimeout(function() { btn.textContent = orig; }, 1500);
                }).catch(function(err) {
                  helpers.showError('Clipboard error', 'Failed to copy image: ' + err.message);
                });
              } catch (e) {
                helpers.showError('Clipboard error', 'Your browser may not support copying images.');
              }
            }, 'image/png');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });
  };

  function renderAvif(file, content, helpers) {
    helpers.showLoading('Parsing avif...');
    
    try {
      const blob = new Blob([content], { type: 'image/avif' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      
      img.onload = function() {
        helpers.setState('currentImg', img);
        
        // Cleanup previous object URL if any
        const oldUrl = helpers.getState().objectUrl;
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        helpers.setState('objectUrl', url);

        const infoBar = [
          '<div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">',
            '<span class="font-medium">' + escape(file.name) + '</span>',
            '<span class="text-surface-400">·</span>',
            '<span>' + formatSize(file.size) + '</span>',
            '<span class="text-surface-400">·</span>',
            '<span>' + img.naturalWidth + ' × ' + img.naturalHeight + '</span>',
          '</div>'
        ].join('');

        const renderHtml = [
          '<div class="p-6 bg-white">',
            infoBar,
            '<div class="flex items-center justify-center p-8 bg-surface-100 rounded-xl overflow-auto min-h-[400px]">',
              '<div class="relative shadow-2xl rounded-lg overflow-hidden bg-white bg-[url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uAnP+PgsZaG95ACpCjGBxpAbBoMmoYBBgx8CAfAnS7IAABU7QAfSTC99wAAAABJRU5ErkJggg==\')]" style="line-height: 0;">',
                '<img src="' + url + '" class="max-w-full h-auto" style="display: block;">',
                '<div class="absolute inset-0 border border-black/5 pointer-events-none"></div>',
              '</div>',
            '</div>',
          '</div>'
        ].join('');
        
        helpers.render(renderHtml);
      };

      img.onerror = function() {
        helpers.showError('Could not parse avif file', 'Your browser may not support AVIF or the file is corrupted.');
      };

      img.src = url;
    } catch(e) {
      helpers.showError('Could not parse avif file', e.message);
    }
  }

})();
