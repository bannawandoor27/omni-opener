/**
 * OmniOpener — Production-Grade MBOX Toolkit
 * A high-performance, secure, and beautiful browser-based mailbox viewer.
 */
(function () {
  'use strict';

  // Helper for human-readable file sizes
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Robust HTML escaping
  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Simplified MBOX parser
  function parseMbox(text) {
    const messages = [];
    // Split by the "From " line at the start of a message
    // Note: This regex assumes standard mbox formatting
    const parts = text.split(/^From\s/m);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      const lines = part.split(/\r?\n/);
      const headers = {};
      let bodyStart = -1;

      // The first line of 'part' might be the remainder of the "From " line if we split at "From "
      // but standard split(/^From /m) removes the "From ". 
      // Actually, if we use a capturing group or lookahead we could keep it, 
      // but let's just parse what we have.

      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        if (line === '') {
          bodyStart = j + 1;
          break;
        }
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }

      const body = bodyStart !== -1 ? lines.slice(bodyStart).join('\n') : '';
      messages.push({
        subject: headers.subject || '(No Subject)',
        from: headers.from || 'Unknown Sender',
        date: headers.date || '',
        headers: headers,
        body: body,
        raw: 'From ' + part
      });
    }
    return messages;
  }

  window.initTool = function (toolConfig, mountEl) {
    let chartInstance = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.mbox',
      binary: false,
      infoHtml: '<strong>MBOX Toolkit:</strong> Secure browser-side mailbox analysis with privacy-first parsing and visual statistics.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      onDestroy: function() {
        if (chartInstance) {
          chartInstance.destroy();
          chartInstance = null;
        }
      },

      actions: [
        {
          label: '📋 Export Metadata',
          id: 'export-csv',
          onClick: function (h) {
            const msgs = h.getState().messages;
            if (!msgs || msgs.length === 0) return;
            const headers = ['Subject', 'From', 'Date'];
            const rows = msgs.map(m => [
              `"${(m.subject || '').replace(/"/g, '""')}"`,
              `"${(m.from || '').replace(/"/g, '""')}"`,
              `"${(m.date || '').replace(/"/g, '""')}"`
            ].join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            h.download('mailbox-metadata.csv', csv, 'text/csv');
          }
        },
        {
          label: '📦 Download JSON',
          id: 'export-json',
          onClick: function (h) {
            const msgs = h.getState().messages;
            if (msgs) h.download('mailbox.json', JSON.stringify(msgs, null, 2));
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        // Race condition check for Chart.js
        if (typeof Chart === 'undefined') {
          h.showLoading('Initializing engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Parsing mailbox...');
        
        // Use a timeout to allow the loading message to render
        setTimeout(function() {
          try {
            const messages = parseMbox(content);
            h.setState('messages', messages);
            h.setState('filtered', messages);

            if (messages.length === 0) {
              h.render(`
                <div class="flex flex-col items-center justify-center p-20 text-center">
                  <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
                    <span class="text-2xl">📁</span>
                  </div>
                  <h3 class="text-lg font-semibold text-surface-900">Empty Mailbox</h3>
                  <p class="text-surface-500 max-w-xs mt-1">This file appears to be valid but contains no messages.</p>
                </div>
              `);
              return;
            }

            // Truncate for performance if necessary
            const isTruncated = messages.length > 2000;
            const displayMessages = isTruncated ? messages.slice(0, 2000) : messages;

            const renderUI = () => {
              const currentFiltered = h.getState().filtered || [];
              const stats = {};
              messages.forEach(m => {
                const s = m.from.split('<')[0].replace(/"/g, '').trim() || 'Unknown';
                stats[s] = (stats[s] || 0) + 1;
              });

              h.render(`
                <div class="max-w-7xl mx-auto p-4 md:p-6 font-sans">
                  <!-- U1: File Info Bar -->
                  <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                    <span class="font-semibold text-surface-800">${escape(file.name)}</span>
                    <span class="text-surface-300">|</span>
                    <span>${formatSize(file.size)}</span>
                    <span class="text-surface-300">|</span>
                    <span class="text-surface-500">MBOX Format</span>
                    ${isTruncated ? `<span class="ml-auto text-amber-600 font-medium">⚠️ Showing first 2,000 of ${messages.length.toLocaleString()} messages</span>` : ''}
                  </div>

                  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[750px]">
                    <!-- Sidebar: Search and List -->
                    <div class="lg:col-span-4 flex flex-col bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                      <div class="p-4 border-b border-surface-100">
                        <div class="flex items-center justify-between mb-3">
                          <h3 class="font-bold text-surface-900">Messages</h3>
                          <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">${messages.length.toLocaleString()}</span>
                        </div>
                        <div class="relative">
                          <input type="text" id="mbox-search-input" placeholder="Search by subject or sender..." 
                            class="w-full pl-9 pr-4 py-2 text-sm bg-surface-50 border border-surface-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                          <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
                        </div>
                        <div class="flex mt-3 p-1 bg-surface-50 rounded-lg border border-surface-100">
                          <button id="tab-btn-list" class="flex-1 py-1.5 text-xs font-bold rounded-md bg-white shadow-sm text-brand-600 transition-all">Inbox</button>
                          <button id="tab-btn-stats" class="flex-1 py-1.5 text-xs font-bold rounded-md text-surface-500 hover:text-surface-700 transition-all">Analytics</button>
                        </div>
                      </div>

                      <div id="mbox-sidebar-content" class="flex-1 overflow-y-auto bg-white">
                        <div id="mbox-items-container" class="divide-y divide-surface-100">
                          ${renderMessageList(displayMessages)}
                        </div>
                        <div id="mbox-stats-container" class="hidden p-6 space-y-6">
                           <div class="bg-surface-50 rounded-xl p-4 border border-surface-100">
                              <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-4">Top Senders Distribution</h4>
                              <div class="h-64"><canvas id="mbox-dist-chart"></canvas></div>
                           </div>
                           <div class="space-y-2">
                             <h4 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest px-1">Engagement Summary</h4>
                             <div class="grid grid-cols-2 gap-2">
                               <div class="p-3 bg-surface-50 rounded-lg border border-surface-100 text-center">
                                 <div class="text-lg font-bold text-surface-900">${messages.length}</div>
                                 <div class="text-[10px] text-surface-500 uppercase">Total Emails</div>
                               </div>
                               <div class="p-3 bg-surface-50 rounded-lg border border-surface-100 text-center">
                                 <div class="text-lg font-bold text-surface-900">${Object.keys(stats).length}</div>
                                 <div class="text-[10px] text-surface-500 uppercase">Unique Senders</div>
                               </div>
                             </div>
                           </div>
                        </div>
                      </div>
                    </div>

                    <!-- Main Viewport -->
                    <div id="mbox-main-viewport" class="lg:col-span-8 flex flex-col bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                       <div class="flex-1 flex flex-col items-center justify-center text-center p-12 text-surface-400">
                          <div class="w-20 h-20 bg-brand-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <span class="text-3xl">📩</span>
                          </div>
                          <h3 class="text-lg font-semibold text-surface-800">No Message Selected</h3>
                          <p class="text-sm max-w-xs mt-2">Select an email from the list to view its contents, headers, and attachments.</p>
                       </div>
                    </div>
                  </div>
                </div>
              `);

              setupEvents();
            };

            const renderMessageList = (list) => {
              if (list.length === 0) {
                return `<div class="p-12 text-center text-surface-400 text-sm italic">No matching messages</div>`;
              }
              return list.map((m, idx) => `
                <div class="mbox-msg-row p-4 hover:bg-brand-50/50 cursor-pointer transition-all border-l-4 border-transparent group" data-idx="${messages.indexOf(m)}">
                  <div class="flex justify-between items-start mb-1">
                    <h4 class="text-sm font-bold text-surface-900 truncate pr-4 group-hover:text-brand-700 transition-colors">${escape(m.subject)}</h4>
                    <span class="text-[10px] font-medium text-surface-400 whitespace-nowrap bg-surface-100 px-1.5 py-0.5 rounded">${escape(m.date.split(' ').slice(0, 3).join(' '))}</span>
                  </div>
                  <div class="text-xs text-surface-500 truncate">${escape(m.from)}</div>
                </div>
              `).join('');
            };

            const setupEvents = () => {
              const searchInput = document.getElementById('mbox-search-input');
              const itemsContainer = document.getElementById('mbox-items-container');
              const statsContainer = document.getElementById('mbox-stats-container');
              const sidebarContent = document.getElementById('mbox-sidebar-content');
              const viewport = document.getElementById('mbox-main-viewport');
              const tabList = document.getElementById('tab-btn-list');
              const tabStats = document.getElementById('tab-btn-stats');

              searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = messages.filter(m => 
                  m.subject.toLowerCase().includes(term) || 
                  m.from.toLowerCase().includes(term) ||
                  m.body.toLowerCase().includes(term)
                ).slice(0, 500); // Limit search results for UI responsiveness
                itemsContainer.innerHTML = renderMessageList(filtered);
              };

              sidebarContent.onclick = (e) => {
                const row = e.target.closest('.mbox-msg-row');
                if (!row) return;

                document.querySelectorAll('.mbox-msg-row').forEach(el => el.classList.remove('bg-brand-50', 'border-brand-500'));
                row.classList.add('bg-brand-50', 'border-brand-500');

                const idx = parseInt(row.getAttribute('data-idx'));
                const m = messages[idx];
                
                viewport.innerHTML = `
                  <div class="flex flex-col h-full">
                    <div class="shrink-0 p-6 bg-surface-50 border-b border-surface-100">
                       <div class="flex justify-between items-start mb-4">
                         <h2 class="text-xl font-bold text-surface-900 leading-tight">${escape(m.subject)}</h2>
                         <button id="btn-export-eml" class="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white border border-surface-200 rounded-lg text-xs font-bold text-surface-700 hover:bg-surface-50 hover:border-surface-300 transition-all shadow-sm">
                           <span>📥</span> Export EML
                         </button>
                       </div>
                       <div class="grid grid-cols-[60px_1fr] gap-y-2 text-xs">
                         <span class="text-surface-400 font-bold uppercase tracking-wider">From</span>
                         <span class="text-surface-800 font-semibold">${escape(m.from)}</span>
                         <span class="text-surface-400 font-bold uppercase tracking-wider">Date</span>
                         <span class="text-surface-600">${escape(m.date)}</span>
                       </div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-8 bg-white">
                       <div class="max-w-none prose prose-sm text-surface-700">
                          <pre class="whitespace-pre-wrap font-sans text-sm leading-relaxed">${escape(m.body)}</pre>
                       </div>
                    </div>
                    <div class="p-3 bg-surface-50 border-t border-surface-100 flex justify-center">
                       <button id="btn-show-raw" class="text-[10px] font-bold text-surface-400 uppercase tracking-widest hover:text-brand-600 transition-colors">Show Raw Headers</button>
                    </div>
                  </div>
                `;

                document.getElementById('btn-export-eml').onclick = () => h.download(`message-${idx}.eml`, m.raw, 'message/rfc822');
                document.getElementById('btn-show-raw').onclick = () => {
                  const rawWindow = window.open('', '_blank');
                  rawWindow.document.write(`<pre style="font-family:monospace;font-size:12px;padding:20px;">${escape(Object.entries(m.headers).map(([k,v]) => `${k}: ${v}`).join('\n'))}</pre>`);
                };
              };

              tabList.onclick = () => {
                tabList.className = "flex-1 py-1.5 text-xs font-bold rounded-md bg-white shadow-sm text-brand-600 transition-all";
                tabStats.className = "flex-1 py-1.5 text-xs font-bold rounded-md text-surface-500 hover:text-surface-700 transition-all";
                itemsContainer.classList.remove('hidden');
                statsContainer.classList.add('hidden');
              };

              tabStats.onclick = () => {
                tabStats.className = "flex-1 py-1.5 text-xs font-bold rounded-md bg-white shadow-sm text-brand-600 transition-all";
                tabList.className = "flex-1 py-1.5 text-xs font-bold rounded-md text-surface-500 hover:text-surface-700 transition-all";
                itemsContainer.classList.add('hidden');
                statsContainer.classList.remove('hidden');
                
                const senderStats = {};
                messages.forEach(m => {
                  const s = m.from.split('<')[0].replace(/"/g, '').trim() || 'Unknown';
                  senderStats[s] = (senderStats[s] || 0) + 1;
                });
                const sorted = Object.entries(senderStats).sort((a,b) => b[1] - a[1]).slice(0, 10);
                
                if (chartInstance) chartInstance.destroy();
                chartInstance = new Chart(document.getElementById('mbox-dist-chart'), {
                  type: 'doughnut',
                  data: {
                    labels: sorted.map(s => s[0]),
                    datasets: [{
                      data: sorted.map(s => s[1]),
                      backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#64748b'],
                      borderWidth: 0,
                      hoverOffset: 10
                    }]
                  },
                  options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 6, padding: 15, font: { size: 9, weight: 'bold' }, usePointStyle: true } }
                    }
                  }
                });
              };
            };

            renderUI();
          } catch (err) {
            console.error(err);
            h.showError('Parsing Failed', 'The MBOX file format was not recognized or the file is severely corrupted. Please ensure it is a valid mailbox export.');
          }
        }, 50);
      }
    });
  };
})();
