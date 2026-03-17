(function() {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.zip,.jar,.apk,.ipa,.war,.ear,.whl,.nupkg,.crate',
      dropLabel: 'Drop a .zip file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Processing it might slow down your browser. Continue?')) {
            helpers.reset();
            return;
          }
        }

        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Loading ZIP engine...');
          setTimeout(() => helpers.onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Extracting ZIP contents...');

        JSZip.loadAsync(content)
          .then(function(zip) {
            const files = [];
            let totalUncompressedSize = 0;
            let metadata = null;

            zip.forEach(function(relativePath, zipEntry) {
              files.push({
                name: zipEntry.name,
                size: zipEntry._data.uncompressedSize || 0,
                date: zipEntry.date,
                dir: zipEntry.dir,
                entry: zipEntry
              });
              totalUncompressedSize += (zipEntry._data.uncompressedSize || 0);

              // Look for metadata files
              const lowerName = zipEntry.name.toLowerCase();
              if (lowerName.endsWith('manifest.mf') || 
                  lowerName.endsWith('androidmanifest.xml') || 
                  lowerName.endsWith('pkg-info') ||
                  lowerName.endsWith('package.json')) {
                metadata = zipEntry;
              }
            });

            // Sort files: directories first, then alphabetical
            files.sort((a, b) => {
              if (a.dir !== b.dir) return a.dir ? -1 : 1;
              return a.name.localeCompare(b.name);
            });

            helpers.setState('zipFiles', files);
            helpers.setState('zipInstance', zip);

            renderZipContent(file, files, totalUncompressedSize, metadata, helpers);
          })
          .catch(function(e) {
            helpers.showError('Could not parse zip file', e.message);
          });
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
            const list = files.map(f => `${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.download('file-list.txt', list, 'text/plain');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });
  };

  function renderZipContent(file, files, totalSize, metadataEntry, helpers) {
    const fileCount = files.length;
    
    let html = `
      <div class="p-4">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${fileCount.toLocaleString()} files</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(totalSize)} uncompressed</span>
        </div>

        <div id="metadata-preview" class="hidden mb-4 p-4 bg-brand-50 border border-brand-100 rounded-xl">
           <h3 class="text-brand-900 font-semibold text-sm mb-2 flex items-center gap-2">
             <span>📦 Package Metadata</span>
             <span id="metadata-filename" class="text-xs font-normal opacity-70"></span>
           </h3>
           <pre id="metadata-content" class="text-xs text-brand-800 overflow-auto max-h-40 whitespace-pre-wrap font-mono"></pre>
        </div>

        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
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
                  <td class="px-4 py-2 font-mono text-xs text-surface-600 truncate max-w-md" title="${escapeHtml(f.name)}">
                    ${f.dir ? '📁' : '📄'} ${escapeHtml(f.name)}
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
                        class="dl-entry-btn text-brand-600 hover:text-brand-700 font-medium text-xs" 
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
    `;

    helpers.render(html);

    // Handle metadata if found
    if (metadataEntry) {
      const metadataEl = document.getElementById('metadata-preview');
      const contentEl = document.getElementById('metadata-content');
      const nameEl = document.getElementById('metadata-filename');
      
      nameEl.textContent = metadataEntry.name;
      metadataEntry.async('string').then(text => {
        if (text.trim()) {
           metadataEl.classList.remove('hidden');
           contentEl.textContent = text.slice(0, 5000) + (text.length > 5000 ? '\n... (truncated)' : '');
        }
      }).catch(() => {});
    }

    // Bind download buttons
    helpers.getRenderEl().querySelectorAll('.dl-entry-btn').forEach(btn => {
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
