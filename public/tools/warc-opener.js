(function () {
  'use strict';

  let currentObjectUrls = [];

  function cleanupUrls() {
    currentObjectUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    });
    currentObjectUrls = [];
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSize(bytes) {
    if (!bytes || bytes < 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function getIcon(type) {
    const types = {
      'request': '📤',
      'response': '📥',
      'metadata': '📋',
      'warcinfo': 'ℹ️',
      'revisit': '🔄',
      'resource': '📦',
      'conversion': '📑',
      'continuation': '🔗'
    };
    return types[String(type).toLowerCase()] || '📄';
  }

  function findSequence(bytes, seq, start) {
    for (let i = start; i < bytes.length - seq.length + 1; i++) {
      let match = true;
      for (let j = 0; j < seq.length; j++) {
        if (bytes[i + j] !== seq[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  }

  function decompressConcatenatedGzip(data) {
    const chunks = [];
    let offset = 0;
    while (offset < data.length) {
      if (data[offset] !== 0x1f || data[offset + 1] !== 0x8b) {
        offset++;
        continue;
      }
      try {
        const inflater = new pako.Inflate();
        inflater.push(data.subarray(offset), true);
        if (inflater.err) {
          offset++;
          continue;
        }
        chunks.push(inflater.result);
        const nextHeader = findSequence(data, [0x1f, 0x8b], offset + 2);
        if (nextHeader === -1) break;
        offset = nextHeader;
      } catch (e) {
        break;
      }
    }
    if (chunks.length === 0) throw new Error('Could not decompress GZIP archive.');
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  function parseWarc(bytes) {
    const records = [];
    let offset = 0;
    const decoder = new TextDecoder();

    while (offset < bytes.length) {
      const headerEnd = findSequence(bytes, [13, 10, 13, 10], offset);
      if (headerEnd === -1) break;

      const headerText = decoder.decode(bytes.subarray(offset, headerEnd));
      const lines = headerText.split('\r\n');
      if (!lines[0] || !lines[0].startsWith('WARC/')) {
        offset++;
        continue;
      }

      const headers = {};
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf(':');
        if (idx !== -1) {
          headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }
      }

      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      const record = {
        headers,
        type: headers['warc-type'] || 'unknown',
        uri: headers['warc-target-uri'] || '',
        date: headers['warc-date'] || '',
        contentType: headers['content-type'] || '',
        id: headers['warc-record-id'] || `idx-${records.length}`
      };

      if (bodyEnd > bytes.length) {
        record.body = bytes.subarray(bodyStart);
        record.truncated = true;
        records.push(record);
        break;
      } else {
        record.body = bytes.subarray(bodyStart, bodyEnd);
        records.push(record);
      }

      offset = bodyEnd;
      while (offset < bytes.length && (bytes[offset] === 10 || bytes[offset] === 13)) {
        offset++;
      }
    }
    return records;
  }

  function generateHexDump(buffer) {
    const bytes = new Uint8Array(buffer);
    const maxLen = 4096;
    const len = Math.min(bytes.length, maxLen);
    let out = '';
    for (let i = 0; i < len; i += 16) {
      let line = i.toString(16).padStart(8, '0') + '  ';
      let ascii = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < len) {
          const b = bytes[i + j];
          line += b.toString(16).padStart(2, '0') + ' ';
          ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          line += '   ';
        }
        if (j === 7) line += ' ';
      }
      out += line + ' |' + ascii + '|\n';
    }
    if (bytes.length > maxLen) out += '\n... (truncated for performance)';
    return out;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.warc,.warc.gz',
      binary: true,
      infoHtml: 'Parses Web ARChive (WARC) files directly in your browser. Supports GZIP compression.',

      actions: [
        {
          label: '📋 Copy URIs',
          id: 'copy-uris',
          onClick: function (h, btn) {
            const records = h.getState().records;
            if (!records) return;
            const uris = records.map(r => r.uri).filter(u => u).join('\n');
            if (!uris) {
              h.showError('No URIs', 'No target URIs found in this archive.');
              return;
            }
            h.copyToClipboard(uris, btn);
          }
        },
        {
          label: '📥 Export CSV Index',
          id: 'export-csv',
          onClick: function (h) {
            const records = h.getState().records;
            if (!records) return;
            const csv = [
              'ID,Type,URI,MimeType,Size,Date',
              ...records.map(r => [
                `"${(r.id || '').replace(/"/g, '""')}"`,
                `"${(r.type || '').replace(/"/g, '""')}"`,
                `"${(r.uri || '').replace(/"/g, '""')}"`,
                `"${(r.contentType || '').replace(/"/g, '""')}"`,
                r.body.length,
                `"${(r.date || '').replace(/"/g, '""')}"`
              ].join(','))
            ].join('\n');
            h.download('warc-index.csv', csv, 'text/csv');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onDestroy: function () {
        cleanupUrls();
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof pako === 'undefined') {
          h.showLoading('Loading dependencies...');
          setTimeout(function () { _onFileFn(file, content, h); }, 100);
          return;
        }

        cleanupUrls();
        h.showLoading('Parsing WARC structure...');

        setTimeout(function () {
          try {
            let data = new Uint8Array(content);
            
            // Handle GZIP
            if (data[0] === 0x1f && data[1] === 0x8b) {
              try {
                data = pako.inflate(data);
              } catch (e) {
                // Try concatenated gzip members
                try {
                  data = decompressConcatenatedGzip(data);
                } catch (e2) {
                  throw new Error('Failed to decompress GZIP: ' + e2.message);
                }
              }
            }

            const records = parseWarc(data);
            if (!records || records.length === 0) {
              h.showError('Empty Archive', 'No valid WARC records were found in this file.');
              return;
            }

            h.setState({
              records: records,
              fileName: file.name,
              fileSize: file.size,
              searchTerm: '',
              sortCol: 'id',
              sortDir: 1,
              viewingRecord: null
            });
            renderWarc(h);
          } catch (err) {
            h.showError('Parsing Failed', err.message);
          }
        }, 30);
      }
    });
  };

  function renderWarc(h) {
    const state = h.getState();
    const records = state.records || [];
    const searchTerm = (state.searchTerm || '').toLowerCase();

    const filtered = searchTerm ? records.filter(r =>
      (r.uri || '').toLowerCase().includes(searchTerm) ||
      (r.contentType || '').toLowerCase().includes(searchTerm) ||
      (r.type || '').toLowerCase().includes(searchTerm) ||
      (r.id || '').toLowerCase().includes(searchTerm)
    ) : records;

    const sorted = [...filtered].sort((a, b) => {
      let vA, vB;
      if (state.sortCol === 'uri') { vA = a.uri; vB = b.uri; }
      else if (state.sortCol === 'type') { vA = a.type; vB = b.type; }
      else if (state.sortCol === 'size') { vA = a.body.length; vB = b.body.length; }
      else if (state.sortCol === 'date') { vA = a.date; vB = b.date; }
      else { vA = records.indexOf(a); vB = records.indexOf(b); }
      
      if (vA < vB) return -1 * state.sortDir;
      if (vA > vB) return 1 * state.sortDir;
      return 0;
    });

    const PAGE_SIZE = 500;
    const displayItems = sorted.slice(0, PAGE_SIZE);

    const html = `
      <div class="p-4 md:p-8 max-w-7xl mx-auto">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${records.length.toLocaleString()} records</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.warc file</span>
        </div>

        <div class="space-y-4">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 class="font-semibold text-surface-800 text-lg">Archive Records</h3>
              <p class="text-xs text-surface-500">Select a record to view headers and content</p>
            </div>
            
            <div class="relative w-full md:w-80">
              <input type="text" id="warc-search" placeholder="Search URI, type, or mime..." value="${esc(state.searchTerm)}"
                class="w-full pl-10 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all">
              <span class="absolute left-3.5 top-2.5 text-surface-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/50">
                  <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-12">#</th>
                  <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100" data-sort="type">Type ${state.sortCol==='type'?(state.sortDir===1?'▲':'▼'):''}</th>
                  <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100" data-sort="uri">URI ${state.sortCol==='uri'?(state.sortDir===1?'▲':'▼'):''}</th>
                  <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Content Type</th>
                  <th class="sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100" data-sort="size">Size ${state.sortCol==='size'?(state.sortDir===1?'▲':'▼'):''}</th>
                  <th class="sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${displayItems.map((r, i) => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors cursor-pointer group" data-idx="${records.indexOf(r)}">
                    <td class="px-4 py-2.5 text-surface-400 font-mono text-xs">${records.indexOf(r) + 1}</td>
                    <td class="px-4 py-2.5">
                      <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-100 text-[10px] font-bold text-surface-700 uppercase">
                        ${getIcon(r.type)} ${esc(r.type)}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 font-mono text-[11px] text-surface-700 break-all max-w-md">${esc(r.uri || '—')}</td>
                    <td class="px-4 py-2.5 text-surface-500 text-xs">${esc(r.contentType || '—')}</td>
                    <td class="px-4 py-2.5 text-right text-surface-600 font-mono text-xs">${formatSize(r.body.length)}</td>
                    <td class="px-4 py-2.5 text-right">
                      <button class="view-btn text-brand-600 hover:text-brand-700 font-semibold text-xs group-hover:underline">Inspect</button>
                    </td>
                  </tr>
                `).join('')}
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="6" class="p-16 text-center">
                      <div class="text-surface-400 mb-2">No records found matching your search.</div>
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
          
          ${filtered.length > PAGE_SIZE ? `
            <div class="text-center py-4 bg-surface-50 rounded-xl text-surface-500 text-xs italic">
              Showing first ${PAGE_SIZE} of ${filtered.length.toLocaleString()} matching records. Use search to find specific entries.
            </div>
          ` : ''}
        </div>

        <div id="warc-modal" class="fixed inset-0 z-50 hidden bg-surface-950/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-full flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div class="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-surface-50/50">
              <div class="flex items-center gap-4 min-w-0">
                <div id="m-icon" class="w-10 h-10 rounded-xl bg-white border border-surface-200 flex items-center justify-center text-xl shadow-sm"></div>
                <div class="min-w-0">
                  <h4 id="m-title" class="text-sm font-bold text-surface-900 truncate"></h4>
                  <p id="m-subtitle" class="text-[11px] text-surface-500 font-mono truncate"></p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button id="m-dl" title="Download Record Body" class="p-2.5 text-surface-500 hover:text-brand-600 hover:bg-white rounded-xl border border-transparent hover:border-surface-200 transition-all">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </button>
                <button id="m-close" class="p-2.5 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <div class="flex bg-surface-50/50 border-b border-surface-100 px-4">
              <button class="m-tab px-6 py-3 text-xs font-bold text-surface-500 border-b-2 border-transparent transition-all hover:text-brand-600" data-tab="content">CONTENT</button>
              <button class="m-tab px-6 py-3 text-xs font-bold text-surface-500 border-b-2 border-transparent transition-all hover:text-brand-600" data-tab="headers">WARC HEADERS</button>
            </div>

            <div class="flex-1 overflow-hidden relative bg-white min-h-[400px]">
              <div id="m-content-view" class="h-full overflow-auto"></div>
              <div id="m-headers-view" class="hidden absolute inset-0 overflow-auto p-6 bg-surface-50 font-mono text-xs"></div>
            </div>
            
            <div class="px-6 py-3 bg-surface-50 border-t border-surface-100 flex justify-between items-center text-[10px] text-surface-400">
              <span id="m-status"></span>
              <span id="m-size"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const searchEl = document.getElementById('warc-search');
    searchEl.oninput = (e) => {
      h.setState({ searchTerm: e.target.value });
      renderWarc(h);
      document.getElementById('warc-search').focus();
    };

    h.getRenderEl().querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        const dir = (state.sortCol === col) ? (state.sortDir * -1) : 1;
        h.setState({ sortCol: col, sortDir: dir });
        renderWarc(h);
      };
    });

    h.getRenderEl().querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.onclick = () => {
        const idx = parseInt(tr.dataset.idx);
        openRecord(records[idx], h);
      };
    });
  }

  function openRecord(record, h) {
    cleanupUrls();
    const modal = document.getElementById('warc-modal');
    modal.classList.remove('hidden');
    
    document.getElementById('m-title').textContent = record.uri || 'Unnamed Record';
    document.getElementById('m-subtitle').textContent = record.id;
    document.getElementById('m-icon').textContent = getIcon(record.type);
    document.getElementById('m-size').textContent = formatSize(record.body.length);
    document.getElementById('m-status').textContent = record.truncated ? '⚠️ Truncated' : 'Complete Record';

    const headersHtml = Object.entries(record.headers).map(([k, v]) => 
      `<div class="py-1 border-b border-surface-200/50"><span class="font-bold text-brand-700 select-none">${esc(k)}:</span> <span class="text-surface-800 break-all">${esc(v)}</span></div>`
    ).join('');
    document.getElementById('m-headers-view').innerHTML = `<div class="max-w-4xl mx-auto">${headersHtml}</div>`;

    const contentView = document.getElementById('m-content-view');
    const ct = (record.contentType || '').toLowerCase();
    
    if (ct.startsWith('image/')) {
      const blob = new Blob([record.body], { type: record.contentType });
      const url = URL.createObjectURL(blob);
      currentObjectUrls.push(url);
      contentView.innerHTML = `<div class="flex items-center justify-center p-8 h-full bg-surface-100/50"><img src="${url}" class="max-w-full max-h-full rounded shadow-xl bg-white p-2"></div>`;
    } else if (ct === 'text/html') {
      let text = new TextDecoder().decode(record.body);
      const sanitized = text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '<!-- script removed -->')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/href="javascript:[^"]*"/gi, 'href="#"');
        
      const blob = new Blob([sanitized], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      currentObjectUrls.push(url);
      contentView.innerHTML = `<iframe src="${url}" class="w-full h-full border-none" sandbox="allow-same-origin"></iframe>`;
    } else {
      let text;
      try {
        text = new TextDecoder().decode(record.body);
      } catch (e) {
        text = null;
      }

      const isBinary = !text || /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 4096));
      
      if (isBinary) {
        contentView.innerHTML = `
          <div class="p-6">
            <div class="mb-4 flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg text-xs font-medium">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              Binary content detected. Showing hex dump.
            </div>
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
              <pre class="p-4 text-[10px] md:text-xs font-mono bg-gray-900 text-gray-100 overflow-x-auto leading-relaxed">${generateHexDump(record.body)}</pre>
            </div>
          </div>
        `;
      } else {
        contentView.innerHTML = `
          <div class="p-6">
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
              <pre class="p-4 text-xs md:text-sm font-mono bg-gray-900 text-gray-100 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">${esc(text)}</pre>
            </div>
          </div>
        `;
      }
    }

    const closeBtn = document.getElementById('m-close');
    const closeFn = () => {
      modal.classList.add('hidden');
      cleanupUrls();
    };
    closeBtn.onclick = closeFn;
    modal.onclick = (e) => { if (e.target === modal) closeFn(); };
    
    document.getElementById('m-dl').onclick = () => {
      h.download(`${record.id.replace(/[^a-z0-9]/gi, '_')}.bin`, record.body);
    };

    const tabs = document.querySelectorAll('.m-tab');
    function setTab(activeId) {
      tabs.forEach(t => {
        const isActive = t.dataset.tab === activeId;
        t.classList.toggle('text-brand-600', isActive);
        t.classList.toggle('border-brand-600', isActive);
        t.classList.toggle('text-surface-500', !isActive);
        t.classList.toggle('border-transparent', !isActive);
      });
      document.getElementById('m-content-view').classList.toggle('hidden', activeId !== 'content');
      document.getElementById('m-headers-view').classList.toggle('hidden', activeId !== 'headers');
    }

    tabs.forEach(t => {
      t.onclick = () => setTab(t.dataset.tab);
    });
    setTab('content');
  }

})();
