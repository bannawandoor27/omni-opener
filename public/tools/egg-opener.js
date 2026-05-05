(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentZip = null;
    let allFiles = [];

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.egg',
      infoHtml: 'Python .egg files are specialized ZIP archives. This tool allows you to browse and extract their contents entirely in your browser.',

      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: async function (h, btn) {
            try {
              const content = h.getContent();
              const hashBuffer = await crypto.subtle.digest('SHA-256', content);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              h.copyToClipboard(hashHex, btn);
            } catch (err) {
              h.showError('Hash failed', err.message);
            }
          }
        },
        {
          label: '📥 Download .zip',
          id: 'dl-zip',
          onClick: function (h) {
            const file = h.getFile();
            const name = file.name.replace(/\.egg$/i, '') + '.zip';
            h.download(name, h.getContent(), 'application/zip');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onDestroy: function () {
        currentZip = null;
        allFiles = [];
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Reading Python Egg archive...');

        // B1: Ensure JSZip is loaded
        if (typeof JSZip === 'undefined') {
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 100) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            h.showError('Library Load Failed', 'JSZip could not be loaded from CDN. Please check your connection.');
            return;
          }
        }

        try {
          const zip = new JSZip();
          currentZip = await zip.loadAsync(content);
          allFiles = [];

          currentZip.forEach((relativePath, zipEntry) => {
            allFiles.push({
              name: relativePath,
              size: zipEntry._data.uncompressedSize || 0,
              dir: zipEntry.dir,
              date: zipEntry.date,
              entry: zipEntry
            });
          });

          if (allFiles.length === 0) {
            renderEmpty(file, h);
            return;
          }

          // Sort: Directories first, then alphabetical
          allFiles.sort((a, b) => {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          renderUI(file, h);
        } catch (err) {
          h.showError('Could not open Egg file', 'The file might be corrupted or not a valid ZIP-based Egg archive. ' + err.message);
        }
      }
    });

    function renderUI(file, h) {
      const totalUncompressedSize = allFiles.reduce((acc, f) => acc + f.size, 0);
      
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Python Egg Archive</span>
        </div>
      `;

      const searchAndStats = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div class="relative flex-1 max-w-md">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
            <input type="text" id="egg-search" placeholder="Search files in archive..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
          </div>
          <div class="flex items-center gap-3">
             <span class="text-xs font-medium bg-brand-50 text-brand-700 px-3 py-1 rounded-full border border-brand-100">
               ${allFiles.length} items • ${formatSize(totalUncompressedSize)} total
             </span>
          </div>
        </div>
      `;

      const tableHtml = `
        <div class="overflow-x-auto rounded-xl border border-surface-200">
          <table class="min-w-full text-sm" id="egg-table">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700">Name</th>
                <th class="sticky top-0 bg-surface-50 px-4 py-3 text-right font-semibold text-surface-700">Size</th>
                <th class="sticky top-0 bg-surface-50 px-4 py-3 text-right font-semibold text-surface-700">Modified</th>
                <th class="sticky top-0 bg-surface-50 px-4 py-3 text-center font-semibold text-surface-700">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100 bg-white">
              ${renderRows(allFiles)}
            </tbody>
          </table>
        </div>
      `;

      h.render(`<div class="p-4 md:p-6">${infoBar}${searchAndStats}${tableHtml}</div>`);

      // Bind Search
      const searchInput = h.getRenderEl().querySelector('#egg-search');
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allFiles.filter(f => f.name.toLowerCase().includes(query));
        h.getRenderEl().querySelector('tbody').innerHTML = renderRows(filtered);
        bindTableActions(h);
      });

      bindTableActions(h);
    }

    function renderRows(files) {
      if (files.length === 0) {
        return `<tr><td colspan="4" class="px-4 py-8 text-center text-surface-500 italic">No files matching your search</td></tr>`;
      }

      return files.map(f => {
        const icon = f.dir ? '📁' : getFileIcon(f.name);
        return `
          <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
            <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-mono text-xs truncate max-w-md">
              <span class="mr-2 opacity-70">${icon}</span>${esc(f.name)}
            </td>
            <td class="px-4 py-2 text-right text-surface-500 border-b border-surface-100">
              ${f.dir ? '—' : formatSize(f.size)}
            </td>
            <td class="px-4 py-2 text-right text-surface-500 border-b border-surface-100 whitespace-nowrap">
              ${f.date.toLocaleDateString()}
            </td>
            <td class="px-4 py-2 text-center border-b border-surface-100">
              ${f.dir ? '' : `
                <button class="extract-btn text-brand-600 hover:text-brand-700 font-medium px-2 py-1 rounded transition-colors" data-name="${esc(f.name)}">
                  Extract
                </button>
              `}
            </td>
          </tr>
        `;
      }).join('');
    }

    function bindTableActions(h) {
      h.getRenderEl().querySelectorAll('.extract-btn').forEach(btn => {
        btn.onclick = async function () {
          const name = this.getAttribute('data-name');
          const originalContent = this.innerHTML;
          this.innerHTML = '<span class="animate-pulse">...</span>';
          this.disabled = true;

          try {
            const entry = currentZip.file(name);
            if (!entry) throw new Error('File entry not found');
            
            const blob = await entry.async('blob');
            h.download(name.split('/').pop(), blob);
          } catch (err) {
            console.error(err);
            alert('Extraction failed: ' + err.message);
          } finally {
            this.innerHTML = originalContent;
            this.disabled = false;
          }
        };
      });
    }

    function renderEmpty(file, h) {
      h.render(`
        <div class="p-12 text-center">
          <div class="text-4xl mb-4">📦</div>
          <h3 class="text-lg font-semibold text-surface-900 mb-2">${esc(file.name)}</h3>
          <p class="text-surface-500">This archive appears to be empty.</p>
        </div>
      `);
    }

    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function getFileIcon(name) {
      const ext = name.split('.').pop().toLowerCase();
      if (['py', 'pyc', 'pyo', 'pyd'].includes(ext)) return '🐍';
      if (['txt', 'md', 'rst', 'info'].includes(ext)) return '📄';
      if (['json', 'yaml', 'yml', 'xml', 'cfg', 'ini'].includes(ext)) return '⚙️';
      if (['so', 'dll', 'dylib'].includes(ext)) return '🔨';
      return '📄';
    }

    function esc(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, function (m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        }[m];
      });
    }
  };
})();
