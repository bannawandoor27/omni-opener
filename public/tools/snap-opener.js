(function () {
  'use strict';

  /**
   * OmniOpener — Snap Package (SquashFS) Viewer
   * Production-grade browser-based explorer for Ubuntu .snap packages.
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

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let archiveEngineReady = false;
    let currentFiles = [];
    let filterQuery = '';

    const tool = OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.snap',
      
      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.hashHex) {
              h.copyToClipboard(state.hashHex, btn);
            }
          }
        },
        {
          label: '📥 Download Snap',
          id: 'download-raw',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.showLoading('Initializing engine...');
        h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', () => {
          if (window.Archive) {
            Archive.init({
              workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
            });
            archiveEngineReady = true;
            h.hideLoading();
          } else {
            h.showError('Engine Error', 'Could not load libarchive.js. Please check your connection.');
          }
        });
      },

      onFile: function _onFile(file, content, h) {
        if (!archiveEngineReady) {
          setTimeout(function() { _onFile(file, content, h); }, 200);
          return;
        }
        processSnap(file, content, h);
      },

      onDestroy: function () {
        currentFiles = [];
        // LibArchive workers are managed by the library global, 
        // but we clear our local references.
      }
    });

    async function processSnap(file, content, h) {
      h.showLoading('Analyzing Snap architecture...');
      
      try {
        const buffer = content;
        
        // Fingerprinting
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        
        const view = new Uint8Array(buffer);
        const magic = String.fromCharCode(...view.slice(0, 4));
        const isSquashFS = (magic === 'hsqs' || magic === 'sqsh');
        
        const entropy = calculateEntropy(view);
        const hexDump = generateHexDump(buffer.slice(0, 2048));

        currentFiles = [];
        filterQuery = '';

        if (isSquashFS) {
          h.showLoading('Extracting file tree...');
          try {
            const blob = new Blob([buffer]);
            const archive = await Archive.open(blob);
            const list = await archive.getFilesArray();
            currentFiles = list.map(item => ({
              path: item.path,
              size: item.file.size,
              entry: item.file,
              isDir: item.path.endsWith('/') || (item.file.size === 0 && !item.path.includes('.'))
            }));
          } catch (e) {
            console.error('Extraction error:', e);
          }
        }

        h.setState({
          hashHex,
          isSquashFS,
          entropy,
          hexDump,
          fileSize: file.size,
          fileName: file.name
        });

        renderMainUI(h);
      } catch (err) {
        h.showError('Snap Analysis Failed', 'The file could not be parsed as a valid Snap package. ' + err.message);
      } finally {
        h.hideLoading();
      }
    }

    function renderMainUI(h) {
      const state = h.getState();
      const filtered = filterQuery 
        ? currentFiles.filter(f => f.path.toLowerCase().includes(filterQuery.toLowerCase()))
        : currentFiles;

      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(state.fileSize)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.snap package</span>
          ${state.isSquashFS ? '<span class="ml-auto px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase">SquashFS Verified</span>' : ''}
        </div>
      `;

      const statsCards = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Compression Entropy</h3>
            <div class="flex items-end gap-2">
              <span class="text-2xl font-bold text-surface-900">${state.entropy.toFixed(3)}</span>
              <span class="text-xs text-surface-500 mb-1">bits/byte</span>
            </div>
            <div class="mt-2 w-full bg-surface-100 h-1.5 rounded-full overflow-hidden">
              <div class="bg-brand-500 h-full" style="width: ${(state.entropy / 8) * 100}%"></div>
            </div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">SHA-256 Fingerprint</h3>
            <div class="font-mono text-[10px] text-surface-600 break-all leading-relaxed">
              ${state.hashHex.slice(0, 32)}<br>${state.hashHex.slice(32)}
            </div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Package Info</h3>
            <div class="text-sm text-surface-700">
              <div class="flex justify-between py-0.5">
                <span class="text-surface-500">Files:</span>
                <span class="font-semibold">${currentFiles.length}</span>
              </div>
              <div class="flex justify-between py-0.5">
                <span class="text-surface-500">Format:</span>
                <span class="font-semibold">${state.isSquashFS ? 'SquashFS' : 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const explorer = `
        <div class="mb-8">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h3 class="font-semibold text-surface-800">Archive Explorer</h3>
              <p class="text-xs text-surface-500">Browse and extract contents from the Snap image</p>
            </div>
            <div class="relative">
              <input type="text" id="snap-search" placeholder="Search files..." 
                class="w-full sm:w-64 pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                value="${esc(filterQuery)}">
              <div class="absolute left-3 top-2.5 text-surface-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/50">
                  <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name / Path</th>
                  <th class="sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                  <th class="sticky top-0 px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200 w-24">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${filtered.length === 0 ? `
                  <tr>
                    <td colspan="3" class="px-4 py-12 text-center text-surface-400 italic">
                      ${currentFiles.length === 0 ? 'No files found in this archive.' : 'No files match your search.'}
                    </td>
                  </tr>
                ` : filtered.slice(0, 500).map((f, i) => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700 break-all font-mono text-xs">
                      <span class="inline-block mr-2 text-lg leading-none">${f.isDir ? '📁' : '📄'}</span>
                      ${esc(f.path)}
                    </td>
                    <td class="px-4 py-2.5 text-right text-surface-500 font-mono text-xs">
                      ${f.isDir ? '-' : formatSize(f.size)}
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      ${f.isDir ? '' : `
                        <button class="extract-file-btn text-brand-600 font-semibold hover:text-brand-700 hover:underline disabled:opacity-30" 
                          data-idx="${currentFiles.indexOf(f)}">Extract</button>
                      `}
                    </td>
                  </tr>
                `).join('')}
                ${filtered.length > 500 ? `
                  <tr>
                    <td colspan="3" class="px-4 py-4 text-center text-surface-400 text-xs bg-surface-50/50">
                      Showing first 500 of ${filtered.length} files. Use search to find specific entries.
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const hexSection = `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Binary Header Preview</h3>
            <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">First 2KB</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-4 text-[10px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed selection:bg-brand-500/30">${state.hexDump}</pre>
          </div>
        </div>
      `;

      h.render(`
        <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
          ${infoBar}
          ${statsCards}
          ${explorer}
          ${hexSection}
        </div>
      `);

      const el = h.getRenderEl();
      
      const searchInput = el.querySelector('#snap-search');
      if (searchInput) {
        searchInput.oninput = (e) => {
          filterQuery = e.target.value;
          renderMainUI(h);
          // Maintain focus
          const newSearch = h.getRenderEl().querySelector('#snap-search');
          if (newSearch) {
            newSearch.focus();
            newSearch.setSelectionRange(filterQuery.length, filterQuery.length);
          }
        };
      }

      el.querySelectorAll('.extract-file-btn').forEach(btn => {
        btn.onclick = async () => {
          const idx = parseInt(btn.dataset.idx);
          const f = currentFiles[idx];
          if (!f) return;

          btn.disabled = true;
          const originalText = btn.innerText;
          btn.innerText = '...';
          
          h.showLoading(`Extracting ${f.path.split('/').pop()}...`);
          try {
            const blob = await f.entry.extract();
            h.download(f.path.split('/').pop() || 'extracted-file', blob);
          } catch (err) {
            h.showError('Extraction Failed', 'Could not extract this file. ' + err.message);
          } finally {
            h.hideLoading();
            btn.disabled = false;
            btn.innerText = originalText;
          }
        };
      });
    }

    function calculateEntropy(data) {
      const freq = new Uint32Array(256);
      for (let i = 0; i < data.length; i++) freq[data[i]]++;
      let entropy = 0;
      const len = data.length;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / len;
          entropy -= p * Math.log2(p);
        }
      }
      return entropy;
    }

    function generateHexDump(buffer) {
      const bytes = new Uint8Array(buffer);
      let out = '';
      for (let i = 0; i < bytes.length; i += 16) {
        let line = i.toString(16).padStart(8, '0') + '  ';
        let ascii = '';
        for (let j = 0; j < 16; j++) {
          if (i + j < bytes.length) {
            const b = bytes[i + j];
            line += b.toString(16).padStart(2, '0') + ' ';
            ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            line += '   ';
          }
          if (j === 7) line += ' ';
        }
        out += line + ' |' + ascii + '|\n';
      }
      return out;
    }
  };
})();
