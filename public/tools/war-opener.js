(function() {
  'use strict';

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(date));
    } catch (e) {
      return '-';
    }
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  };

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.war',
      dropLabel: 'Drop a .war file here',
      binary: true,
      onInit: (helpers) => {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: async (file, content, helpers) => {
        helpers.showLoading('Extracting WAR archive...');

        // B1: Check for JSZip global
        if (typeof JSZip === 'undefined') {
          let retries = 0;
          const checkJSZip = setInterval(async () => {
            retries++;
            if (typeof JSZip !== 'undefined') {
              clearInterval(checkJSZip);
              await processWar(file, content, helpers);
            } else if (retries > 50) {
              clearInterval(checkJSZip);
              helpers.showError('Library Load Issue', 'JSZip could not be loaded from CDN. Please check your connection.');
            }
          }, 100);
          return;
        }

        await processWar(file, content, helpers);
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: (helpers, btn) => {
            const files = helpers.getState('allFiles');
            if (!files || files.length === 0) return;
            const text = files.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download List',
          id: 'dl-list',
          onClick: (helpers) => {
            const files = helpers.getState('allFiles');
            if (!files || files.length === 0) return;
            const text = files.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
            const fileName = helpers.getFile().name.replace(/\.[^/.]+$/, "") + '-manifest.txt';
            helpers.download(fileName, text);
          }
        }
      ],
      infoHtml: '<strong>WAR Explorer:</strong> Inspect Java Web Archive contents, view deployment descriptors, and extract files. 100% client-side.'
    });
  };

  async function processWar(file, content, helpers) {
    try {
      // B3: Proper async/await for JSZip
      const zip = await JSZip.loadAsync(content);
      const files = [];
      let totalUncompressedSize = 0;
      let webXmlContent = null;

      zip.forEach((relativePath, zipEntry) => {
        const size = zipEntry._data.uncompressedSize || 0;
        files.push({
          name: relativePath,
          size: size,
          date: zipEntry.date,
          isDirectory: zipEntry.dir,
          entry: zipEntry
        });
        if (!zipEntry.dir) {
          totalUncompressedSize += size;
        }
      });

      if (files.length === 0) {
        // U5: Empty state
        helpers.render(`
          <div class="flex flex-col items-center justify-center p-12 text-center">
            <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4 text-2xl">📦</div>
            <h3 class="text-lg font-semibold text-surface-900">Empty WAR Archive</h3>
            <p class="text-surface-500 mt-1">This archive contains no files or directories.</p>
          </div>
        `);
        return;
      }

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      // Try to find and read web.xml
      const webXmlEntry = zip.file('WEB-INF/web.xml');
      if (webXmlEntry) {
        try {
          webXmlContent = await webXmlEntry.async('string');
        } catch (e) {
          console.warn('Could not read web.xml', e);
        }
      }

      helpers.setState('allFiles', files);
      helpers.setState('webXml', webXmlContent);
      helpers.setState('totalUncompressedSize', totalUncompressedSize);
      
      renderWarView(helpers);
    } catch (err) {
      // U3: Friendly error message
      helpers.showError('Could not open WAR file', 'The file may be corrupted or in an unsupported format. Error: ' + err.message);
    }
  }

  function renderWarView(helpers) {
    const file = helpers.getFile();
    const allFiles = helpers.getState('allFiles') || [];
    const webXml = helpers.getState('webXml');
    const totalSize = helpers.getState('totalUncompressedSize') || 0;
    const searchTerm = (helpers.getState('searchTerm') || '').toLowerCase();

    const filteredFiles = searchTerm 
      ? allFiles.filter(f => f.name.toLowerCase().includes(searchTerm))
      : allFiles;

    // B7: Large file list handling - truncate for DOM performance if needed
    const MAX_VISIBLE = 2000;
    const visibleFiles = filteredFiles.slice(0, MAX_VISIBLE);
    const isTruncated = filteredFiles.length > MAX_VISIBLE;

    const html = `
      <div class="p-4 md:p-6 space-y-6">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)} (Compressed)</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.war file</span>
          <span class="text-surface-300">|</span>
          <span class="text-brand-600 font-medium">${allFiles.length} items</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- U9: Summary Card -->
          <div class="bg-white border border-surface-200 rounded-xl p-5 shadow-sm hover:border-brand-300 transition-all">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-surface-800">Archive Summary</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Stats</span>
            </div>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm text-surface-500">Uncompressed Size</span>
                <span class="text-sm font-bold text-surface-800">${formatSize(totalSize)}</span>
              </div>
              <div class="flex justify-between items-center border-t border-surface-50 pt-3">
                <span class="text-sm text-surface-500">Files</span>
                <span class="text-sm font-medium text-surface-700">${allFiles.filter(f => !f.isDirectory).length}</span>
              </div>
              <div class="flex justify-between items-center border-t border-surface-50 pt-3">
                <span class="text-sm text-surface-500">Directories</span>
                <span class="text-sm font-medium text-surface-700">${allFiles.filter(f => f.isDirectory).length}</span>
              </div>
              <div class="flex justify-between items-center border-t border-surface-50 pt-3">
                <span class="text-sm text-surface-500">Compression Ratio</span>
                <span class="text-sm font-medium text-brand-600">${file.size > 0 ? Math.round((1 - (file.size / totalSize)) * 100) : 0}%</span>
              </div>
            </div>
          </div>

          <!-- U8: Web Metadata (Deployment Descriptor) -->
          <div class="lg:col-span-2 bg-white border border-surface-200 rounded-xl p-5 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-surface-800">Deployment Descriptor (web.xml)</h3>
              ${webXml ? `<button id="copy-web-xml" class="text-xs text-brand-600 hover:text-brand-700 font-medium px-2 py-1 bg-brand-50 rounded-lg transition-colors">Copy XML</button>` : ''}
            </div>
            ${webXml ? `
              <div class="rounded-xl overflow-hidden border border-surface-200">
                <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[180px]">${escapeHtml(webXml)}</pre>
              </div>
            ` : `
              <div class="flex flex-col items-center justify-center h-[180px] bg-surface-50 rounded-xl border border-dashed border-surface-300">
                <span class="text-2xl mb-2">📄</span>
                <span class="text-sm text-surface-500 italic">WEB-INF/web.xml not found</span>
              </div>
            `}
          </div>
        </div>

        <!-- SEARCH BOX (Format-specific Excellence) -->
        <div class="relative">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span class="text-surface-400">🔍</span>
          </div>
          <input type="text" id="war-search" value="${escapeHtml(searchTerm)}" 
                 placeholder="Filter entries by name or path..." 
                 class="block w-full pl-10 pr-3 py-2.5 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm">
        </div>

        <!-- U7: File List Table -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Archive Contents</h3>
            <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${filteredFiles.length} matches</span>
          </div>
          
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm divide-y divide-surface-200">
              <thead>
                <tr class="bg-surface-50">
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Entry Path</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-28">Size</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-44">Modified</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100 bg-white">
                ${visibleFiles.length > 0 ? visibleFiles.map((f, i) => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700 break-all">
                      <div class="flex items-center gap-2">
                        <span class="text-lg opacity-70 group-hover:opacity-100 transition-opacity">${f.isDirectory ? '📁' : getFileIcon(f.name)}</span>
                        <span class="${f.isDirectory ? 'font-medium text-surface-900' : 'text-surface-600'}">${escapeHtml(f.name)}</span>
                      </div>
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 font-mono text-xs whitespace-nowrap">
                      ${f.isDirectory ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 text-xs whitespace-nowrap">
                      ${formatDate(f.date)}
                    </td>
                    <td class="px-4 py-2.5 text-right whitespace-nowrap">
                      ${f.isDirectory ? '' : `
                        <button class="dl-entry-btn text-brand-600 hover:text-brand-700 font-medium text-xs bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded transition-all"
                                data-name="${escapeHtml(f.name)}">
                          Extract
                        </button>
                      `}
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="4" class="px-4 py-12 text-center text-surface-400 italic bg-surface-50/10">
                      No matching entries found
                    </td>
                  </tr>
                `}
                ${isTruncated ? `
                  <tr>
                    <td colspan="4" class="px-4 py-4 text-center text-surface-500 bg-surface-50/50 border-t border-surface-100">
                      Showing first ${MAX_VISIBLE} of ${filteredFiles.length} entries. Refine your search to find specific files.
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Event Listeners
    const renderEl = helpers.getRenderEl();

    // Search functionality
    const searchInput = renderEl.querySelector('#war-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        helpers.setState('searchTerm', e.target.value);
        renderWarView(helpers);
        // Maintain focus
        const newSearchInput = helpers.getRenderEl().querySelector('#war-search');
        if (newSearchInput) {
          newSearchInput.focus();
          newSearchInput.setSelectionRange(e.target.value.length, e.target.value.length);
        }
      });
    }

    // Copy web.xml
    const copyXmlBtn = renderEl.querySelector('#copy-web-xml');
    if (copyXmlBtn) {
      copyXmlBtn.addEventListener('click', () => {
        helpers.copyToClipboard(webXml, copyXmlBtn);
      });
    }

    // Extraction
    renderEl.querySelectorAll('.dl-entry-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-name');
        const fileObj = allFiles.find(f => f.name === name);
        if (!fileObj) return;

        const originalHtml = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;

        try {
          const blob = await fileObj.entry.async('blob');
          helpers.download(name.split('/').pop(), blob);
        } catch (err) {
          console.error(err);
          helpers.showError('Extraction failed', 'Could not extract ' + name);
        } finally {
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        }
      });
    });
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    switch(ext) {
      case 'xml': return '🧩';
      case 'class': return '☕';
      case 'jar': return '📦';
      case 'properties': return '⚙️';
      case 'jsp': return '📄';
      case 'html': return '🌐';
      case 'js': return '📜';
      case 'css': return '🎨';
      case 'png':
      case 'jpg':
      case 'gif': return '🖼️';
      default: return '📄';
    }
  }

})();
