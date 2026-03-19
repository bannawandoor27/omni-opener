(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
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
          h.render(`
            <div class="p-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              <div class="bg-white p-4 border rounded shadow-sm">
                <div>Tracks: ${midi.tracks.length}</div>
                <div>Duration: ${midi.duration.toFixed(2)}s</div>
              </div>
            </div>
          `);
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
