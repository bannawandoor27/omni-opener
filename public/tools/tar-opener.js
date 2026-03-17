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

  /**
   * Basic TAR parser for POSIX/ustar/GNU formats.
   * Uses subarray() for memory efficiency with large files.
   */
  function parseTar(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = [];
    let offset = 0;
    let nextFileName = null;

    const decoder = new TextDecoder();

    while (offset + 512 <= bytes.length) {
      const header = bytes.subarray(offset, offset + 512);
      
      // End of archive: two null blocks
      if (header[0] === 0) {
        if (offset + 1024 <= bytes.length && bytes[offset + 512] === 0) {
          break;
        }
        offset += 512;
        continue;
      }

      // Read name
      let name = nextFileName || decoder.decode(header.subarray(0, 100)).split('\0')[0];
      nextFileName = null;

      // Read size (12 bytes octal)
      const sizeStr = decoder.decode(header.subarray(124, 136)).split('\0')[0].trim();
      const size = parseInt(sizeStr, 8) || 0;

      // Read type flag
      const type = String.fromCharCode(header[156]);

      // Read mtime (12 bytes octal)
      const mtimeStr = decoder.decode(header.subarray(136, 148)).split('\0')[0].trim();
      const mtime = parseInt(mtimeStr, 8) || 0;

      // Check for ustar prefix
      const magic = decoder.decode(header.subarray(257, 263));
      if (magic.startsWith('ustar')) {
        const prefix = decoder.decode(header.subarray(345, 500)).split('\0')[0];
        if (prefix && !nextFileName) {
          name = prefix + (prefix.endsWith('/') ? '' : '/') + name;
        }
      }

      const contentOffset = offset + 512;
      const data = bytes.subarray(contentOffset, contentOffset + size);

      if (type === 'L') {
        // GNU Long Name extension
        nextFileName = decoder.decode(data).split('\0')[0];
      } else {
        const isDir = type === '5' || name.endsWith('/');
        files.push({
          name: name,
          size: isDir ? 0 : size,
          mtime: mtime ? new Date(mtime * 1000) : null,
          isDir: isDir,
          data: isDir ? null : data
        });
      }

      // Move offset: 512 (header) + size padded to 512-byte blocks
      offset += 512 + Math.ceil(size / 512) * 512;
    }

    return files;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.tar',
      dropLabel: 'Drop a .tar file here',
      binary: true,
      onInit: function(helpers) {
        // No external dependencies required for basic TAR parsing
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Parsing it might slow down your browser. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Parsing tar...');

        try {
          const files = parseTar(content);
          
          let totalUncompressedSize = 0;
          files.forEach(f => {
            if (!f.isDir) totalUncompressedSize += f.size;
          });

          // Sort: directories first, then alphabetically
          files.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          helpers.setState('tarFiles', files);

          renderTar(file, files, totalUncompressedSize, helpers);
        } catch (e) {
          console.error('[TarOpener]', e);
          helpers.showError('Could not parse tar file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function(helpers, btn) {
            const files = helpers.getState().tarFiles;
            if (!files) return;
            const list = files.map(f => (f.isDir ? '📁 ' : '📄 ') + f.name).join('\n');
            helpers.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download File List',
          id: 'dl-list',
          onClick: function(helpers) {
            const files = helpers.getState().tarFiles;
            if (!files) return;
            const list = files.map(f => `${f.isDir ? '[DIR] ' : '[FILE]'} ${f.name} (${formatSize(f.size)})`).join('\n');
            helpers.download('file-list.txt', list, 'text/plain');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });
  };

  function renderTar(file, files, totalSize, helpers) {
    const fileCount = files.length;
    
    let html = `
      <div class="p-4">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${fileCount.toLocaleString()} items</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(totalSize)} uncompressed</span>
        </div>

        <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left border-collapse">
              <thead class="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-3 font-semibold text-surface-700">Path</th>
                  <th class="px-4 py-3 font-semibold text-surface-700 w-24 text-right">Size</th>
                  <th class="px-4 py-3 font-semibold text-surface-700 w-40 text-right">Modified</th>
                  <th class="px-4 py-3 font-semibold text-surface-700 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${files.length === 0 ? `
                  <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-surface-400 italic">No files found in archive</td>
                  </tr>
                ` : files.map((f, i) => `
                  <tr class="hover:bg-surface-50 transition-colors">
                    <td class="px-4 py-2 font-mono text-xs text-surface-600 truncate max-w-md" title="${escapeHtml(f.name)}">
                      ${f.isDir ? '📁' : '📄'} ${escapeHtml(f.name)}
                    </td>
                    <td class="px-4 py-2 text-surface-500 whitespace-nowrap text-xs text-right">
                      ${f.isDir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2 text-surface-500 whitespace-nowrap text-xs text-right">
                      ${f.mtime ? f.mtime.toLocaleString() : '-'}
                    </td>
                    <td class="px-4 py-2 text-right">
                      ${f.isDir ? '' : `
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
      </div>
    `;

    helpers.render(html);

    // Bind individual file download buttons
    helpers.getRenderEl().querySelectorAll('.dl-entry-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.dataset.idx);
        const entry = files[idx];
        if (!entry || !entry.data) return;

        const blob = new Blob([entry.data], { type: 'application/octet-stream' });
        const parts = entry.name.split('/');
        const filename = parts[parts.length - 1] || 'file';
        helpers.download(filename, blob);
      });
    });
  }
})();
