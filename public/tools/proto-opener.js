(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.proto',
      onFile: function(file, content, helpers) {
        helpers.render('<div class="p-4 bg-surface-100 rounded-lg h-full"><pre class="p-3 rounded-md text-sm text-surface-900 overflow-auto"><code>' + String(content).replace(/&/g, '\&amp;').replace(/</g, '\&lt;').replace(/>/g, '\&gt;') + '</code></pre></div>');
      }
    });
  };
})();
