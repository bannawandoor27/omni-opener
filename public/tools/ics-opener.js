(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    var parsedEvents = [];

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ics',
      dropLabel: 'Drop an .ics file here',
      binary: false,
      infoHtml: '<strong>Privacy First:</strong> Your .ics files are processed entirely in your browser. No event data is ever sent to a server.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (helpers, btn) {
            if (parsedEvents.length > 0) {
              helpers.copyToClipboard(JSON.stringify(parsedEvents, null, 2), btn);
            } else {
              helpers.showError('No events to copy', 'Please load an ICS file first.');
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (helpers) {
            if (parsedEvents.length > 0) {
              var file = helpers.getFile();
              var name = file ? file.name.replace(/\.ics$/i, '') : 'events';
              helpers.download(name + '.json', JSON.stringify(parsedEvents, null, 2), 'application/json');
            } else {
              helpers.showError('No events to download', 'Please load an ICS file first.');
            }
          }
        },
      ],

      onInit: function (helpers) {
        helpers.loadScript('https://unpkg.com/ical.js/dist/ical.min.js');
      },

      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing ICS file...');

        // Delay slightly to ensure ICAL.js is ready
        setTimeout(function () {
          if (typeof ICAL === 'undefined') {
            helpers.showError('Dependency Error', 'The ICAL.js library failed to load. Please check your connection and try again.');
            return;
          }

          try {
            var jcalData = ICAL.parse(content);
            var comp = new ICAL.Component(jcalData);
            var vevents = comp.getAllSubcomponents('vevent');
            parsedEvents = [];

            if (vevents.length === 0) {
              helpers.render('<div class="p-12 text-center text-surface-500">No events found in this .ics file.</div>');
              return;
            }

            var html = '<div class="p-6 space-y-4">';
            vevents.forEach(function (vevent) {
              var event = new ICAL.Event(vevent);
              var data = {
                summary: event.summary || 'Untitled Event',
                start: event.startDate ? event.startDate.toString() : 'N/A',
                end: event.endDate ? event.endDate.toString() : 'N/A',
                location: event.location || '',
                description: event.description || '',
                organizer: event.organizer ? event.organizer.email : ''
              };
              parsedEvents.push(data);

              html += '<div class="border border-surface-200 rounded-xl p-5 bg-white shadow-sm hover:border-brand-400 transition-colors">';
              html += '  <h3 class="font-bold text-xl text-surface-900 mb-2">' + escapeHtml(data.summary) + '</h3>';
              html += '  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">';
              html += '    <div class="flex items-center gap-2 text-surface-600"><span class="font-semibold text-surface-400 uppercase text-[10px] tracking-wider">Start</span> ' + escapeHtml(data.start) + '</div>';
              html += '    <div class="flex items-center gap-2 text-surface-600"><span class="font-semibold text-surface-400 uppercase text-[10px] tracking-wider">End</span> ' + escapeHtml(data.end) + '</div>';
              if (data.location) {
                html += '    <div class="md:col-span-2 flex items-center gap-2 text-surface-600"><span class="font-semibold text-surface-400 uppercase text-[10px] tracking-wider">Location</span> ' + escapeHtml(data.location) + '</div>';
              }
              html += '  </div>';
              if (data.description) {
                html += '  <div class="mt-4 pt-4 border-t border-surface-100 text-sm text-surface-700 whitespace-pre-wrap leading-relaxed">' + escapeHtml(data.description) + '</div>';
              }
              if (data.organizer) {
                html += '  <div class="mt-3 text-xs text-surface-400">Organizer: ' + escapeHtml(data.organizer) + '</div>';
              }
              html += '</div>';
            });
            html += '</div>';

            helpers.render(html);
          } catch (err) {
            helpers.showError('Parse Error', 'Failed to read iCalendar data. The file might be corrupted or in an unsupported format.');
          }
        }, 200);
      }
    });
  };
})();
