(function () {
  'use strict';

  var LIB_URL = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
  var lastUrl = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.heic,.heif',
      dropLabel: 'Drop HEIC image to convert',
      infoHtml: '<strong>Security:</strong> All processing is done locally in your browser. Your images are never uploaded.',

      actions: [
        {
          label: '📥 Save as JPEG',
          id: 'dl-jpeg',
          onClick: function (h) { exportImage(h, 'image/jpeg', '.jpg'); }
        },
        {
          label: '📥 Save as PNG',
          id: 'dl-png',
          onClick: function (h) { exportImage(h, 'image/png', '.png'); }
        },
        {
          label: '📋 Copy Image',
          id: 'copy-img',
          onClick: function (h, btn) { copyToClipboard(h, btn); }
        }
      ],

      onInit: function (h) {
        if (typeof window.heic2any === 'undefined') {
          h.loadScript(LIB_URL);
        }
      },

      onFile: function (file, content, h) {
        if (!content || content.byteLength === 0) {
          return h.showError('Empty File', 'The selected file contains no data.');
        }

        h.showLoading('Initializing converter...');

        if (typeof window.heic2any === 'undefined') {
          h.loadScript(LIB_URL, function () {
            if (typeof window.heic2any === 'undefined') {
              h.showError('Library Error', 'Could not load conversion engine. Please check your connection.');
            } else {
              process(file, content, h);
            }
          });
        } else {
          process(file, content, h);
        }
      }
    });
  };

  function process(file, content, h) {
    h.showLoading('Converting HEIC to JPEG...');
    var blob = new Blob([content], { type: 'image/heic' });
    h.setState('raw', blob);

    window.heic2any({
      blob: blob,
      toType: 'image/jpeg',
      quality: 0.8
    })
    .then(function (result) {
      var previewBlob = Array.isArray(result) ? result[0] : result;
      h.setState('preview', previewBlob);
      
      var tempUrl = URL.createObjectURL(previewBlob);
      var img = new Image();
      img.onload = function() {
        h.setState('dims', { w: img.width, h: img.height });
        render(h, file, previewBlob);
        URL.revokeObjectURL(tempUrl);
      };
      img.onerror = function() {
        render(h, file, previewBlob);
        URL.revokeObjectURL(tempUrl);
      };
      img.src = tempUrl;
    })
    .catch(function (err) {
      console.error(err);
      h.showError('Conversion Failed', 'Unable to parse this HEIC file. It might be an unsupported variant or corrupted.');
    });
  }

  function render(h, file, blob) {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);

    var dims = h.getState().dims;
    var dimStr = dims ? dims.w + ' × ' + dims.h : '';
    var sizeStr = formatSize(file.size);

    var html = 
      '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
        '<span class="font-semibold text-surface-800">' + esc(file.name) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span>' + sizeStr + '</span>' +
        (dimStr ? '<span class="text-surface-300">|</span><span>' + dimStr + ' px</span>' : '') +
        '<span class="text-surface-300">|</span>' +
        '<span class="text-surface-500">.heic file</span>' +
      '</div>' +

      '<div class="rounded-2xl border border-surface-200 overflow-hidden bg-white shadow-sm">' +
        '<div class="p-3 bg-surface-50/50 border-b border-surface-100 flex items-center justify-between px-6">' +
          '<div class="flex items-center gap-2">' +
            '<div class="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>' +
            '<span class="text-[10px] font-bold uppercase tracking-widest text-surface-500">Image Preview</span>' +
          '</div>' +
        '</div>' +
        '<div class="relative group bg-surface-100/30 min-h-[300px] flex items-center justify-center p-4 sm:p-10">' +
          '<div class="absolute inset-0 opacity-[0.03] pointer-events-none" style="background-image: url(\'data:image/svg+xml,%3Csvg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h20v20H0V0zm10 10h10v10H10V10zM0 10h10v10H0V10z\" fill=\"%23000\" fill-rule=\"evenodd\"/%3E%3C/svg%3E\')"></div>' +
          '<img src="' + lastUrl + '" class="max-w-full max-h-[70vh] rounded-lg shadow-2xl transition-transform duration-500 group-hover:scale-[1.01]" />' +
        '</div>' +
        '<div class="p-6 border-t border-surface-100">' +
          '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">' +
            '<div>' +
              '<h3 class="font-bold text-surface-900">Converted Successfully</h3>' +
              '<p class="text-sm text-surface-500 mt-0.5">High-quality JPEG preview generated locally.</p>' +
            '</div>' +
            '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200 uppercase tracking-tighter">Verified</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    h.render(html);
  }

  function exportImage(h, mime, ext) {
    var state = h.getState();
    var file = h.getFile();
    if (!state.raw || !file) return;

    h.showLoading('Exporting ' + ext.substring(1).toUpperCase() + '...');
    
    window.heic2any({
      blob: state.raw,
      toType: mime,
      quality: 0.95
    })
    .then(function (result) {
      var blob = Array.isArray(result) ? result[0] : result;
      var name = file.name.replace(/\.[^/.]+$/, "") + ext;
      h.download(name, blob, mime);
    })
    .catch(function (err) {
      h.showError('Export Failed', 'Could not convert image to ' + ext.substring(1).toUpperCase());
    });
  }

  function copyToClipboard(h, btn) {
    var blob = h.getState().preview;
    if (!blob || !window.ClipboardItem) return h.copyToClipboard('Not supported', btn);

    var data = [new ClipboardItem({ [blob.type]: blob })];
    navigator.clipboard.write(data).then(function() {
      var old = btn.innerHTML;
      btn.innerHTML = '✅ Copied!';
      setTimeout(function() { btn.innerHTML = old; }, 2000);
    }).catch(function() {
      h.copyToClipboard('Failed to copy', btn);
    });
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    var k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(s) {
    var t = document.createElement('textarea');
    t.textContent = s;
    return t.innerHTML;
  }
})();
