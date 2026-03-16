(function () {
  'use strict';

  var parsedEvents = []; // To store the parsed ICS data

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ics',
      dropLabel: 'Drop an .ics file here',
      binary: false,
      infoHtml: '<strong>Privacy First:</strong> Your .ics files are processed entirely in your browser. No event data is ever sent to a server.',
      
      actions: [
        {
          label: '📋 Copy as JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            if (parsedEvents.length > 0) {
              var jsonStr = JSON.stringify(parsedEvents, null, 2);
              helpers.copyToClipboard(jsonStr, btn);
            } else {
              helpers.showError('No events to copy', 'Please load an ICS file first.');
            }
          } 
        },
        {
          label: '📥 Download as JSON', 
          id: 'dl-json', 
          onClick: function (helpers) {
            if (parsedEvents.length > 0) {
              var jsonStr = JSON.stringify(parsedEvents, null, 2);
              var originalFilename = helpers.getFile().name;
              var newFilename = originalFilename.replace(/\.ics$/i, '.json');
              helpers.download(newFilename, jsonStr, 'application/json');
            } else {
              helpers.showError('No events to download', 'Please load an ICS file first.');
            }
          }
        },
      ],

      onInit: function (helpers) {
        // Load ICAL.js library
        helpers.loadScript('https://unpkg.com/ical.js/dist/ical.min.js', function () {
          console.log('ICAL.js loaded successfully');
        });
      },

      onFile: function (file, content, helpers) {
        if (typeof ICAL === 'undefined') {
            helpers.showError('ICAL.js not loaded', 'Please try again. The ICAL.js library might not have loaded yet.');
            return;
        }

        helpers.showLoading('Parsing ICS file...');
        parsedEvents = []; // Clear previous data

        try {
          var jcalData = ICAL.parse(content);
          var comp = new ICAL.Component(jcalData);
          var vevents = comp.getAllSubcomponents('vevent');

          if (vevents.length === 0) {
            helpers.render('<div class="p-4 text-center text-surface-500">No events found in this .ics file.</div>');
            return;
          }

          var eventsHtml = '<div class="p-4 space-y-6">';
          vevents.forEach(function (vevent) {
            var event = new ICAL.Event(vevent);
            parsedEvents.push({
                uid: event.uid,
                summary: event.summary,
                startDate: event.startDate.toString(),
                endDate: event.endDate.toString(),
                location: event.location,
                description: event.description,
                organizer: event.organizer ? event.organizer.email : undefined
            });

            eventsHtml += '<div class="border border-surface-200 rounded-lg p-4 bg-white shadow-sm">';
            eventsHtml += '<h3 class="font-bold text-lg text-brand-600">' + escapeHtml(event.summary) + '</h3>';
            eventsHtml += '<p class="text-sm text-surface-700 mt-1"><strong>When:</strong> ' + escapeHtml(event.startDate.toString()) + ' &mdash; ' + escapeHtml(event.endDate.toString()) + '</p>';
            if (event.location) {
                eventsHtml += '<p class="text-sm text-surface-700"><strong>Where:</strong> ' + escapeHtml(event.location) + '</p>';
            }
            if (event.description) {
                eventsHtml += '<p class="text-sm text-surface-700 mt-2 whitespace-pre-wrap">' + escapeHtml(event.description) + '</p>';
            }
            if (event.organizer && event.organizer.email) {
                eventsHtml += '<p class="text-xs text-surface-500 mt-2"><strong>Organizer:</strong> ' + escapeHtml(event.organizer.email) + '</p>';
            }
            eventsHtml += '</div>';
          });
          eventsHtml += '</div>';
          
          helpers.render(eventsHtml);

        } catch (err) {
          helpers.showError('Failed to parse ICS', err.message);
        }
      }
    });
  };

})();
