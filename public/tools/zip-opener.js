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
      infoHtml: '<strong>Privacy:</strong> Everything is processed locally in your browser. No files are uploaded to any server. Supports ZIP, JAR, APK, and other archive formats.'
    });
  };

  function processZip(file, content, helpers) {
    helpers.showLoading('Extracting ZIP metadata...');

    JSZip.loadAsync(content)
      .then(function(zip) {
        const files = [];
        let totalUncompressedSize = 0;
        let metadata = null;

        zip.forEach(function(relativePath, zipEntry) {
          // Internal property access for size to avoid async overhead during list rendering
          const size = zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0;
          files.push({
            name: zipEntry.name,
            size: size,
            date: zipEntry.date,
            dir: zipEntry.dir,
            entry: zipEntry
          });
          totalUncompressedSize += size;

          const lowerName = zipEntry.name.toLowerCase();
          if (lowerName.endsWith('manifest.mf') || 
              lowerName.endsWith('androidmanifest.xml') || 
              lowerName.endsWith('package.json')) {
            metadata = zipEntry;
          }
        });

        files.sort((a, b) => {
          if (a.dir !== b.dir) return a.dir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        helpers.setState('zipFiles', files);
        helpers.setState('zipInstance', zip);

        renderZip(file, files, totalUncompressedSize, metadata, helpers);
      })
      .catch(function(e) {
        helpers.showError('Could not parse ZIP file', e.message);
      });
  }

  function renderZip(file, files, totalSize, metadataEntry, helpers) {
    const html = `
      <div class="p-4">
        <div class="flex flex-wrap items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
          <span class="font-medium truncate max-w-xs">${esc(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${files.length.toLocaleString()} items</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(totalSize)} uncompressed</span>
        </div>

        <div id="metadata-box" class="hidden mb-4 p-4 bg-brand-50 border border-brand-100 rounded-xl">
           <h3 class="text-brand-900 font-semibold text-sm mb-2 flex items-center gap-2">
             <span>📦 Package Metadata</span>
             <span id="metadata-title" class="text-xs font-normal opacity-70"></span>
           </h3>
           <pre id="metadata-pre" class="text-xs text-brand-800 overflow-auto max-h-40 whitespace-pre-wrap font-mono"></pre>
        </div>

        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left border-collapse">
              <thead class="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-3 font-semibold text-surface-700">Path</th>
                  <th class="px-4 py-3 font-semibold text-surface-700 w-24">Size</th>
                  <th class="px-4 py-3 font-semibold text-surface-700 w-40">Modified</th>
                  <th class="px-4 py-3 font-semibold text-surface-700 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${files.map((f, i) => `
                  <tr class="hover:bg-surface-50 transition-colors">
                    <td class="px-4 py-2 font-mono text-xs text-surface-600 truncate max-w-md" title="${esc(f.name)}">
                      ${f.dir ? '📁' : '📄'} ${esc(f.name)}
                    </td>
                    <td class="px-4 py-2 text-surface-500 whitespace-nowrap text-xs">
                      ${f.dir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2 text-surface-500 whitespace-nowrap text-xs">
                      ${f.date ? f.date.toLocaleString() : '-'}
                    </td>
                    <td class="px-4 py-2 text-right">
                      ${f.dir ? '' : `
                        <button 
                          class="dl-btn text-brand-600 hover:text-brand-700 font-medium text-xs px-2 py-1 rounded hover:bg-brand-50" 
                          data-idx="${i}"
                        >
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

    if (metadataEntry) {
      metadataEntry.async('string').then(text => {
        if (text.trim()) {
           const box = document.getElementById('metadata-box');
           const pre = document.getElementById('metadata-pre');
           const title = document.getElementById('metadata-title');
           if (box && pre && title) {
             box.classList.remove('hidden');
             title.textContent = metadataEntry.name;
             pre.textContent = text.slice(0, 5000) + (text.length > 5000 ? '\n... (truncated)' : '');
           }
        }
      }).catch(() => {});
    }

    helpers.getRenderEl().querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        const entry = files[idx];
        const originalText = this.textContent;
        
        this.textContent = '...';
        this.disabled = true;

        entry.entry.async('blob').then(blob => {
          const parts = entry.name.split('/');
          const filename = parts[parts.length - 1] || 'file';
          helpers.download(filename, blob);
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
