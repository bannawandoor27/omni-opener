(function() {
  'use strict';

  let Archive = null;

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.7z',
      binary: true,
      onFile: async function(file, content, helpers) {
        helpers.showLoading('Initializing engine...');
        try {
          if (!Archive) {
            const module = await import('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/main.js');
            Archive = module.Archive;
            Archive.init({
              workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
            });
          }

          helpers.showLoading('Reading archive...');
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();
          
          helpers.render(`
            <div class="p-4 bg-surface-50 border-b flex justify-between items-center mb-4">
              <span class="font-bold">${esc(file.name)}</span>
              <span class="text-sm">${entries.length} items</span>
            </div>
            <div class="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table class="min-w-full text-sm">
                <thead><tr class="bg-surface-50"><th class="px-4 py-2 text-left">Path</th><th class="px-4 py-2 text-right">Size</th><th class="px-4 py-2 text-center">Action</th></tr></thead>
                <tbody class="divide-y">
                  ${entries.map(e => `
                    <tr>
                      <td class="px-4 py-2 truncate">${esc(e.path)}</td>
                      <td class="px-4 py-2 text-right">${formatSize(e.size)}</td>
                      <td class="px-4 py-2 text-center">
                        <button class="extract-btn text-brand-600 font-bold" data-path="${esc(e.path)}">Download</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `);

          document.querySelectorAll('.extract-btn').forEach(btn => {
            btn.onclick = async () => {
              const entry = entries.find(e => e.path === btn.dataset.path);
              const blob = await entry.extract();
              helpers.download(entry.path.split('/').pop(), blob);
            };
          });
        } catch (err) {
          helpers.showError('Error', err.message);
        }
      }
    });
  };

  function formatSize(b) {
    if (!b) return '0 B';
    const k = 1024;
    const i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
