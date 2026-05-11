(function () {
  'use strict';

  /**
   * OmniOpener WARC Tool
   * Production Perfect Edition
   */

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
    if (bytes === 0) return '0 B';
    if (!bytes) return '—';
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
    const len = bytes.length;
    const seqLen = seq.length;
    outer: for (let i = start; i <= len - seqLen; i++) {
      for (let j = 0; j < seqLen; j++) {
        if (bytes[i + j] !== seq[j]) continue outer;
      }
      return i;
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
      while (offset < bytes.length && (bytes[offset] === 10 || bytes[offset] === 13 || bytes[offset] === 32)) {
        offset++;
      }
      if (offset >= bytes.length) break;

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
          const key = line.slice(0, idx).trim().toLowerCase();
          const val = line.slice(idx + 1).trim();
          headers[key] = val;
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
        id: headers['warc-record-id'] || `rec-${records.length}`,
        body: null,
        truncated: false
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
    }
    return records;
  }

  function generateHexDump(buffer) {
    const bytes = new Uint8Array(buffer);
    const maxLen = 8192;
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

  function sanitizeHtml(html) {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '<!-- script removed -->')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/href="javascript:[^"]*"/gi, 'href="#"');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.warc,.warc.gz',
      binary: true,
      infoHtml: 'Professional Web ARChive (WARC) viewer. Inspect network captures, metadata, and archived web content directly in your browser.',

      actions: [
        {
          label: '📋 Copy URIs',
          id: 'copy-uris',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.records) return;
            const uris = state.records.map(r => r.uri).filter(u => u).join('\n');
            if (!uris) {
              h.showError('No URIs Found', 'No target URIs were found in this archive.');
              return;
            }
            h.copyToClipboard(uris, btn);
          }
        },
        {
          label: '📥 Export CSV Index',
          id: 'export-csv',
          onClick: function (h) {
            const state = h.getState();
            if (!state.records) return;
            const csv = [
              'ID,Type,URI,MimeType,Size,Date',
              ...state.records.map(r => [
                `"${(r.id || '').replace(/"/g, '""')}"`,
                `"${(r.type || '').replace(/"/g, '""')}"`,
                `"${(r.uri || '').replace(/"/g, '""')}"`,
                `"${(r.contentType || '').replace(/"/g, '""')}"`,
                r.body ? r.body.length : 0,
                `"${(r.date || '').replace(/"/g, '""')}"`
              ].join(','))
            ].join('\n');
            h.download(`${state.fileName || 'warc'}-index.csv`, csv, 'text/csv');
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
          h.showLoading('Loading decompression engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 150);
          return;
        }

        cleanupUrls();
        h.showLoading('Extracting WARC records...');

        setTimeout(function () {
          try {
            let data = new Uint8Array(content);
            if (data[0] === 0x1f && data[1] === 0x8b) {
              try {
                data = pako.inflate(data);
              } catch (e) {
                try {
                  data = decompressConcatenatedGzip(data);
                } catch (e2) {
                  throw new Error('Failed to decompress archive: ' + e2.message);
                }
              }
            }

            const records = parseWarc(data);
            if (!records || records.length === 0) {
              h.showError('Empty Archive', 'This file does not appear to contain any valid WARC records.');
              return;
            }

            h.setState({
              records: records,
              fileName: file.name,
              fileSize: file.size,
              searchTerm: '',
              sortCol: null,
              sortDir: 1,
              viewingRecordIdx: -1
            });
            renderMain(h);
          } catch (err) {
            h.showError('Could not open WARC file', 'The file may be corrupted or in an unsupported format. Error: ' + err.message);
          }
        }, 50);
      }
    });
  };

  function renderMain(h) {
    const state = h.getState();
    const records = state.records || [];
    const searchTerm = (state.searchTerm || '').toLowerCase();

    const filtered = searchTerm ? records.filter(r =>
      (r.uri || '').toLowerCase().includes(searchTerm) ||
      (r.contentType || '').toLowerCase().includes(searchTerm) ||
      (r.type || '').toLowerCase().includes(searchTerm) ||
      (r.id || '').toLowerCase().includes(searchTerm)
    ) : records;

    if (state.sortCol) {
      filtered.sort((a, b) => {
        let vA, vB;
        if (state.sortCol === 'uri') { vA = a.uri; vB = b.uri; }
        else if (state.sortCol === 'type') { vA = a.type; vB = b.type; }
        else if (state.sortCol === 'size') { vA = a.body ? a.body.length : 0; vB = b.body ? b.body.length : 0; }
        else if (state.sortCol === 'date') { vA = a.date; vB = b.date; }
        else { vA = 0; vB = 0; }
        if (vA < vB) return -1 * state.sortDir;
        if (vA > vB) return 1 * state.sortDir;
        return 0;
      });
    }

    const PAGE_SIZE = 1000;
    const displayItems = filtered.slice(0, PAGE_SIZE);

    const html = `
      <div class="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.warc file</span>
        </div>

        <div class="space-y-6">
          <!-- U10: Section Header -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
            <div>
              <h3 class="font-semibold text-surface-800 text-lg">Archive Contents</h3>
              <p class="text-xs text-surface-500 mt-0.5">${records.length.toLocaleString()} total records</p>
            </div>
            <div class="relative w-full md:w-80">
              <input type="text" id="warc-search" placeholder="Filter records..." value="${esc(state.searchTerm)}"
                class="w-full pl-10 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
              <span class="absolute left-3.5 top-2.5 text-surface-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
              <span class="absolute right-3 top-2.5 text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${filtered.length}</span>
            </div>
          </div>

          <!-- U7: Table -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50">
                  <th class="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-16">#</th>
                  <th class="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:text-brand-600 transition-colors" data-sort="type">
                    Type ${state.sortCol === 'type' ? (state.sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                  <th class="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:text-brand-600 transition-colors" data-sort="uri">
                    Target URI ${state.sortCol === 'uri' ? (state.sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                  <th class="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">MIME Type</th>
                  <th class="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:text-brand-600 transition-colors" data-sort="size">
                    Size ${state.sortCol === 'size' ? (state.sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${displayItems.map((r, i) => {
                  const realIdx = records.indexOf(r);
                  return `
                  <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors cursor-pointer" data-idx="${realIdx}">
                    <td class="px-4 py-2.5 text-surface-400 font-mono text-xs">${realIdx + 1}</td>
                    <td class="px-4 py-2.5">
                      <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-100 text-[10px] font-bold text-surface-600 uppercase">
                        ${getIcon(r.type)} ${esc(r.type)}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 font-mono text-[11px] text-surface-700 break-all max-w-md">
                      ${esc(r.uri || '—')}
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 text-xs truncate max-w-[150px]">
                      ${esc(r.contentType || '—')}
                    </td>
                    <td class="px-4 py-2.5 text-right text-surface-600 font-mono text-xs tabular-nums">
                      ${formatSize(r.body ? r.body.length : 0)}
                    </td>
                  </tr>
                `}).join('')}
                
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="5" class="py-20 text-center">
                      <div class="flex flex-col items-center justify-center opacity-40">
                        <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <p class="text-base font-medium">No matching records found</p>
                      </div>
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
          
          ${filtered.length > PAGE_SIZE ? `
            <div class="text-center py-4 bg-surface-50 rounded-xl border border-dashed border-surface-200 text-surface-500 text-xs">
              Showing first <b>${PAGE_SIZE}</b> of ${filtered.length.toLocaleString()} matches.
            </div>
          ` : ''}
        </div>

        <!-- U9: Content Modal -->
        <div id="warc-modal" class="fixed inset-0 z-[100] hidden bg-surface-950/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 transition-opacity duration-300 opacity-0">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden transform scale-95 transition-transform duration-300">
            <div class="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-surface-50/50">
              <div class="flex items-center gap-3 min-w-0">
                <div id="m-icon" class="w-10 h-10 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-xl shadow-sm flex-shrink-0"></div>
                <div class="min-w-0">
                  <h4 id="m-title" class="text-sm font-bold text-surface-900 truncate pr-4"></h4>
                  <p id="m-subtitle" class="text-[10px] text-surface-400 font-mono truncate"></p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button id="m-dl" title="Download Body" class="p-2 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </button>
                <button id="m-close" class="p-2 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <div class="flex bg-surface-50 border-b border-surface-100 px-6">
              <button class="m-tab px-5 py-3 text-[11px] font-bold text-surface-400 border-b-2 border-transparent transition-all hover:text-brand-600" data-tab="content">CONTENT PREVIEW</button>
              <button class="m-tab px-5 py-3 text-[11px] font-bold text-surface-400 border-b-2 border-transparent transition-all hover:text-brand-600" data-tab="headers">HEADERS</button>
            </div>

            <div class="flex-1 overflow-hidden relative min-h-[400px]">
              <div id="m-content-view" class="h-full overflow-auto p-4 md:p-6 bg-surface-50/30"></div>
              <div id="m-headers-view" class="hidden absolute inset-0 overflow-auto p-4 md:p-6 bg-white"></div>
            </div>
            
            <div class="px-6 py-3 bg-surface-50 border-t border-surface-100 flex justify-between items-center text-[10px] text-surface-400 font-medium">
              <span id="m-status" class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-200 text-surface-600 capitalize"></span>
              <span id="m-size-info" class="font-mono"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const searchEl = document.getElementById('warc-search');
    searchEl.oninput = (e) => {
      h.setState({ searchTerm: e.target.value });
      renderMain(h);
      const input = document.getElementById('warc-search');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    h.getRenderEl().querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        const dir = (state.sortCol === col) ? (state.sortDir * -1) : 1;
        h.setState({ sortCol: col, sortDir: dir });
        renderMain(h);
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
    const modalInner = modal.querySelector('.transform');
    
    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.add('opacity-100');
    modalInner.classList.remove('scale-95');
    modalInner.classList.add('scale-100');
    
    document.getElementById('m-title').textContent = record.uri || 'Record without URI';
    document.getElementById('m-subtitle').textContent = record.id;
    document.getElementById('m-icon').textContent = getIcon(record.type);
    document.getElementById('m-size-info').textContent = formatSize(record.body ? record.body.length : 0);
    document.getElementById('m-status').textContent = record.type + (record.truncated ? ' (truncated)' : '');

    // U7: Headers table
    const headersHtml = `
      <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
        <table class="min-w-full text-xs">
          <tbody class="divide-y divide-surface-100">
            ${Object.entries(record.headers).map(([k, v]) => `
              <tr class="hover:bg-surface-50">
                <td class="px-4 py-3 font-bold text-surface-500 w-1/3 bg-surface-50/50 border-r border-surface-100 uppercase tracking-tighter">${esc(k)}</td>
                <td class="px-4 py-3 text-surface-800 font-mono break-all">${esc(v)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('m-headers-view').innerHTML = headersHtml;

    const contentView = document.getElementById('m-content-view');
    const ct = (record.contentType || '').toLowerCase();
    
    if (record.body && record.body.length > 0) {
      if (ct.startsWith('image/')) {
        const blob = new Blob([record.body], { type: record.contentType });
        const url = URL.createObjectURL(blob);
        currentObjectUrls.push(url);
        contentView.innerHTML = `
          <div class="flex items-center justify-center p-8 bg-white rounded-xl border border-surface-200 shadow-sm">
            <img src="${url}" class="max-w-full max-h-[500px] shadow-lg rounded">
          </div>`;
      } else if (ct === 'text/html' || ct === 'application/xhtml+xml') {
        const text = new TextDecoder().decode(record.body);
        const sanitized = sanitizeHtml(text);
        const blob = new Blob([sanitized], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        currentObjectUrls.push(url);
        contentView.innerHTML = `
          <div class="h-[500px] w-full bg-white rounded-xl border border-surface-200 overflow-hidden shadow-inner">
            <iframe src="${url}" class="w-full h-full border-none" sandbox="allow-same-origin"></iframe>
          </div>`;
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
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
              <pre class="p-4 text-[10px] md:text-xs font-mono bg-gray-900 text-gray-100 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-surface-700">${generateHexDump(record.body)}</pre>
            </div>
          `;
        } else {
          let prettyText = text;
          if (ct.includes('json') || (text.trim().startsWith('{') && text.trim().endsWith('}'))) {
            try { prettyText = JSON.stringify(JSON.parse(text), null, 2); } catch (e) {}
          }
          // U8: Code block
          contentView.innerHTML = `
            <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm bg-gray-950">
              <pre class="p-4 text-xs font-mono text-gray-100 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">${esc(prettyText)}</pre>
            </div>
          `;
        }
      }
    } else {
      contentView.innerHTML = `
        <div class="flex flex-col items-center justify-center p-20 opacity-30">
          <svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          <div class="text-sm font-medium">Empty record body</div>
        </div>
      `;
    }

    const closeBtn = document.getElementById('m-close');
    const closeFn = () => {
      modal.classList.remove('opacity-100');
      modalInner.classList.remove('scale-100');
      modalInner.classList.add('scale-95');
      setTimeout(() => {
        modal.classList.add('hidden');
        cleanupUrls();
      }, 200);
    };
    
    closeBtn.onclick = closeFn;
    modal.onclick = (e) => { if (e.target === modal) closeFn(); };
    
    document.getElementById('m-dl').onclick = () => {
      const filename = (record.uri ? record.uri.split('/').pop() : record.id.replace(/[^a-z0-9]/gi, '_')) || 'record';
      h.download(`${filename}.bin`, record.body || new Uint8Array(0));
    };

    const tabs = document.querySelectorAll('.m-tab');
    function setTab(activeId) {
      tabs.forEach(t => {
        const isActive = t.dataset.tab === activeId;
        t.classList.toggle('text-brand-600', isActive);
        t.classList.toggle('border-brand-600', isActive);
        t.classList.toggle('text-surface-400', !isActive);
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
