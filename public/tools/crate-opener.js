(function() {
  'use strict';

  /**
   * Production-perfect .crate (Rust package) viewer
   * Handles .tar.gz decompression and TAR parsing client-side.
   */

  const CONFIG = {
    pakoUrl: 'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
    prismCss: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css',
    prismJs: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
    prismToml: 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-toml.min.js'
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * TAR parser for crate contents
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      
      // Check for end of archive (two null blocks)
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) break;
        offset += 512;
        continue;
      }

      let name = decoder.decode(header.subarray(0, 100)).split('\0')[0];
      const sizeStr = decoder.decode(header.subarray(124, 136)).trim();
      const size = parseInt(sizeStr, 8) || 0;
      const type = String.fromCharCode(header[156]);
      
      // Handle ustar prefix
      const magic = decoder.decode(header.subarray(257, 263));
      if (magic.startsWith('ustar')) {
        const prefix = decoder.decode(header.subarray(345, 500)).split('\0')[0];
        if (prefix) name = prefix + (prefix.endsWith('/') ? '' : '/') + name;
      }

      const dataOffset = offset + 512;
      const isDir = type === '5' || name.endsWith('/');
      
      files.push({
        name,
        size: isDir ? 0 : size,
        isDir,
        data: isDir ? null : bytes.subarray(dataOffset, dataOffset + size)
      });

      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  function parseMetadata(toml) {
    const meta = { name: 'Unknown', version: '0.0.0', description: '', license: '', repository: '', homepage: '', edition: '' };
    if (!toml) return meta;

    const packageMatch = toml.match(/\[package\]([\s\S]*?)(\n\[|$)/);
    if (packageMatch) {
      const section = packageMatch[1];
      const getValue = (key) => {
        const m = section.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`)) || section.match(new RegExp(`${key}\\s*=\\s*'([^']+)'`));
        return m ? m[1] : '';
      };
      meta.name = getValue('name') || meta.name;
      meta.version = getValue('version') || meta.version;
      meta.description = getValue('description');
      meta.license = getValue('license');
      meta.repository = getValue('repository');
      meta.homepage = getValue('homepage');
      meta.edition = getValue('edition');
    }
    return meta;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.crate',
      dropLabel: 'Drop a .crate file to explore Rust package contents',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScript(CONFIG.pakoUrl);
        helpers.loadCSS(CONFIG.prismCss);
        helpers.loadScript(CONFIG.prismJs, () => {
          helpers.loadScript(CONFIG.prismToml);
        });
      },

      onFile: async function(file, content, helpers) {
        try {
          helpers.showLoading('Decompressing package...');
          
          // Race condition check (B1)
          if (typeof pako === 'undefined') {
            await new Promise((resolve, reject) => {
              let attempts = 0;
              const check = () => {
                if (typeof pako !== 'undefined') resolve();
                else if (attempts++ > 100) reject(new Error('Pako library failed to load'));
                else setTimeout(check, 50);
              };
              check();
            });
          }

          const uint8 = new Uint8Array(content);
          let decompressed;
          try {
            decompressed = pako.ungzip(uint8);
          } catch (e) {
            throw new Error('Decompression failed. Is this a valid .crate (tar.gz) file?');
          }
          
          helpers.showLoading('Parsing archive contents...');
          const files = parseTar(decompressed.buffer);
          
          if (files.length === 0) {
            helpers.showError('Empty Archive', 'This .crate file appears to contain no files.');
            return;
          }

          // Extract Cargo.toml for metadata
          const cargoTomlEntry = files.find(f => f.name.endsWith('/Cargo.toml') || f.name === 'Cargo.toml');
          let cargoTomlContent = '';
          if (cargoTomlEntry && cargoTomlEntry.data) {
            cargoTomlContent = new TextDecoder().decode(cargoTomlEntry.data);
          }

          const metadata = parseMetadata(cargoTomlContent);
          
          helpers.setState('files', files);
          helpers.setState('filteredFiles', files);
          helpers.setState('metadata', metadata);
          helpers.setState('toml', cargoTomlContent);
          helpers.setState('sortCol', 'name');
          helpers.setState('sortDir', 1);

          renderApp(file, helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open crate file', err.message || 'The file may be corrupted or in an unsupported variant. Try re-uploading.');
        }
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: (helpers, btn) => {
            const files = helpers.getState().files || [];
            if (files.length === 0) return;
            const text = files.map(f => `${f.isDir ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Cargo.toml',
          id: 'dl-toml',
          onClick: (helpers) => {
            const state = helpers.getState();
            if (state.toml) {
              helpers.download('Cargo.toml', state.toml, 'text/plain');
            } else {
              helpers.showError('Not Found', 'No Cargo.toml file was found in this archive.');
            }
          }
        }
      ]
    });
  };

  function renderApp(file, helpers) {
    const state = helpers.getState();
    const meta = state.metadata;
    const files = state.files;
    const toml = state.toml;
    const filteredFiles = state.filteredFiles;

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    const html = `
      <div class="p-4 md:p-6 max-w-6xl mx-auto animate-in fade-in duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)} (GZipped)</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.crate file</span>
        </div>

        <!-- Metadata Card (U9: Content Cards) -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="lg:col-span-2 space-y-4">
            <div class="p-6 bg-white rounded-2xl border border-surface-200 shadow-sm">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <h1 class="text-3xl font-bold text-surface-900 flex flex-wrap items-center gap-3">
                    <span class="p-2 bg-brand-50 text-brand-600 rounded-lg">📦</span>
                    ${escapeHtml(meta.name)}
                    <span class="text-sm font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">v${escapeHtml(meta.version)}</span>
                  </h1>
                  ${meta.description ? `<p class="mt-4 text-surface-600 leading-relaxed text-lg">${escapeHtml(meta.description)}</p>` : ''}
                </div>
              </div>

              <div class="mt-6 flex flex-wrap gap-6 text-sm border-t border-surface-100 pt-6">
                ${meta.license ? `
                  <div class="flex flex-col gap-1">
                    <span class="text-surface-400 font-medium uppercase tracking-wider text-[10px]">License</span>
                    <span class="text-surface-700 font-semibold">${escapeHtml(meta.license)}</span>
                  </div>
                ` : ''}
                ${meta.edition ? `
                  <div class="flex flex-col gap-1">
                    <span class="text-surface-400 font-medium uppercase tracking-wider text-[10px]">Edition</span>
                    <span class="text-surface-700 font-semibold">${escapeHtml(meta.edition)}</span>
                  </div>
                ` : ''}
                ${meta.homepage ? `
                   <div class="flex flex-col gap-1">
                    <span class="text-surface-400 font-medium uppercase tracking-wider text-[10px]">Homepage</span>
                    <a href="${escapeHtml(meta.homepage)}" target="_blank" class="text-brand-600 font-semibold hover:underline">${escapeHtml(new URL(meta.homepage).hostname)}</a>
                  </div>
                ` : ''}
              </div>

              <div class="flex flex-wrap gap-3 mt-6">
                ${meta.repository ? `
                  <a href="${escapeHtml(meta.repository)}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-surface-900 text-white rounded-xl text-sm font-medium hover:bg-black transition-all">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                    <span>Repository</span>
                  </a>
                ` : ''}
                <a href="https://crates.io/crates/${escapeHtml(meta.name)}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-all shadow-sm shadow-brand-200">
                  <span>View on crates.io</span>
                </a>
              </div>
            </div>
          </div>

          <div class="bg-surface-50 border border-surface-200 rounded-2xl p-6 flex flex-col justify-between">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Package Analysis</h3>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">Unpacked Size</span>
                <span class="text-sm font-mono font-bold text-surface-800">${formatSize(totalSize)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">File Count</span>
                <span class="text-sm font-mono font-bold text-surface-800">${files.filter(f => !f.isDir).length}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">Compression</span>
                <span class="text-sm font-mono font-bold text-brand-600">${Math.round((1 - (file.size / totalSize)) * 100)}%</span>
              </div>
            </div>
            <div class="mt-6 pt-6 border-t border-surface-200">
              <div class="text-[10px] text-surface-400 uppercase font-bold mb-2">Primary Target</div>
              <div class="text-sm font-medium text-surface-700">${escapeHtml(meta.name)}.rlib</div>
            </div>
          </div>
        </div>

        <!-- Section Headers with Count (U10) -->
        <div class="flex items-center justify-between mb-4 border-b border-surface-100 pb-1">
          <div class="flex items-center gap-6">
            <button id="btn-tab-files" class="pb-3 text-sm font-bold border-b-2 border-brand-600 text-brand-600 transition-all">Archive Content</button>
            <button id="btn-tab-toml" class="pb-3 text-sm font-medium border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all">Cargo.toml</button>
          </div>
          <span id="item-count" class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredFiles.length} items</span>
        </div>

        <!-- TAB: Files -->
        <div id="tab-files-content" class="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <!-- SEARCH BOX (ARCHIVE EXCELLENCE) -->
          <div class="relative">
            <input type="text" id="file-search" placeholder="Search files in crate (e.g. src/, .rs, README)..." 
              class="w-full pl-11 pr-4 py-3 bg-white border border-surface-200 rounded-2xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none shadow-sm">
            <div class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>

          <!-- U7: Table -->
          <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50/50">
                    <th class="px-6 py-4 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="name">
                      Name <span class="sort-icon ml-1">${state.sortCol === 'name' ? (state.sortDir === 1 ? '▲' : '▼') : ''}</span>
                    </th>
                    <th class="px-6 py-4 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-32" data-sort="size">
                      Size <span class="sort-icon ml-1">${state.sortCol === 'size' ? (state.sortDir === 1 ? '▲' : '▼') : ''}</span>
                    </th>
                    <th class="px-6 py-4 text-right font-semibold text-surface-700 border-b border-surface-200 w-28">Action</th>
                  </tr>
                </thead>
                <tbody id="file-list-body" class="divide-y divide-surface-100">
                  ${renderFileList(filteredFiles)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB: Cargo.toml -->
        <div id="tab-toml-content" class="hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
          <!-- U8: Code Block -->
          <div class="rounded-2xl overflow-hidden border border-surface-200 bg-gray-950 shadow-xl">
            <div class="flex items-center justify-between px-6 py-3 bg-white/5 border-b border-white/10">
              <div class="flex items-center gap-2">
                <div class="flex gap-1.5">
                  <div class="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
                  <div class="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
                </div>
                <span class="ml-2 text-xs font-mono text-gray-400 uppercase tracking-widest">Cargo.toml</span>
              </div>
              <button id="copy-toml" class="flex items-center gap-2 px-3 py-1 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                Copy
              </button>
            </div>
            <pre class="p-6 text-sm font-mono leading-relaxed overflow-x-auto custom-scrollbar"><code class="language-toml">${escapeHtml(toml || '# No Cargo.toml found in archive')}</code></pre>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
    bindEvents(helpers);
  }

  function renderFileList(files) {
    if (files.length === 0) {
      return `<tr><td colspan="3" class="px-6 py-16 text-center">
        <div class="flex flex-col items-center gap-2 text-surface-400">
          <svg class="w-12 h-12 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          <span class="italic text-sm">No files found matching your search.</span>
        </div>
      </td></tr>`;
    }

    // Truncation for performance if massive (U7)
    const MAX_FILES = 1000;
    const items = files.slice(0, MAX_FILES);

    const rows = items.map((f, i) => `
      <tr class="group hover:bg-brand-50/50 transition-colors">
        <td class="px-6 py-3.5">
          <div class="flex items-center gap-3">
            <span class="text-xl filter drop-shadow-sm select-none">${f.isDir ? '📁' : getFileIcon(f.name)}</span>
            <span class="font-mono text-xs text-surface-700 break-all">${escapeHtml(f.name)}</span>
          </div>
        </td>
        <td class="px-6 py-3.5 text-right font-mono text-xs text-surface-500">
          ${f.isDir ? '<span class="text-surface-300">DIR</span>' : formatSize(f.size)}
        </td>
        <td class="px-6 py-3.5 text-right">
          ${f.isDir ? '' : `
            <button class="dl-file p-1.5 text-brand-600 hover:bg-brand-100 rounded-lg transition-all opacity-0 group-hover:opacity-100" data-idx="${i}" title="Download file">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            </button>
          `}
        </td>
      </tr>
    `).join('');

    if (files.length > MAX_FILES) {
      return rows + `<tr><td colspan="3" class="px-6 py-4 text-center text-xs text-surface-400 bg-surface-50">Showing first ${MAX_FILES} items...</td></tr>`;
    }
    return rows;
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    switch(ext) {
      case 'rs': return '🦀';
      case 'toml': return '⚙️';
      case 'md': return '📝';
      case 'json': return 'JSON';
      case 'lock': return '🔒';
      default: return '📄';
    }
  }

  function bindEvents(helpers) {
    const el = helpers.getRenderEl();
    const searchInput = el.querySelector('#file-search');
    const tableBody = el.querySelector('#file-list-body');
    const countEl = el.querySelector('#item-count');
    
    // Tab switching
    const btnFiles = el.querySelector('#btn-tab-files');
    const btnToml = el.querySelector('#btn-tab-toml');
    const tabFiles = el.querySelector('#tab-files-content');
    const tabToml = el.querySelector('#tab-toml-content');

    const setActiveTab = (isFiles) => {
      btnFiles.className = isFiles ? 'pb-3 text-sm font-bold border-b-2 border-brand-600 text-brand-600 transition-all' : 'pb-3 text-sm font-medium border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all';
      btnToml.className = !isFiles ? 'pb-3 text-sm font-bold border-b-2 border-brand-600 text-brand-600 transition-all' : 'pb-3 text-sm font-medium border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all';
      tabFiles.classList.toggle('hidden', !isFiles);
      tabToml.classList.toggle('hidden', isFiles);
      if (!isFiles && typeof Prism !== 'undefined') Prism.highlightAllUnder(tabToml);
    };

    btnFiles.onclick = () => setActiveTab(true);
    btnToml.onclick = () => setActiveTab(false);

    // Search functionality
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase();
      const allFiles = helpers.getState().files;
      const filtered = allFiles.filter(f => f.name.toLowerCase().includes(q));
      helpers.setState('filteredFiles', filtered);
      tableBody.innerHTML = renderFileList(filtered);
      countEl.innerText = `${filtered.length} items`;
    };

    // Column Sorting (Excelence)
    el.querySelectorAll('th[data-sort]').forEach(th => {
      th.onclick = () => {
        const col = th.dataset.sort;
        let dir = helpers.getState().sortDir || 1;
        if (helpers.getState().sortCol === col) dir *= -1;
        else dir = 1;

        const sorted = [...helpers.getState().filteredFiles].sort((a, b) => {
          if (col === 'size') return (a.size - b.size) * dir;
          return a.name.localeCompare(b.name) * dir;
        });

        helpers.setState('sortCol', col);
        helpers.setState('sortDir', dir);
        helpers.setState('filteredFiles', sorted);
        
        // Refresh UI
        renderApp(helpers.getState()._file, helpers); // Re-render to update icons and list
      };
    });

    // File Downloads
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('.dl-file');
      if (btn) {
        const idx = parseInt(btn.dataset.idx);
        const filtered = helpers.getState().filteredFiles;
        const file = filtered[idx];
        if (file && file.data) {
          const blob = new Blob([file.data], { type: 'application/octet-stream' });
          const fileName = file.name.split('/').pop();
          helpers.download(fileName, blob);
        }
      }
    });

    // Copy TOML
    const copyBtn = el.querySelector('#copy-toml');
    if (copyBtn) {
      copyBtn.onclick = function() {
        helpers.copyToClipboard(helpers.getState().toml, this);
      };
    }
  }

})();
