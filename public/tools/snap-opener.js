/**
 * OmniOpener — Snap Package (SquashFS) Viewer
 * Uses libarchive.js to browse and extract contents of Ubuntu Snap packages.
 */
(function () {
  'use strict';

  // Helper: Escape HTML
  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Helper: Format Size
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.snap',
      
      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.hashHex) h.copyToClipboard(state.hashHex, btn);
          }
        },
        {
          label: '📥 Download Snap',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', () => {
          if (window.Archive) {
            Archive.init({
              workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js'
            });
          }
        });
      },

      onFile: function _onFile(file, content, h) {
        if (!window.Archive) {
          h.showLoading('Initializing engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/libarchive.js', () => {
            if (window.Archive) {
              Archive.init({ workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/dist/worker-bundle.js' });
              _onFile(file, content, h);
            } else {
              h.showError('Engine Load Failed', 'Could not load extraction engine.');
            }
          });
          return;
        }

        analyzeAndRender(file, content, h);
      }
    });

    async function analyzeAndRender(file, content, h) {
      h.showLoading('Analyzing Snap package...');
      
      try {
        const buffer = content;
        
        // Hash computation
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        
        const view = new Uint8Array(buffer);
        const magicStr = String.fromCharCode(...view.slice(0, 4));
        const isSquashFS = (magicStr === 'hsqs' || magicStr === 'sqsh');
        const entropy = calculateEntropy(view);
        const hexDump = generateHexDump(buffer.slice(0, 4096));

        h.setState({
          hashHex,
          isSquashFS,
          entropy,
          hexDump,
          files: []
        });

        if (isSquashFS) {
          try {
            h.showLoading('Reading SquashFS file tree...');
            const blob = new Blob([buffer]);
            const archive = await Archive.open(blob);
            const list = await archive.getFilesArray();
            h.setState('files', list.map(item => ({
              path: item.path,
              size: item.file.size,
              entry: item.file,
              isDir: item.path.endsWith('/') || (item.file.size === 0 && !item.path.includes('.'))
            })));
          } catch (archiveErr) {
            console.warn('Archive open failed:', archiveErr);
          }
        }

        renderUI(h, file);
      } catch (err) {
        h.showError('Analysis Failed', err.message);
      }
    }

    function renderUI(h, file) {
      const state = h.getState();
      const files = state.files || [];
      
      const explorerHtml = files.length > 0 ? `
        <div class="space-y-3">
          <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Package Contents</h4>
          <div class="border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div class="overflow-x-auto max-h-[400px]">
              <table class="min-w-full text-xs text-left">
                <thead class="bg-surface-50 border-b border-surface-200 sticky top-0">
                  <tr>
                    <th class="px-4 py-3 font-bold text-surface-600">File Path</th>
                    <th class="px-4 py-3 font-bold text-surface-600 text-right">Size</th>
                    <th class="px-4 py-3 font-bold text-surface-600 text-right w-24">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${files.slice(0, 1000).map((f, i) => `
                    <tr class="hover:bg-surface-50/80 transition-colors">
                      <td class="px-4 py-2 font-mono text-surface-700 truncate max-w-md" title="${esc(f.path)}">
                        ${f.isDir ? '📁' : '📄'} ${esc(f.path)}
                      </td>
                      <td class="px-4 py-2 text-right text-surface-500 font-mono">${f.isDir ? '-' : formatSize(f.size)}</td>
                      <td class="px-4 py-2 text-right">
                        ${f.isDir ? '' : `<button class="text-brand-600 font-bold hover:underline extract-btn" data-idx="${i}">Extract</button>`}
                      </td>
                    </tr>
                  `).join('')}
                  ${files.length > 1000 ? `<tr><td colspan="3" class="px-4 py-4 text-center text-surface-400 italic bg-surface-50/30">... and ${files.length - 1000} more files</td></tr>` : ''}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : (state.isSquashFS ? `
        <div class="p-8 text-center bg-surface-50 rounded-2xl border border-surface-200">
          <p class="text-surface-600 font-medium italic">Verified SquashFS format, but could not list files.</p>
          <p class="text-xs text-surface-400 mt-2">This Snap may use an advanced compression algorithm (XZ/ZSTD) not supported by the current WASM build.</p>
        </div>
      ` : '');

      h.render(`
        <div class="p-6 space-y-8 animate-in fade-in duration-500">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 shadow-sm">
              <span class="text-[10px] font-black text-surface-400 uppercase tracking-widest">Type</span>
              <p class="text-lg font-bold text-surface-900 mt-1">${state.isSquashFS ? 'SquashFS Image' : 'Binary File'}</p>
            </div>
            <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 shadow-sm">
              <span class="text-[10px] font-black text-surface-400 uppercase tracking-widest">Entropy</span>
              <p class="text-lg font-bold text-surface-900 mt-1">${state.entropy.toFixed(3)} <span class="text-xs font-normal text-surface-500">bits/byte</span></p>
            </div>
            <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 shadow-sm">
              <span class="text-[10px] font-black text-surface-400 uppercase tracking-widest">Fingerprint</span>
              <p class="text-[10px] font-mono break-all text-surface-600 mt-1">${state.hashHex.slice(0, 32)}<br>${state.hashHex.slice(32)}</p>
            </div>
          </div>

          ${explorerHtml}

          <div class="space-y-3">
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Hex Preview (Header)</h4>
            <div class="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
              <pre class="p-5 font-mono text-[10px] leading-tight overflow-x-auto text-surface-800">${state.hexDump}</pre>
            </div>
          </div>
        </div>
      `);

      h.getRenderEl().querySelectorAll('.extract-btn').forEach(btn => {
        btn.onclick = async () => {
          const f = files[parseInt(btn.dataset.idx)];
          h.showLoading(`Extracting ${f.path.split('/').pop()}...`);
          try {
            const blob = await f.entry.extract();
            h.download(f.path.split('/').pop(), blob);
          } catch (e) {
            h.showError('Extraction failed', e.message);
          } finally {
            h.hideLoading();
            renderUI(h, file);
          }
        };
      });
    }

    function calculateEntropy(data) {
      const freq = new Array(256).fill(0);
      for (let i = 0; i < data.length; i++) freq[data[i]]++;
      let entropy = 0;
      for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / data.length;
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
