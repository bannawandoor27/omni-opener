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
    // Split by "From " at the beginning of a line
    const rawParts = text.split(/^From\s/m);

    for (let part of rawParts) {
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
        // Handle folded headers
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
          label: '📋 Export Index (CSV)',
          id: 'export-csv',
          onClick: function (h) {
            const msgs = h.getState().messages;
            if (!msgs || msgs.length === 0) return;
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
            if (msgs && msgs.length > 0) {
              h.download('mailbox.json', JSON.stringify(msgs, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        // B1 & B4: Check for dependencies
        if (typeof Chart === 'undefined') {
          h.showLoading('Initializing visualization engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        // U2 & U6: Immediate feedback
        h.showLoading('Parsing mailbox archive...');

        // B8: Use setTimeout with named function reference for strict mode safety
        setTimeout(function() {
          try {
            const messages = parseMbox(content);
            h.setState('messages', messages);
            h.setState('filteredMessages', messages);
            h.setState('selectedIdx', null);
            h.setState('view', 'list');

            // U5: Empty state handling
            if (messages.length === 0) {
              h.render(`
                <div class="flex flex-col items-center justify-center p-20 text-center bg-white rounded-2xl border border-dashed border-surface-300">
                  <div class="w-16 h-16 bg-surface-50 rounded-full flex items-center justify-center mb-4 text-2xl">📥</div>
                  <h3 class="text-lg font-semibold text-surface-900">No Messages Found</h3>
                  <p class="text-surface-500 max-w-xs mt-1">This MBOX file appears to be empty or in an unsupported format.</p>
                </div>
              `);
              return;
            }

            // B7: Large file handling (truncation for UI performance)
            const MAX_DISPLAY = 1000;
            const isTruncated = messages.length > MAX_DISPLAY;

            const renderList = (list) => {
              const selectedIdx = h.getState().selectedIdx;
              if (list.length === 0) {
                return `<div class="p-12 text-center text-surface-400 text-sm italic">No matching messages found</div>`;
              }
              
              const displayList = list.slice(0, MAX_DISPLAY);
              
              return displayList.map((m) => {
                const globalIdx = messages.indexOf(m);
                const isSelected = selectedIdx === globalIdx;
                return `
                  <div class="msg-item p-4 cursor-pointer transition-all border-l-4 ${isSelected ? 'bg-brand-50 border-brand-500 shadow-inner' : 'border-transparent hover:bg-surface-50'}" data-idx="${globalIdx}">
                    <div class="flex justify-between items-start gap-2 mb-1">
                      <h4 class="text-sm font-bold text-surface-900 truncate flex-1">${escapeHTML(m.subject)}</h4>
                      <span class="text-[10px] font-medium text-surface-400 whitespace-nowrap">${escapeHTML(m.date.split(' ').slice(0, 3).join(' '))}</span>
                    </div>
                    <div class="text-xs text-surface-500 truncate">${escapeHTML(m.from)}</div>
                  </div>
                `;
              }).join('');
            };

            const renderDetail = (m, idx) => {
              if (!m) return '';
              return `
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
                  <div class="flex-1 overflow-y-auto p-8 bg-surface-50/20">
                    <div class="rounded-xl border border-surface-200 bg-white p-6 shadow-sm min-h-full leading-relaxed text-surface-700 font-sans text-sm whitespace-pre-wrap">${escapeHTML(m.body)}</div>
                  </div>
                  <div class="px-6 py-4 bg-surface-50 border-t border-surface-100 flex justify-between items-center">
                    <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Message ${idx + 1} of ${messages.length}</span>
                    <button id="toggle-headers" class="text-[10px] font-black text-brand-600 uppercase tracking-widest hover:underline">View Raw Headers</button>
                  </div>
                  <div id="headers-view" class="hidden p-6 bg-gray-950 border-t border-surface-800 max-h-64 overflow-y-auto">
                    <pre class="text-[11px] font-mono text-gray-100 leading-relaxed">${escapeHTML(Object.entries(m.headers).map(([k,v]) => `${k}: ${v}`).join('\n'))}</pre>
                  </div>
                </div>
              `;
            };

            const updateUI = () => {
              const selectedIdx = h.getState().selectedIdx;
              const view = h.getState().view;
              const filtered = h.getState().filteredMessages || messages;

              // U1: File info bar
              h.render(`
                <div class="max-w-7xl mx-auto font-sans text-surface-900">
                  <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
                    <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
                    <span class="text-surface-300">|</span>
                    <span>${formatBytes(file.size)}</span>
                    <span class="text-surface-300">|</span>
                    <span class="text-surface-500">.mbox file</span>
                    ${isTruncated ? `<span class="ml-auto text-amber-600 font-bold text-xs">Showing ${MAX_DISPLAY} of ${messages.length}</span>` : ''}
                  </div>

                  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[800px]">
                    <!-- Sidebar -->
                    <div class="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                      <div class="p-4 border-b border-surface-100 bg-surface-50/30">
                        <div class="flex items-center justify-between mb-4">
                          <h3 class="font-bold text-surface-800">Mailbox</h3>
                          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${messages.length} items</span>
                        </div>
                        
                        <!-- Search Box (Format-Specific Excellence) -->
                        <div class="relative mb-4">
                          <input type="text" id="mbox-search" placeholder="Search subject or sender..." class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-xl outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all">
                          <span class="absolute left-3 top-2.5 text-surface-400 text-sm">🔍</span>
                        </div>

                        <div class="flex gap-1 p-1 bg-surface-100 rounded-xl">
                          <button id="view-list" class="flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'list' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">Messages</button>
                          <button id="view-stats" class="flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'stats' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">Analytics</button>
                        </div>
                      </div>
                      
                      <div id="sidebar-content" class="flex-1 overflow-y-auto divide-y divide-surface-100">
                        ${view === 'list' ? renderList(filtered) : `
                          <div class="p-6">
                            <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-4">Top Correspondents</h4>
                            <div class="h-64 mb-8">
                              <canvas id="stats-chart"></canvas>
                            </div>
                            <div id="stats-table" class="space-y-2"></div>
                          </div>
                        `}
                      </div>
                    </div>

                    <!-- Main View -->
                    <div id="detail-pane" class="lg:col-span-8 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col">
                      ${selectedIdx !== null ? renderDetail(messages[selectedIdx], selectedIdx) : `
                        <div class="flex-1 flex flex-col items-center justify-center p-12 text-surface-400 bg-surface-50/10">
                          <div class="w-20 h-20 bg-brand-50 rounded-3xl flex items-center justify-center mb-6 text-3xl shadow-sm rotate-3">📧</div>
                          <h3 class="text-lg font-bold text-surface-800">Select an email to read</h3>
                          <p class="text-sm text-surface-500 mt-2 text-center max-w-xs">Privacy notice: Your emails are parsed entirely in your browser and never leave your computer.</p>
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
              const searchInput = document.getElementById('mbox-search');
              if (searchInput) {
                searchInput.value = h.getState().searchTerm || '';
                searchInput.oninput = (e) => {
                  const term = e.target.value.toLowerCase();
                  h.setState('searchTerm', term);
                  const filtered = messages.filter(m => 
                    m.subject.toLowerCase().includes(term) || 
                    m.from.toLowerCase().includes(term) ||
                    m.body.toLowerCase().includes(term)
                  );
                  h.setState('filteredMessages', filtered);
                  
                  if (h.getState().view === 'list') {
                    document.getElementById('sidebar-content').innerHTML = renderList(filtered);
                    attachItemClicks();
                  }
                };
              }

              const attachItemClicks = () => {
                document.querySelectorAll('.msg-item').forEach(el => {
                  el.onclick = () => {
                    const idx = parseInt(el.dataset.idx);
                    h.setState('selectedIdx', idx);
                    updateUI();
                  };
                });
              };

              attachItemClicks();
              
              const vList = document.getElementById('view-list');
              const vStats = document.getElementById('view-stats');
              if (vList) vList.onclick = () => { h.setState('view', 'list'); updateUI(); };
              if (vStats) vStats.onclick = () => { h.setState('view', 'stats'); updateUI(); };

              const dlEml = document.getElementById('dl-eml');
              if (dlEml) dlEml.onclick = () => {
                const idx = h.getState().selectedIdx;
                const m = messages[idx];
                h.download(`message_${idx + 1}.eml`, m.raw, 'message/rfc822');
              };

              const tHdr = document.getElementById('toggle-headers');
              if (tHdr) tHdr.onclick = () => {
                const hv = document.getElementById('headers-view');
                if (hv) {
                  hv.classList.toggle('hidden');
                  tHdr.innerText = hv.classList.contains('hidden') ? 'View Raw Headers' : 'Hide Raw Headers';
                }
              };
            };

            const renderStats = () => {
              const ctx = document.getElementById('stats-chart');
              if (!ctx) return;
              
              const senders = {};
              messages.forEach(m => {
                const s = m.from.split('<')[0].replace(/"/g, '').trim() || m.from;
                senders[s] = (senders[s] || 0) + 1;
              });
              
              const sorted = Object.entries(senders).sort((a,b) => b[1] - a[1]).slice(0, 10);
              
              if (chartInstance) chartInstance.destroy();
              chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                  labels: sorted.map(s => s[0]),
                  datasets: [{
                    data: sorted.map(s => s[1]),
                    backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#94a3b8', '#fbbf24', '#2dd4bf'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                  }]
                },
                options: { 
                  responsive: true, 
                  maintainAspectRatio: false, 
                  cutout: '75%',
                  plugins: { 
                    legend: { display: false }
                  } 
                }
              });

              const tableEl = document.getElementById('stats-table');
              if (tableEl) {
                tableEl.innerHTML = sorted.map(([name, count]) => `
                  <div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-50 transition-colors">
                    <span class="text-xs text-surface-700 truncate mr-4">${escapeHTML(name)}</span>
                    <span class="text-xs font-bold text-surface-900">${count}</span>
                  </div>
                `).join('');
              }
            };

            updateUI();
          } catch (err) {
            console.error('MBOX Parser Error:', err);
            h.showError('Could not open mbox file', 'The file may be corrupted or in an unsupported variant. Try exporting it again from your mail client.');
          }
        }, 50);
      }
    });
  };
})();
