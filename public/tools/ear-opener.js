(function () {
  'use strict';

  /**
   * OmniOpener EAR Tool
   * A high-performance, browser-based Java Enterprise Archive (.ear) explorer.
   */
  window.initTool = function (toolConfig, mountEl) {
    let _fileList = [];
    let _currentFile = null;
    let _searchTerm = '';
    let _sortCol = 'path';
    let _sortDir = 1; // 1 for asc, -1 for desc

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ear',
      binary: true,
      dropLabel: 'Drop .ear file here',
      infoHtml: 'Extract and explore Java Enterprise Archive (EAR) contents. Supports deep inspection of WAR, JAR, and configuration files locally.',

      actions: [
        {
          label: '📋 Copy Paths',
          id: 'copy-paths',
          onClick: function (h, btn) {
            if (!_fileList || _fileList.length === 0) return;
            const text = _fileList.map(f => f.path).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Original File',
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
        _sortCol = 'path';
        _sortDir = 1;

        const checkReady = () => {
          if (typeof JSZip !== 'undefined') {
            processArchive(file, content, h);
          } else {
            setTimeout(checkReady, 100);
          }
        };

        h.showLoading('Analyzing EAR structure...');
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
        
        const entries = [];
        zipData.forEach((relativePath, zipEntry) => {
          entries.push({
            path: relativePath,
            name: relativePath.split('/').pop() || relativePath,
            size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
            isDir: zipEntry.dir,
            date: zipEntry.date,
            ref: zipEntry,
            type: getFileType(relativePath, zipEntry.dir)
          });
        });

        _fileList = entries;
        render(h);
      } catch (err) {
        console.error('[EAR Tool] Error:', err);
        h.showError(
          'Could not parse EAR file', 
          'The archive may be corrupted or encrypted. Ensure it is a valid Java Enterprise Archive.'
        );
      }
    }

    /**
     * Main render loop
     */
    function render(h) {
      if (!_currentFile) return;

      // Filter and Sort
      const filtered = _fileList.filter(f => 
        f.path.toLowerCase().includes(_searchTerm.toLowerCase())
      );

      const sorted = [...filtered].sort((a, b) => {
        let valA = a[_sortCol];
        let valB = b[_sortCol];
        
        if (typeof valA === 'string') {
          return valA.localeCompare(valB) * _sortDir;
        }
        return (valA - valB) * _sortDir;
      });

      // UI Components
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(_currentFile.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(_currentFile.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.ear archive</span>
        </div>
      `;

      const controls = `
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-surface-800">Archive Contents</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${_fileList.length} items</span>
          </div>
          <div class="relative w-full sm:w-64">
            <input 
              type="text" 
              id="ear-search" 
              placeholder="Search by path..." 
              value="${esc(_searchTerm)}"
              class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
            >
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>
      `;

      if (_fileList.length === 0) {
        h.render(infoBar + '<div class="p-12 text-center border border-dashed border-surface-200 rounded-xl text-surface-500">Archive is empty</div>');
        return;
      }

      const sortIcon = (col) => {
        if (_sortCol !== col) return '<span class="ml-1 opacity-20">↕</span>';
        return _sortDir === 1 ? '<span class="ml-1 text-brand-500">↑</span>' : '<span class="ml-1 text-brand-500">↓</span>';
      };

      const table = `
        <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr class="bg-surface-50">
                  <th class="sortable sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors" data-col="path">
                    File Path ${sortIcon('path')}
                  </th>
                  <th class="sortable sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-28" data-col="size">
                    Size ${sortIcon('size')}
                  </th>
                  <th class="sortable sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 cursor-pointer hover:bg-surface-100 transition-colors w-36 hidden md:table-cell" data-col="type">
                    Type ${sortIcon('type')}
                  </th>
                  <th class="sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map((f, i) => `
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700 border-b border-surface-100 font-mono text-xs break-all">
                      <span class="mr-2 inline-block w-4 text-center">${f.isDir ? '📁' : f.icon || '📄'}</span>${esc(f.path)}
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 text-right whitespace-nowrap tabular-nums">
                      ${f.isDir ? '—' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 border-b border-surface-100 hidden md:table-cell">
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 text-surface-600 uppercase font-bold tracking-tight">${f.type}</span>
                    </td>
                    <td class="px-4 py-2.5 text-right border-b border-surface-100">
                      ${!f.isDir ? `
                        <button 
                          class="extract-btn opacity-0 group-hover:opacity-100 focus:opacity-100 text-brand-600 hover:text-brand-700 font-semibold text-xs transition-opacity" 
                          data-idx="${_fileList.indexOf(f)}"
                        >
                          Extract
                        </button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('') || '<tr><td colspan="4" class="px-4 py-12 text-center text-surface-400">No matching files found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;

      h.render(infoBar + controls + table);

      // Event Listeners
      const container = h.getRenderEl();
      
      const searchInput = container.querySelector('#ear-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        searchInput.addEventListener('input', (e) => {
          _searchTerm = e.target.value;
          render(h);
        });
      }

      container.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (_sortCol === col) {
            _sortDir *= -1;
          } else {
            _sortCol = col;
            _sortDir = 1;
          }
          render(h);
        });
      });

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
            h.download(f.name, blob);
          } catch (err) {
            console.error('[EAR Tool] Extraction error:', err);
            h.showError('Extraction failed', 'Could not extract the individual file from the archive.');
          } finally {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        });
      });
    }

    /**
     * Helper to classify file types in EAR
     */
    function getFileType(path, isDir) {
      if (isDir) return 'Folder';
      const ext = path.split('.').pop().toLowerCase();
      switch (ext) {
        case 'war': return 'Web Module';
        case 'jar': return 'Java Library';
        case 'rar': return 'Resource Adapter';
        case 'xml': return 'Config (XML)';
        case 'properties': return 'Properties';
        case 'class': return 'Java Class';
        case 'mf': return 'Manifest';
        case 'json': return 'JSON Data';
        case 'yaml': 
        case 'yml': return 'YAML Config';
        case 'txt': return 'Text File';
        case 'html': return 'HTML Page';
        case 'css': return 'Styles';
        case 'js': return 'Script';
        default: return ext.toUpperCase() || 'File';
      }
    }

    /**
     * Simple size formatter
     */
    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * Minimal HTML Escaping
     */
    function esc(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };
})();
