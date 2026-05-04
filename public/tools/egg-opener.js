/**
 * OmniOpener — Python Egg Opener
 * Browser-based viewer and extractor for .egg files (ZIP archives).
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.egg',
      infoHtml: '<strong>Note:</strong> Python .egg files are specialized ZIP archives. This tool allows you to browse and extract their contents entirely in your browser.',

      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: async function (h, btn) {
            const content = h.getContent();
            const hashBuffer = await crypto.subtle.digest('SHA-256', content);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            h.copyToClipboard(hashHex, btn);
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

      onFile: async function (file, content, h) {
        h.showLoading('Reading Egg archive...');

        try {
          // Wait for JSZip if it's still loading
          if (typeof JSZip === 'undefined') {
            await new Promise(resolve => {
              const check = setInterval(() => {
                if (typeof JSZip !== 'undefined') {
                  clearInterval(check);
                  resolve();
                }
              }, 50);
            });
          }

          const zip = new JSZip();
          const zipContent = await zip.loadAsync(content);
          
          const files = [];
          zipContent.forEach((relativePath, zipEntry) => {
            files.push({
              name: relativePath,
              size: zipEntry._data.uncompressedSize,
              dir: zipEntry.dir,
              date: zipEntry.date
            });
          });

          // Sort: Directories first, then alphabetical
          files.sort((a, b) => {
            if (a.dir !== b.dir) return a.dir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          renderFileList(file, files, h, zipContent);
        } catch (err) {
          h.showError('Failed to open Egg file', 'Ensure this is a valid Python Egg (ZIP-formatted) archive. ' + err.message);
        }
      }
    });
  };

  function renderFileList(file, files, h, zipContent) {
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    
    let html = `
      <div class="p-6 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-200 pb-4">
          <div>
            <h3 class="text-xl font-bold text-surface-900">${esc(file.name)}</h3>
            <p class="text-sm text-surface-500">${files.length} items • ${formatSize(totalSize)} uncompressed</p>
          </div>
        </div>

        <div class="overflow-x-auto border border-surface-200 rounded-xl">
          <table class="w-full text-left border-collapse text-sm">
            <thead class="bg-surface-50 text-surface-600 font-medium border-b border-surface-200">
              <tr>
                <th class="px-4 py-2">Name</th>
                <th class="px-4 py-2 text-right">Size</th>
                <th class="px-4 py-2 text-right">Modified</th>
                <th class="px-4 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
    `;

    files.forEach((f, idx) => {
      const icon = f.dir ? '📁' : getFileIcon(f.name);
      html += `
        <tr class="hover:bg-surface-50 transition-colors">
          <td class="px-4 py-2 truncate max-w-md font-mono text-xs">
            <span class="mr-2">${icon}</span>${esc(f.name)}
          </td>
          <td class="px-4 py-2 text-right text-surface-500">${f.dir ? '-' : formatSize(f.size)}</td>
          <td class="px-4 py-2 text-right text-surface-500">${f.date.toLocaleDateString()}</td>
          <td class="px-4 py-2 text-center">
            ${f.dir ? '' : `<button class="dl-entry-btn text-brand-600 hover:text-brand-700 font-medium" data-name="${esc(f.name)}">Download</button>`}
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    h.render(html);

    // Bind individual download buttons
    h.getRenderEl().querySelectorAll('.dl-entry-btn').forEach(btn => {
      btn.onclick = async function() {
        const name = this.getAttribute('data-name');
        const originalText = this.innerText;
        this.innerText = '...';
        try {
          const blob = await zipContent.file(name).async('blob');
          h.download(name.split('/').pop(), blob);
        } catch (e) {
          alert('Failed to extract file: ' + e.message);
        } finally {
          this.innerText = originalText;
        }
      };
    });
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['py', 'pyc', 'pyo'].includes(ext)) return '🐍';
    if (['txt', 'md', 'rst'].includes(ext)) return '📄';
    if (['json', 'yaml', 'yml', 'xml'].includes(ext)) return '⚙️';
    return '📄';
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

})();
