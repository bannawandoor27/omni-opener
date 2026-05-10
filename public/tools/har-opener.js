(function () {
  'use strict';

  /**
   * OmniOpener — HAR (HTTP Archive) Viewer
   * A production-perfect, secure, browser-local network log analyzer.
   */

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatTime(ms) {
    if (ms == null || isNaN(ms)) return '-';
    if (ms < 1) return ms.toFixed(3) + 'ms';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  window.initTool = function (toolConfig, mountEl) {
    let _harData = null;
    let _activeIdx = -1;
    let _filter = '';
    let _typeFilter = 'all';
    let _statusFilter = 'all';
    let _sortCol = 'started';
    let _sortDir = 1;
    let _fileInfo = null;

    const MAX_VISIBLE = 1500;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.har',
      dropLabel: 'Drop .har network log',
      binary: false,
      infoHtml: '<strong>HAR Viewer:</strong> Deeply inspect network requests, headers, and timing data. 100% private.',

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

      onFile: function _onFileFn(file, content, helpers) {
        helpers.showLoading('Parsing HTTP Archive...');
        _fileInfo = file;

        // Use setTimeout to ensure UI updates before heavy JSON.parse
        setTimeout(function() {
          try {
            const har = JSON.parse(content);
            if (!har || !har.log || !har.log.entries) {
              throw new Error('Invalid HAR: missing log.entries');
            }

            // Pre-process entries for faster filtering and rendering
            har.log.entries.forEach((entry, idx) => {
              entry._idx = idx;
              const mime = (entry.response.content.mimeType || '').toLowerCase();
              if (mime.includes('image')) entry._type = 'image';
              else if (mime.includes('javascript') || mime.includes('/js')) entry._type = 'js';
              else if (mime.includes('css')) entry._type = 'css';
              else if (mime.includes('json') || mime.includes('xml')) entry._type = 'data';
              else if (mime.includes('html')) entry._type = 'html';
              else if (mime.includes('font') || mime.includes('/woff')) entry._type = 'font';
              else entry._type = 'other';
              
              const status = entry.response.status;
              if (status >= 500) entry._statusGroup = '5xx';
              else if (status >= 400) entry._statusGroup = '4xx';
              else if (status >= 300) entry._statusGroup = '3xx';
              else if (status >= 200) entry._statusGroup = '2xx';
              else entry._statusGroup = 'other';
            });

            _harData = har;
            _activeIdx = -1;
            _filter = '';
            _typeFilter = 'all';
            _statusFilter = 'all';
            
            renderMain(helpers);
          } catch (err) {
            console.error(err);
            helpers.showError('Could not open har file', 'The file may be corrupted or in an unsupported format. Ensure it is a valid JSON exported from browser DevTools.');
          }
        }, 50);
      },

      onDestroy: function() {
        _harData = null;
        _fileInfo = null;
      }
    });

    function renderMain(helpers) {
      const creator = _harData.log.creator || { name: 'Unknown', version: '' };
      const entries = _harData.log.entries;

      if (entries.length === 0) {
        helpers.render(`
          <div class="flex flex-col items-center justify-center p-20 text-center">
            <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
              <span class="text-2xl grayscale opacity-50">📂</span>
            </div>
            <h3 class="text-lg font-semibold text-surface-800">Empty HAR File</h3>
            <p class="text-surface-500 max-w-xs mt-2">This network log contains no requests. Try capturing again with your browser's DevTools.</p>
          </div>
        `);
        return;
      }

      const html = `
        <div class="flex flex-col h-full max-h-[90vh] animate-in fade-in duration-500">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHtml(_fileInfo.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(_fileInfo.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.har file</span>
            <div class="ml-auto hidden sm:flex items-center gap-4">
               <span class="text-[10px] uppercase tracking-wider font-bold text-surface-400">Captured by ${escapeHtml(creator.name)} ${escapeHtml(creator.version)}</span>
            </div>
          </div>

          <!-- U10. Section Header with Counts -->
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Network Traffic</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">${entries.length} items</span>
          </div>

          <!-- Filters & Search (Format Category: DATA) -->
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <div class="relative flex-1 min-w-[240px]">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
              <input type="text" id="har-search" placeholder="Search URL, method, status, or content type..." 
                class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm">
            </div>
            
            <div class="flex items-center bg-surface-100 p-1 rounded-lg border border-surface-200 shadow-inner">
              ${['all', 'html', 'js', 'css', 'image', 'data', 'font'].map(t => `
                <button data-type="${t}" class="type-btn px-3 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md transition-all ${t === 'all' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">
                  ${t}
                </button>
              `).join('')}
            </div>

            <div class="flex items-center bg-surface-100 p-1 rounded-lg border border-surface-200 shadow-inner">
              ${['all', '2xx', '3xx', '4xx', '5xx'].map(s => `
                <button data-status="${s}" class="status-btn px-3 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md transition-all ${s === 'all' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">
                  ${s}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
            <!-- Table Wrapper (U7) -->
            <div class="w-full md:w-3/5 flex flex-col min-h-0">
              <div class="flex-1 overflow-auto rounded-xl border border-surface-200 bg-white shadow-sm relative">
                <table class="min-w-full text-xs border-separate border-spacing-0">
                  <thead class="sticky top-0 z-20">
                    <tr class="bg-white/95 backdrop-blur-md">
                      <th data-sort="status" class="sortable bg-white/95 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors">Status</th>
                      <th data-sort="method" class="sortable bg-white/95 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors">Method</th>
                      <th data-sort="url" class="sortable bg-white/95 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors">URL</th>
                      <th data-sort="size" class="sortable bg-white/95 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors">Size</th>
                      <th data-sort="time" class="sortable bg-white/95 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-50 transition-colors">Time</th>
                    </tr>
                  </thead>
                  <tbody id="har-body" class="divide-y divide-surface-100"></tbody>
                </table>
              </div>
              <div id="filter-status" class="mt-2 text-[10px] text-surface-400 font-medium px-1 uppercase tracking-widest"></div>
            </div>

            <!-- Detail Pane -->
            <div id="detail-pane" class="w-full md:w-2/5 flex flex-col min-h-0 bg-surface-50 rounded-xl border border-surface-200 overflow-hidden shadow-sm">
              <div id="detail-empty" class="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white/50">
                <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
                  <span class="text-2xl grayscale opacity-30">⚡</span>
                </div>
                <h4 class="font-semibold text-surface-800 mb-1">No Request Selected</h4>
                <p class="text-xs text-surface-500 max-w-[220px] leading-relaxed">Select a request from the list to inspect full headers, payload, and response timing.</p>
              </div>
              
              <div id="detail-container" class="hidden h-full flex flex-col min-h-0 bg-white">
                <div class="flex items-center gap-1 px-3 pt-2 bg-surface-50 border-b border-surface-200">
                  ${['Headers', 'Payload', 'Response', 'Timing'].map(tab => `
                    <button data-tab="${tab.toLowerCase()}" class="tab-btn px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-t-lg border-b-2 transition-all">
                      ${tab}
                    </button>
                  `).join('')}
                </div>
                <div id="detail-body" class="flex-1 overflow-auto p-4 bg-white"></div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);
      
      const searchInput = document.getElementById('har-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.addEventListener('input', (e) => {
          _filter = e.target.value.toLowerCase();
          updateDisplay(helpers);
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
          updateDisplay(helpers);
        };
      });

      document.querySelectorAll('.status-btn').forEach(btn => {
        btn.onclick = () => {
          _statusFilter = btn.dataset.status;
          document.querySelectorAll('.status-btn').forEach(b => {
            b.classList.remove('bg-white', 'shadow-sm', 'text-brand-600');
            b.classList.add('text-surface-500');
          });
          btn.classList.add('bg-white', 'shadow-sm', 'text-brand-600');
          btn.classList.remove('text-surface-500');
          updateDisplay(helpers);
        };
      });

      document.querySelectorAll('.sortable').forEach(th => {
        th.onclick = () => {
          const col = th.dataset.sort;
          if (_sortCol === col) _sortDir *= -1;
          else { _sortCol = col; _sortDir = 1; }
          
          // Add sort indicators
          document.querySelectorAll('.sortable').forEach(s => {
            s.innerHTML = s.innerHTML.replace(/ (▲|▼)/g, '');
          });
          th.innerHTML += _sortDir === 1 ? ' ▲' : ' ▼';
          
          updateDisplay(helpers);
        };
      });

      updateDisplay(helpers);
    }

    function updateDisplay(helpers) {
      const body = document.getElementById('har-body');
      const statusEl = document.getElementById('filter-status');
      if (!body) return;

      let filtered = _harData.log.entries.filter(e => {
        const matchesType = _typeFilter === 'all' || e._type === _typeFilter;
        const matchesStatus = _statusFilter === 'all' || e._statusGroup === _statusFilter;
        const matchesSearch = !_filter || 
          e.request.url.toLowerCase().includes(_filter) ||
          e.request.method.toLowerCase().includes(_filter) ||
          String(e.response.status).includes(_filter) ||
          (e.response.content.mimeType || '').toLowerCase().includes(_filter);
        return matchesType && matchesStatus && matchesSearch;
      });

      filtered.sort((a, b) => {
        let valA, valB;
        switch(_sortCol) {
          case 'status': valA = a.response.status; valB = b.response.status; break;
          case 'method': valA = a.request.method; valB = b.request.method; break;
          case 'url': valA = a.request.url; valB = b.request.url; break;
          case 'size': valA = a.response.content.size || 0; valB = b.response.content.size || 0; break;
          case 'time': valA = a.time || 0; valB = b.time || 0; break;
          default: valA = a._idx; valB = b._idx;
        }
        return (valA < valB ? -1 : valA > valB ? 1 : 0) * _sortDir;
      });

      if (statusEl) statusEl.textContent = `Showing ${filtered.length} of ${_harData.log.entries.length} requests`;

      if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="py-24 text-center text-surface-400 italic text-sm">No requests match your criteria</td></tr>`;
        return;
      }

      const visible = filtered.slice(0, MAX_VISIBLE);
      body.innerHTML = visible.map(e => {
        const status = e.response.status;
        let sColor = 'text-emerald-600';
        if (status >= 500) sColor = 'text-red-700 font-bold';
        else if (status >= 400) sColor = 'text-red-500 font-semibold';
        else if (status >= 300) sColor = 'text-blue-500';
        else if (status === 0) sColor = 'text-surface-400 italic';

        let urlDisplay = e.request.url;
        try { 
          const u = new URL(e.request.url); 
          urlDisplay = u.pathname + u.search;
          if (!urlDisplay || urlDisplay === '/') urlDisplay = u.hostname;
          if (urlDisplay.length > 90) urlDisplay = urlDisplay.substring(0, 87) + '...';
        } catch(err) {}

        return `
          <tr data-idx="${e._idx}" class="group hover:bg-brand-50 cursor-pointer transition-colors ${e._idx === _activeIdx ? 'bg-brand-50' : 'even:bg-surface-50/30'}">
            <td class="px-4 py-2.5 border-b border-surface-100 ${sColor} font-mono">${status || 'fail'}</td>
            <td class="px-4 py-2.5 border-b border-surface-100 font-bold text-surface-500 uppercase tracking-tighter">${e.request.method}</td>
            <td class="px-4 py-2.5 border-b border-surface-100 truncate text-surface-800" title="${escapeHtml(e.request.url)}">${escapeHtml(urlDisplay)}</td>
            <td class="px-4 py-2.5 border-b border-surface-100 text-right font-mono text-surface-500">${formatBytes(e.response.content.size)}</td>
            <td class="px-4 py-2.5 border-b border-surface-100 text-right font-mono text-surface-500">${formatTime(e.time)}</td>
          </tr>
        `;
      }).join('') + (filtered.length > MAX_VISIBLE ? `<tr><td colspan="5" class="p-4 text-center text-surface-400 border-t border-surface-100 bg-surface-50 text-[10px] italic font-medium uppercase tracking-widest">Only first ${MAX_VISIBLE} results shown.</td></tr>` : '');

      body.querySelectorAll('tr[data-idx]').forEach(tr => {
        tr.onclick = () => {
          const idx = parseInt(tr.dataset.idx);
          if (_activeIdx === idx) return;
          _activeIdx = idx;
          body.querySelectorAll('tr').forEach(r => r.classList.remove('bg-brand-50'));
          tr.classList.add('bg-brand-50');
          showDetails('headers', helpers);
        };
      });
    }

    function showDetails(tabId, helpers) {
      const container = document.getElementById('detail-container');
      const empty = document.getElementById('detail-empty');
      const body = document.getElementById('detail-body');
      if (!_harData || _activeIdx === -1 || !container || !body) return;

      container.classList.remove('hidden');
      if (empty) empty.classList.add('hidden');

      const entry = _harData.log.entries.find(e => e._idx === _activeIdx);
      if (!entry) return;

      document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabId) {
          btn.classList.add('text-brand-600', 'border-brand-600', 'bg-white');
          btn.classList.remove('text-surface-500', 'border-transparent');
        } else {
          btn.classList.remove('text-brand-600', 'border-brand-600', 'bg-white');
          btn.classList.add('text-surface-500', 'border-transparent');
        }
        btn.onclick = () => showDetails(btn.dataset.tab, helpers);
      });

      let contentHtml = '';
      if (tabId === 'headers') {
        contentHtml = `
          <div class="space-y-6 animate-in slide-in-from-right-3 duration-300">
            <section>
              <h3 class="font-bold text-surface-800 mb-3 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                Request Summary
              </h3>
              <div class="rounded-xl border border-surface-200 p-4 space-y-3 text-[11px] bg-surface-50/50 shadow-inner">
                <div class="flex gap-4"><span class="w-24 shrink-0 text-surface-400 font-semibold uppercase tracking-tighter">URL</span> <span class="text-surface-900 break-all select-all font-mono leading-relaxed">${escapeHtml(entry.request.url)}</span></div>
                <div class="flex gap-4"><span class="w-24 shrink-0 text-surface-400 font-semibold uppercase tracking-tighter">Method</span> <span class="font-black text-brand-600 uppercase">${entry.request.method}</span></div>
                <div class="flex gap-4"><span class="w-24 shrink-0 text-surface-400 font-semibold uppercase tracking-tighter">Status</span> <span class="font-bold text-surface-900">${entry.response.status} ${escapeHtml(entry.response.statusText)}</span></div>
                <div class="flex gap-4"><span class="w-24 shrink-0 text-surface-400 font-semibold uppercase tracking-tighter">Remote IP</span> <span class="text-surface-600 font-mono">${escapeHtml(entry.serverIPAddress || 'Unknown')}</span></div>
              </div>
            </section>

            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-surface-800 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Response Headers
                </h3>
                <span class="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-100">${entry.response.headers.length}</span>
              </div>
              <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
                <table class="min-w-full text-[10px] leading-tight divide-y divide-surface-100">
                  <tbody>
                    ${entry.response.headers.map(h => `
                      <tr class="hover:bg-emerald-50/30 transition-colors">
                        <td class="px-4 py-2.5 font-bold text-surface-500 w-1/3 break-all bg-surface-50/30">${escapeHtml(h.name)}</td>
                        <td class="px-4 py-2.5 text-surface-800 break-all select-all font-mono">${escapeHtml(h.value)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-surface-800 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Request Headers
                </h3>
                <span class="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-100">${entry.request.headers.length}</span>
              </div>
              <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
                <table class="min-w-full text-[10px] leading-tight divide-y divide-surface-100">
                  <tbody>
                    ${entry.request.headers.map(h => `
                      <tr class="hover:bg-blue-50/30 transition-colors">
                        <td class="px-4 py-2.5 font-bold text-surface-500 w-1/3 break-all bg-surface-50/30">${escapeHtml(h.name)}</td>
                        <td class="px-4 py-2.5 text-surface-800 break-all select-all font-mono">${escapeHtml(h.value)}</td>
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
          <div class="space-y-6 animate-in slide-in-from-right-3 duration-300">
            <section>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-surface-800 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Query Parameters
                </h3>
                <span class="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-bold border border-amber-100">${qp.length}</span>
              </div>
              ${qp.length ? `
                <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
                  <table class="min-w-full text-[10px] leading-tight divide-y divide-surface-100">
                    <tbody>
                      ${qp.map(p => `
                        <tr class="hover:bg-amber-50/30 transition-colors">
                          <td class="px-4 py-2.5 font-bold text-surface-500 w-1/3 break-all bg-surface-50/30">${escapeHtml(p.name)}</td>
                          <td class="px-4 py-2.5 text-surface-800 break-all select-all font-mono">${escapeHtml(p.value)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : `<div class="p-10 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl italic text-xs bg-surface-50/50">No query parameters</div>`}
            </section>

            <section>
              <h3 class="font-bold text-surface-800 mb-3 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                POST Body
              </h3>
              ${post ? `
                <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                  <div class="bg-surface-50 px-4 py-2 text-[9px] font-black text-surface-400 border-b border-surface-200 flex justify-between items-center">
                    <span class="uppercase tracking-widest">${escapeHtml(post.mimeType)}</span>
                  </div>
                  <pre class="p-5 text-[11px] font-mono bg-gray-950 text-gray-200 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all selection:bg-brand-500/30">${escapeHtml(post.text || '')}</pre>
                </div>
              ` : `<div class="p-10 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl italic text-xs bg-surface-50/50">No POST body</div>`}
            </section>
          </div>
        `;
      } else if (tabId === 'response') {
        const content = entry.response.content;
        contentHtml = `
          <div class="space-y-4 h-full flex flex-col animate-in slide-in-from-right-3 duration-300">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-surface-800 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                Response Body
              </h3>
              <div class="flex gap-2">
                <span class="text-[10px] bg-brand-50 text-brand-700 px-3 py-1 rounded-full font-black border border-brand-100">${formatBytes(content.size)}</span>
              </div>
            </div>
            
            <div class="flex-1 min-h-[200px]">
              ${content.text ? `
                <!-- U8. Code/pre block -->
                <div class="rounded-xl overflow-hidden border border-surface-200 h-full flex flex-col bg-white shadow-sm">
                  <div class="bg-surface-50 px-4 py-2.5 flex items-center justify-between border-b border-surface-200">
                    <span class="text-[10px] font-bold text-surface-400 uppercase tracking-[0.2em]">${escapeHtml(content.mimeType || 'Content')}</span>
                    <button id="copy-response" class="text-[10px] font-bold text-brand-600 hover:text-brand-700 uppercase tracking-widest transition-colors">Copy</button>
                  </div>
                  <pre class="flex-1 p-5 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-auto leading-relaxed whitespace-pre-wrap break-all selection:bg-brand-500/30">${escapeHtml(content.text)}</pre>
                </div>
              ` : `
                <div class="h-full flex flex-col items-center justify-center p-12 text-center text-surface-400 border border-dashed border-surface-200 rounded-xl bg-surface-50/50">
                  <div class="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mb-4 opacity-50">📄</div>
                  <p class="text-xs font-semibold text-surface-600 mb-1">Body not available</p>
                  <p class="text-[10px] max-w-[200px] leading-relaxed">The response body was not captured in this HAR file.</p>
                </div>
              `}
            </div>
          </div>
        `;
        setTimeout(() => {
          const btn = document.getElementById('copy-response');
          if (btn) btn.onclick = () => helpers.copyToClipboard(content.text, btn);
        }, 0);
      } else if (tabId === 'timing') {
        const t = entry.timings;
        const total = entry.time;
        const bars = [
          { label: 'Blocked', val: t.blocked, color: 'bg-slate-300' },
          { label: 'DNS', val: t.dns, color: 'bg-blue-300' },
          { label: 'Connect', val: t.connect, color: 'bg-orange-300' },
          { label: 'SSL', val: t.ssl, color: 'bg-purple-300' },
          { label: 'Send', val: t.send, color: 'bg-emerald-300' },
          { label: 'Wait (TTFB)', val: t.wait, color: 'bg-brand-400' },
          { label: 'Receive', val: t.receive, color: 'bg-cyan-500' }
        ].filter(b => b.val > 0);

        contentHtml = `
          <div class="space-y-8 animate-in slide-in-from-right-3 duration-300">
            <section>
              <div class="flex items-center justify-between mb-6">
                <h3 class="font-bold text-surface-800 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                  Timing Waterfall
                </h3>
                <span class="text-xs font-black text-brand-700 bg-brand-50 px-3 py-1 rounded-lg border border-brand-100">${formatTime(total)}</span>
              </div>
              
              <div class="space-y-5">
                ${bars.map(b => {
                  const percent = Math.max(1, (b.val / total * 100)).toFixed(1);
                  return `
                    <div class="space-y-1.5 group">
                      <div class="flex justify-between text-[10px] font-bold">
                        <span class="text-surface-400 uppercase tracking-widest">${b.label}</span>
                        <span class="text-surface-900 font-mono">${b.val.toFixed(2)}ms <span class="text-surface-300 ml-1 font-normal">(${percent}%)</span></span>
                      </div>
                      <div class="h-2 bg-surface-100 rounded-full overflow-hidden border border-surface-200/50 shadow-inner">
                        <div class="${b.color} h-full rounded-full transition-all duration-700 ease-out" style="width: ${percent}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </section>

            <div class="p-5 bg-surface-50 rounded-2xl border border-surface-200 shadow-inner">
              <h4 class="text-[10px] font-black uppercase tracking-[0.3em] text-surface-400 mb-4">Metadata</h4>
              <div class="space-y-3 text-[11px]">
                <div class="flex justify-between items-center border-b border-surface-100/50 pb-2">
                  <span class="text-surface-500 font-medium">Started At</span>
                  <span class="text-surface-900 font-bold">${new Date(entry.startedDateTime).toLocaleString()}</span>
                </div>
                <div class="flex justify-between items-center border-b border-surface-100/50 pb-2">
                  <span class="text-surface-500 font-medium">Connection</span>
                  <span class="text-surface-900 font-mono font-bold">${escapeHtml(entry.connection || 'N/A')}</span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-surface-500 font-medium">Protocol</span>
                  <span class="text-surface-900 font-bold bg-white px-2 py-0.5 rounded border border-surface-200">${escapeHtml(entry.response.httpVersion || 'HTTP/1.1')}</span>
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
