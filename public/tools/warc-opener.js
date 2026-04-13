(function () {
  'use strict';

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(b) {
    if (!b || b < 0) return '0 B';
    if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
    if (b > 1e3) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  function getIcon(type, uri) {
    if (type === 'request') return '📤';
    if (type === 'response') return '📥';
    if (type === 'metadata') return '📋';
    if (type === 'warcinfo') return 'ℹ️';
    if (type === 'revisit') return '🔄';
    return '📄';
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.warc,.warc.gz',
      binary: true,
      dropLabel: 'Drop a WARC file here',
      infoHtml: '<strong>Privacy:</strong> All WARC parsing happens locally in your browser. No data is uploaded.',

      actions: [
        {
          label: '📋 Copy URIs',
          id: 'copy-uris',
          onClick: function (h, btn) {
            const records = h.getState().records;
            if (!records) return;
            const uris = records.map(r => r.uri).filter(u => u).join('\n');
            h.copyToClipboard(uris, btn);
          }
        },
        {
          label: '📥 Download JSON Index',
          id: 'dl-index',
          onClick: function (h) {
            const records = h.getState().records;
            if (!records) return;
            const index = records.map(r => ({
              type: r.type,
              uri: r.uri,
              date: r.date,
              contentType: r.contentType,
              size: r.body.length
            }));
            h.download('warc-index.json', JSON.stringify(index, null, 2), 'application/json');
          }
        }
      ],

      onInit: function (h) {
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing WARC archive...');
        setTimeout(() => {
          try {
            let data = new Uint8Array(content);
            if (file.name.endsWith('.gz') || (data[0] === 0x1f && data[1] === 0x8b)) {
              try {
                // Try full decompression first (for single-stream GZIP)
                data = pako.inflate(data);
              } catch (e) {
                // Fallback: WARC files are often concatenated GZIP members
                data = decompressConcatenatedGzip(data);
              }
            }

            const records = parseWarc(data);
            h.setState({
              records: records,
              fileName: file.name,
              fileSize: file.size,
              searchTerm: ''
            });
            renderWarc(h);
          } catch (err) {
            h.showError('Failed to parse WARC', err.message);
          }
        }, 50);
      }
    });
  };

  function decompressConcatenatedGzip(data) {
    const chunks = [];
    let offset = 0;
    while (offset < data.length) {
      try {
        const inflater = new pako.Inflate();
        inflater.push(data.subarray(offset), true);
        if (inflater.err) break;
        chunks.push(inflater.result);
        // pako doesn't tell us exactly how many bytes it consumed easily in synchronous mode
        // but we can find the next GZIP header (0x1f 0x8b)
        // This is a bit hacky but common for WARC
        const nextHeader = findSequence(data, [0x1f, 0x8b], offset + 1);
        if (nextHeader === -1) break;
        offset = nextHeader;
      } catch (e) {
        break;
      }
    }
    if (chunks.length === 0) throw new Error('Failed to decompress GZIP members');
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
      if (!lines[0].startsWith('WARC/')) {
        // Skip junk or invalid start
        offset++;
        continue;
      }

      const headers = {};
      lines.slice(1).forEach(line => {
        const idx = line.indexOf(':');
        if (idx !== -1) {
          headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        }
      });

      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      const body = bytes.subarray(bodyStart, Math.min(bodyEnd, bytes.length));

      records.push({
        headers: headers,
        body: body,
        type: headers['warc-type'] || 'unknown',
        uri: headers['warc-target-uri'] || '',
        date: headers['warc-date'] || '',
        contentType: headers['content-type'] || ''
      });

      offset = bodyEnd;
      while (offset < bytes.length && (bytes[offset] === 10 || bytes[offset] === 13)) {
        offset++;
      }
    }
    return records;
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

  function renderWarc(h) {
    const state = h.getState();
    const records = state.records;
    const searchTerm = (state.searchTerm || '').toLowerCase();
    const filtered = searchTerm ? records.filter(r => 
      (r.uri || '').toLowerCase().includes(searchTerm) || 
      (r.contentType || '').toLowerCase().includes(searchTerm) ||
      (r.type || '').toLowerCase().includes(searchTerm)
    ) : records;

    const html = `
      <div class="p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-50 rounded-xl border border-surface-100">
          <div class="space-y-1">
            <h3 class="text-sm font-bold text-surface-900 truncate max-w-md">${esc(state.fileName)}</h3>
            <div class="flex gap-2 text-[10px] text-surface-500 font-medium uppercase tracking-wider">
              <span>${formatSize(state.fileSize)}</span>
              <span>•</span>
              <span>${records.length.toLocaleString()} records</span>
            </div>
          </div>
          <div class="relative min-w-[300px]">
            <input 
              type="text" 
              id="warc-search" 
              placeholder="Search URI, type, or content-type..." 
              value="${esc(state.searchTerm || '')}"
              class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none"
            >
            <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
          </div>
        </div>

        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="overflow-x-auto max-h-[60vh]">
            <table class="w-full text-sm text-left border-collapse">
              <thead class="bg-surface-50 border-b border-surface-200 sticky top-0 z-10">
                <tr>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider w-12 text-center">T</th>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider">Target URI / Meta</th>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider w-32">Content-Type</th>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider w-20 text-right">Size</th>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filtered.map((r, i) => `
                  <tr class="hover:bg-surface-50 transition-colors cursor-pointer record-row" data-idx="${i}">
                    <td class="px-4 py-2 text-center" title="${esc(r.type)}">${getIcon(r.type)}</td>
                    <td class="px-4 py-2">
                      <div class="font-mono text-[11px] text-surface-800 break-all max-w-xl">${esc(r.uri || (r.type === 'warcinfo' ? 'WARC Info' : 'No URI'))}</div>
                      <div class="text-[10px] text-surface-400 mt-0.5">${esc(r.date)}</div>
                    </td>
                    <td class="px-4 py-2 text-surface-500 text-[10px] font-mono truncate max-w-[120px]">${esc(r.contentType)}</td>
                    <td class="px-4 py-2 text-right text-surface-500 text-[10px] font-mono whitespace-nowrap">${formatSize(r.body.length)}</td>
                    <td class="px-4 py-2 text-right">
                      <button class="view-btn text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase px-2 py-1 rounded hover:bg-brand-50" data-idx="${i}">View</button>
                    </td>
                  </tr>
                `).join('')}
                ${filtered.length === 0 ? `<tr><td colspan="5" class="px-4 py-8 text-center text-surface-400 italic">No records found</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Preview Modal -->
        <div id="warc-preview-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 bg-surface-900/60 backdrop-blur-sm">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
              <div class="flex items-center gap-3">
                <span id="preview-icon" class="text-xl">📄</span>
                <div class="min-w-0">
                  <h4 id="preview-title" class="text-sm font-bold text-surface-900 truncate"></h4>
                  <p id="preview-meta" class="text-[10px] text-surface-500 font-medium uppercase"></p>
                </div>
              </div>
              <div class="flex gap-2">
                <button id="preview-dl-btn" class="p-2 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Download Record">📥</button>
                <button id="preview-close-btn" class="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Close">✕</button>
              </div>
            </div>
            <div id="preview-tabs" class="flex border-b border-surface-100 bg-surface-50">
               <button class="preview-tab px-6 py-2 text-xs font-bold text-surface-600 border-b-2 border-transparent hover:text-brand-600 active-tab" data-tab="body">BODY</button>
               <button class="preview-tab px-6 py-2 text-xs font-bold text-surface-600 border-b-2 border-transparent hover:text-brand-600" data-tab="headers">HEADERS</button>
            </div>
            <div id="preview-body" class="flex-1 overflow-auto bg-white p-6 min-h-[400px]"></div>
            <div id="preview-headers" class="hidden flex-1 overflow-auto bg-surface-50 p-6 font-mono text-xs text-surface-700"></div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const searchInput = document.getElementById('warc-search');
    searchInput.addEventListener('input', (e) => {
      h.setState('searchTerm', e.target.value);
      renderWarc(h);
      const input = document.getElementById('warc-search');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

    h.getRenderEl().querySelectorAll('.view-btn, .record-row').forEach(el => {
      el.addEventListener('click', (e) => {
        const idx = parseInt(el.dataset.idx);
        showPreview(filtered[idx], h);
      });
    });

    document.getElementById('preview-close-btn').onclick = hidePreview;
    document.getElementById('warc-preview-modal').onclick = (e) => { if (e.target.id === 'warc-preview-modal') hidePreview(); };
    
    document.querySelectorAll('.preview-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('border-brand-600', 'text-brand-600'));
        tab.classList.add('border-brand-600', 'text-brand-600');
        if (tab.dataset.tab === 'body') {
          document.getElementById('preview-body').classList.remove('hidden');
          document.getElementById('preview-headers').classList.add('hidden');
        } else {
          document.getElementById('preview-body').classList.add('hidden');
          document.getElementById('preview-headers').classList.remove('hidden');
        }
      };
    });
    // Set initial active tab
    document.querySelector('.preview-tab[data-tab="body"]').click();
  }

  function showPreview(record, h) {
    const modal = document.getElementById('warc-preview-modal');
    const bodyEl = document.getElementById('preview-body');
    const headersEl = document.getElementById('preview-headers');
    const titleEl = document.getElementById('preview-title');
    const metaEl = document.getElementById('preview-meta');
    const iconEl = document.getElementById('preview-icon');
    const dlBtn = document.getElementById('preview-dl-btn');

    modal.classList.remove('hidden');
    titleEl.textContent = record.uri || record.type;
    metaEl.textContent = `${record.type} • ${record.contentType || 'no content-type'} • ${formatSize(record.body.length)}`;
    iconEl.textContent = getIcon(record.type);

    headersEl.innerHTML = `<pre class="whitespace-pre-wrap">${Object.entries(record.headers).map(([k, v]) => `<span class="text-brand-700 font-bold">${esc(k)}</span>: ${esc(v)}`).join('\n')}</pre>`;

    // Render body based on content type
    const ct = (record.contentType || '').toLowerCase();
    if (ct.includes('image/')) {
      const blob = new Blob([record.body], { type: record.contentType });
      const url = URL.createObjectURL(blob);
      bodyEl.innerHTML = `<div class="flex items-center justify-center h-full"><img src="${url}" class="max-w-full max-h-full object-contain shadow-md rounded"></div>`;
    } else if (ct.includes('text/html')) {
      // For HTML, we'll try to strip scripts and show in an iframe or just text
      const blob = new Blob([record.body], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      bodyEl.innerHTML = `<iframe src="${url}" class="w-full h-full border-0 bg-white"></iframe>`;
    } else {
      const text = new TextDecoder().decode(record.body);
      const isLikelyBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000));
      if (isLikelyBinary) {
        bodyEl.innerHTML = `<pre class="text-[10px] font-mono text-surface-600">${generateHexDump(record.body.buffer.slice(record.body.byteOffset, record.body.byteOffset + 16384))}</pre>`;
      } else {
        bodyEl.innerHTML = `<pre class="text-xs font-mono text-surface-800 whitespace-pre-wrap break-all">${esc(text)}</pre>`;
      }
    }

    dlBtn.onclick = () => {
      const filename = (record.uri ? record.uri.split('/').pop() : record.type) || 'record';
      h.download(filename + '.bin', new Blob([record.body]));
    };
  }

  function hidePreview() {
    document.getElementById('warc-preview-modal').classList.add('hidden');
    document.getElementById('preview-body').innerHTML = '';
  }

  function generateHexDump(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i += 16) {
      let line = i.toString(16).padStart(8, '0') + '  ';
      let ascii = '';
      for (let j = 0; j < 16; j++) {
        if (i + j < bytes.length) {
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
    if (buffer.byteLength > 16384) out += '\n... (truncated)';
    return out;
  }
})();
