(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _fileList = [];
    let _currentFile = null;
    let _searchTerm = '';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ear',
      binary: true,
      dropLabel: 'Drop an EAR file here',
      infoHtml: 'Extract and explore the contents of Java Enterprise Archive (EAR) files directly in your browser. All processing happens locally.',

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            if (!_fileList || _fileList.length === 0) return;
            const text = _fileList.map(f => f.name).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download-orig',
          onClick: function (h) {
            if (_currentFile) h.download(_currentFile.name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      },

      onDestroy: function () {
        _fileList = [];
        _currentFile = null;
      },

      onFile: function _onFileFn(file, content, h) {
        _currentFile = file;
        _searchTerm = '';
        _fileList = [];

        const checkReady = () => {
          if (typeof JSZip !== 'undefined') {
            processArchive(file, content, h);
          } else {
            setTimeout(checkReady, 100);
          }
        };

        h.showLoading('Extracting EAR archive...');
        checkReady();
      }
    });

    /**
     * Parse EAR (ZIP) structure
     */
    async function processArchive(file, content, h) {
      try {
        const zip = new JSZip();
        const zipData = await zip.loadAsync(content);
        
        const files = [];
        zipData.forEach((relativePath, zipEntry) => {
          files.push({
            name: relativePath,
            size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
            dir: zipEntry.dir,
            date: zipEntry.date,
            ref: zipEntry
          });
        });

        _fileList = files;
        render(h);
      } catch (err) {
        console.error(err);
        h.showError('Could not open EAR file', 'The archive may be corrupted or in an unsupported format. Error: ' + err.message);
      }
    }

    /**
     * Main render function
     */
    function render(h) {
      const filtered = _fileList.filter(f => 
        f.name.toLowerCase().includes(_searchTerm.toLowerCase())
      );

      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(_currentFile.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(_currentFile.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.ear archive</span>
        </div>
      `;

      const searchHeader = `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-surface-800">Archive Contents</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${_fileList.length} items</span>
          </div>
          <div class="relative w-full sm:w-64">
            <input 
              type="text" 
              id="ear-search" 
              placeholder="Search files..." 
              value="${esc(_searchTerm)}"
              class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            >
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>
      `;

      if (_fileList.length === 0) {
        h.render(infoBar + '<div class="p-12 text-center border-2 border-dashed border-surface-200 rounded-xl text-surface-500">Archive is empty</div>');
        return;
      }

      let tableRows = '';
      filtered.forEach((f, idx) => {
        const isDir = f.dir;
        let type = 'File';
        let icon = '📄';

        if (isDir) {
          type = 'Directory';
          icon = '📁';
        } else {
          const lower = f.name.toLowerCase();
          if (lower.endsWith('.war')) { type = 'Web Module'; icon = '🌐'; }
          else if (lower.endsWith('.jar')) { type = 'Java Library'; icon = '📦'; }
          else if (lower.endsWith('.xml')) { type = 'Config'; icon = '⚙️'; }
          else if (lower.endsWith('.class')) { type = 'Java Class'; icon = '☕'; }
          else if (lower.endsWith('.properties')) { type = 'Properties'; icon = '📝'; }
        }

        tableRows += `
          <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
            <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 font-mono text-xs break-all">
              <span class="mr-1.5">${icon}</span>${esc(f.name)}
            </td>
            <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 text-right whitespace-nowrap">
              ${isDir ? '-' : formatSize(f.size)}
            </td>
            <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 hidden md:table-cell">
              <span class="text-xs px-2 py-0.5 rounded-md bg-surface-100 text-surface-600">${type}</span>
            </td>
            <td class="px-4 py-2.5 text-right border-b border-surface-100">
              ${!isDir ? `
                <button 
                  class="extract-btn opacity-0 group-hover:opacity-100 focus:opacity-100 text-brand-600 hover:text-brand-700 font-medium text-xs transition-opacity" 
                  data-idx="${_fileList.indexOf(f)}"
                >
                  Download
                </button>
              ` : ''}
            </td>
          </tr>
        `;
      });

      const table = `
        <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50 border-b border-surface-200">
                  <th class="px-4 py-3 text-left font-semibold text-surface-700">Path</th>
                  <th class="px-4 py-3 text-right font-semibold text-surface-700 w-24">Size</th>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700 w-32 hidden md:table-cell">Type</th>
                  <th class="px-4 py-3 text-right font-semibold text-surface-700 w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || '<tr><td colspan="4" class="px-4 py-12 text-center text-surface-400">No matching files found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;

      h.render(infoBar + searchHeader + table);

      // Event Listeners
      const container = h.getRenderEl();
      
      const searchInput = container.querySelector('#ear-search');
      if (searchInput) {
        searchInput.focus();
        // Place cursor at end
        const val = searchInput.value;
        searchInput.value = '';
        searchInput.value = val;
        
        searchInput.addEventListener('input', (e) => {
          _searchTerm = e.target.value;
          render(h);
        });
      }

      container.querySelectorAll('.extract-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.idx);
          const f = _fileList[idx];
          if (!f || !f.ref) return;

          const originalText = btn.textContent;
          btn.textContent = '...';
          btn.disabled = true;

          try {
            const blob = await f.ref.async('blob');
            h.download(f.name.split('/').pop(), blob);
          } catch (err) {
            console.error(err);
            alert('Extraction failed: ' + err.message);
          } finally {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        });
      });
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };
})();
