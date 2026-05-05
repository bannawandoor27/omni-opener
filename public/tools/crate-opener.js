(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
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
          label: '📥 Download .crate',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Analyzing Rust Crate...');

        // Small delay to ensure dependencies are ready
        setTimeout(async function () {
          try {
            // 1. Compute Hash
            const hashBuffer = await crypto.subtle.digest('SHA-256', content);
            const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            h.setState({ hashHex: hashHex });

            // 2. Decompress
            let decompressed;
            try {
              decompressed = pako.ungzip(new Uint8Array(content));
            } catch (e) {
              throw new Error('Decompression failed. Is this a valid .crate (tar.gz) file?');
            }

            // 3. Parse Tar
            const files = parseTar(decompressed);
            if (files.length === 0) throw new Error('No files found in the archive.');

            const cargoToml = files.find(f => f.name.endsWith('Cargo.toml'));
            let cargoContent = '';
            if (cargoToml) {
              cargoContent = new TextDecoder().decode(cargoToml.buffer);
            }

            // 4. Render UI
            h.render(`
              <div class="p-6 space-y-6 font-sans">
                <div class="flex flex-col md:flex-row gap-4">
                  <div class="flex-1 bg-surface-50 p-4 rounded-xl border border-surface-200">
                    <p class="text-xs font-bold text-surface-500 uppercase tracking-wider mb-1">Package Name</p>
                    <p class="text-lg font-semibold text-surface-900 truncate">${esc(file.name)}</p>
                  </div>
                  <div class="bg-surface-50 p-4 rounded-xl border border-surface-200 min-w-[120px]">
                    <p class="text-xs font-bold text-surface-500 uppercase tracking-wider mb-1">Files</p>
                    <p class="text-lg font-semibold text-surface-900">${files.length}</p>
                  </div>
                  <div class="bg-surface-50 p-4 rounded-xl border border-surface-200 min-w-[150px]">
                    <p class="text-xs font-bold text-surface-500 uppercase tracking-wider mb-1">Unpacked Size</p>
                    <p class="text-lg font-semibold text-surface-900">${(decompressed.length / 1024).toFixed(1)} KB</p>
                  </div>
                </div>

                ${cargoContent ? `
                  <div class="border border-surface-200 rounded-xl overflow-hidden shadow-sm">
                    <div class="bg-surface-100 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                      <span class="text-xs font-bold text-surface-700 uppercase">Cargo.toml</span>
                    </div>
                    <pre class="p-4 font-mono text-sm leading-relaxed overflow-auto max-h-[400px] bg-white text-surface-800">${esc(cargoContent)}</pre>
                  </div>
                ` : `
                  <div class="p-4 bg-orange-50 border border-orange-100 rounded-xl text-orange-700 text-sm">
                    No <strong>Cargo.toml</strong> found. This might not be a standard Rust crate.
                  </div>
                `}

                <div class="border border-surface-200 rounded-xl overflow-hidden shadow-sm">
                  <div class="bg-surface-100 px-4 py-2 border-b border-surface-200">
                    <span class="text-xs font-bold text-surface-700 uppercase">Contents</span>
                  </div>
                  <div class="divide-y divide-surface-100 max-h-[500px] overflow-auto bg-white">
                    ${files.map(f => `
                      <div class="px-4 py-2.5 flex justify-between items-center hover:bg-surface-50 transition-colors">
                        <div class="flex items-center gap-2 overflow-hidden">
                          <span class="text-surface-400 text-lg">${getFileIcon(f.name)}</span>
                          <span class="text-sm font-mono text-surface-700 truncate">${esc(f.name)}</span>
                        </div>
                        <span class="text-xs text-surface-400 font-mono">${formatSize(f.size)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>

                <div class="text-[10px] text-surface-400 font-mono break-all">
                  SHA-256: ${hashHex}
                </div>
              </div>
            `);

          } catch (err) {
            h.showError('Analysis Failed', err.message);
          }
        }, 100);
      }
    });

    // ── Tar Parser ────────────────────────────────────────
    function parseTar(buffer) {
      const files = [];
      let offset = 0;
      
      while (offset < buffer.length - 512) {
        const header = buffer.slice(offset, offset + 512);
        
        // Check for null header (end of archive)
        let isNull = true;
        for (let i = 0; i < 512; i++) {
          if (header[i] !== 0) { isNull = false; break; }
        }
        if (isNull) break;

        const name = trimNulls(new TextDecoder().decode(header.slice(0, 100)));
        const sizeStr = new TextDecoder().decode(header.slice(124, 136)).trim();
        const size = parseInt(sizeStr, 8);
        const type = String.fromCharCode(header[156]);

        // Support standard files (type '0' or '\0')
        if (type === '0' || type === '\0') {
          files.push({
            name: name,
            size: size,
            buffer: buffer.slice(offset + 512, offset + 512 + size)
          });
        }
        
        // tar blocks are 512 bytes
        offset += 512 + Math.ceil(size / 512) * 512;
      }
      return files;
    }

    // ── Utilities ──────────────────────────────────────────
    function trimNulls(str) {
      const idx = str.indexOf('\0');
      return idx === -1 ? str : str.slice(0, idx);
    }

    function esc(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, function (m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      });
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getFileIcon(name) {
      if (name.endsWith('.rs')) return '🦀';
      if (name.endsWith('.toml')) return '⚙️';
      if (name.endsWith('.md')) return '📝';
      if (name.endsWith('.txt')) return '📄';
      if (name.includes('/')) return '📁';
      return '📄';
    }
  };
})();
