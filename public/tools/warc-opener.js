(function () {
  'use strict';

  /**
   * OmniOpener WARC Tool
   * Senior Staff Engineer Edition
   * Supports .warc and .warc.gz (including concatenated GZIP)
   */

  let currentObjectUrls = [];

  function cleanupUrls() {
    currentObjectUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore revocation errors
      }
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

  /**
   * WARC files are often concatenated GZIP members.
   * Standard pako.inflate only handles the first member.
   */
  function decompressConcatenatedGzip(data) {
    const chunks = [];
    let offset = 0;
    while (offset < data.length) {
      // Check for GZIP magic number
      if (data[offset] !== 0x1f || data[offset + 1] !== 0x8b) {
        offset++;
        continue;
      }
      try {
        // We use a new Inflate instance for each member
        const inflater = new pako.Inflate();
        inflater.push(data.subarray(offset), true);
        if (inflater.err) {
          offset++;
          continue;
        }
        chunks.push(inflater.result);
        
        // Find next member start
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
      // Skip leading newlines/whitespace
      while (offset < bytes.length && (bytes[offset] === 10 || bytes[offset] === 13 || bytes[offset] === 32)) {
        offset++;
      }
      if (offset >= bytes.length) break;

      const headerEnd = findSequence(bytes, [13, 10, 13, 10], offset);
      if (headerEnd === -1) break;

      const headerText = decoder.decode(bytes.subarray(offset, headerEnd));
      const lines = headerText.split('\r\n');
      if (!lines[0] || !lines[0].startsWith('WARC/')) {
        // Not a valid record start, skip one byte and retry
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
    const maxLen = 8192; // Slightly more for "Staff" level
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
    // Basic sanitization for iframe preview
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
        // B1 & B8: Check dependency and handle strict mode self-reference
        if (typeof pako === 'undefined') {
          h.showLoading('Initializing decompression engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 150);
          return;
        }

        cleanupUrls();
        h.showLoading('Analyzing WARC structure...');

        // Wrap in setTimeout to ensure UI updates with loading message
        setTimeout(function () {
          try {
            // B2: Ensure binary content handling
            let data = new Uint8Array(content);
            
            // Handle GZIP (Concatenated or Single)
            if (data[0] === 0x1f && data[1] === 0x8b) {
              try {
                // Try standard pako first
                data = pako.inflate(data);
              } catch (e) {
                // B4: Handle concatenated gzip members if standard fails
                try {
                  data = decompressConcatenatedGzip(data);
                } catch (e2) {
                  throw new Error('Failed to decompress archive: ' + e2.message);
                }
              }
            }

            const records = parseWarc(data);
            if (!records || records.length === 0) {
              // U5: Empty state
              h.showError('Invalid Archive', 'The file does not contain valid WARC records.');
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
            // U3: Friendly error
            h.showError('Could not open WARC file', 'The file may be corrupted, encrypted, or in an unsupported format. Error: ' + err.message);
          }
        }, 50);
      }
    });
  };

  function renderMain(h) {
    const state = h.getState();
    const records = state.records || [];
    const searchTerm = (state.searchTerm || '').toLowerCase();

    // U4 & PART 4: Data filtering
    const filtered = searchTerm ? records.filter(r =>
      (r.uri || '').toLowerCase().includes(searchTerm) ||
      (r.contentType || '').toLowerCase().includes(searchTerm) ||
      (r.type || '').toLowerCase().includes(searchTerm) ||
      (r.id || '').toLowerCase().includes(searchTerm)
    ) : records;

    // Sorting logic
    const sorted = state.sortCol ? [...filtered].sort((a, b) => {
      let vA, vB;
      if (state.sortCol === 'uri') { vA = a.uri; vB = b.uri; }
      else if (state.sortCol === 'type') { vA = a.type; vB = b.type; }
      else if (state.sortCol === 'size') { vA = a.body ? a.body.length : 0; vB = b.body ? b.body.length : 0; }
      else if (state.sortCol === 'date') { vA = a.date; vB = b.date; }
      else { vA = 0; vB = 0; }
      
      if (vA < vB) return -1 * state.sortDir;
      if (vA > vB) return 1 * state.sortDir;
      return 0;
    }) : filtered;

    // B7: Large file handling (pagination)
    const PAGE_SIZE = 1000;
    const displayItems = sorted.slice(0, PAGE_SIZE);

    const html = `
      <div class="p-4 md:p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
          <span class="font-bold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-brand-600 font-medium">${records.length.toLocaleString()} records</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.warc file</span>
        </div>

        <div class="space-y-6">
          <!-- U10: Section Header with Search -->
          <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-bold text-surface-900 text-xl">Archive Explorer</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">${filtered.length} matches</span>
              </div>
              <p class="text-sm text-surface-500">Filter and inspect individual WARC records</p>
            </div>
            
            <div class="relative w-full md:w-96 group">
              <input type="text" id="warc-search" placeholder="Search URI, content-type, or record type..." value="${esc(state.searchTerm)}"
                class="w-full pl-11 pr-4 py-2.5 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm">
              <span class="absolute left-4 top-3 text-surface-400 group-focus-within:text-brand-500 transition-colors">
                <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
            </div>
          </div>

          <!-- U7: Table Implementation -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th class="sticky top-0 z-10 bg-surface-50/95 backdrop-blur px-4 py-3.5 text-left font-semibold text-surface-700 border-b border-surface-200 w-12 rounded-tl-xl">#</th>
                  <th class="sticky top-0 z-10 bg-surface-50/95 backdrop-blur px-4 py-3.5 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group" data-sort="type">
                    Type ${state.sortCol==='type'?(state.sortDir===1?'<span class="text-brand-500 ml-1">▲</span>':'<span class="text-brand-500 ml-1">▼</span>'):'<span class="opacity-0 group-hover:opacity-40 ml-1">↕</span>'}
                  </th>
                  <th class="sticky top-0 z-10 bg-surface-50/95 backdrop-blur px-4 py-3.5 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group" data-sort="uri">
                    Target URI ${state.sortCol==='uri'?(state.sortDir===1?'<span class="text-brand-500 ml-1">▲</span>':'<span class="text-brand-500 ml-1">▼</span>'):'<span class="opacity-0 group-hover:opacity-40 ml-1">↕</span>'}
                  </th>
                  <th class="sticky top-0 z-10 bg-surface-50/95 backdrop-blur px-4 py-3.5 text-left font-semibold text-surface-700 border-b border-surface-200">Content Type</th>
                  <th class="sticky top-0 z-10 bg-surface-50/95 backdrop-blur px-4 py-3.5 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors group rounded-tr-xl" data-sort="size">
                    Size ${state.sortCol==='size'?(state.sortDir===1?'<span class="text-brand-500 ml-1">▲</span>':'<span class="text-brand-500 ml-1">▼</span>'):'<span class="opacity-0 group-hover:opacity-40 ml-1">↕</span>'}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${displayItems.map((r, i) => {
                  const realIdx = records.indexOf(r);
                  return `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/60 transition-colors cursor-pointer group" data-idx="${realIdx}">
                    <td class="px-4 py-3 text-surface-400 font-mono text-[10px]">${realIdx + 1}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-surface-200 text-[10px] font-bold text-surface-700 uppercase shadow-sm">
                        ${getIcon(r.type)} ${esc(r.type)}
                      </span>
                    </td>
                    <td class="px-4 py-3 font-mono text-[11px] text-surface-800 break-all max-w-xl">
                      ${esc(r.uri || '—')}
                    </td>
                    <td class="px-4 py-3 text-surface-500 text-xs">
                      ${esc(r.contentType || '—')}
                    </td>
                    <td class="px-4 py-3 text-right text-surface-600 font-mono text-xs tabular-nums">
                      ${formatSize(r.body ? r.body.length : 0)}
                    </td>
                  </tr>
                `}).join('')}
                
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="5" class="py-20 text-center">
                      <div class="flex flex-col items-center justify-center opacity-40">
                        <svg class="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <div class="text-lg font-medium">No matching records</div>
                        <div class="text-sm">Try a different search term</div>
                      </div>
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
          
          ${filtered.length > PAGE_SIZE ? `
            <div class="flex items-center justify-center py-4 bg-surface-50 rounded-xl border border-dashed border-surface-300 text-surface-500 text-sm">
              <span class="mr-2">💡</span>
              Showing first <b>${PAGE_SIZE}</b> of ${filtered.length.toLocaleString()} matching records. Refine search to see others.
            </div>
          ` : ''}
        </div>

        <!-- U9 & Modal implementation -->
        <div id="warc-modal" class="fixed inset-0 z-[100] hidden bg-surface-950/60 backdrop-blur-sm flex items-center justify-center p-4 md:p-10 transition-all duration-300 opacity-0">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-full flex flex-col overflow-hidden transform scale-95 transition-all duration-300">
            <!-- Modal Header -->
            <div class="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-surface-50/50">
              <div class="flex items-center gap-4 min-w-0">
                <div id="m-icon" class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center text-2xl shadow-sm"></div>
                <div class="min-w-0">
                  <h4 id="m-title" class="text-base font-bold text-surface-900 truncate pr-4"></h4>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span id="m-subtitle" class="text-[11px] text-surface-500 font-mono truncate bg-surface-100 px-1.5 py-0.5 rounded"></span>
                    <span id="m-date" class="text-[11px] text-surface-400 font-medium italic"></span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button id="m-dl" title="Download Content Body" class="p-2.5 text-surface-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl transition-all border border-transparent hover:border-brand-200">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </button>
                <button id="m-close" class="p-2.5 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <!-- Modal Tabs -->
            <div class="flex bg-surface-50 border-b border-surface-100 px-6">
              <button class="m-tab px-6 py-3 text-xs font-bold text-surface-400 border-b-2 border-transparent transition-all hover:text-brand-600 flex items-center gap-2" data-tab="content">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                CONTENT PREVIEW
              </button>
              <button class="m-tab px-6 py-3 text-xs font-bold text-surface-400 border-b-2 border-transparent transition-all hover:text-brand-600 flex items-center gap-2" data-tab="headers">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
                RECORD HEADERS
              </button>
            </div>

            <!-- Modal Body -->
            <div class="flex-1 overflow-hidden relative bg-surface-50/30 min-h-[500px]">
              <div id="m-content-view" class="h-full overflow-auto animate-in fade-in duration-300"></div>
              <div id="m-headers-view" class="hidden absolute inset-0 overflow-auto p-6 bg-white animate-in slide-in-from-right-4 duration-300"></div>
            </div>
            
            <!-- Modal Footer -->
            <div class="px-6 py-3 bg-surface-50 border-t border-surface-100 flex justify-between items-center text-[10px] text-surface-400 font-medium">
              <div class="flex items-center gap-4">
                <span id="m-status" class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-200 text-surface-600"></span>
                <span id="m-type-badge" class="font-bold uppercase tracking-tighter"></span>
              </div>
              <span id="m-size-info" class="font-mono bg-white px-2 py-0.5 rounded border border-surface-200 text-surface-600 shadow-sm"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    // Event Listeners
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
    // Force reflow for animations
    void modal.offsetWidth;
    modal.classList.add('opacity-100');
    modalInner.classList.remove('scale-95');
    modalInner.classList.add('scale-100');
    
    document.getElementById('m-title').textContent = record.uri || 'Unnamed Record';
    document.getElementById('m-subtitle').textContent = record.id;
    document.getElementById('m-date').textContent = record.date ? `Captured: ${record.date}` : '';
    document.getElementById('m-icon').textContent = getIcon(record.type);
    document.getElementById('m-size-info').textContent = formatSize(record.body ? record.body.length : 0);
    document.getElementById('m-status').innerHTML = record.truncated 
      ? '<span class="text-amber-600">⚠️ Truncated</span>' 
      : '<span class="text-emerald-600">✓ Complete</span>';
    document.getElementById('m-type-badge').textContent = record.type;

    // Render Headers (U7 style)
    const headersHtml = `
      <div class="max-w-4xl mx-auto space-y-4">
        <h3 class="font-bold text-surface-900 flex items-center gap-2">
          WARC/1.x Headers
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">${Object.keys(record.headers).length} fields</span>
        </h3>
        <div class="rounded-xl border border-surface-200 overflow-hidden shadow-sm bg-white">
          <table class="min-w-full text-xs">
            <tbody class="divide-y divide-surface-100">
              ${Object.entries(record.headers).map(([k, v]) => `
                <tr class="hover:bg-surface-50 transition-colors">
                  <td class="px-4 py-3 bg-surface-50/50 font-bold text-surface-500 w-1/3 border-r border-surface-100 uppercase tracking-tighter">${esc(k)}</td>
                  <td class="px-4 py-3 text-surface-800 font-mono break-all">${esc(v)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    document.getElementById('m-headers-view').innerHTML = headersHtml;

    const contentView = document.getElementById('m-content-view');
    const ct = (record.contentType || '').toLowerCase();
    
    // PART 4: Specialized rendering
    if (record.body && record.body.length > 0) {
      if (ct.startsWith('image/')) {
        const blob = new Blob([record.body], { type: record.contentType });
        const url = URL.createObjectURL(blob);
        currentObjectUrls.push(url);
        contentView.innerHTML = `
          <div class="flex flex-col items-center justify-center p-12 h-full bg-surface-100/30">
            <div class="relative group">
              <img src="${url}" class="max-w-full max-h-[400px] rounded-lg shadow-2xl bg-white p-3 ring-1 ring-surface-200 transition-transform group-hover:scale-[1.02]">
              <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-surface-900 text-white text-[10px] px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                ${esc(record.contentType)}
              </div>
            </div>
          </div>`;
      } else if (ct === 'text/html' || ct === 'application/xhtml+xml') {
        const text = new TextDecoder().decode(record.body);
        const sanitized = sanitizeHtml(text);
        const blob = new Blob([sanitized], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        currentObjectUrls.push(url);
        contentView.innerHTML = `
          <div class="h-full w-full bg-white relative">
            <div class="absolute top-2 right-4 z-10 bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded border border-amber-200 shadow-sm animate-pulse">
              Preview Mode: Scripts Disabled
            </div>
            <iframe src="${url}" class="w-full h-full border-none shadow-inner" sandbox="allow-same-origin"></iframe>
          </div>`;
      } else {
        let text;
        try {
          text = new TextDecoder().decode(record.body);
        } catch (e) {
          text = null;
        }

        const isBinary = !text || /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 8192));
        
        if (isBinary) {
          contentView.innerHTML = `
            <div class="p-6">
              <div class="mb-4 flex items-center gap-3 text-surface-600 bg-surface-100 px-4 py-3 rounded-xl text-xs border border-surface-200">
                <div class="w-8 h-8 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-lg">📁</div>
                <div>
                  <div class="font-bold text-surface-800">Binary Stream Detected</div>
                  <div>Showing hexadecimal representation of the raw record body.</div>
                </div>
              </div>
              <div class="rounded-xl overflow-hidden border border-surface-200 shadow-md">
                <pre class="p-4 text-[10px] md:text-xs font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-surface-700">${generateHexDump(record.body)}</pre>
              </div>
            </div>
          `;
        } else {
          // Check for JSON
          let prettyText = text;
          if (ct.includes('json') || (text.trim().startsWith('{') && text.trim().endsWith('}'))) {
            try {
              prettyText = JSON.stringify(JSON.parse(text), null, 2);
            } catch (e) {}
          }

          contentView.innerHTML = `
            <div class="p-6">
              <div class="rounded-xl overflow-hidden border border-surface-200 shadow-md bg-white">
                <div class="px-4 py-2 bg-surface-50 border-b border-surface-100 flex items-center justify-between">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Plain Text Content</span>
                  <button class="text-[10px] text-brand-600 font-bold hover:underline" id="copy-text-body">COPY TO CLIPBOARD</button>
                </div>
                <pre class="p-4 text-xs md:text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all max-h-[600px]">${esc(prettyText)}</pre>
              </div>
            </div>
          `;
          
          document.getElementById('copy-text-body').onclick = function(e) {
            h.copyToClipboard(prettyText, e.target);
          };
        }
      }
    } else {
      contentView.innerHTML = `
        <div class="flex flex-col items-center justify-center p-20 opacity-30">
          <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
          <div class="text-xl font-bold italic">Empty Record Body</div>
        </div>
      `;
    }

    // Modal Actions
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
        t.classList.toggle('bg-white', isActive);
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
