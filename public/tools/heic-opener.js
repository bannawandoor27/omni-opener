(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.heic,.heif',
      dropLabel: 'Drop a HEIC or HEIF file here',
      infoHtml: '<strong>Privacy:</strong> Your HEIC files are converted locally in your browser. No data is sent to any server.',

      actions: [
        {
          label: '📥 Download JPEG',
          id: 'download-jpg',
          onClick: function (h) {
            download(h, 'image/jpeg', '.jpg');
          }
        },
        {
          label: '📥 Download PNG',
          id: 'download-png',
          onClick: function (h) {
            download(h, 'image/png', '.png');
          }
        },
        {
          label: '📋 Copy Image',
          id: 'copy-image',
          onClick: function (h, btn) {
            var state = h.getState();
            var blob = state.previewBlob;
            if (blob && window.ClipboardItem) {
              var data = [new ClipboardItem({ [blob.type]: blob })];
              navigator.clipboard.write(data).then(function() {
                var orig = btn.textContent;
                btn.textContent = '✓ Copied!';
                setTimeout(function() { btn.textContent = orig; }, 1500);
              }).catch(function(err) {
                console.error('Clipboard Error:', err);
              });
            } else {
              h.copyToClipboard('Copying images is not supported in this browser.', btn);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof heic2any === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Converting HEIC...');
        
        // Ensure library is ready
        if (typeof heic2any === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', function() {
            renderPreview(file, content, h);
          });
        } else {
          renderPreview(file, content, h);
        }
      }
    });
  };

  function renderPreview(file, content, h) {
    var blob = new Blob([content], { type: 'image/heic' });
    h.setState('originalBlob', blob);

    heic2any({
      blob: blob,
      toType: "image/jpeg",
      quality: 0.8
    })
    .then(function (result) {
      var resultBlob = Array.isArray(result) ? result[0] : result;
      h.setState('previewBlob', resultBlob);
      displayImage(h, resultBlob, file.name);
    })
    .catch(function (err) {
      console.error('HEIC Error:', err);
      h.showError('Conversion Failed', 'Could not convert this HEIC file. It might be an unsupported variant or corrupted.');
    });
  }

  function download(h, mimeType, extension) {
    var state = h.getState();
    var file = h.getFile();
    if (!state.originalBlob || !file) return;

    // If already converted to the right format in preview, download immediately
    if (state.previewBlob && state.previewBlob.type === mimeType) {
      var name = file.name.replace(/\.[^/.]+$/, "");
      h.download(name + extension, state.previewBlob, mimeType);
      return;
    }

    // Otherwise convert to requested format
    h.showLoading('Preparing ' + extension.toUpperCase() + '...');
    heic2any({
      blob: state.originalBlob,
      toType: mimeType,
      quality: 0.9
    })
    .then(function (result) {
      var resultBlob = Array.isArray(result) ? result[0] : result;
      var name = file.name.replace(/\.[^/.]+$/, "");
      h.download(name + extension, resultBlob, mimeType);
      
      // Restore the preview display
      if (state.previewBlob) {
        displayImage(h, state.previewBlob, file.name);
      }
    })
    .catch(function (err) {
      h.showError('Download Failed', 'Could not convert to ' + mimeType);
    });
  }

  function displayImage(h, blob, filename) {
    var url = URL.createObjectURL(blob);
    h.render(
      '<div class="flex flex-col items-center p-8 bg-surface-50 min-h-[400px] justify-center">' +
        '<div class="bg-white p-2 rounded-xl shadow-lg border border-surface-200">' +
          '<img src="' + url + '" class="max-w-full max-h-[70vh] rounded-lg" />' +
        '</div>' +
        '<div class="mt-6 text-center">' +
          '<p class="text-sm font-semibold text-surface-800">' + esc(filename) + '</p>' +
          '<p class="text-xs text-surface-400 mt-1">Successfully converted for preview</p>' +
        '</div>' +
      '</div>'
    );
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
