(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.msi,.msp,.msm',
      dropLabel: 'Drop a Windows Installer (.msi) file here',
      infoHtml: '<strong>MSI Inspector:</strong> Professional Windows Installer analyzer. Extracts stream information, verifies CFBF structure, and provides binary insights.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js');
      },

      onFile: async function (file, content, h) {
        if (typeof CFB === 'undefined') {
          h.showLoading('Loading MSI engine...');
          setTimeout(() => h.onFile(file, content, h), 200);
          return;
        }

        h.showLoading('Parsing MSI package...');

        try {
          const cfb = CFB.read(new Uint8Array(content), { type: 'array' });
          const hashHex = await computeHash(content);
          
          h.setState({ 
            cfb: cfb, 
            hashHex: hashHex,
            fileName: file.name,
            fileSize: file.size
          });

          renderApp(h);
        } catch (err) {
          h.showError('MSI Parse Error', 'This file might be corrupted or not a valid MSI/CFBF container. ' + err.message);
        }
      },

      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().hashHex;
            if (hash) h.copyToClipboard(hash, btn);
          }
        },
        {
          label: '📥 Download File',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ]
    });

    async function computeHash(buffer) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function renderApp(h) {
      const state = h.getState();
      const cfb = state.cfb;
      const streams = cfb.FullPaths.map((path, i) => ({
        path: path,
        name: path.split('/').pop(),
        size: cfb.FileIndex[i].size,
        content: cfb.FileIndex[i].content
      })).filter(s => s.path !== '/');

      h.render(`
        <div class="flex flex-col border border-surface-200 rounded-xl overflow-hidden bg-white font-sans">
          <!-- Header Info -->
          <div class="p-6 border-b border-surface-100 bg-surface-50/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 class="text-lg font-bold text-surface-900">${esc(state.fileName)}</h3>
              <p class="text-xs text-surface-500 font-medium">${(state.fileSize / (1024 * 1024)).toFixed(2)} MB • Windows Installer Package (CFBF)</p>
            </div>
            <div class="flex flex-col items-end">
              <span class="text-[9px] font-bold text-surface-400 uppercase tracking-widest mb-1">SHA-256 Fingerprint</span>
              <code class="text-[10px] bg-white border border-surface-200 px-2 py-1 rounded text-surface-600 font-mono">${state.hashHex}</code>
            </div>
          </div>

          <!-- Main Content -->
          <div class="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-surface-100 min-h-[500px]">
            <!-- Streams List -->
            <div class="lg:col-span-2 flex flex-col">
              <div class="px-4 py-2 bg-surface-50 border-b border-surface-100 flex justify-between items-center">
                <span class="text-[10px] font-bold text-surface-500 uppercase tracking-wider">Internal Streams (${streams.length})</span>
                <span class="text-[10px] text-surface-400">Standard OLE Streams</span>
              </div>
              <div class="flex-1 overflow-auto max-h-[600px]">
                <table class="w-full text-left text-xs border-collapse">
                  <thead class="sticky top-0 bg-white z-10 shadow-sm">
                    <tr>
                      <th class="px-4 py-3 border-b border-surface-100 font-bold text-surface-700">Stream Name</th>
                      <th class="px-4 py-3 border-b border-surface-100 font-bold text-surface-700 text-right">Size</th>
                      <th class="px-4 py-3 border-b border-surface-100"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-50">
                    ${streams.map((s, idx) => `
                      <tr class="hover:bg-brand-50/30 transition-colors group">
                        <td class="px-4 py-2.5 font-mono text-[11px] text-surface-600 flex items-center gap-2">
                          <span class="text-surface-300">└─</span>
                          ${esc(s.name)}
                        </td>
                        <td class="px-4 py-2.5 text-right font-mono text-surface-400">${s.size.toLocaleString()} B</td>
                        <td class="px-4 py-2.5 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <button class="text-brand-600 hover:text-brand-700 font-bold text-[10px] uppercase tracking-wider view-stream" data-idx="${idx}">Inspect</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Details Panel -->
            <div class="bg-surface-50/50 flex flex-col p-6 space-y-6">
              <div>
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Package Analysis</h4>
                <div class="space-y-4">
                  <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                    <div class="flex items-center gap-3 mb-2">
                      <div class="w-2 h-2 rounded-full bg-green-500"></div>
                      <span class="text-xs font-bold text-surface-700 uppercase">Container Valid</span>
                    </div>
                    <p class="text-[11px] text-surface-500 leading-relaxed">CFBF sector size is ${cfb.FileIndex[0].size === 0 ? '512' : 'detected'} bytes. Directory structure is intact.</p>
                  </div>

                  <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
                    <h5 class="text-[10px] font-bold text-surface-400 uppercase mb-2">Technical Info</h5>
                    <div class="space-y-2 text-[11px]">
                      <div class="flex justify-between"><span class="text-surface-400">Entries:</span> <span class="text-surface-700 font-mono">${cfb.FullPaths.length}</span></div>
                      <div class="flex justify-between"><span class="text-surface-400">Platform:</span> <span class="text-surface-700 font-mono">Windows</span></div>
                      <div class="flex justify-between"><span class="text-surface-400">Encoding:</span> <span class="text-surface-700 font-mono">UTF-16LE</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div id="stream-preview" class="hidden">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Stream Preview</h4>
                <div class="bg-[#1e1e1e] rounded-xl p-4 border border-surface-800 overflow-hidden shadow-lg">
                  <div id="preview-name" class="text-[10px] font-mono text-blue-400 border-b border-surface-800 pb-2 mb-2 truncate"></div>
                  <pre id="preview-hex" class="text-[9px] text-green-500 font-mono leading-tight overflow-auto max-h-[200px]"></pre>
                </div>
              </div>

              <div class="flex-1 flex flex-col justify-end">
                <p class="text-[10px] text-surface-400 italic">MSI files use a Compound File Binary Format (CFBF) to store relational database tables and files. This tool lists all internal streams.</p>
              </div>
            </div>
          </div>
        </div>
      `);

      // Bind events
      h.getRenderEl().querySelectorAll('.view-stream').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          const stream = streams[idx];
          const previewEl = document.getElementById('stream-preview');
          const hexEl = document.getElementById('preview-hex');
          const nameEl = document.getElementById('preview-name');
          
          previewEl.classList.remove('hidden');
          nameEl.textContent = stream.name;
          hexEl.textContent = generateHexDump(stream.content ? stream.content.slice(0, 512) : new Uint8Array(0));
          previewEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
        };
      });
    }

    function generateHexDump(bytes) {
      if (!bytes || bytes.length === 0) return '(Empty Stream)';
      let out = '';
      for (let i = 0; i < bytes.length; i += 16) {
        let line = i.toString(16).padStart(4, '0') + ': ';
        let ascii = '';
        for (let j = 0; j < 16; j++) {
          if (i + j < bytes.length) {
            const b = bytes[i + j];
            line += b.toString(16).padStart(2, '0') + ' ';
            ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
          } else {
            line += '   ';
          }
        }
        out += line + ' |' + ascii + '|\n';
      }
      return out;
    }

    function esc(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }
  };
})();
