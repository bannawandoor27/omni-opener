/**
 * OmniOpener — JAR Opener Tool
 * A PRODUCTION-PERFECT browser-based JAR/ZIP explorer.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentZip = null;
    let currentFile = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.jar,.zip,.war,.ear',
      binary: true,
      dropLabel: 'Drop a JAR or ZIP file here',
      infoHtml: '<strong>Privacy:</strong> Your files are processed entirely in your browser using JSZip. No data is uploaded to any server.',

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            if (!currentZip) return;
            const list = Object.keys(currentZip.files)
              .filter(p => !currentZip.files[p].dir)
              .sort()
              .join('\n');
            h.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download List',
          id: 'download-list',
          onClick: function (h) {
            if (!currentZip) return;
            const list = Object.keys(currentZip.files)
              .filter(p => !currentZip.files[p].dir)
              .sort()
              .join('\n');
            h.download(`${currentFile.name.replace(/\.[^/.]+$/, "")}-files.txt`, list);
          }
        }
      ],

      onInit: function (h) {
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
      },

      onFile: function _onFile(file, content, h) {
        currentFile = file;
        h.showLoading('Extracting archive metadata...');

        const processArchive = async () => {
          try {
            // B1: Race condition check for CDN
            if (typeof JSZip === 'undefined') {
              setTimeout(processArchive, 100);
              return;
            }

            const zip = await JSZip.loadAsync(content);
            currentZip = zip;
            renderUI(zip, file, h);
          } catch (err) {
            h.showError('Could not open archive', 'The file may be corrupted or is not a valid ZIP/JAR format. Error: ' + err.message);
          }
        };

        processArchive();
      },

      onDestroy: function() {
        currentZip = null;
        currentFile = null;
      }
    });

    function renderUI(zip, file, h) {
      const fileEntries = Object.keys(zip.files)
        .map(name => ({
          name,
          dir: zip.files[name].dir,
          // Extract size from JSZip internals safely
          size: zip.files[name]._data ? zip.files[name]._data.uncompressedSize : 0
        }))
        .filter(f => !f.dir)
        .sort((a, b) => a.name.localeCompare(b.name));

      const totalFiles = fileEntries.length;
      const formattedMainSize = formatSize(file.size);

      let html = `
        <div class="flex flex-col h-full">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formattedMainSize}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">Archive Container</span>
          </div>

          <!-- Search and Header -->
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
            <div>
              <h3 class="font-bold text-surface-900 text-lg">Archive Contents</h3>
              <p class="text-xs text-surface-500">${totalFiles} searchable entries found</p>
            </div>
            
            <div class="relative w-full md:w-64">
              <input type="text" id="archive-search" placeholder="Search files..." 
                class="w-full px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
              <span class="absolute right-3 top-2.5 text-surface-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </span>
            </div>
          </div>

          <!-- U7: Table Wrapper -->
          <div class="flex-grow overflow-hidden rounded-xl border border-surface-200 bg-white">
            <div class="overflow-x-auto h-full overflow-y-auto">
              <table class="min-w-full text-sm border-separate border-spacing-0" id="files-table">
                <thead class="sticky top-0 z-10">
                  <tr class="bg-surface-50/95 backdrop-blur shadow-sm">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">File Path</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                    <th class="px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-32">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
      `;

      if (totalFiles === 0) {
        html += `
          <tr>
            <td colspan="3" class="px-4 py-20 text-center">
              <div class="text-surface-400 italic mb-2">This archive appears to be empty</div>
              <p class="text-xs text-surface-300">No files were found in the provided JAR/ZIP container.</p>
            </td>
          </tr>
        `;
      } else {
        fileEntries.forEach((entry, idx) => {
          html += `
            <tr class="entry-row hover:bg-brand-50/50 transition-colors group" data-name="${esc(entry.name.toLowerCase())}">
              <td class="px-4 py-2.5 text-surface-700 font-mono text-xs break-all">
                <div class="flex items-center gap-2">
                  <svg class="text-surface-400 shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                  ${esc(entry.name)}
                </div>
              </td>
              <td class="px-4 py-2.5 text-right text-surface-500 font-mono text-xs">${formatSize(entry.size)}</td>
              <td class="px-4 py-2.5 text-center">
                <button class="dl-btn text-brand-600 hover:text-brand-700 font-semibold text-xs bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-all border border-brand-100 group-hover:border-brand-200" data-path="${esc(entry.name)}">
                  Download
                </button>
              </td>
            </tr>
          `;
        });
      }

      html += `
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      // Add functionality
      const renderEl = h.getRenderEl();
      
      // Live Search Filter
      const searchInput = renderEl.querySelector('#archive-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase();
          const rows = renderEl.querySelectorAll('.entry-row');
          rows.forEach(row => {
            const name = row.dataset.name;
            row.style.display = name.includes(term) ? '' : 'none';
          });
        });
      }

      // Download buttons
      renderEl.querySelectorAll('.dl-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const path = btn.dataset.path;
          const fileName = path.split('/').pop();
          const originalContent = btn.innerHTML;
          
          try {
            btn.innerHTML = '<span class="flex items-center gap-1"><svg class="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>...</span>';
            btn.disabled = true;

            const blob = await zip.file(path).async('blob');
            h.download(fileName, blob);
            
            btn.innerHTML = 'Success!';
            btn.classList.replace('text-brand-600', 'text-green-600');
            btn.classList.replace('bg-brand-50', 'bg-green-50');
            setTimeout(() => {
              btn.innerHTML = originalContent;
              btn.classList.replace('text-green-600', 'text-brand-600');
              btn.classList.replace('bg-green-50', 'bg-brand-50');
              btn.disabled = false;
            }, 2000);
          } catch (err) {
            console.error(err);
            btn.innerHTML = 'Error';
            btn.classList.replace('text-brand-600', 'text-red-600');
            btn.classList.replace('bg-brand-50', 'bg-red-50');
            setTimeout(() => {
              btn.innerHTML = originalContent;
              btn.classList.replace('text-red-600', 'text-brand-600');
              btn.classList.replace('bg-red-50', 'bg-brand-50');
              btn.disabled = false;
            }, 2000);
          }
        });
      });
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      if (!bytes) return '-';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return str.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
  };
})();
