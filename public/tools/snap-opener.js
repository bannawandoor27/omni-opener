(function () {
  'use strict';

  /**
   * OmniOpener — Snap Package Opener
   * Uses libarchive.js to explore Ubuntu Snap (.snap) packages (SquashFS).
   * Parses meta/snap.yaml for package metadata.
   */

  var workerBlobUrl = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.snap',
      dropLabel: 'Drop a .snap package here',
      binary: true,

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.min.js');
        h.loadScript('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js');
      },

      onDestroy: function () {
        if (workerBlobUrl) {
          URL.revokeObjectURL(workerBlobUrl);
          workerBlobUrl = null;
        }
      },

      onFile: async function (file, content, h) {
        // Large file warning
        if (file.size > 100 * 1024 * 1024) {
          if (!confirm('This snap file is large (' + formatSize(file.size) + '). Processing in-browser may be slow. Continue?')) {
            h.reset();
            return;
          }
        }

        h.showLoading('Loading engines...');

        // Wait for dependencies to load
        const checkDeps = () => typeof Archive !== 'undefined' && typeof jsyaml !== 'undefined';
        for (let i = 0; i < 40; i++) {
          if (checkDeps()) break;
          await new Promise(r => setTimeout(r, 250));
        }

        if (!checkDeps()) {
          h.showError('Dependency Error', 'Failed to load decompression engines. Please check your connection.');
          return;
        }

        try {
          // Initialize worker once
          if (!workerBlobUrl) {
            const workerUrl = 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js';
            const workerCode = "importScripts('" + workerUrl + "');";
            const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
            workerBlobUrl = URL.createObjectURL(workerBlob);
            Archive.init({ workerUrl: workerBlobUrl });
          }

          h.showLoading('Reading snap structure...');
          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();

          if (!entries || entries.length === 0) {
            throw new Error('No files found in snap package.');
          }

          // Try to extract metadata
          let metadata = null;
          const metaEntry = entries.find(e => e.path === 'meta/snap.yaml' || e.path === './meta/snap.yaml');
          if (metaEntry) {
            try {
              const metaBlob = await metaEntry.extract();
              const metaText = await metaBlob.text();
              metadata = jsyaml.load(metaText);
            } catch (e) {
              console.warn('Failed to parse meta/snap.yaml', e);
            }
          }

          entries.sort((a, b) => {
            const aDir = a.file.type === 'directory' ? 0 : 1;
            const bDir = b.file.type === 'directory' ? 0 : 1;
            return aDir - bDir || a.path.localeCompare(b.path);
          });

          let totalUncompressed = 0;
          entries.forEach(e => totalUncompressed += (e.size || 0));

          h.setState('entries', entries);
          h.setState('metadata', metadata);

          renderUI(file, entries, metadata, totalUncompressed, h);

        } catch (err) {
          console.error('[snap-opener] Error:', err);
          h.showError(
            'Could not open snap file',
            err.message || 'The file might be corrupted or uses an unsupported compression.'
          );
        }
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            const entries = h.getState().entries;
            if (!entries) return;
            h.copyToClipboard(entries.map(e => e.path).join('\n'), btn);
          }
        },
        {
          label: '📥 Download Metadata',
          id: 'dl-meta',
          onClick: function (h) {
            const metadata = h.getState().metadata;
            if (!metadata) return alert('No metadata found in this snap.');
            h.download('snap-metadata.json', JSON.stringify(metadata, null, 2), 'application/json');
          }
        }
      ]
    });
  };

  function renderUI(file, entries, metadata, totalUncompressed, h) {
    const fileCount = entries.length;
    const pkgName = metadata ? (metadata.name || metadata.title || 'Unknown') : 'Unknown Package';
    const pkgVer = metadata ? (metadata.version || 'unknown') : 'unknown';

    const html = `
      <div class="p-6 max-w-6xl mx-auto">
        <!-- Header Info -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="p-4 bg-brand-50 rounded-2xl border border-brand-100">
            <p class="text-[10px] text-brand-400 uppercase font-bold tracking-widest mb-1">Package</p>
            <p class="text-xl font-black text-brand-900 truncate">${esc(pkgName)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-2xl border border-surface-100">
            <p class="text-[10px] text-surface-400 uppercase font-bold tracking-widest mb-1">Version</p>
            <p class="text-xl font-mono font-bold text-surface-700 truncate">${esc(pkgVer)}</p>
          </div>
          <div class="p-4 bg-surface-50 rounded-2xl border border-surface-100">
            <p class="text-[10px] text-surface-400 uppercase font-bold tracking-widest mb-1">Content</p>
            <p class="text-xl font-bold text-surface-700">${fileCount.toLocaleString()} <span class="text-sm font-normal text-surface-500">files</span></p>
          </div>
        </div>

        ${metadata && metadata.summary ? `
          <div class="mb-6 p-4 bg-white border border-surface-200 rounded-2xl shadow-sm">
            <p class="text-[10px] text-surface-400 uppercase font-bold tracking-widest mb-2">Summary</p>
            <p class="text-surface-700 font-medium">${esc(metadata.summary)}</p>
            ${metadata.description ? `<p class="mt-2 text-sm text-surface-500 whitespace-pre-wrap">${esc(metadata.description)}</p>` : ''}
          </div>
        ` : ''}

        <!-- Stats Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-xs text-surface-500 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-700">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>Archive: ${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span>Unpacked: ${formatSize(totalUncompressed)}</span>
        </div>

        <!-- Search -->
        <div class="mb-6 relative">
          <input type="text" id="snap-filter" 
            placeholder="Search files..." 
            class="w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all outline-none shadow-sm"
          >
          <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
        </div>

        <!-- Table -->
        <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm text-left">
              <thead class="bg-surface-50/50 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-3 font-bold text-surface-700">Path</th>
                  <th class="px-4 py-3 font-bold text-surface-700 w-32 text-right">Size</th>
                  <th class="px-4 py-3 font-bold text-surface-700 w-24 text-center">Action</th>
                </tr>
              </thead>
              <tbody id="snap-body" class="divide-y divide-surface-100">
                ${renderRows(entries)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    const filterInput = document.getElementById('snap-filter');
    const snapBody = document.getElementById('snap-body');

    filterInput.addEventListener('input', () => {
      const query = filterInput.value.toLowerCase().trim();
      const filtered = entries.filter(e => e.path.toLowerCase().includes(query));
      snapBody.innerHTML = renderRows(filtered);
      bindExtractButtons(filtered, h);
    });

    bindExtractButtons(entries, h);
  }

  function renderRows(items) {
    const limit = 500;
    const visible = items.slice(0, limit);
    
    let html = visible.map((entry) => {
      const isDir = entry.file.type === 'directory';
      const icon = isDir ? '📁' : getFileIcon(entry.path);
      return `
        <tr class="hover:bg-brand-50/50 transition-colors">
          <td class="px-4 py-3 text-surface-700">
            <div class="flex items-center gap-3">
              <span class="text-base">${icon}</span>
              <span class="font-mono text-xs truncate max-w-md" title="${esc(entry.path)}">${esc(entry.path)}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-right text-surface-500 font-mono text-xs">
            ${isDir ? '-' : formatSize(entry.size)}
          </td>
          <td class="px-4 py-3 text-center">
            ${isDir ? '' : `
              <button 
                data-path="${esc(entry.path)}" 
                class="snap-extract text-brand-600 hover:text-brand-700 font-bold text-xs"
              >
                Extract
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    if (items.length > limit) {
      html += `<tr><td colspan="3" class="px-4 py-4 text-center text-surface-400 italic bg-surface-50/30 text-xs">Showing first ${limit} items. Use search to filter.</td></tr>`;
    }
    if (items.length === 0) {
      html = `<tr><td colspan="3" class="px-4 py-12 text-center text-surface-400 italic">No files match your search.</td></tr>`;
    }
    return html;
  }

  function bindExtractButtons(items, h) {
    h.getRenderEl().querySelectorAll('.snap-extract').forEach(btn => {
      btn.onclick = async function () {
        const path = this.dataset.path;
        const entry = items.find(e => e.path === path);
        if (!entry) return;

        const originalText = this.textContent;
        try {
          this.textContent = '...';
          this.disabled = true;
          
          const blob = await entry.extract();
          const filename = path.split('/').pop() || 'extracted';
          h.download(filename, blob);
          
          this.textContent = '✓';
          setTimeout(() => {
            this.textContent = originalText;
            this.disabled = false;
          }, 1500);
        } catch (err) {
          console.error(err);
          this.textContent = 'Err';
          this.disabled = false;
        }
      };
    });
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getFileIcon(path) {
    const ext = path.split('.').pop().toLowerCase();
    const icons = {
      'pdf': '📄', 'docx': '📝', 'doc': '📝', 'xlsx': '📊', 'xls': '📊',
      'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
      'mp4': '🎬', 'webm': '🎬', 'mp3': '🎵', 'wav': '🎵',
      'zip': '📦', 'tar': '📦', '7z': '📦', 'gz': '📦',
      'js': '📜', 'ts': '📜', 'html': '🌐', 'json': '🔑', 'yaml': '🔑', 'yml': '🔑',
      'sh': '🐚', 'bash': '🐚', 'py': '🐍', 'rb': '💎', 'go': '🐹',
      'conf': '⚙️', 'ini': '⚙️', 'desktop': '🖥️', 'service': '⚙️'
    };
    return icons[ext] || '📄';
  }

})();
