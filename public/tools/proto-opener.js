(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.proto',
      onFile: function(file, content, helpers) {
        helpers.render('<div class="p-4 bg-surface-100 rounded-lg h-full"><pre class="p-3 rounded-md text-sm text-surface-900 overflow-auto"><code>' + String(content).replace(/&/g, '\&amp;').replace(/</g, '\&lt;').replace(/>/g, '\&gt;') + '</code></pre></div>');
      }
    });
  };
})();
