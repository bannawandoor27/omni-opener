(function() {
  'use strict';

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ico',
      onFile: function(file, content, helpers) {
        helpers.render('<div class="p-4">ICO file content detected. The preview for this format is currently being updated. Metadata: ' + file.size + ' bytes.</div>');
      }
    });
  };
})();
