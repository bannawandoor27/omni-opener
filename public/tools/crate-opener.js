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
   * Minimal TAR parser for crate contents
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
      const size = parseInt(decoder.decode(header.subarray(124, 136)).trim(), 8) || 0;
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
          
          // Wait for pako if not ready
          if (typeof pako === 'undefined') {
            await new Promise(r => {
              const check = () => typeof pako !== 'undefined' ? r() : setTimeout(check, 50);
              check();
            });
          }

          const uint8 = new Uint8Array(content);
          const decompressed = pako.ungzip(uint8);
          
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

          renderApp(file, helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Failed to open crate', 'Ensure this is a valid .crate (tar.gz) file. ' + err.message);
        }
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: (helpers, btn) => {
            const files = helpers.getState().files || [];
            const text = files.map(f => `${f.isDir ? '[DIR]' : '[FILE]'} ${f.name}`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Metadata',
          id: 'dl-meta',
          onClick: (helpers) => {
            const meta = helpers.getState().metadata;
            if (meta) helpers.download(`${meta.name}-metadata.json`, JSON.stringify(meta, null, 2), 'application/json');
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

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    const html = `
      <div class="p-4 md:p-6 max-w-6xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)} (Compressed)</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${files.length} items</span>
        </div>

        <!-- Metadata Header (U9: Content Cards) -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div class="lg:col-span-2 space-y-4">
            <div class="flex items-start justify-between">
              <div>
                <h1 class="text-3xl font-bold text-surface-900 flex items-center gap-3">
                  <span class="p-2 bg-brand-50 text-brand-600 rounded-lg">📦</span>
                  ${escapeHtml(meta.name)}
                  <span class="text-sm font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">v${escapeHtml(meta.version)}</span>
                </h1>
                ${meta.description ? `<p class="mt-3 text-surface-600 leading-relaxed text-lg">${escapeHtml(meta.description)}</p>` : ''}
              </div>
            </div>

            <div class="flex flex-wrap gap-6 text-sm">
              ${meta.license ? `
                <div class="flex items-center gap-2">
                  <span class="text-surface-400 font-medium uppercase tracking-wider text-[10px]">License</span>
                  <span class="text-surface-700 font-semibold">${escapeHtml(meta.license)}</span>
                </div>
              ` : ''}
              ${meta.edition ? `
                <div class="flex items-center gap-2">
                  <span class="text-surface-400 font-medium uppercase tracking-wider text-[10px]">Edition</span>
                  <span class="text-surface-700 font-semibold">${escapeHtml(meta.edition)}</span>
                </div>
              ` : ''}
            </div>

            <div class="flex flex-wrap gap-4 pt-2">
              ${meta.repository ? `
                <a href="${escapeHtml(meta.repository)}" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:border-brand-300 hover:text-brand-600 transition-all">
                  <span>GitHub</span>
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </a>
              ` : ''}
              <a href="https://crates.io/crates/${escapeHtml(meta.name)}" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-surface-200 rounded-lg text-sm font-medium text-surface-700 hover:border-brand-300 hover:text-brand-600 transition-all">
                <span>crates.io</span>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
              </a>
            </div>
          </div>

          <div class="bg-surface-50 border border-surface-200 rounded-2xl p-5 space-y-4">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Archive Details</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">Uncompressed Size</span>
                <span class="text-sm font-mono font-bold text-surface-800">${formatSize(totalSize)}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">Total Files</span>
                <span class="text-sm font-mono font-bold text-surface-800">${files.filter(f => !f.isDir).length}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">Total Folders</span>
                <span class="text-sm font-mono font-bold text-surface-800">${files.filter(f => f.isDir).length}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex items-center gap-8 mb-6 border-b border-surface-100">
          <button id="btn-tab-files" class="pb-4 text-sm font-bold border-b-2 border-brand-600 text-brand-600 transition-all">Files</button>
          <button id="btn-tab-toml" class="pb-4 text-sm font-medium border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all">Cargo.toml</button>
        </div>

        <!-- TAB: Files -->
        <div id="tab-files-content" class="space-y-4">
          <!-- SEARCH BOX (ARCHIVE EXCELLENCE) -->
          <div class="relative group">
            <input type="text" id="file-search" placeholder="Search files in crate..." 
              class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all outline-none">
            <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl border border-surface-200 bg-white">
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50/50 border-b border-surface-100">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700 w-32">Size</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700 w-24">Action</th>
                  </tr>
                </thead>
                <tbody id="file-list-body" class="divide-y divide-surface-50">
                  ${renderFileList(files)}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB: Cargo.toml -->
        <div id="tab-toml-content" class="hidden">
          <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950">
            <div class="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/10">
              <span class="text-xs font-mono text-gray-400">Cargo.toml</span>
              <button id="copy-toml" class="text-xs font-medium text-gray-300 hover:text-white transition-colors">Copy</button>
            </div>
            <pre class="p-4 text-sm font-mono leading-relaxed overflow-x-auto"><code class="language-toml">${escapeHtml(toml || '# No Cargo.toml found')}</code></pre>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);
    bindEvents(helpers);
  }

  function renderFileList(files) {
    if (files.length === 0) {
      return `<tr><td colspan="3" class="px-4 py-12 text-center text-surface-400 italic">No files found matching your search.</td></tr>`;
    }

    return files.map((f, i) => `
      <tr class="group hover:bg-brand-50/30 transition-colors">
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            <span class="text-lg">${f.isDir ? '📁' : '📄'}</span>
            <span class="font-mono text-xs text-surface-700 break-all">${escapeHtml(f.name)}</span>
          </div>
        </td>
        <td class="px-4 py-3 text-right font-mono text-xs text-surface-500">
          ${f.isDir ? '-' : formatSize(f.size)}
        </td>
        <td class="px-4 py-3 text-right">
          ${f.isDir ? '' : `
            <button class="dl-file text-brand-600 hover:text-brand-700 font-semibold text-xs opacity-0 group-hover:opacity-100 transition-opacity" data-idx="${i}">
              Download
            </button>
          `}
        </td>
      </tr>
    `).join('');
  }

  function bindEvents(helpers) {
    const el = helpers.getRenderEl();
    const searchInput = el.querySelector('#file-search');
    const tableBody = el.querySelector('#file-list-body');
    
    // Tab switching
    const btnFiles = el.querySelector('#btn-tab-files');
    const btnToml = el.querySelector('#btn-tab-toml');
    const tabFiles = el.querySelector('#tab-files-content');
    const tabToml = el.querySelector('#tab-toml-content');

    btnFiles.onclick = () => {
      btnFiles.className = 'pb-4 text-sm font-bold border-b-2 border-brand-600 text-brand-600 transition-all';
      btnToml.className = 'pb-4 text-sm font-medium border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all';
      tabFiles.classList.remove('hidden');
      tabToml.classList.add('hidden');
    };

    btnToml.onclick = () => {
      btnToml.className = 'pb-4 text-sm font-bold border-b-2 border-brand-600 text-brand-600 transition-all';
      btnFiles.className = 'pb-4 text-sm font-medium border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all';
      tabToml.classList.remove('hidden');
      tabFiles.classList.add('hidden');
      if (typeof Prism !== 'undefined') Prism.highlightAllUnder(tabToml);
    };

    // Search functionality
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase();
      const allFiles = helpers.getState().files;
      const filtered = allFiles.filter(f => f.name.toLowerCase().includes(q));
      helpers.setState('filteredFiles', filtered);
      tableBody.innerHTML = renderFileList(filtered);
    };

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
    el.querySelector('#copy-toml').onclick = function() {
      helpers.copyToClipboard(helpers.getState().toml, this);
    };
  }
})();
