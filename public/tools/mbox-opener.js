/**
 * OmniOpener — Production-Grade MBOX Toolkit
 * A high-performance, secure, and beautiful browser-based mailbox viewer.
 */
(function () {
  'use strict';

  // Robust HTML escaping to prevent XSS (Mandate B6)
  const escapeHTML = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Human-readable file sizes (Mandate U1)
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  /**
   * High-performance MBOX Parser
   */
  const parseMbox = (text) => {
    const messages = [];
    const rawParts = text.split(/^From\s/m);

    for (const part of rawParts) {
      if (!part.trim()) continue;

      const lines = part.split(/\r?\n/);
      const headers = {};
      let bodyStart = -1;
      let currentHeader = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') {
          bodyStart = i + 1;
          break;
        }
        if (line.match(/^[ \t]/) && currentHeader) {
          headers[currentHeader] += ' ' + line.trim();
          continue;
        }
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
          currentHeader = key;
        }
      }

      const body = bodyStart !== -1 ? lines.slice(bodyStart).join('\n') : '';
      messages.push({
        subject: headers.subject || '(No Subject)',
        from: headers.from || 'Unknown Sender',
        date: headers.date || 'Unknown Date',
        headers: headers,
        body: body,
        raw: 'From ' + part
      });
    }
    return messages;
  };

  window.initTool = function (toolConfig, mountEl) {
    let chartInstance = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mbox',
      binary: false,
      infoHtml: '<strong>MBOX Explorer:</strong> Privacy-focused browser-side mailbox viewer. Analyze headers, search messages, and export EML files securely.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      onDestroy: function () {
        if (chartInstance) {
          chartInstance.destroy();
          chartInstance = null;
        }
      },

      actions: [
        {
          label: '📋 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const msgs = h.getState().messages;
            if (!msgs) return;
            const rows = [['Subject', 'From', 'Date'], ...msgs.map(m => [m.subject, m.from, m.date])];
            const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
            h.download('mailbox_index.csv', csv, 'text/csv');
          }
        },
        {
          label: '📦 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const msgs = h.getState().messages;
            if (msgs) h.download('mailbox.json', JSON.stringify(msgs, null, 2), 'application/json');
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (typeof Chart === 'undefined') {
          h.showLoading('Preparing engine...');
          setTimeout(() => _onFileFn(file, content, h), 200);
          return;
        }

        h.showLoading('Parsing mailbox archive...');

        setTimeout(() => {
          try {
            const messages = parseMbox(content);
            h.setState('messages', messages);
            h.setState('selectedIdx', null);
            h.setState('view', 'list');

            if (messages.length === 0) {
              h.render(`
                <div class="flex flex-col items-center justify-center p-20 text-center bg-white rounded-2xl border border-dashed border-surface-300">
                  <div class="w-16 h-16 bg-surface-50 rounded-full flex items-center justify-center mb-4 text-2xl">📥</div>
                  <h3 class="text-lg font-semibold text-surface-900">No Messages Found</h3>
                  <p class="text-surface-500 max-w-xs mt-1">This MBOX file appears to be empty.</p>
                </div>
              `);
              return;
            }

            const MAX_DISPLAY = 1500;
            const isTruncated = messages.length > MAX_DISPLAY;

            const renderList = (list, activeIdx) => {
              if (list.length === 0) return `<div class="p-12 text-center text-surface-400 text-sm italic">No messages found</div>`;
              return list.map((m) => {
                const globalIdx = messages.indexOf(m);
                return `
                  <div class="msg-item p-4 cursor-pointer transition-all border-l-4 ${activeIdx === globalIdx ? 'bg-brand-50 border-brand-500' : 'border-transparent hover:bg-surface-50'}" data-idx="${globalIdx}">
                    <div class="flex justify-between items-start gap-2 mb-1">
                      <h4 class="text-sm font-bold text-surface-900 truncate flex-1">${escapeHTML(m.subject)}</h4>
                      <span class="text-[10px] font-medium text-surface-400 whitespace-nowrap">${escapeHTML(m.date.split(' ').slice(0, 3).join(' '))}</span>
                    </div>
                    <div class="text-xs text-surface-500 truncate">${escapeHTML(m.from)}</div>
                  </div>
                `;
              }).join('');
            };

            const renderDetail = (m, idx) => `
              <div class="flex flex-col h-full bg-white">
                <div class="p-6 bg-surface-50/50 border-b border-surface-100">
                  <div class="flex justify-between items-start gap-4 mb-6">
                    <h2 class="text-2xl font-black text-surface-950 leading-tight">${escapeHTML(m.subject)}</h2>
                    <button id="dl-eml" class="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border border-surface-200 rounded-xl text-xs font-bold text-surface-700 hover:border-brand-500 hover:text-brand-600 transition-all shadow-sm">
                      📥 Download .eml
                    </button>
                  </div>
                  <div class="space-y-2">
                    <div class="flex items-baseline gap-3">
                      <span class="w-12 text-[10px] font-black text-surface-400 uppercase tracking-widest text-right">From</span>
                      <span class="text-sm font-bold text-surface-800">${escapeHTML(m.from)}</span>
                    </div>
                    <div class="flex items-baseline gap-3">
                      <span class="w-12 text-[10px] font-black text-surface-400 uppercase tracking-widest text-right">Date</span>
                      <span class="text-sm text-surface-600">${escapeHTML(m.date)}</span>
                    </div>
                  </div>
                </div>
                <div class="flex-1 overflow-y-auto p-8">
                  <div class="rounded-xl border border-surface-100 bg-surface-50/30 p-6 min-h-full">
                    <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed text-surface-700">${escapeHTML(m.body)}</pre>
                  </div>
                </div>
                <div class="px-6 py-4 bg-surface-50 border-t border-surface-100 flex justify-between items-center">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Message #${idx + 1}</span>
                  <button id="toggle-headers" class="text-[10px] font-black text-brand-600 uppercase tracking-widest hover:underline">View Raw Headers</button>
                </div>
                <div id="headers-view" class="hidden p-6 bg-surface-950 border-t border-surface-800 max-h-64 overflow-y-auto">
                  <pre class="text-[11px] font-mono text-brand-200">${escapeHTML(Object.entries(m.headers).map(([k,v]) => `${k}: ${v}`).join('\n'))}</pre>
                </div>
              </div>
            `;

            const updateUI = () => {
              const selectedIdx = h.getState().selectedIdx;
              const view = h.getState().view;

              h.render(`
                <div class="max-w-7xl mx-auto font-sans text-surface-900">
                  <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-xs text-surface-600 mb-6 border border-surface-200">
                    <span class="font-bold text-surface-800">${escapeHTML(file.name)}</span>
                    <span class="text-surface-300">|</span>
                    <span>${formatBytes(file.size)}</span>
                    <span class="text-surface-300">|</span>
                    <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-medium">MBOX</span>
                    ${isTruncated ? `<span class="ml-auto text-amber-600 font-bold">Showing ${MAX_DISPLAY} of ${messages.length}</span>` : ''}
                  </div>

                  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px]">
                    <div class="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div class="p-4 border-b border-surface-100 bg-surface-50/30">
                        <div class="flex items-center justify-between mb-4">
                          <h3 class="font-bold text-surface-800">Mailbox</h3>
                          <span class="text-[10px] font-bold bg-surface-900 text-white px-2 py-0.5 rounded-full">${messages.length}</span>
                        </div>
                        <div class="relative">
                          <input type="text" id="mbox-search" placeholder="Filter messages..." class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-xl outline-none focus:border-brand-500">
                          <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
                        </div>
                        <div class="flex gap-1 mt-4 p-1 bg-surface-100 rounded-lg">
                          <button id="view-list" class="flex-1 py-1.5 text-xs font-bold rounded-md ${view === 'list' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500'}">Messages</button>
                          <button id="view-stats" class="flex-1 py-1.5 text-xs font-bold rounded-md ${view === 'stats' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500'}">Stats</button>
                        </div>
                      </div>
                      <div id="sidebar-content" class="flex-1 overflow-y-auto divide-y divide-surface-100">
                        ${view === 'list' ? renderList(messages.slice(0, MAX_DISPLAY), selectedIdx) : `<div class="p-6"><canvas id="stats-chart" class="h-64"></canvas></div>`}
                      </div>
                    </div>
                    <div id="detail-pane" class="lg:col-span-8 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
                      ${selectedIdx !== null ? renderDetail(messages[selectedIdx], selectedIdx) : `
                        <div class="flex-1 flex flex-col items-center justify-center p-12 text-surface-400">
                          <div class="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mb-4 text-2xl">📧</div>
                          <p class="font-bold text-surface-800">Select a message</p>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              `);

              attachEvents();
              if (view === 'stats') renderStats();
            };

            const attachEvents = () => {
              const search = document.getElementById('mbox-search');
              if (search) {
                search.oninput = (e) => {
                  if (h.getState().view !== 'list') return;
                  const term = e.target.value.toLowerCase();
                  const filtered = messages.filter(m => m.subject.toLowerCase().includes(term) || m.from.toLowerCase().includes(term)).slice(0, MAX_DISPLAY);
                  document.getElementById('sidebar-content').innerHTML = renderList(filtered, h.getState().selectedIdx);
                  // Immediate re-attach for search results
                  document.querySelectorAll('.msg-item').forEach(el => el.onclick = () => selectMsg(parseInt(el.dataset.idx)));
                };
              }

              const selectMsg = (idx) => {
                h.setState('selectedIdx', idx);
                updateUI();
              };

              document.querySelectorAll('.msg-item').forEach(el => el.onclick = () => selectMsg(parseInt(el.dataset.idx)));
              
              const vList = document.getElementById('view-list');
              const vStats = document.getElementById('view-stats');
              if (vList) vList.onclick = () => { h.setState('view', 'list'); updateUI(); };
              if (vStats) vStats.onclick = () => { h.setState('view', 'stats'); updateUI(); };

              const dlEml = document.getElementById('dl-eml');
              if (dlEml) dlEml.onclick = () => {
                const m = messages[h.getState().selectedIdx];
                h.download(`message_${h.getState().selectedIdx + 1}.eml`, m.raw, 'message/rfc822');
              };

              const tHdr = document.getElementById('toggle-headers');
              if (tHdr) tHdr.onclick = () => {
                const hv = document.getElementById('headers-view');
                hv.classList.toggle('hidden');
                tHdr.innerText = hv.classList.contains('hidden') ? 'View Raw Headers' : 'Hide Raw Headers';
              };
            };

            const renderStats = () => {
              const ctx = document.getElementById('stats-chart');
              if (!ctx) return;
              const senders = {};
              messages.forEach(m => {
                const s = m.from.split('<')[0].replace(/"/g, '').trim() || 'Unknown';
                senders[s] = (senders[s] || 0) + 1;
              });
              const sorted = Object.entries(senders).sort((a,b) => b[1] - a[1]).slice(0, 7);
              
              if (chartInstance) chartInstance.destroy();
              chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                  labels: sorted.map(s => s[0]),
                  datasets: [{
                    data: sorted.map(s => s[1]),
                    backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6'],
                    borderWidth: 0
                  }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } } } }
              });
            };

            updateUI();
          } catch (err) {
            console.error(err);
            h.showError('Parsing failed', 'Could not parse MBOX file.');
          }
        }, 100);
      }
    });
  };
})();
