(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.mid,.midi',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.js');
      },
      onFile: function (file, content, h) {
        if (typeof Midi === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/dist/Midi.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const midi = new Midi(content);
          const metaText = `Tracks: ${midi.tracks.length}\nDuration: ${midi.duration.toFixed(2)}s`;
          h.render(`
            <div class="p-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              <div class="bg-white p-4 border rounded shadow-sm">
                <div>Tracks: ${midi.tracks.length}</div>
                <div>Duration: ${midi.duration.toFixed(2)}s</div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button id="btn-copy-meta" class="px-2 py-1 bg-surface-100 border rounded text-xs">📋 Copy Metadata</button>
                  <button id="btn-download" class="px-2 py-1 bg-surface-100 border rounded text-xs">📥 Download</button>
                </div>
              </div>
            </div>
          `);
          document.getElementById('btn-copy-meta').onclick = () => { navigator.clipboard.writeText(metaText); h.showLoading('Copied!'); setTimeout(() => h.showLoading(false), 1000); };
          document.getElementById('btn-download').onclick = () => { const blob = new Blob([content], { type: 'audio/midi' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); };
        } catch (err) {
          h.showError('MIDI Error', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
