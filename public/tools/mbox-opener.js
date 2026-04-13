/**
 * OmniOpener — MBOX Toolkit
 * Uses OmniTool SDK and Chart.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function parseMbox(content) {
    const messages = [];
    const rawMessages = content.split(/^From /m);
    for (let raw of rawMessages) {
      if (!raw.trim()) continue;
      const lines = raw.split('\n');
      const headers = {};
      let bodyIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "") { bodyIndex = i; break; }
        const colon = line.indexOf(':');
        if (colon !== -1) {
          const key = line.substring(0, colon).trim().toLowerCase();
          headers[key] = line.substring(colon + 1).trim();
        }
      }
      messages.push({
        headers,
        body: lines.slice(bodyIndex).join('\n').trim(),
        raw: 'From ' + raw
      });
    }
    return messages;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mbox',
      binary: false,
      infoHtml: '<strong>MBOX Toolkit:</strong> Professional mailbox viewer with sender distribution analytics and bulk metadata export.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
      },

      actions: [
        {
          label: '📋 Export Metadata',
          id: 'export-meta',
          onClick: function (h) {
             const msgs = h.getState().messages;
             if (msgs) {
                const meta = msgs.map(m => m.headers);
                h.download('mailbox-metadata.json', JSON.stringify(meta, null, 2));
             }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (typeof Chart === 'undefined') {
          h.showLoading('Loading charts...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        const messages = parseMbox(content);
        h.setState('messages', messages);

        if (messages.length === 0) {
           h.render(`<div class="p-12 text-center text-surface-400">No messages found in this mailbox.</div>`);
           return;
        }

        const senderStats = {};
        messages.forEach(m => {
           const s = m.headers.from || 'Unknown';
           senderStats[s] = (senderStats[s] || 0) + 1;
        });

        const renderList = (filtered) => `
          <div class="divide-y divide-surface-100">
            ${filtered.map((m, i) => `
              <div class="msg-item p-4 hover:bg-surface-50 cursor-pointer transition-colors flex flex-col gap-1" data-index="${messages.indexOf(m)}">
                 <div class="flex justify-between items-start">
                    <span class="font-bold text-surface-900 truncate flex-1 pr-4">${escapeHtml(m.headers.subject || 'No Subject')}</span>
                    <span class="text-[10px] text-surface-400 font-mono whitespace-nowrap">${escapeHtml(m.headers.date || '')}</span>
                 </div>
                 <div class="text-xs text-surface-500 truncate">From: ${escapeHtml(m.headers.from || 'Unknown')}</div>
              </div>
            `).join('')}
          </div>
        `;

        h.render(`
          <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
            <!-- Sidebar -->
            <div class="w-80 shrink-0 border-r border-surface-200 flex flex-col bg-surface-50/30">
               <div class="p-4 border-b border-surface-200 bg-white">
                  <div class="flex items-center justify-between mb-4">
                     <div class="flex px-1 bg-surface-100 rounded-lg">
                        <button id="tab-inbox" class="px-3 py-1 text-[10px] font-bold border-b-2 border-brand-500 text-brand-600">Inbox</button>
                        <button id="tab-stats" class="px-3 py-1 text-[10px] font-bold border-b-2 border-transparent text-surface-400">Stats</button>
                     </div>
                     <span class="text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-bold">${messages.length}</span>
                  </div>
                  <input type="text" id="mbox-search" placeholder="Search mail..." class="w-full px-3 py-1.5 text-xs border border-surface-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20">
               </div>
               <div id="mbox-list" class="flex-1 overflow-auto">
                  ${renderList(messages)}
               </div>
               <div id="mbox-stats" class="flex-1 overflow-auto p-6 hidden">
                  <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-6 text-center">Top Senders</h3>
                  <div class="h-64"><canvas id="sender-chart"></canvas></div>
               </div>
            </div>

            <!-- View Area -->
            <div id="mbox-view" class="flex-1 overflow-auto bg-white flex flex-col">
               <div class="flex-1 flex flex-col items-center justify-center text-surface-300">
                  <span class="text-4xl mb-2">📩</span>
                  <p class="text-sm font-medium">Select a message to read</p>
               </div>
            </div>
          </div>
        `);

        const list = document.getElementById('mbox-list');
        const stats = document.getElementById('mbox-stats');
        const view = document.getElementById('mbox-view');
        const search = document.getElementById('mbox-search');

        const openMsg = (idx) => {
           const m = messages[idx];
           view.innerHTML = `
             <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-6 space-y-4">
                <h2 class="text-2xl font-bold text-surface-900">${escapeHtml(m.headers.subject || 'No Subject')}</h2>
                <div class="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                   <span class="text-surface-400 font-bold uppercase text-[10px]">From:</span>
                   <span class="text-surface-700 font-medium">${escapeHtml(m.headers.from || 'Unknown')}</span>
                   <span class="text-surface-400 font-bold uppercase text-[10px]">Date:</span>
                   <span class="text-surface-500">${escapeHtml(m.headers.date || '')}</span>
                </div>
             </div>
             <div class="flex-1 overflow-auto p-8 bg-white">
                <pre class="whitespace-pre-wrap font-sans text-surface-800 text-sm leading-relaxed">${escapeHtml(m.body)}</pre>
             </div>
             <div class="p-4 border-t border-surface-100 bg-surface-50 flex justify-end">
                <button id="btn-dl-msg" class="px-3 py-1.5 bg-white border border-surface-200 rounded text-xs font-bold hover:bg-surface-100 transition-colors">📥 Export .eml</button>
             </div>
           `;
           document.getElementById('btn-dl-msg').onclick = () => h.download('message.eml', m.raw);
        };

        list.onclick = (e) => {
           const item = e.target.closest('.msg-item');
           if (item) {
              document.querySelectorAll('.msg-item').forEach(el => el.classList.remove('bg-brand-50', 'border-l-4', 'border-brand-500'));
              item.classList.add('bg-brand-50', 'border-l-4', 'border-brand-500');
              openMsg(item.getAttribute('data-index'));
           }
        };

        search.oninput = (e) => {
           const term = e.target.value.toLowerCase();
           const filtered = messages.filter(m => JSON.stringify(m.headers).toLowerCase().includes(term) || m.body.toLowerCase().includes(term));
           list.innerHTML = renderList(filtered);
        };

        document.getElementById('tab-inbox').onclick = () => {
           document.getElementById('tab-inbox').className = "px-3 py-1 text-[10px] font-bold border-b-2 border-brand-500 text-brand-600";
           document.getElementById('tab-stats').className = "px-3 py-1 text-[10px] font-bold border-b-2 border-transparent text-surface-400";
           list.classList.remove('hidden');
           stats.classList.add('hidden');
        };

        document.getElementById('tab-stats').onclick = () => {
           document.getElementById('tab-stats').className = "px-3 py-1 text-[10px] font-bold border-b-2 border-brand-500 text-brand-600";
           document.getElementById('tab-inbox').className = "px-3 py-1 text-[10px] font-bold border-b-2 border-transparent text-surface-400";
           stats.classList.remove('hidden');
           list.classList.add('hidden');
           renderSenderChart();
        };

        function renderSenderChart() {
           const sorted = Object.entries(senderStats).sort((a,b) => b[1] - a[1]).slice(0, 10);
           new Chart(document.getElementById('sender-chart'), {
              type: 'pie',
              data: {
                 labels: sorted.map(s => s[0].split('<')[0].trim()),
                 datasets: [{ data: sorted.map(s => s[1]), backgroundColor: sorted.map((_, i) => `hsl(${(i * 360) / 10}, 70%, 60%)`) }]
              },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 8 } } } } }
           });
        }
      }
    });
  };
})();

