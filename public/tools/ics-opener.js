/**
 * OmniOpener — ICS Toolkit
 * Uses OmniTool SDK and ical.js.
 */
(function () {
  'use strict';

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function getGoogleCalUrl(e) {
    if (!e.start) return '#';
    const start = e.start.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const end = (e.end || e.start).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.summary)}&dates=${start}/${end}&details=${encodeURIComponent(e.description)}&location=${encodeURIComponent(e.location)}`;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ics',
      binary: false,
      infoHtml: '<strong>ICS Toolkit:</strong> Professional calendar viewer with event extraction and export. All processing happens locally in your browser.',
      
      onInit: function (h) {
        if (typeof ICAL === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js');
        }
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const events = h.getState().events;
            if (events) h.copyToClipboard(JSON.stringify(events, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const events = h.getState().events;
            if (events) h.download((h.getFile().name || 'calendar') + '.json', JSON.stringify(events, null, 2), 'application/json');
          }
        },
        {
          label: '📊 Export CSV',
          id: 'dl-csv',
          onClick: function (h) {
            const events = h.getState().events;
            if (!events) return;
            const headers = ['Summary', 'Start', 'End', 'Location', 'Description'];
            const rows = events.map(e => [
              e.summary,
              e.start ? e.start.toISOString() : '',
              e.end ? e.end.toISOString() : '',
              e.location,
              e.description
            ].map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            h.download((h.getFile().name || 'calendar') + '.csv', csv, 'text/csv');
          }
        }
      ],

      onFile: function _onFile(file, content, h) {
        if (typeof ICAL === 'undefined') {
          h.showLoading('Loading iCalendar engine...');
          setTimeout(() => _onFile(file, content, h), 300);
          return;
        }

        h.showLoading('Parsing calendar...');
        
        // Small delay to ensure UI updates
        setTimeout(() => {
          try {
            const jcal = ICAL.parse(content);
            const comp = new ICAL.Component(jcal);
            const events = comp.getAllSubcomponents('vevent').map(v => {
              const e = new ICAL.Event(v);
              return {
                summary: e.summary || 'No Title',
                start: e.startDate ? e.startDate.toJSDate() : null,
                end: e.endDate ? e.endDate.toJSDate() : null,
                location: e.location || '',
                description: e.description || ''
              };
            }).filter(e => e.start);

            h.setState('events', events);

            if (events.length === 0) {
              h.render('<div class="p-12 text-center text-surface-400 italic">No events found in this calendar file.</div>');
              return;
            }

            h.render(`
              <div class="flex flex-col h-[700px] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
                <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex items-center justify-between">
                   <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-lg">📅</div>
                      <div>
                        <h2 class="font-bold text-surface-900 text-sm leading-none uppercase tracking-wider">Calendar View</h2>
                        <p class="text-[10px] text-surface-400 font-medium uppercase mt-1 tracking-tighter">${esc(file.name)}</p>
                      </div>
                   </div>
                   <span class="px-2 py-1 bg-surface-200 rounded text-[10px] font-black text-surface-600 uppercase tracking-widest">${events.length} Events</span>
                </div>
                <div class="flex-1 overflow-auto p-6 space-y-4 bg-surface-50">
                  ${events.map(e => `
                    <div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm hover:border-brand-300 hover:shadow-md transition-all group">
                       <div class="flex justify-between items-start mb-3 gap-4">
                          <h3 class="text-lg font-bold text-surface-900 leading-tight group-hover:text-brand-600 transition-colors">${esc(e.summary)}</h3>
                          <a href="${getGoogleCalUrl(e)}" target="_blank" class="shrink-0 px-3 py-1 bg-brand-50 text-brand-600 border border-brand-100 rounded-lg text-[10px] font-bold hover:bg-brand-500 hover:text-white transition-all shadow-sm">＋ Google Calendar</a>
                       </div>
                       <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-surface-500 mb-3">
                          <div class="flex items-center gap-2 bg-surface-50 p-2 rounded-lg border border-surface-100">
                            <span class="text-base">📅</span>
                            <div>
                               <div class="font-bold text-surface-700">Time</div>
                               <div>${e.start ? e.start.toLocaleString() : 'N/A'} ${e.end ? '<span class="mx-1 text-surface-300">→</span> ' + e.end.toLocaleString() : ''}</div>
                            </div>
                          </div>
                          <div class="flex items-center gap-2 bg-surface-50 p-2 rounded-lg border border-surface-100">
                            <span class="text-base">📍</span>
                            <div>
                               <div class="font-bold text-surface-700">Location</div>
                               <div class="truncate max-w-[200px]">${esc(e.location) || '<span class="italic text-surface-300">Not specified</span>'}</div>
                            </div>
                          </div>
                       </div>
                       ${e.description ? `
                         <div class="mt-3 text-xs text-surface-600 border-t border-surface-100 pt-3 leading-relaxed">
                            <div class="font-bold text-surface-400 uppercase text-[9px] mb-1 tracking-widest">Description</div>
                            <div class="whitespace-pre-wrap">${esc(e.description)}</div>
                         </div>
                       ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            `);
          } catch (err) {
            h.showError('Parsing Error', 'The file does not appear to be a valid iCalendar format: ' + err.message);
          }
        }, 100);
      }
    });
  };
})();
