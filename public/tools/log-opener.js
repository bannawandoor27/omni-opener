(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.log,.txt',
      onFile: function (file, content, h) {
        const lines = content.split(/\r?\n/);
        h.render(`
          <div class="p-4 bg-surface-900 text-surface-100 rounded shadow-lg">
            <div class="mb-4 flex justify-between items-center">
              <span class="font-bold">${esc(file.name)}</span>
              <span class="text-xs">${lines.length} lines</span>
            </div>
            <div class="overflow-auto max-h-[70vh] font-mono text-xs whitespace-pre-wrap" id="log-content"></div>
          </div>
        `);

        const container = document.getElementById('log-content');
        if (container) {
          container.textContent = lines.slice(0, 5000).join('\n');
          if (lines.length > 5000) {
            container.textContent += '\n... (truncated)';
          }
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
