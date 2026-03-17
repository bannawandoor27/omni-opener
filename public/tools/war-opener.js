(function() {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(date) {
    if (!date) return '-';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.war',
      dropLabel: 'Drop a .war file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This WAR file is large (' + formatSize(file.size) + '). Processing may take a moment. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Parsing WAR archive...');

        if (typeof JSZip === 'undefined') {
          setTimeout(() => helpers.onFile(file, content, helpers), 500);
          return;
        }

        JSZip.loadAsync(content).then(async function(zip) {
          const files = [];
          let totalUncompressedSize = 0;
          let webXmlContent = null;

          // Collect file info
          zip.forEach(function(relativePath, zipEntry) {
            files.push({
              name: relativePath,
              size: zipEntry._data.uncompressedSize || 0,
              date: zipEntry.date,
              isDirectory: zipEntry.dir,
              entry: zipEntry
            });
            if (!zipEntry.dir) {
              totalUncompressedSize += (zipEntry._data.uncompressedSize || 0);
            }
          });

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

          helpers.setState('zipFiles', files);
          helpers.setState('zipTotalSize', totalUncompressedSize);

          renderWarView(file, files, totalUncompressedSize, webXmlContent, helpers);
        }).catch(function(err) {
          helpers.showError('Could not parse WAR file', err.message);
        });
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const files = helpers.getState().zipFiles;
            if (!files) return;
            const text = files.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download List',
          id: 'dl-list',
          onClick: function(helpers) {
            const files = helpers.getState().zipFiles;
            if (!files) return;
            const text = files.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.download(helpers.getFile().name + '-files.txt', text);
          }
        }
      ],
      infoHtml: '<strong>WAR Explorer:</strong> Inspect Java Web Archive contents, view deployment descriptors, and extract files. 100% client-side.'
    });
  };

  function renderWarView(file, files, totalSize, webXml, helpers) {
    let html = `
      <div class="p-6">
        <!-- File Info Bar -->
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
          <span class="text-xl">📦</span>
          <span class="font-medium truncate">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)} (Compressed)</span>
          <span class="text-surface-400">·</span>
          <span>${files.length} items</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <!-- Summary Card -->
          <div class="bg-white border border-surface-200 rounded-xl p-4 shadow-sm">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Archive Summary</h3>
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-sm text-surface-500">Uncompressed Size</span>
                <span class="text-sm font-semibold text-surface-700">${formatSize(totalSize)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-surface-500">Files</span>
                <span class="text-sm font-semibold text-surface-700">${files.filter(f => !f.isDirectory).length}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-sm text-surface-500">Folders</span>
                <span class="text-sm font-semibold text-surface-700">${files.filter(f => f.isDirectory).length}</span>
              </div>
            </div>
          </div>

          <!-- Web Metadata -->
          <div class="lg:col-span-2 bg-white border border-surface-200 rounded-xl p-4 shadow-sm">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Web Deployment Descriptor</h3>
            ${webXml ? `
              <div class="relative group">
                <pre id="web-xml-content" class="text-[11px] font-mono bg-surface-900 text-surface-100 p-3 rounded-lg overflow-auto max-h-48 leading-relaxed">${escapeHtml(webXml)}</pre>
                <button id="copy-web-xml" class="absolute top-2 right-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-white text-[10px] transition-colors">Copy web.xml</button>
              </div>
            ` : `
              <div class="flex items-center justify-center h-32 bg-surface-50 rounded-lg border border-dashed border-surface-200">
                <span class="text-sm text-surface-400 italic">WEB-INF/web.xml not found</span>
              </div>
            `}
          </div>
        </div>

        <!-- File List -->
        <div class="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left border-collapse">
              <thead>
                <tr class="bg-surface-50 border-b border-surface-200">
                  <th class="px-4 py-3 font-bold text-surface-700">Path</th>
                  <th class="px-4 py-3 font-bold text-surface-700 w-32">Size</th>
                  <th class="px-4 py-3 font-bold text-surface-700 w-48">Modified</th>
                  <th class="px-4 py-3 font-bold text-surface-700 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${files.map((f, i) => `
                  <tr class="hover:bg-surface-50 transition-colors">
                    <td class="px-4 py-2.5 truncate max-w-md">
                      <span class="mr-2">${f.isDirectory ? '📁' : '📄'}</span>
                      <span class="${f.isDirectory ? 'font-medium text-brand-600' : 'text-surface-600'}">${escapeHtml(f.name)}</span>
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 font-mono text-xs">
                      ${f.isDirectory ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-surface-500 text-xs">
                      ${formatDate(f.date)}
                    </td>
                    <td class="px-4 py-2.5 text-right">
                      ${f.isDirectory ? '' : `
                        <button class="dl-file-btn text-brand-600 hover:text-brand-700 font-medium text-xs underline decoration-brand-200 hover:decoration-brand-500 underline-offset-4 transition-all"
                                data-index="${i}">
                          Download
                        </button>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Attach web.xml copy event
    const copyBtn = document.getElementById('copy-web-xml');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        helpers.copyToClipboard(webXml, copyBtn);
      });
    }

    // Attach download events
    const renderEl = helpers.getRenderEl();
    renderEl.querySelectorAll('.dl-file-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.getAttribute('data-index'));
        const fileObj = files[idx];
        if (!fileObj) return;

        const originalText = this.textContent;
        this.textContent = '...';
        this.disabled = true;

        fileObj.entry.async('blob').then(blob => {
          helpers.download(fileObj.name.split('/').pop(), blob);
          this.textContent = originalText;
          this.disabled = false;
        }).catch(err => {
          console.error(err);
          this.textContent = 'Error';
          this.disabled = false;
        });
      });
    });
  }
})();
