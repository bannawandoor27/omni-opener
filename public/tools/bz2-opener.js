/**
 * OmniOpener — BZip2 Toolkit
 * Professional browser-based decompression and analysis.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onInit: function (h) {
        // Load bzip2 library (B1: Loaded here, used in onFile)
        h.loadScript('https://cdn.jsdelivr.net/gh/antimatter15/bzip2.js/bzip2.js');
      },
      onDestroy: function (h) {
        const state = h.getState();
        if (state && state.previewUrl) {
          URL.revokeObjectURL(state.previewUrl);
        }
      },
      onFile: function _onFile(file, content, h) {
        // B5: Revoke previous URL if any
        const prevState = h.getState();
        if (prevState && prevState.previewUrl) {
          URL.revokeObjectURL(prevState.previewUrl);
        }

        h.showLoading('Decompressing BZip2 archive...');

        // B1, B8: Race condition check for library using named function for retry
        if (typeof bzip2 === 'undefined' || typeof bzip2.array !== 'function') {
          setTimeout(function() { _onFile(file, content, h); }, 200);
          return;
        }

        try {
          const uint8 = new Uint8Array(content);
          
          // Verify BZip2 magic bytes (BZh)
          if (uint8[0] !== 0x42 || uint8[1] !== 0x5A || uint8[2] !== 0x68) {
             h.showError('Invalid BZip2 file', 'The file does not appear to be a valid BZip2 archive (missing "BZh" signature).');
             return;
          }

          // Decompress
          const decompressed = bzip2.array(uint8);
          
          if (!decompressed || decompressed.length === 0) {
            h.showError('Empty Archive', 'The BZip2 archive contains no data.');
            return;
          }

          const originalName = file.name.replace(/\.bz2$/i, '') || 'unpacked_file';
          const ratio = decompressed.length > 0 ? ((1 - (file.size / decompressed.length)) * 100).toFixed(1) : '0';

          // Compute SHA-256 (B3: Proper async handling)
          crypto.subtle.digest('SHA-256', content).then(hashBuffer => {
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            h.setState({
              decompressed: decompressed,
              originalName: originalName,
              hashHex: hashHex
            });

            // Preview logic
            let previewHtml = '';
            const sample = decompressed.slice(0, 1000);
            const isProbablyText = Array.from(sample).every(b => b === 10 || b === 13 || b === 9 || (b >= 32 && b <= 126));
            
            // Image detection for excellence
            const isImage = file.name.match(/\.(png|jpe?g|gif|webp|svg)\.bz2$/i) || 
                            originalName.match(/\.(png|jpe?g|gif|webp|svg)$/i);

            if (isImage) {
              const mimeMap = {
                'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'
              };
              const ext = originalName.split('.').pop().toLowerCase();
              const mime = mimeMap[ext] || 'image/png';
              const blob = new Blob([decompressed], { type: mime });
              const url = URL.createObjectURL(blob);
              h.setState({ previewUrl: url });
              previewHtml = `
                <div class="mt-8 flex flex-col items-center">
                  <h3 class="font-semibold text-surface-800 mb-4 self-start">Visual Preview</h3>
                  <div class="bg-surface-50 p-4 rounded-2xl border border-surface-200 shadow-sm inline-block">
                    <img src="${url}" class="max-w-full max-h-[600px] rounded-lg" alt="Preview">
                  </div>
                </div>
              `;
            } else if (isProbablyText) {
              const text = new TextDecoder().decode(decompressed.slice(0, 15000));
              const showingAll = decompressed.length <= 15000;
              previewHtml = `
                <div class="mt-8">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <h3 class="font-semibold text-surface-800">Content Preview ${showingAll ? '' : '(First 15KB)'}</h3>
                      <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Text Content</span>
                    </div>
                    <div class="relative">
                      <input type="text" id="preview-search" placeholder="Search preview..." class="text-xs border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 w-48 transition-all">
                    </div>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                    <pre id="preview-box" class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[500px]">${escapeHtml(text)}${showingAll ? '' : '\n\n... [remaining data truncated]'}</pre>
                  </div>
                </div>
              `;
            } else {
              const hexDump = generateHexDump(decompressed.slice(0, 3072));
              const showingAll = decompressed.length <= 3072;
              previewHtml = `
                <div class="mt-8">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Binary Preview ${showingAll ? '' : '(First 3KB)'}</h3>
                    <span class="text-[10px] bg-surface-200 text-surface-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Binary Data</span>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                    <pre class="p-4 text-[11px] font-mono bg-white text-surface-800 overflow-x-auto leading-tight max-h-[500px]">${escapeHtml(hexDump)}</pre>
                  </div>
                </div>
              `;
            }

            h.render(`
              <div class="max-w-5xl mx-auto p-4 md:p-6 font-sans">
                <!-- U1: File Info Bar -->
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                  <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">BZip2 Archive</span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <!-- Main Info Card -->
                  <div class="md:col-span-2 bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                    <div class="px-6 py-4 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">
                      <h2 class="font-bold text-surface-800">Extraction Report</h2>
                      <div class="flex items-center gap-2">
                         <span class="w-2 h-2 rounded-full bg-green-500"></span>
                         <span class="text-[10px] font-bold uppercase tracking-wider text-green-700">Decompressed Successfully</span>
                      </div>
                    </div>
                    <div class="p-6">
                      <div class="grid grid-cols-2 sm:grid-cols-3 gap-6">
                        <div>
                          <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Compressed Size</div>
                          <div class="text-xl font-mono font-bold text-surface-900">${formatSize(file.size)}</div>
                        </div>
                        <div>
                          <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Unpacked Size</div>
                          <div class="text-xl font-mono font-bold text-brand-600">${formatSize(decompressed.length)}</div>
                        </div>
                        <div class="col-span-2 sm:col-span-1">
                          <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Space Saved</div>
                          <div class="text-xl font-mono font-bold text-orange-600">${ratio}% lighter</div>
                        </div>
                      </div>

                      <div class="mt-8 pt-6 border-t border-surface-100">
                        <div class="flex flex-col sm:flex-row items-center gap-4 bg-surface-50 p-4 rounded-xl border border-surface-100">
                          <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center text-2xl shadow-sm">📦</div>
                          <div class="flex-1 min-w-0 text-center sm:text-left">
                            <div class="text-sm font-bold text-surface-900 truncate">${escapeHtml(originalName)}</div>
                            <div class="text-[10px] text-surface-500 uppercase font-bold">Unpacked file ready</div>
                          </div>
                          <button id="main-dl" class="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            <span>Download File</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Metadata Sidebar -->
                  <div class="space-y-4">
                    <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 shadow-sm">
                      <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-4 tracking-widest">Digital Integrity</h4>
                      <div class="space-y-4">
                        <div>
                          <label class="text-[10px] text-surface-400 uppercase font-bold block mb-1.5">SHA-256 Hash (Source)</label>
                          <div class="bg-white border border-surface-200 rounded-lg p-2.5 flex items-center gap-2">
                            <code class="text-[10px] text-surface-600 break-all flex-1 font-mono leading-tight">${hashHex}</code>
                            <button id="copy-hash-btn" class="p-1.5 hover:bg-surface-100 rounded-md transition-colors text-surface-400 hover:text-brand-600" title="Copy Hash">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                            </button>
                          </div>
                        </div>
                        <div class="pt-2">
                           <div class="flex items-center gap-2 text-xs text-surface-600">
                             <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                             <span>BZip2 (Burrows-Wheeler)</span>
                           </div>
                        </div>
                      </div>
                    </div>
                    
                    <div class="bg-brand-50 rounded-2xl p-5 border border-brand-100">
                      <h4 class="text-[10px] font-bold text-brand-600 uppercase mb-2 tracking-widest">Local Privacy</h4>
                      <p class="text-[11px] text-brand-700 leading-relaxed opacity-80">
                        This tool uses the <strong>bzip2.js</strong> library for client-side processing. Your file content is never uploaded to any server.
                      </p>
                    </div>
                  </div>
                </div>

                ${previewHtml}
              </div>
            `);

            // B9: Attach events after render (avoids inline onclick)
            document.getElementById('main-dl').onclick = function() {
              h.download(originalName, decompressed);
            };
            document.getElementById('copy-hash-btn').onclick = function(e) {
              h.copyToClipboard(hashHex, e.currentTarget);
            };
            
            // Search excellence
            const searchInput = document.getElementById('preview-search');
            if (searchInput && isProbablyText) {
              const fullText = new TextDecoder().decode(decompressed.slice(0, 15000));
              const showingAllInPreview = decompressed.length <= 15000;
              searchInput.oninput = function() {
                const query = this.value.toLowerCase();
                if (!query) {
                  document.getElementById('preview-box').innerHTML = escapeHtml(fullText) + (showingAllInPreview ? '' : '\n\n... [remaining data truncated]');
                  return;
                }
                const lines = fullText.split('\n');
                const filtered = lines.filter(l => l.toLowerCase().includes(query)).join('\n');
                document.getElementById('preview-box').innerHTML = escapeHtml(filtered || '-- No matching lines found --') + (showingAllInPreview ? '' : '\n\n... [remaining data truncated]');
              };
            }

          }).catch(err => {
            console.error(err);
            h.showError('Security Verification Failed', 'The file was decompressed but hash calculation failed.');
          });

        } catch (err) {
          console.error(err);
          h.showError('Decompression Failed', 'The BZip2 archive is invalid or uses an unsupported compression variant. Details: ' + err.message);
        }
      },

      actions: [
        {
          label: '📥 Download Unpacked',
          id: 'dl-unpacked',
          onClick: function (h) {
            const state = h.getState();
            if (state && state.decompressed) {
              h.download(state.originalName, state.decompressed);
            } else {
              h.showError('Not Ready', 'Please wait for the file to be decompressed.');
            }
          }
        },
        {
          label: '📋 Copy Hash',
          id: 'copy-hash-action',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.hashHex) {
              h.copyToClipboard(state.hashHex, btn);
            }
          }
        }
      ]
    });
  };
})();
