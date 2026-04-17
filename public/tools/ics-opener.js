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

      onFile: function _onFileFn(file, content, h) {
        if (typeof ICAL === 'undefined') {
          h.showLoading('Loading engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        try {
          const jcal = ICAL.parse(content);
          const comp = new ICAL.Component(jcal);
          const events = comp.getAllSubcomponents('vevent').map(v => {
             const e = new ICAL.Event(v);
             return {
                summary: e.summary,
                start: e.startDate.toJSDate(),
                end: e.endDate.toJSDate(),
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
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-4 py-2 flex items-center justify-between">
                 <div class="flex px-1 bg-white border border-surface-200 rounded-lg">
                    <button id="tab-list" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">List</button>
                    <button id="tab-grid" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400">Grid</button>
                 </div>
                 <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">${events.length} Events</span>
              </div>
              <div class="flex-1 overflow-hidden relative">
                 <div id="view-list" class="absolute inset-0 overflow-auto p-6 space-y-4 bg-surface-50">
                    ${events.map(e => `
                      <div class="bg-white p-5 rounded-xl border border-surface-200 shadow-sm">
                         <div class="flex justify-between items-start mb-2">
                            <h3 class="text-lg font-bold text-surface-900">${escapeHtml(e.summary || 'No Title')}</h3>
                            <a href="https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.summary)}&dates=${e.start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${e.end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z&details=${encodeURIComponent(e.description || '')}&location=${encodeURIComponent(e.location || '')}" target="_blank" class="px-2 py-1 bg-white border border-surface-200 rounded text-[10px] font-bold text-surface-600 hover:bg-surface-50 transition-colors">➕ Google Cal</a>
                         </div>
                         <div class="flex flex-wrap gap-4 text-xs text-surface-500 mb-4">
                            <div class="flex items-center gap-1">📅 ${e.start.toLocaleString()}</div>
                            <div class="flex items-center gap-1">📍 ${escapeHtml(e.location || 'No Location')}</div>
                         </div>
                         ${e.description ? `<div class="text-xs text-surface-600 border-t border-surface-50 pt-3 leading-relaxed">${escapeHtml(e.description)}</div>` : ''}
                      </div>
                    `).join('')}
                 </div>
                 <div id="view-grid" class="absolute inset-0 hidden overflow-auto p-8 bg-white">
                    <div class="grid grid-cols-7 border-t border-l border-surface-100">
                       ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="p-2 border-r border-b border-surface-100 bg-surface-50 text-[10px] font-bold text-center uppercase text-surface-400">${d}</div>`).join('')}
                       ${Array.from({ length: 35 }).map((_, i) => `<div class="h-24 p-2 border-r border-b border-surface-100 relative group"><span class="text-[10px] font-bold text-surface-300 group-hover:text-brand-500">${(i%31)+1}</span></div>`).join('')}
                    </div>
                 </div>
              </div>
            </div>
          `);

          const tabList = document.getElementById('tab-list');
          const tabGrid = document.getElementById('tab-grid');
          const viewList = document.getElementById('view-list');
          const viewGrid = document.getElementById('view-grid');

          tabList.onclick = () => {
             tabList.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             tabGrid.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400";
             viewList.classList.remove('hidden');
             viewGrid.classList.add('hidden');
          };

          tabGrid.onclick = () => {
             tabGrid.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             tabList.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400";
             viewGrid.classList.remove('hidden');
             viewList.classList.add('hidden');
          };


        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">This file is not a valid iCalendar (.ics) document.</div>`);
        }
      }
    });
  };
})();
