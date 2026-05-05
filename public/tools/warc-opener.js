(function () {
  'use strict';

  // State management inside closure
  let currentObjectUrls = [];

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(b) {
    if (!b || b < 0) return '0 B';
    const i = b === 0 ? 0 : Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(2) * 1 + ' ' + ['B', 'KB', 'MB', 'GB', 'TB'][i];
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
    return types[type.toLowerCase()] || '📄';
  }

  function cleanupUrls() {
    currentObjectUrls.forEach(url => URL.revokeObjectURL(url));
    currentObjectUrls = [];
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
      try {
        if (data[offset] !== 0x1f || data[offset + 1] !== 0x8b) {
          offset++;
          continue;
        }
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
      
      if (bodyEnd > bytes.length) {
        records.push({
          headers: headers,
          body: bytes.subarray(bodyStart),
          type: headers['warc-type'] || 'unknown',
          uri: headers['warc-target-uri'] || '',
          date: headers['warc-date'] || '',
          contentType: headers['content-type'] || '',
          truncated: true
        });
        break;
      }

      records.push({
        headers: headers,
        body: bytes.subarray(bodyStart, bodyEnd),
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
    if (bytes.length > maxLen) out += '\n... (truncated to 8KB)';
    return out;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.warc,.warc.gz',
      binary: true,
      dropLabel: 'Drop a WARC file here',
      infoHtml: 'All WARC parsing happens locally in your browser. Supports concatenated GZIP members.',

      actions: [
        {
          label: '📋 Copy URIs',
          id: 'copy-uris',
          onClick: function (h, btn) {
            const records = h.getState().records;
            if (!records) return;
            const uris = records.map(r => r.uri).filter(u => u).join('\n');
            if (!uris) {
              h.showError('No URIs found', 'This WARC file does not contain target URIs.');
              return;
            }
            h.copyToClipboard(uris, btn);
          }
        },
        {
          label: '📥 Export Index',
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

      onDestroy: function() {
        cleanupUrls();
      },

      onFile: function _onFile(file, content, h) {
        if (typeof pako === 'undefined') {
          h.showLoading('Loading decompression library...');
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
          let attempts = 0;
          const check = setInterval(() => {
            if (typeof pako !== 'undefined') {
              clearInterval(check);
              _onFile(file, content, h);
            } else if (++attempts > 50) {
              clearInterval(check);
              h.showError('Dependency Error', 'Could not load pako.js library.');
            }
          }, 100);
          return;
        }

        cleanupUrls();
        h.showLoading('Parsing WARC archive...');

        setTimeout(() => {
          try {
            let data = new Uint8Array(content);
            if (data[0] === 0x1f && data[1] === 0x8b) {
              try {
                data = pako.inflate(data);
              } catch (e) {
                data = decompressConcatenatedGzip(data);
              }
            }

            const records = parseWarc(data);
            if (records.length === 0) {
              h.showError('Empty Archive', 'No valid WARC records found.');
              return;
            }

            h.setState({
              records: records,
              fileName: file.name,
              fileSize: file.size,
              searchTerm: '',
              sortCol: 'id',
              sortDir: 1
            });
            renderWarc(h);
          } catch (err) {
            h.showError('Parsing Error', err.message);
          }
        }, 50);
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
      (r.type || '').toLowerCase().includes(searchTerm)
    ) : records;

    const sorted = [...filtered].sort((a, b) => {
      let valA, valB;
      if (state.sortCol === 'uri') { valA = a.uri; valB = b.uri; }
      else if (state.sortCol === 'size') { valA = a.body.length; valB = b.body.length; }
      else if (state.sortCol === 'type') { valA = a.type; valB = b.type; }
      else { return 0; }
      if (valA < valB) return -1 * state.sortDir;
      if (valA > valB) return 1 * state.sortDir;
      return 0;
    });

    const html = `
      <div class="p-6 max-w-7xl mx-auto space-y-6">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${records.length.toLocaleString()} records</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.warc file</span>
        </div>

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
          <h3 class="font-semibold text-surface-800">Archive Entries</h3>
          <div class="relative min-w-[300px]">
            <input type="text" id="warc-search-input" placeholder="Search entries..." value="${esc(state.searchTerm || '')}"
              class="w-full pl-10 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none">
            <span class="absolute left-3.5 top-2.5 text-surface-400">🔍</span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm">
            <thead class="bg-surface-50 border-b border-surface-200">
              <tr>
                <th class="px-4 py-3 text-left font-semibold text-surface-700 w-12">#</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700 cursor-pointer hover:text-brand-600" data-sort="type">Type</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700 cursor-pointer hover:text-brand-600" data-sort="uri">URI</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700">Mime</th>
                <th class="px-4 py-3 text-right font-semibold text-surface-700 cursor-pointer hover:text-brand-600" data-sort="size">Size</th>
                <th class="px-4 py-3 text-right font-semibold text-surface-700">View</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${sorted.slice(0, 1000).map((r, i) => `
                <tr class="hover:bg-brand-50 transition-colors record-row cursor-pointer" data-idx="${records.indexOf(r)}">
                  <td class="px-4 py-3 text-surface-400 font-mono text-xs">${records.indexOf(r) + 1}</td>
                  <td class="px-4 py-3"><span class="px-2 py-0.5 rounded-full bg-surface-100 text-[10px] font-bold uppercase">${getIcon(r.type)} ${esc(r.type)}</span></td>
                  <td class="px-4 py-3 font-mono text-[11px] text-surface-700 break-all max-w-xl">${esc(r.uri || '—')}</td>
                  <td class="px-4 py-3 text-surface-500 font-mono text-[10px]">${esc(r.contentType || '—')}</td>
                  <td class="px-4 py-3 text-right text-surface-600 font-mono text-[10px]">${formatSize(r.body.length)}</td>
                  <td class="px-4 py-3 text-right"><button class="view-btn text-brand-600 font-bold hover:underline" data-idx="${records.indexOf(r)}">Open</button></td>
                </tr>
              `).join('')}
              ${sorted.length === 0 ? `<tr><td colspan="6" class="p-12 text-center text-surface-400 italic">No records found.</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div id="warc-preview-overlay" class="fixed inset-0 z-50 hidden bg-surface-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-full flex flex-col overflow-hidden">
            <div class="flex items-center justify-between px-6 py-4 border-b border-surface-100 bg-surface-50/50">
              <div class="flex items-center gap-3 overflow-hidden">
                <span id="p-icon" class="text-2xl">📄</span>
                <h4 id="p-title" class="text-sm font-bold text-surface-900 truncate"></h4>
              </div>
              <div class="flex items-center gap-2">
                <button id="p-dl" class="p-2 text-surface-500 hover:text-brand-600 hover:bg-white rounded-lg transition-all">📥</button>
                <button id="p-close" class="p-2 text-surface-500 hover:text-red-600 hover:bg-white rounded-lg transition-all">✕</button>
              </div>
            </div>
            <div class="flex bg-surface-50 border-b border-surface-100">
              <button class="p-tab px-6 py-3 text-xs font-bold text-surface-500 border-b-2 border-transparent hover:text-brand-600 active" data-tab="body">BODY</button>
              <button class="p-tab px-6 py-3 text-xs font-bold text-surface-500 border-b-2 border-transparent hover:text-brand-600" data-tab="headers">HEADERS</button>
            </div>
            <div class="flex-1 overflow-hidden relative bg-white">
              <div id="p-body-view" class="h-full overflow-auto p-6"></div>
              <div id="p-headers-view" class="hidden absolute inset-0 overflow-auto p-6 bg-surface-50 font-mono text-xs"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const searchInput = document.getElementById('warc-search-input');
    searchInput.addEventListener('input', (e) => {
      h.setState({ searchTerm: e.target.value });
      renderWarc(h);
      document.getElementById('warc-search-input').focus();
    });

    h.getRenderEl().querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        const dir = (state.sortCol === col) ? (state.sortDir * -1) : 1;
        h.setState({ sortCol: col, sortDir: dir });
        renderWarc(h);
      };
    });

    h.getRenderEl().querySelectorAll('.record-row, .view-btn').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        showPreview(records[parseInt(el.dataset.idx)], h);
      };
    });
  }

  function showPreview(record, h) {
    cleanupUrls();
    const overlay = document.getElementById('warc-preview-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('p-title').textContent = record.uri || record.type;
    document.getElementById('p-icon').textContent = getIcon(record.type);

    document.getElementById('p-headers-view').innerHTML = `
      <div class="space-y-1">
        ${Object.entries(record.headers).map(([k, v]) => `<div><span class="font-bold text-brand-700">${esc(k)}:</span> ${esc(v)}</div>`).join('')}
      </div>`;

    const bodyView = document.getElementById('p-body-view');
    const ct = (record.contentType || '').toLowerCase();
    
    if (ct.startsWith('image/')) {
      const url = URL.createObjectURL(new Blob([record.body], { type: record.contentType }));
      currentObjectUrls.push(url);
      bodyView.innerHTML = `<div class="flex justify-center"><img src="${url}" class="max-w-full max-h-[60vh] rounded shadow-lg"></div>`;
    } else if (ct === 'text/html') {
      const url = URL.createObjectURL(new Blob([record.body], { type: 'text/html' }));
      currentObjectUrls.push(url);
      bodyView.innerHTML = `<iframe src="${url}" class="w-full h-[60vh] border rounded shadow-inner" sandbox="allow-same-origin"></iframe>`;
    } else {
      const text = new TextDecoder().decode(record.body);
      if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000))) {
        bodyView.innerHTML = `<pre class="p-4 text-[10px] font-mono bg-gray-950 text-gray-100 rounded-xl overflow-x-auto">${generateHexDump(record.body)}</pre>`;
      } else {
        bodyView.innerHTML = `<pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 rounded-xl overflow-x-auto whitespace-pre-wrap break-all">${esc(text)}</pre>`;
      }
    }

    document.getElementById('p-close').onclick = () => overlay.classList.add('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
    document.getElementById('p-dl').onclick = () => h.download('record.bin', new Blob([record.body]));

    const tabs = document.querySelectorAll('.p-tab');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active', 'border-brand-600', 'text-brand-600'));
        tab.classList.add('active', 'border-brand-600', 'text-brand-600');
        document.getElementById('p-body-view').classList.toggle('hidden', tab.dataset.tab !== 'body');
        document.getElementById('p-headers-view').classList.toggle('hidden', tab.dataset.tab !== 'headers');
      };
    });
  }
})();
