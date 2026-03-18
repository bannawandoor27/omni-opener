#!/bin/bash
# Bulk fix for OmniOpener tools

# 1. URL fixes
find public/tools -name "*.js" -exec sed -i 's|vkbeautify@0.99.3/vkbeautify.min.js|vkbeautify@0.99.1/vkbeautify.min.js|g' {} +
find public/tools -name "*.js" -exec sed -i 's|libarchive.js@1.3.0/dist/libarchive.min.js|libarchive.js@1.3.0/main.min.js|g' {} +
find public/tools -name "*.js" -exec sed -i 's|three@0.163.0/build/three.min.js|three@0.160.1/build/three.min.js|g' {} +
find public/tools -name "*.js" -exec sed -i 's|three@0.149.0/examples/js/loaders/STLLoader.js|three@0.149.0/examples/jsm/loaders/STLLoader.js|g' {} +

# 2. helpers.onFile bug fix (recursive call fix)
# This one is tricky with sed. I'll use a better approach for xml-opener.js and others.

# Fix xml-opener.js
cat > public/tools/xml-opener.js <<EOF
(function () {
  'use strict';
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xml,.rss,.atom,.svg,.kml,.gpx,.wsdl,.xsd',
      binary: false,
      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
      },
      onFile: function _onFile(file, content, helpers) {
        if (typeof vkbeautify === 'undefined' || typeof hljs === 'undefined') {
          helpers.showLoading('Loading engines...');
          helpers.loadScripts([
            'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
            'https://cdn.jsdelivr.net/npm/vkbeautify@0.99.1/vkbeautify.min.js'
          ], () => _onFile(file, content, helpers));
          return;
        }
        try {
          const beautified = vkbeautify.xml(content, 2);
          helpers.setState('beautifiedXml', beautified);
          helpers.render('<div class="p-4"><pre class="hljs language-xml rounded-lg p-4 overflow-auto max-h-[70vh]">' + hljs.highlight(beautified, {language: "xml"}).value + '</pre></div>');
        } catch (e) {
          helpers.showError('XML Error', e.message);
        }
      }
    });
  };
})();
EOF

# Fix webp-opener.js (was missing image display due to hideLoading)
# Fix avif-opener.js
# Fix pdf-opener.js

# I'll use a more surgical approach for the rest.
