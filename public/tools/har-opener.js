(function () {
  'use strict';

  /**
   * OmniOpener — HAR Viewer Tool
   * Professional browser-based HTTP Archive (.har) viewer.
   */

  const MAX_INITIAL_ENTRIES = 500;

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatTime(ms) {
    if (ms < 1) return ms.toFixed(3) + 'ms';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.har',
      dropLabel: 'Drop a .har file here',
      binary: false,
      infoHtml: '<strong>HAR Viewer:</strong> Deeply analyze network logs from any browser. All processing is local and secure.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-har',
          onClick: function (helpers, btn) {
            const data = helpers.getState().harData;
            if (data) {
              helpers.copyToClipboard(JSON.stringify(data, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl-har',
          onClick: function (helpers) {
            const data = helpers.getState().harData;
            if (data) {
              helpers.download(helpers.getFile().name, JSON.stringify(data, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: async function (file, content, helpers) {
        helpers.showLoading('Parsing HTTP Archive...');
        
        // Give the UI a chance to show the loading state
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
          const har = JSON.parse(content);
          if (!har || !har.log || !har.log.entries) {
            throw new Error('The file does not appear to be a valid HAR archive (missing log.entries).');
          }
          
          helpers.setState('harData', har);
          helpers.setState('filter', '');
          helpers.setState('activeEntryIdx', -1);
          helpers.setState('activeTab', 'headers');
          
          renderInterface(helpers);
        } catch (err) {
          helpers.showError('Could not open HAR file', err.message || 'The file may be corrupted or in an unsupported variant.');
        }
      }
    });
  };

  function renderInterface(helpers) {
    const file = helpers.getFile();
    const har = helpers.getState().harData;
    const entries = har.log.entries;
    const creator = har.log.creator || { name: 'Unknown', version: '' };

    const html = `
      <div class="flex flex-col h-full max-h-[85vh]">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${entries.length} requests</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${escapeHtml(creator.name)} ${escapeHtml(creator.version)}</span>
        </div>

        <!-- Toolbar -->
        <div class="flex items-center justify-between mb-4 gap-4">
          <div class="relative flex-1 max-w-md">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-lg">🔍</span>
            <input type="text" id="har-search" placeholder="Search by URL, method, or status..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
          </div>
          <div id="filter-stats" class="text-xs font-medium text-surface-500">
            Showing all ${entries.length} entries
          </div>
        </div>

        <!-- Main Layout -->
        <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
          <!-- List Pane -->
          <div class="w-full md:w-1/2 flex flex-col min-h-0 bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
            <div class="overflow-auto flex-1" id="har-list-scroll">
              <table class="min-w-full text-sm border-separate border-spacing-0">
                <thead class="sticky top-0 z-10">
                  <tr>
                    <th class="bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Status</th>
                    <th class="bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Method</th>
                    <th class="bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Path / Domain</th>
                    <th class="bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Size</th>
                    <th class="bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Time</th>
                  </tr>
                </thead>
                <tbody id="har-table-body">
                  <!-- Rows populated here -->
                </tbody>
              </table>
              <div id="large-file-notice" class="hidden p-8 text-center bg-surface-50 border-t border-surface-100">
                <p class="text-sm text-surface-500 mb-2">Showing the first ${MAX_INITIAL_ENTRIES} entries for performance.</p>
                <button id="show-all-entries" class="text-brand-600 font-semibold text-sm hover:underline">Show all entries</button>
              </div>
            </div>
          </div>

          <!-- Detail Pane -->
          <div class="w-full md:w-1/2 flex flex-col min-h-0 bg-surface-50 rounded-xl border border-surface-200 overflow-hidden shadow-sm">
            <div id="detail-empty" class="flex-1 flex flex-col items-center justify-center p-12 text-center text-surface-400">
              <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4 text-3xl">📡</div>
              <h4 class="font-semibold text-surface-800 mb-1">Select a request</h4>
              <p class="text-sm">Click any entry on the left to view detailed headers, payload, and timing data.</p>
            </div>
            
            <div id="detail-content" class="hidden flex-1 flex flex-col min-h-0 bg-white">
              <!-- Detail Tabs -->
              <div class="flex items-center gap-1 px-2 pt-2 bg-surface-50 border-b border-surface-200">
                <button data-tab="headers" class="tab-btn px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors border-b-2 border-transparent text-surface-500 hover:text-surface-700">Headers</button>
                <button data-tab="payload" class="tab-btn px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors border-b-2 border-transparent text-surface-500 hover:text-surface-700">Payload</button>
                <button data-tab="response" class="tab-btn px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors border-b-2 border-transparent text-surface-500 hover:text-surface-700">Response</button>
                <button data-tab="timing" class="tab-btn px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-lg transition-colors border-b-2 border-transparent text-surface-500 hover:text-surface-700">Timing</button>
              </div>
              <div class="flex-1 overflow-auto p-4" id="detail-pane-body">
                <!-- Tab content goes here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Initial table render
    updateTable(helpers);

    // Search event
    const searchInput = document.getElementById('har-search');
    searchInput.addEventListener('input', (e) => {
      helpers.setState('filter', e.target.value.toLowerCase());
      updateTable(helpers);
    });

    // Tab events
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        helpers.setState('activeTab', btn.dataset.tab);
        updateDetails(helpers);
      });
    });

    // Show all entries button
    const showAllBtn = document.getElementById('show-all-entries');
    if (showAllBtn) {
      showAllBtn.onclick = () => {
        helpers.setState('showAll', true);
        updateTable(helpers);
      };
    }
  }

  function updateTable(helpers) {
    const har = helpers.getState().harData;
    const filter = helpers.getState().filter;
    const tableBody = document.getElementById('har-table-body');
    const statsEl = document.getElementById('filter-stats');
    const activeIdx = helpers.getState().activeEntryIdx;
    const showAll = helpers.getState().showAll;

    let filtered = har.log.entries.map((entry, originalIdx) => ({ ...entry, originalIdx }));

    if (filter) {
      filtered = filtered.filter(e => 
        e.request.url.toLowerCase().includes(filter) ||
        e.request.method.toLowerCase().includes(filter) ||
        String(e.response.status).includes(filter)
      );
    }

    const totalFiltered = filtered.length;
    statsEl.textContent = filter ? `Showing ${totalFiltered} of ${har.log.entries.length} entries` : `Showing all ${totalFiltered} entries`;

    const noticeEl = document.getElementById('large-file-notice');
    if (totalFiltered > MAX_INITIAL_ENTRIES && !showAll && !filter) {
      filtered = filtered.slice(0, MAX_INITIAL_ENTRIES);
      noticeEl.classList.remove('hidden');
    } else {
      noticeEl.classList.add('hidden');
    }

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="px-4 py-12 text-center text-surface-400 italic">No entries match your search criteria.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map(entry => {
      const status = entry.response.status;
      let statusClass = 'text-green-600 font-bold';
      if (status >= 500) statusClass = 'text-red-700 font-bold';
      else if (status >= 400) statusClass = 'text-red-500 font-bold';
      else if (status >= 300) statusClass = 'text-blue-500 font-bold';
      else if (status === 0) statusClass = 'text-surface-400 italic';

      let path = entry.request.url;
      let domain = '';
      try {
        const urlObj = new URL(entry.request.url);
        path = urlObj.pathname + urlObj.search;
        domain = urlObj.hostname;
      } catch (e) {
        // Fallback for invalid URLs
      }

      const isSelected = entry.originalIdx === activeIdx;
      const rowClass = isSelected 
        ? 'bg-brand-50 hover:bg-brand-100 transition-colors cursor-pointer active-row' 
        : 'even:bg-surface-50/50 hover:bg-brand-50 transition-colors cursor-pointer';

      return `
        <tr class="${rowClass}" data-idx="${entry.originalIdx}">
          <td class="px-4 py-2 border-b border-surface-100 ${statusClass}">${status || '(failed)'}</td>
          <td class="px-4 py-2 border-b border-surface-100 font-mono text-xs font-bold text-surface-700">${escapeHtml(entry.request.method)}</td>
          <td class="px-4 py-2 border-b border-surface-100 max-w-[200px] lg:max-w-md truncate" title="${escapeHtml(entry.request.url)}">
            <div class="font-medium text-surface-900 truncate">${escapeHtml(path === '/' ? entry.request.url : path)}</div>
            <div class="text-[10px] text-surface-400 truncate">${escapeHtml(domain)}</div>
          </td>
          <td class="px-4 py-2 border-b border-surface-100 text-right font-mono text-xs text-surface-500">${formatBytes(entry.response.content.size || 0)}</td>
          <td class="px-4 py-2 border-b border-surface-100 text-right font-mono text-xs text-surface-500">${formatTime(entry.time)}</td>
        </tr>
      `;
    }).join('');

    // Attach click listeners
    tableBody.querySelectorAll('tr[data-idx]').forEach(row => {
      row.onclick = () => {
        const idx = parseInt(row.getAttribute('data-idx'));
        helpers.setState('activeEntryIdx', idx);
        
        // Visual update for selection without full re-render
        tableBody.querySelectorAll('tr').forEach(r => r.classList.remove('bg-brand-50', 'bg-brand-100', 'active-row'));
        row.classList.add('bg-brand-50', 'active-row');
        
        updateDetails(helpers);
      };
    });
  }

  function updateDetails(helpers) {
    const idx = helpers.getState().activeEntryIdx;
    const tab = helpers.getState().activeTab;
    const har = helpers.getState().harData;
    
    const emptyEl = document.getElementById('detail-empty');
    const contentEl = document.getElementById('detail-content');
    const paneBody = document.getElementById('detail-pane-body');

    if (idx === -1) {
      emptyEl.classList.remove('hidden');
      contentEl.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    contentEl.classList.remove('hidden');

    // Update active tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('text-brand-600', 'border-brand-600', 'bg-white');
        btn.classList.remove('text-surface-500', 'border-transparent');
      } else {
        btn.classList.remove('text-brand-600', 'border-brand-600', 'bg-white');
        btn.classList.add('text-surface-500', 'border-transparent');
      }
    });

    const entry = har.log.entries[idx];
    let html = '';

    if (tab === 'headers') {
      html = `
        <div class="space-y-6">
          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">General</h3>
            </div>
            <div class="rounded-xl border border-surface-200 p-4 space-y-2 text-sm">
              <div class="flex"><span class="w-32 shrink-0 text-surface-400 font-medium">Request URL:</span> <span class="text-surface-900 break-all select-all">${escapeHtml(entry.request.url)}</span></div>
              <div class="flex"><span class="w-32 shrink-0 text-surface-400 font-medium">Method:</span> <span class="font-bold text-brand-700">${escapeHtml(entry.request.method)}</span></div>
              <div class="flex"><span class="w-32 shrink-0 text-surface-400 font-medium">Status:</span> <span class="font-bold text-surface-900">${entry.response.status} ${escapeHtml(entry.response.statusText)}</span></div>
              ${entry.serverIPAddress ? `<div class="flex"><span class="w-32 shrink-0 text-surface-400 font-medium">Remote IP:</span> <span class="text-surface-900 font-mono">${escapeHtml(entry.serverIPAddress)}</span></div>` : ''}
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Response Headers</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${entry.response.headers.length} items</span>
            </div>
            <div class="rounded-xl border border-surface-200 overflow-hidden">
              <table class="min-w-full text-xs">
                <tbody>
                  ${entry.response.headers.map(h => `
                    <tr class="even:bg-surface-50">
                      <td class="px-4 py-2 font-bold text-brand-700 border-b border-surface-100 w-1/3 break-all">${escapeHtml(h.name)}</td>
                      <td class="px-4 py-2 text-surface-700 border-b border-surface-100 break-all select-all">${escapeHtml(h.value)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Request Headers</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${entry.request.headers.length} items</span>
            </div>
            <div class="rounded-xl border border-surface-200 overflow-hidden">
              <table class="min-w-full text-xs">
                <tbody>
                  ${entry.request.headers.map(h => `
                    <tr class="even:bg-surface-50">
                      <td class="px-4 py-2 font-bold text-brand-700 border-b border-surface-100 w-1/3 break-all">${escapeHtml(h.name)}</td>
                      <td class="px-4 py-2 text-surface-700 border-b border-surface-100 break-all select-all">${escapeHtml(h.value)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      `;
    } else if (tab === 'payload') {
      const qp = entry.request.queryString || [];
      const post = entry.request.postData;
      
      html = `
        <div class="space-y-6">
          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Query String Parameters</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${qp.length} parameters</span>
            </div>
            ${qp.length ? `
              <div class="rounded-xl border border-surface-200 overflow-hidden">
                <table class="min-w-full text-xs">
                  <tbody>
                    ${qp.map(p => `
                      <tr class="even:bg-surface-50">
                        <td class="px-4 py-2 font-bold text-brand-700 border-b border-surface-100 w-1/3 break-all">${escapeHtml(p.name)}</td>
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100 break-all select-all">${escapeHtml(p.value)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `<div class="p-8 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl italic text-sm">No query parameters</div>`}
          </section>

          <section>
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Post Data</h3>
              ${post ? `<span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${escapeHtml(post.mimeType)}</span>` : ''}
            </div>
            ${post ? `
              <div class="rounded-xl overflow-hidden border border-surface-200">
                <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">${escapeHtml(post.text || '')}</pre>
              </div>
            ` : `<div class="p-8 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl italic text-sm">No POST data</div>`}
          </section>
        </div>
      `;
    } else if (tab === 'response') {
      const content = entry.response.content;
      html = `
        <div class="space-y-4 h-full flex flex-col">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Response Body</h3>
            <div class="flex gap-2">
              <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${escapeHtml(content.mimeType || 'unknown')}</span>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${formatBytes(content.size || 0)}</span>
            </div>
          </div>
          
          <div class="flex-1 min-h-[300px]">
            ${content.text ? `
              <div class="rounded-xl overflow-hidden border border-surface-200 h-full">
                <pre class="p-4 h-full text-[11px] font-mono bg-gray-950 text-gray-100 overflow-auto leading-relaxed whitespace-pre-wrap break-all">${escapeHtml(content.text)}</pre>
              </div>
            ` : `
              <div class="h-full flex flex-col items-center justify-center p-12 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl">
                <p class="text-sm italic mb-2">No response body content available in the HAR file.</p>
                <p class="text-[10px]">Browsers often omit bodies for large resources or binary data.</p>
              </div>
            `}
          </div>
        </div>
      `;
    } else if (tab === 'timing') {
      const t = entry.timings;
      const total = entry.time;
      
      const bars = [
        { label: 'Blocked', val: t.blocked, color: 'bg-surface-300' },
        { label: 'DNS', val: t.dns, color: 'bg-blue-400' },
        { label: 'Connect', val: t.connect, color: 'bg-orange-400' },
        { label: 'SSL', val: t.ssl, color: 'bg-purple-400' },
        { label: 'Send', val: t.send, color: 'bg-green-400' },
        { label: 'Wait (TTFB)', val: t.wait, color: 'bg-brand-500' },
        { label: 'Receive', val: t.receive, color: 'bg-green-600' }
      ].filter(b => b.val > 0);

      html = `
        <div class="space-y-8">
          <section>
            <div class="flex items-center justify-between mb-6">
              <h3 class="font-semibold text-surface-800">Timing Breakdown</h3>
              <span class="text-sm font-bold text-brand-700">${formatTime(total)} total</span>
            </div>
            
            <div class="space-y-4">
              ${bars.map(b => {
                const percent = (b.val / total * 100).toFixed(1);
                return `
                  <div class="space-y-1.5">
                    <div class="flex justify-between text-[11px] font-medium">
                      <span class="text-surface-600">${b.label}</span>
                      <span class="text-surface-900 font-mono">${b.val.toFixed(1)}ms (${percent}%)</span>
                    </div>
                    <div class="h-2 bg-surface-100 rounded-full overflow-hidden">
                      <div class="${b.color} h-full rounded-full" style="width: ${percent}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </section>

          <section class="bg-surface-50 rounded-xl p-4 border border-surface-200">
            <h4 class="text-[11px] font-bold uppercase tracking-wider text-surface-400 mb-3">Information</h4>
            <div class="grid grid-cols-1 gap-2 text-xs">
              <div class="flex justify-between">
                <span class="text-surface-500">Started at</span>
                <span class="text-surface-900 font-medium">${new Date(entry.startedDateTime).toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-surface-500">Connection ID</span>
                <span class="text-surface-900 font-mono">${escapeHtml(entry.connection || 'N/A')}</span>
              </div>
            </div>
          </section>
        </div>
      `;
    }

    paneBody.innerHTML = html;
  }

})();
