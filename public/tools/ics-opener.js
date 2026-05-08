/**
 * OmniOpener — ICS Toolkit (PRODUCTION PERFECT)
 * Professional browser-based iCalendar viewer and extractor.
 */
(function () {
  'use strict';

  // Helper to escape HTML and prevent XSS
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Helper for human-readable file size
  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Generate Google Calendar Link
  function getGoogleCalUrl(e) {
    if (!e.start) return '#';
    try {
      const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      const start = fmt(e.start);
      const end = fmt(e.end || e.start);
      return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.summary)}&dates=${start}/${end}&details=${encodeURIComponent(e.description)}&location=${encodeURIComponent(e.location)}`;
    } catch (err) {
      return '#';
    }
  }

  window.initTool = function (toolConfig, mountEl) {
    let _events = []; // Local cache for filtering
    let _filterText = '';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ics',
      binary: false,
      infoHtml: '<strong>ICS Toolkit:</strong> Professional calendar viewer with event extraction, live search, and multi-format export. All processing happens locally in your browser.',
      
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
            if (!events || events.length === 0) return;
            h.copyToClipboard(JSON.stringify(events, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const events = h.getState().events;
            if (!events || events.length === 0) return;
            h.download((h.getFile().name || 'calendar').replace('.ics', '') + '.json', JSON.stringify(events, null, 2), 'application/json');
          }
        },
        {
          label: '📊 Export CSV',
          id: 'dl-csv',
          onClick: function (h) {
            const events = h.getState().events;
            if (!events || events.length === 0) return;
            const headers = ['Summary', 'Start', 'End', 'Location', 'Description'];
            const rows = events.map(e => [
              e.summary,
              e.start ? new Date(e.start).toISOString() : '',
              e.end ? new Date(e.end).toISOString() : '',
              e.location,
              e.description
            ].map(v => '"' + (String(v || '')).replace(/"/g, '""') + '"').join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            h.download((h.getFile().name || 'calendar').replace('.ics', '') + '.csv', csv, 'text/csv');
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (typeof ICAL === 'undefined') {
          h.showLoading('Initializing iCalendar engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        h.showLoading('Parsing calendar events...');

        // Execute in next tick to show loading state
        setTimeout(function() {
          try {
            const jcal = ICAL.parse(content);
            const comp = new ICAL.Component(jcal);
            const vevents = comp.getAllSubcomponents('vevent');
            
            _events = vevents.map(v => {
              const e = new ICAL.Event(v);
              return {
                summary: e.summary || 'Untitled Event',
                start: e.startDate ? e.startDate.toJSDate() : null,
                end: e.endDate ? e.endDate.toJSDate() : null,
                location: e.location || '',
                description: e.description || '',
                uid: e.uid || Math.random().toString(36).substr(2, 9)
              };
            }).filter(e => e.start).sort((a, b) => a.start - b.start);

            h.setState('events', _events);
            renderView(h, file);

          } catch (err) {
            console.error('ICS Parse Error:', err);
            h.showError('Could not open ICS file', 'The file may be corrupted or in an unsupported iCalendar variant. Ensure it is a valid .ics file.');
          }
        }, 50);
      }
    });

    function renderView(h, file) {
      const filtered = _filterText 
        ? _events.filter(e => 
            e.summary.toLowerCase().includes(_filterText) || 
            e.description.toLowerCase().includes(_filterText) ||
            e.location.toLowerCase().includes(_filterText)
          )
        : _events;

      const html = `
        <div class="omni-ics-tool">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">iCalendar Format</span>
          </div>

          <!-- Live Search / Filter Box -->
          <div class="mb-6">
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
              <input 
                type="text" 
                id="ics-search" 
                placeholder="Search events, locations, or descriptions..." 
                class="w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                value="${esc(_filterText)}"
              >
            </div>
          </div>

          <!-- U10: Section Header -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 flex items-center gap-2">
              Upcoming Events
              ${_filterText ? `<span class="text-xs font-normal text-surface-400">(Filtered)</span>` : ''}
            </h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-semibold">${filtered.length} items</span>
          </div>

          ${filtered.length === 0 ? `
            <!-- U5: Empty State -->
            <div class="py-20 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <div class="text-4xl mb-3">📅</div>
              <p class="text-surface-500 font-medium">${_filterText ? 'No events match your search criteria.' : 'This calendar contains no valid events.'}</p>
              ${_filterText ? `<button id="clear-search" class="mt-4 text-brand-600 font-semibold hover:underline">Clear search</button>` : ''}
            </div>
          ` : `
            <!-- U9: Content Cards -->
            <div class="grid grid-cols-1 gap-4">
              ${filtered.map(e => {
                const startStr = e.start ? e.start.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
                const endStr = e.end ? e.end.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
                
                return `
                  <div class="group bg-white rounded-2xl border border-surface-200 p-5 hover:border-brand-300 hover:shadow-md transition-all duration-200 relative overflow-hidden">
                    <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-xs font-bold text-brand-600 uppercase tracking-wider">${startStr}</span>
                          ${endStr ? `<span class="text-surface-300">→</span> <span class="text-xs font-bold text-surface-500 uppercase tracking-wider">${endStr}</span>` : ''}
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 mb-2 group-hover:text-brand-700 transition-colors">${esc(e.summary)}</h4>
                        
                        <div class="flex flex-wrap gap-y-2 gap-x-4 mt-3">
                          ${e.location ? `
                            <div class="flex items-center gap-1.5 text-sm text-surface-600">
                              <span class="opacity-70">📍</span>
                              <span class="truncate max-w-[300px]">${esc(e.location)}</span>
                            </div>
                          ` : ''}
                          <div class="flex items-center gap-1.5 text-sm text-surface-500">
                            <span class="opacity-70">🆔</span>
                            <span class="font-mono text-[10px] uppercase">${esc(e.uid.substring(0, 12))}</span>
                          </div>
                        </div>
                      </div>

                      <div class="flex md:flex-col gap-2 shrink-0">
                        <a href="${getGoogleCalUrl(e)}" target="_blank" 
                           class="flex items-center justify-center gap-2 px-4 py-2 bg-surface-50 hover:bg-brand-500 hover:text-white text-surface-700 text-xs font-bold rounded-lg border border-surface-200 hover:border-brand-500 transition-all shadow-sm">
                          <span>＋</span> Google Cal
                        </a>
                      </div>
                    </div>

                    ${e.description ? `
                      <div class="mt-4 pt-4 border-t border-surface-100">
                        <p class="text-sm text-surface-600 leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-help" title="Click to expand description">
                          ${esc(e.description)}
                        </p>
                      </div>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      `;

      h.render(html);

      // Bind Search Event
      const searchInput = document.getElementById('ics-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          _filterText = e.target.value.toLowerCase();
          renderView(h, file);
          // Refocus after render
          const newSearch = document.getElementById('ics-search');
          if (newSearch) {
            newSearch.focus();
            newSearch.setSelectionRange(_filterText.length, _filterText.length);
          }
        });
      }

      // Bind Clear Search
      const clearBtn = document.getElementById('clear-search');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          _filterText = '';
          renderView(h, file);
        });
      }
    }
  };
})();
