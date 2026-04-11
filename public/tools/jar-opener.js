/**
 * OmniOpener — JAR Opener Tool
 * Uses OmniTool SDK. Lists and extracts contents of JAR/ZIP files in the browser.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
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
            const zip = h.getState().zip;
            if (!zip) return;
            const list = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort().join('\n');
            h.copyToClipboard(list, btn);
          }
        },
        {
          label: '📥 Download List',
          id: 'download-list',
          onClick: function (h) {
            const zip = h.getState().zip;
            if (!zip) return;
            const list = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort().join('\n');
            h.download('file-list.txt', list);
          }
        }
      ],

      onInit: function (h) {
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Reading archive contents…');
        
        // Wait for JSZip to be available (loaded via onInit)
        const process = () => {
          if (typeof JSZip !== 'undefined') {
            JSZip.loadAsync(content).then(function (zip) {
              h.setState('zip', zip);
              renderFileList(zip, h);
            }).catch(function (err) {
              h.showError('Failed to read archive', err.message);
            });
          } else {
            setTimeout(process, 100);
          }
        };
        process();
      }
    });
  };

  function renderFileList(zip, h) {
    let html = `
      <div class="p-4">
        <div class="overflow-x-auto border border-surface-200 rounded-lg">
          <table class="w-full text-left border-collapse min-w-[500px]">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200 text-surface-500 text-xs uppercase tracking-wider">
                <th class="py-3 px-4 font-semibold">File Path</th>
                <th class="py-3 px-4 font-semibold text-right">Size</th>
                <th class="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody class="text-sm divide-y divide-surface-100">
    `;

    const fileNames = Object.keys(zip.files).filter(p => !zip.files[p].dir).sort();
    
    if (fileNames.length === 0) {
      html += `<tr><td colspan="3" class="py-12 text-center text-surface-400 italic">No files found in this archive.</td></tr>`;
    } else {
      fileNames.forEach(function (path) {
        const file = zip.files[path];
        // uncompressedSize is often available in the internal _data or can be checked via metadata
        const size = formatSize(file._data ? file._data.uncompressedSize : 0);
        html += `
          <tr class="hover:bg-surface-50 transition-colors">
            <td class="py-2.5 px-4 font-mono text-xs break-all" title="${esc(path)}">${esc(path)}</td>
            <td class="py-2.5 px-4 text-right text-surface-400 font-mono text-xs whitespace-nowrap">${size}</td>
            <td class="py-2.5 px-4 text-right">
              <button class="dl-btn text-brand-600 hover:text-brand-700 font-medium text-xs bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded transition-colors" data-path="${esc(path)}">
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
    `;

    h.render(html);

    // Bind download buttons
    h.getRenderEl().querySelectorAll('.dl-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const path = btn.dataset.path;
        const file = zip.files[path];
        const originalText = btn.textContent;
        
        btn.textContent = 'Preparing…';
        btn.disabled = true;

        file.async('blob').then(function (blob) {
          h.download(path.split('/').pop(), blob);
          btn.textContent = originalText;
          btn.disabled = false;
        }).catch(function(err) {
          console.error(err);
          btn.textContent = 'Error';
          btn.classList.remove('bg-brand-50', 'text-brand-600');
          btn.classList.add('bg-red-50', 'text-red-600');
        });
      });
    });
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
