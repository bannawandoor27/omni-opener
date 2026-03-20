/**
 * OmniOpener — ICS Toolkit
 * Uses OmniTool SDK and ical.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ics',
      binary: false,
      infoHtml: '<strong>ICS Toolkit:</strong> Professional calendar viewer with event extraction and JSON export.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js');
      },

      actions: [
        {
          label: '📋 Copy as JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const data = h.getState().events;
            if (data) h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof ICAL === 'undefined') {
          h.showLoading('Loading engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        try {
          const jcal = ICAL.parse(content);
          const comp = new ICAL.Component(jcal);
          const events = comp.getAllSubcomponents('vevent').map(v => {
             const e = new ICAL.Event(v);
             return {
                summary: e.summary,
                start: e.startDate.toString(),
                end: e.endDate.toString(),
                location: e.location,
                description: e.description
             };
          });

          h.setState('events', events);

          if (events.length === 0) {
             h.render(`<div class="p-12 text-center text-surface-400">This calendar file does not contain any events.</div>`);
             return;
          }

          h.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-3 flex items-center justify-between">
                 <span class="text-xs font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
                 <span class="text-[10px] font-bold text-brand-600 uppercase tracking-widest">${events.length} Events Found</span>
              </div>
              <div class="flex-1 overflow-auto bg-surface-100/50 p-6 space-y-4">
                 ${events.map(e => `
                   <div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow">
                      <h3 class="text-lg font-bold text-surface-900 mb-2">${escapeHtml(e.summary || 'No Title')}</h3>
                      <div class="flex flex-wrap gap-4 text-xs text-surface-500 mb-4">
                         <div class="flex items-center gap-1">📅 ${escapeHtml(e.start)}</div>
                         <div class="flex items-center gap-1">📍 ${escapeHtml(e.location || 'No Location')}</div>
                      </div>
                      ${e.description ? `<div class="text-xs text-surface-600 border-t border-surface-50 pt-3 leading-relaxed">${escapeHtml(e.description)}</div>` : ''}
                   </div>
                 `).join('')}
              </div>
            </div>
          `);

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">This file is not a valid iCalendar (.ics) document.</div>`);
        }
      }
    });
  };
})();
