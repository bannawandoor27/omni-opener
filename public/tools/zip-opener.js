(function() {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
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

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.zip,.jar,.apk,.ipa,.war,.ear,.whl,.nupkg,.crate',
      dropLabel: 'Drop a ZIP archive here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: function(file, content, helpers) {
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Loading ZIP engine...');
          helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', function() {
            processZip(file, content, helpers);
          });
          return;
        }
        processZip(file, content, helpers);
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const files = helpers.getState().zipFiles;
            if (!files) return;
            const list = files.map(f => f.name).join('\n');
            helpers.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download File List',
          id: 'dl-list',
          onClick: function(helpers) {
            const files = helpers.getState().zipFiles;
            if (!files) return;
            const list = files.map(f => f.name + ' (' + formatSize(f.size) + ')').join('\n');
            helpers.download('file-list.txt', list, 'text/plain');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Everything is processed locally. Click any file to preview it. Supports ZIP, JAR, APK, and other archive formats.'
    });
  };

  function processZip(file, content, helpers) {
    helpers.showLoading('Extracting ZIP metadata...');

    JSZip.loadAsync(content)
      .then(function(zip) {
        const files = [];
        let totalUncompressedSize = 0;

        zip.forEach(function(relativePath, zipEntry) {
          const size = zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0;
          files.push({
            name: zipEntry.name,
            size: size,
            date: zipEntry.date,
            dir: zipEntry.dir,
            entry: zipEntry
          });
          totalUncompressedSize += size;
        });

        files.sort((a, b) => {
          if (a.dir !== b.dir) return a.dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        helpers.setState('zipFiles', files);
        helpers.setState('zipInstance', zip);
        helpers.setState('fileName', file.name);
        helpers.setState('fileSize', file.size);
        helpers.setState('totalUncompressedSize', totalUncompressedSize);

        renderZip(helpers);
      })
      .catch(function(e) {
        helpers.showError('Could not parse ZIP file', e.message);
      });
  }

  function renderZip(helpers) {
    const state = helpers.getState();
    const files = state.zipFiles;
    const searchTerm = (state.searchTerm || '').toLowerCase();
    const filteredFiles = searchTerm ? files.filter(f => f.name.toLowerCase().includes(searchTerm)) : files;

    const html = `
      <div class="p-6 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 p-4 bg-surface-50 rounded-xl border border-surface-100">
          <div class="space-y-1">
            <h3 class="text-sm font-bold text-surface-900 truncate max-w-md">${esc(state.fileName)}</h3>
            <div class="flex gap-2 text-[10px] text-surface-500 font-medium uppercase tracking-wider">
              <span>${formatSize(state.fileSize)}</span>
              <span>•</span>
              <span>${files.length.toLocaleString()} items</span>
              <span>•</span>
              <span>${formatSize(state.totalUncompressedSize)} uncompressed</span>
            </div>
          </div>
          <div class="relative min-w-[240px]">
            <input 
              type="text" 
              id="zip-search" 
              placeholder="Search files..." 
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
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider">Name</th>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider w-24">Size</th>
                  <th class="px-4 py-3 font-bold text-surface-700 text-xs uppercase tracking-wider w-32 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filteredFiles.map((f, i) => `
                  <tr class="hover:bg-surface-50 transition-colors cursor-pointer file-row" data-name="${esc(f.name)}">
                    <td class="px-4 py-2 font-mono text-xs text-surface-600 truncate max-w-md" title="${esc(f.name)}">
                      <span class="mr-2">${f.dir ? '📁' : getFileIcon(f.name)}</span>
                      <span class="${f.dir ? 'font-bold' : ''}">${esc(f.name)}</span>
                    </td>
                    <td class="px-4 py-2 text-surface-500 whitespace-nowrap text-[10px] font-mono">
                      ${f.dir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2 text-right space-x-1">
                      ${f.dir ? '' : `
                        <button 
                          class="preview-btn text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase px-2 py-1 rounded hover:bg-brand-50" 
                          data-name="${esc(f.name)}"
                        >Preview</button>
                        <button 
                          class="dl-btn text-surface-600 hover:text-surface-900 font-bold text-[10px] uppercase px-2 py-1 rounded hover:bg-surface-100" 
                          data-name="${esc(f.name)}"
                        >Get</button>
                      `}
                    </td>
                  </tr>
                `).join('')}
                ${filteredFiles.length === 0 ? `<tr><td colspan="3" class="px-4 py-8 text-center text-surface-400 italic">No files match your search</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Preview Modal -->
        <div id="zip-preview-modal" class="fixed inset-0 z-50 hidden flex items-center justify-center p-4 bg-surface-900/60 backdrop-blur-sm">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
              <div class="flex items-center gap-3">
                <span id="preview-icon" class="text-xl">📄</span>
                <div>
                  <h4 id="preview-filename" class="text-sm font-bold text-surface-900 truncate max-w-md"></h4>
                  <p id="preview-meta" class="text-[10px] text-surface-500 font-medium uppercase"></p>
                </div>
              </div>
              <div class="flex gap-2">
                <button id="preview-copy-btn" class="p-2 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Copy Content">📋</button>
                <button id="preview-close-btn" class="p-2 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Close">✕</button>
              </div>
            </div>
            <div id="preview-content" class="flex-1 overflow-auto bg-white p-6 min-h-[300px]">
              <!-- Content injected here -->
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Event Listeners
    const searchInput = document.getElementById('zip-search');
    searchInput.addEventListener('input', (e) => {
      helpers.setState('searchTerm', e.target.value);
      renderZip(helpers);
      document.getElementById('zip-search').focus(); // Keep focus after re-render
      const val = document.getElementById('zip-search').value;
      document.getElementById('zip-search').setSelectionRange(val.length, val.length);
    });

    helpers.getRenderEl().querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(btn.dataset.name, helpers);
      });
    });

    helpers.getRenderEl().querySelectorAll('.preview-btn, .file-row').forEach(el => {
      el.addEventListener('click', (e) => {
        const name = el.dataset.name;
        const file = files.find(f => f.name === name);
        if (file && !file.dir) {
          showPreview(file, helpers);
        }
      });
    });

    document.getElementById('preview-close-btn').onclick = hidePreview;
    document.getElementById('zip-preview-modal').onclick = (e) => {
      if (e.target.id === 'zip-preview-modal') hidePreview();
    };
  }

  async function showPreview(file, helpers) {
    const modal = document.getElementById('zip-preview-modal');
    const contentEl = document.getElementById('preview-content');
    const filenameEl = document.getElementById('preview-filename');
    const metaEl = document.getElementById('preview-meta');
    const iconEl = document.getElementById('preview-icon');
    const copyBtn = document.getElementById('preview-copy-btn');

    modal.classList.remove('hidden');
    filenameEl.textContent = file.name;
    metaEl.textContent = formatSize(file.size);
    iconEl.textContent = getFileIcon(file.name);
    contentEl.innerHTML = '<div class="flex items-center justify-center h-full"><div class="animate-spin text-2xl">⏳</div></div>';
    copyBtn.style.display = 'none';

    const ext = file.name.split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico'].includes(ext);

    try {
      if (isImage) {
        const blob = await file.entry.async('blob');
        const url = URL.createObjectURL(blob);
        contentEl.innerHTML = `<div class="flex items-center justify-center h-full"><img src="${url}" class="max-w-full max-h-full object-contain shadow-lg rounded-lg"></div>`;
      } else {
        const text = await file.entry.async('string');
        const isLikelyBinary = /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 1000));
        
        if (isLikelyBinary) {
          const buffer = await file.entry.async('arraybuffer');
          contentEl.innerHTML = `<pre class="text-[10px] font-mono leading-tight text-surface-700">${generateHexDump(buffer.slice(0, 8192))}</pre>`;
        } else {
          contentEl.innerHTML = `<pre class="text-xs font-mono whitespace-pre-wrap break-all text-surface-800">${esc(text)}</pre>`;
          copyBtn.style.display = 'block';
          copyBtn.onclick = (e) => helpers.copyToClipboard(text, e.target);
        }
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="p-8 text-center text-red-500 font-medium">Failed to load preview: ${err.message}</div>`;
    }
  }

  function hidePreview() {
    document.getElementById('zip-preview-modal').classList.add('hidden');
    document.getElementById('preview-content').innerHTML = '';
  }

  async function downloadFile(name, helpers) {
    const file = helpers.getState().zipFiles.find(f => f.name === name);
    if (!file) return;
    const blob = await file.entry.async('blob');
    helpers.download(name.split('/').pop(), blob);
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return '🖼️';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '🎵';
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return '🎬';
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'rs', 'go', 'php', 'html', 'css', 'json', 'xml', 'md'].includes(ext)) return '📜';
    if (['pdf'].includes(ext)) return '📕';
    if (['exe', 'dll', 'so', 'dylib'].includes(ext)) return '⚙️';
    return '📄';
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
    if (buffer.byteLength > 8192) out += '\n... (truncated)';
    return out;
  }
})();
