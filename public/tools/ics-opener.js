(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ics',
      binary: false,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js');
      },
      onFile: function (file, content, h) {
        if (typeof ICAL === 'undefined') {
          h.showLoading('Loading engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js', () => this.onFile(file, content, h));
          return;
        }

        try {
          const jcal = ICAL.parse(content);
          const comp = new ICAL.Component(jcal);
          const events = comp.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));

          if (events.length === 0) {
            h.render('<div class="p-8 text-center text-surface-500">No events found.</div>');
            return;
          }

          h.render(`
            <div class="p-4 space-y-4">
              <div class="font-bold mb-4">${esc(file.name)}</div>
              ${events.map(e => `
                <div class="p-4 border rounded shadow-sm bg-white">
                  <div class="font-bold text-lg">${esc(e.summary)}</div>
                  <div class="text-sm text-surface-500">${e.startDate} - ${e.endDate}</div>
                  ${e.location ? `<div class="text-sm mt-2">📍 ${esc(e.location)}</div>` : ''}
                  ${e.description ? `<div class="mt-2 text-sm border-t pt-2">${esc(e.description)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `);
        } catch (err) {
          h.showError('ICS Issue', err.message);
        }
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
