(function () {
  'use strict';

  /**
   * OmniOpener — HAR Viewer Tool
   * Professional browser-based HTTP Archive (.har) viewer.
   */

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
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatTime(ms) {
    if (ms == null) return '-';
    if (ms < 1) return ms.toFixed(3) + 'ms';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  window.initTool = function (toolConfig, mountEl) {
    // Closure variables for state management and DOM references
    let _harData = null;
    let _activeIdx = -1;
    let _filter = '';
    let _typeFilter = 'all';
    let _sortCol = 'started';
    let _sortDir = 1;

    const MAX_VISIBLE = 200;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.har',
      dropLabel: 'Drop a .har file here',
      binary: false,
      infoHtml: '<strong>HAR Viewer:</strong> Analyze browser network logs. All processing is local and secure.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-har',
          onClick: function (helpers, btn) {
            if (_harData) {
              helpers.copyToClipboard(JSON.stringify(_harData, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl-har',
          onClick: function (helpers) {
            if (_harData) {
              helpers.download(helpers.getFile().name, JSON.stringify(_harData, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: async function _onFile(file, content, helpers) {
        helpers.showLoading('Parsing HTTP Archive...');
        
        // Short delay to allow UI to update
        await new Promise(r => setTimeout(r, 100));

        try {
          const har = JSON.parse(content);
          if (!har || !har.log || !har.log.entries) {
            throw new Error('Invalid HAR: missing log.entries');
          }

          // Pre-process entries with indices and types
          har.log.entries.forEach((entry, idx) => {
            entry._idx = idx;
            const mime = (entry.response.content.mimeType || '').toLowerCase();
            if (mime.includes('image')) entry._type = 'image';
            else if (mime.includes('javascript') || mime.includes('/js')) entry._type = 'js';
            else if (mime.includes('css')) entry._type = 'css';
            else if (mime.includes('json') || mime.includes('xml')) entry._type = 'data';
            else if (mime.includes('html')) entry._type = 'html';
            else entry._type = 'other';
          });

          _harData = har;
          _activeIdx = -1;
          _filter = '';
          _typeFilter = 'all';
          
          renderMain(helpers);
        } catch (err) {
          helpers.showError('Could not parse HAR', err.message || 'The file may be corrupted or not a valid JSON HAR.');
        }
      },

      onDestroy: function() {
        _harData = null;
      }
    });

    function renderMain(helpers) {
      const file = helpers.getFile();
      const entries = _harData.log.entries;
      const creator = _harData.log.creator || { name: 'Unknown', version: '' };

      const html = `
        <div class="flex flex-col h-full max-h-[85vh] animate-in fade-in duration-300">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${entries.length} requests</span>
            <span class="text-surface-300 px-1">|</span>
            <span class="text-surface-500 font-mono text-xs bg-surface-100 px-2 py-0.5 rounded">${escapeHtml(creator.name)} ${escapeHtml(creator.version)}</span>
          </div>

          <!-- Filter Toolbar -->
          <div class="flex flex-wrap items-center gap-4 mb-4">
            <div class="relative flex-1 min-w-[240px]">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
              <input type="text" id="har-search" placeholder="Filter by URL, method, status..." 
                class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm">
            </div>
            
            <div class="flex items-center bg-surface-100 p-1 rounded-lg gap-1 border border-surface-200">
              ${['all', 'html', 'js', 'css', 'image', 'data', 'other'].map(t => `
                <button data-type="${t}" class="type-btn px-3 py-1 text-xs font-medium rounded-md transition-all ${t === 'all' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">
                  ${t.toUpperCase()}
                </button>
              `).join('')}
            </div>
            
            <div id="filter-count" class="text-xs font-medium text-surface-400 ml-auto"></div>
          </div>

          <!-- Content Splitter -->
          <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            <!-- Table Pane -->
            <div class="w-full md:w-1/2 flex flex-col min-h-0 bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
              <div class="overflow-auto flex-1 relative" id="table-scroll">
                <table class="min-w-full text-xs border-separate border-spacing-0">
                  <thead class="sticky top-0 z-20">
                    <tr class="bg-surface-50/95 backdrop-blur-md">
                      <th data-sort="status" class="sortable px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">Status</th>
                      <th data-sort="method" class="sortable px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">Method</th>
                      <th data-sort="url" class="sortable px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">URL</th>
                      <th data-sort="size" class="sortable px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">Size</th>
                      <th data-sort="time" class="sortable px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors">Time</th>
                    </tr>
                  </thead>
                  <tbody id="har-body"></tbody>
                </table>
              </div>
            </div>

            <!-- Detail Pane -->
            <div id="detail-pane" class="w-full md:w-1/2 flex flex-col min-h-0 bg-surface-50 rounded-xl border border-surface-200 overflow-hidden shadow-sm">
              <div id="detail-empty" class="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <div class="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center mb-6 text-4xl shadow-inner">🌐</div>
                <h4 class="font-semibold text-surface-800 mb-2">Select a Request</h4>
                <p class="text-sm text-surface-500 max-w-[200px]">Click any entry to view headers, payload, and response data.</p>
              </div>
              
              <div id="detail-container" class="hidden flex-1 flex flex-col min-h-0 bg-white">
                <div class="flex items-center gap-1 px-3 pt-2 bg-surface-50 border-b border-surface-200">
                  ${['Headers', 'Payload', 'Response', 'Timing'].map(tab => `
                    <button data-tab="${tab.toLowerCase()}" class="tab-btn px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider rounded-t-lg border-b-2 transition-all">
                      ${tab}
                    </button>
                  `).join('')}
                </div>
                <div id="detail-body" class="flex-1 overflow-auto p-5"></div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);
      
      const searchInput = document.getElementById('har-search');
      if (searchInput) searchInput.focus();

      // Listeners
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          _filter = e.target.value.toLowerCase();
          updateDisplay();
        });
      }

      document.querySelectorAll('.type-btn').forEach(btn => {
        btn.onclick = () => {
          _typeFilter = btn.dataset.type;
          document.querySelectorAll('.type-btn').forEach(b => {
            b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
            b.classList.add('text-surface-500');
          });
          btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
          btn.classList.remove('text-surface-500');
          updateDisplay();
        };
      });

      document.querySelectorAll('.sortable').forEach(th => {
        th.onclick = () => {
          const col = th.dataset.sort;
          if (_sortCol === col) _sortDir *= -1;
          else { _sortCol = col; _sortDir = 1; }
          updateDisplay();
        };
      });

      updateDisplay();
    }

    function updateDisplay() {
      const body = document.getElementById('har-body');
      const countEl = document.getElementById('filter-count');
      if (!body) return;

      let filtered = _harData.log.entries.filter(e => {
        const matchesType = _typeFilter === 'all' || e._type === _typeFilter;
        const matchesSearch = !_filter || 
          e.request.url.toLowerCase().includes(_filter) ||
          e.request.method.toLowerCase().includes(_filter) ||
          String(e.response.status).includes(_filter);
        return matchesType && matchesSearch;
      });

      // Sorting
      filtered.sort((a, b) => {
        let valA, valB;
        switch(_sortCol) {
          case 'status': valA = a.response.status; valB = b.response.status; break;
          case 'method': valA = a.request.method; valB = b.request.method; break;
          case 'url': valA = a.request.url; valB = b.request.url; break;
          case 'size': valA = a.response.content.size || 0; valB = b.response.content.size || 0; break;
          case 'time': valA = a.time; valB = b.time; break;
          default: valA = a._idx; valB = b._idx;
        }
        return (valA < valB ? -1 : valA > valB ? 1 : 0) * _sortDir;
      });

      if (countEl) countEl.textContent = `Showing ${filtered.length} of ${_harData.log.entries.length}`;

      if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="py-20 text-center text-surface-400 italic text-sm">No matching requests found</td></tr>`;
        return;
      }

      const visible = filtered.slice(0, MAX_VISIBLE);
      body.innerHTML = visible.map(e => {
        const status = e.response.status;
        let sColor = 'text-green-600';
        if (status >= 500) sColor = 'text-red-700 font-bold';
        else if (status >= 400) sColor = 'text-red-500';
        else if (status >= 300) sColor = 'text-blue-500';
        else if (status === 0) sColor = 'text-surface-400 italic';

        let urlPart = e.request.url;
        try { 
          const u = new URL(e.request.url); 
          urlPart = u.pathname + u.search;
          if (urlPart.length > 60) urlPart = urlPart.substring(0, 57) + '...';
          if (!urlPart || urlPart === '/') urlPart = u.hostname;
        } catch(err) {}

        return `
          <tr data-idx="${e._idx}" class="group hover:bg-brand-50 cursor-pointer transition-colors ${e._idx === _activeIdx ? 'bg-brand-50' : 'even:bg-surface-50/30'}">
            <td class="px-4 py-2 border-b border-surface-100 ${sColor}">${status || 'fail'}</td>
            <td class="px-4 py-2 border-b border-surface-100 font-mono font-bold text-surface-500">${e.request.method}</td>
            <td class="px-4 py-2 border-b border-surface-100 max-w-[200px] lg:max-w-xs truncate text-surface-800" title="${escapeHtml(e.request.url)}">${escapeHtml(urlPart)}</td>
            <td class="px-4 py-2 border-b border-surface-100 text-right font-mono text-surface-500">${formatBytes(e.response.content.size)}</td>
            <td class="px-4 py-2 border-b border-surface-100 text-right font-mono text-surface-500">${formatTime(e.time)}</td>
          </tr>
        `;
      }).join('') + (filtered.length > MAX_VISIBLE ? `<tr><td colspan="5" class="p-4 text-center text-surface-400 border-t border-surface-100 bg-surface-50 text-xs italic">Showing first ${MAX_VISIBLE} entries... Filter to find specific requests.</td></tr>` : '');

      body.querySelectorAll('tr[data-idx]').forEach(tr => {
        tr.onclick = () => {
          _activeIdx = parseInt(tr.dataset.idx);
          body.querySelectorAll('tr').forEach(r => r.classList.remove('bg-brand-50'));
          tr.classList.add('bg-brand-50');
          showDetails('headers');
        };
      });
    }

    function showDetails(tabId) {
      const container = document.getElementById('detail-container');
      const empty = document.getElementById('detail-empty');
      const body = document.getElementById('detail-body');
      if (!_harData || _activeIdx === -1 || !container || !body) return;

      container.classList.remove('hidden');
      if (empty) empty.classList.add('hidden');

      const entry = _harData.log.entries.find(e => e._idx === _activeIdx);
      if (!entry) return;

      // Update tabs
      document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabId) {
          btn.classList.add('text-brand-600', 'border-brand-600', 'bg-white');
          btn.classList.remove('text-surface-500', 'border-transparent');
        } else {
          btn.classList.remove('text-brand-600', 'border-brand-600', 'bg-white');
          btn.classList.add('text-surface-500', 'border-transparent');
        }
        btn.onclick = () => showDetails(btn.dataset.tab);
      });

      let contentHtml = '';
      if (tabId === 'headers') {
        contentHtml = `
          <div class="space-y-6 animate-in slide-in-from-right-2 duration-200">
            <section>
              <h3 class="font-semibold text-surface-800 mb-3 flex items-center gap-2 text-sm">
                <span class="w-2 h-2 rounded-full bg-brand-500"></span> General
              </h3>
              <div class="rounded-xl border border-surface-200 p-4 space-y-3 text-[11px] shadow-sm bg-surface-50/30">
                <div class="flex"><span class="w-24 shrink-0 text-surface-400 font-medium">URL</span> <span class="text-surface-900 break-all select-all font-mono">${escapeHtml(entry.request.url)}</span></div>
                <div class="flex"><span class="w-24 shrink-0 text-surface-400 font-medium">Method</span> <span class="font-bold text-brand-600 uppercase">${entry.request.method}</span></div>
                <div class="flex"><span class="w-24 shrink-0 text-surface-400 font-medium">Status</span> <span class="font-bold text-surface-900">${entry.response.status} ${escapeHtml(entry.response.statusText)}</span></div>
                <div class="flex"><span class="w-24 shrink-0 text-surface-400 font-medium">Protocol</span> <span class="text-surface-600">${escapeHtml(entry.response.httpVersion)}</span></div>
              </div>
            </section>

            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800 text-sm">Response Headers</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${entry.response.headers.length} items</span>
              </div>
              <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                <table class="min-w-full text-[11px]">
                  <tbody>
                    ${entry.response.headers.map(h => `
                      <tr class="even:bg-surface-50/50 group">
                        <td class="px-4 py-2 font-semibold text-brand-700 border-b border-surface-100 w-1/3 break-all bg-surface-50/30">${escapeHtml(h.name)}</td>
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100 break-all select-all font-mono">${escapeHtml(h.value)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800 text-sm">Request Headers</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${entry.request.headers.length} items</span>
              </div>
              <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                <table class="min-w-full text-[11px]">
                  <tbody>
                    ${entry.request.headers.map(h => `
                      <tr class="even:bg-surface-50/50 group">
                        <td class="px-4 py-2 font-semibold text-brand-700 border-b border-surface-100 w-1/3 break-all bg-surface-50/30">${escapeHtml(h.name)}</td>
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100 break-all select-all font-mono">${escapeHtml(h.value)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        `;
      } else if (tabId === 'payload') {
        const qp = entry.request.queryString || [];
        const post = entry.request.postData;
        contentHtml = `
          <div class="space-y-6 animate-in slide-in-from-right-2 duration-200">
            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800 text-sm">Query Parameters</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${qp.length} parameters</span>
              </div>
              ${qp.length ? `
                <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                  <table class="min-w-full text-[11px]">
                    <tbody>
                      ${qp.map(p => `
                        <tr class="even:bg-surface-50/50">
                          <td class="px-4 py-2 font-semibold text-brand-700 border-b border-surface-100 w-1/3 break-all bg-surface-50/30">${escapeHtml(p.name)}</td>
                          <td class="px-4 py-2 text-surface-700 border-b border-surface-100 break-all select-all font-mono">${escapeHtml(p.value)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `<div class="p-8 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl italic text-xs">No query parameters</div>`}
            </section>

            <section>
              <h3 class="font-semibold text-surface-800 mb-3 text-sm">Request Body</h3>
              ${post ? `
                <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                  <div class="bg-surface-100 px-4 py-2 text-[10px] font-bold text-surface-500 border-b border-surface-200">${escapeHtml(post.mimeType)}</div>
                  <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">${escapeHtml(post.text || '')}</pre>
                </div>
              ` : `<div class="p-8 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl italic text-xs">No request body</div>`}
            </section>
          </div>
        `;
      } else if (tabId === 'response') {
        const content = entry.response.content;
        contentHtml = `
          <div class="space-y-4 h-full flex flex-col animate-in slide-in-from-right-2 duration-200">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-surface-800 text-sm">Response Body</h3>
              <div class="flex gap-2">
                <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full border border-surface-200">${escapeHtml(content.mimeType || 'unknown')}</span>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200 font-bold">${formatBytes(content.size)}</span>
              </div>
            </div>
            
            <div class="flex-1 min-h-[300px]">
              ${content.text ? `
                <div class="rounded-xl overflow-hidden border border-surface-200 h-full shadow-sm flex flex-col">
                  <div class="bg-surface-900 px-4 py-2 flex items-center justify-between border-b border-white/10">
                    <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Raw Source</span>
                  </div>
                  <pre class="flex-1 p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-auto leading-relaxed whitespace-pre-wrap break-all">${escapeHtml(content.text)}</pre>
                </div>
              ` : `
                <div class="h-full flex flex-col items-center justify-center p-12 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl">
                  <div class="text-3xl mb-3 opacity-50">📑</div>
                  <p class="text-xs italic mb-1">No response content available</p>
                  <p class="text-[10px] max-w-[200px]">Browsers often exclude bodies for large resources or binary assets from HAR exports.</p>
                </div>
              `}
            </div>
          </div>
        `;
      } else if (tabId === 'timing') {
        const t = entry.timings;
        const total = entry.time;
        const bars = [
          { label: 'Blocked', val: t.blocked, color: 'bg-slate-300' },
          { label: 'DNS', val: t.dns, color: 'bg-blue-300' },
          { label: 'Connect', val: t.connect, color: 'bg-orange-300' },
          { label: 'SSL', val: t.ssl, color: 'bg-purple-300' },
          { label: 'Send', val: t.send, color: 'bg-green-300' },
          { label: 'Wait (TTFB)', val: t.wait, color: 'bg-brand-400' },
          { label: 'Receive', val: t.receive, color: 'bg-emerald-500' }
        ].filter(b => b.val > 0);

        contentHtml = `
          <div class="space-y-8 animate-in slide-in-from-right-2 duration-200">
            <section>
              <div class="flex items-center justify-between mb-8">
                <h3 class="font-semibold text-surface-800 text-sm">Timing Breakdown</h3>
                <span class="text-xs font-bold text-brand-700 bg-brand-50 px-3 py-1 rounded-full border border-brand-100">${formatTime(total)} Total</span>
              </div>
              
              <div class="space-y-5">
                ${bars.map(b => {
                  const percent = Math.max(1, (b.val / total * 100)).toFixed(1);
                  return `
                    <div class="space-y-1.5 group">
                      <div class="flex justify-between text-[11px] font-medium transition-colors group-hover:text-surface-900">
                        <span class="text-surface-500">${b.label}</span>
                        <span class="text-surface-900 font-mono font-bold">${b.val.toFixed(2)}ms <span class="text-surface-300 font-normal ml-1">(${percent}%)</span></span>
                      </div>
                      <div class="h-2.5 bg-surface-100 rounded-full overflow-hidden shadow-inner border border-surface-200/50">
                        <div class="${b.color} h-full rounded-full shadow-sm transition-all duration-700 ease-out" style="width: ${percent}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>

            <div class="p-4 bg-surface-50 rounded-xl border border-surface-200 shadow-sm mt-10">
              <h4 class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-4">Network Info</h4>
              <div class="grid grid-cols-1 gap-3 text-[11px]">
                <div class="flex justify-between items-center border-b border-surface-200/50 pb-2">
                  <span class="text-surface-500">Started At</span>
                  <span class="text-surface-900 font-medium">${new Date(entry.startedDateTime).toLocaleString()}</span>
                </div>
                <div class="flex justify-between items-center border-b border-surface-200/50 pb-2">
                  <span class="text-surface-500">Connection ID</span>
                  <span class="text-surface-900 font-mono font-bold bg-white px-2 py-0.5 rounded border border-surface-200">${escapeHtml(entry.connection || 'N/A')}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-surface-500">Server IP</span>
                  <span class="text-surface-900 font-mono text-xs">${escapeHtml(entry.serverIPAddress || 'N/A')}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      body.innerHTML = contentHtml;
    }
  };

})();
