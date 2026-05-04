(function () {
  'use strict';

  /**
   * OmniOpener — XZ (LZMA2) Archive Toolkit
   * Professional browser-based decompression and analysis.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function calculateEntropy(data) {
    const freq = new Array(256).fill(0);
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

  function generateHexDump(buffer, limit = 4096) {
    const bytes = new Uint8Array(buffer.slice(0, limit));
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
        // B1: Load decompression library
        h.loadScript('https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma-d-min.js');
      },
      onDestroy: function (h) {
        // B5: Revoke object URLs
        const state = h.getState();
        if (state && state.previewUrl) {
          URL.revokeObjectURL(state.previewUrl);
        }
      },
      onFile: function _onFileFn(file, content, h) {
        // B5: Revoke previous file's URLs
        const prevState = h.getState();
        if (prevState && prevState.previewUrl) {
          URL.revokeObjectURL(prevState.previewUrl);
        }

        h.showLoading('Decompressing XZ archive...');

        // B1, B4, B8: Check library availability and retry if necessary
        if (typeof LZMA === 'undefined') {
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        const uint8 = new Uint8Array(content);
        
        // Verify Magic Bytes for XZ (FD 37 7A 58 5A 00)
        const isXZ = uint8.length >= 6 && 
                     uint8[0] === 0xFD && uint8[1] === 0x37 && uint8[2] === 0x7A && 
                     uint8[3] === 0x58 && uint8[4] === 0x5A && uint8[5] === 0x00;

        if (!isXZ) {
          h.showError('Invalid XZ File', 'The file does not appear to be a valid XZ archive (missing "FD 37 7A 58 5A 00" signature).');
          return;
        }

        // B3: Async decompression using library callback
        try {
          LZMA.decompress(uint8, function(result, error) {
            if (error) {
              console.error('XZ Decompression Error:', error);
              renderUI(file, content, h, null, error);
            } else {
              // Ensure we have a Uint8Array
              const decompressed = (result instanceof Uint8Array) ? result : 
                                   (Array.isArray(result) ? new Uint8Array(result) : 
                                   (typeof result === 'string' ? new TextEncoder().encode(result) : null));
              
              if (!decompressed || decompressed.length === 0) {
                renderUI(file, content, h, null, 'Archive produced no data.');
              } else {
                renderUI(file, content, h, decompressed, null);
              }
            }
          });
        } catch (e) {
          renderUI(file, content, h, null, e.message);
        }

        async function renderUI(file, content, h, decompressed, decompressError) {
          // B3: Handle async hash calculation
          const hashBuffer = await crypto.subtle.digest('SHA-256', content);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          const entropy = calculateEntropy(new Uint8Array(content));
          const originalName = file.name.replace(/\.xz$/i, '') || 'unpacked_file';

          h.setState({
            hashHex: hashHex,
            decompressed: decompressed,
            originalName: originalName
          });

          // U7-U10: Construct beautiful UI components
          let previewHtml = '';
          if (decompressed) {
            const sample = decompressed.slice(0, 4000);
            const isProbablyText = Array.from(sample).every(b => b === 10 || b === 13 || b === 9 || (b >= 32 && b <= 126) || b > 127);
            
            if (isProbablyText) {
              const text = new TextDecoder().decode(decompressed.slice(0, 50000));
              const showingAll = decompressed.length <= 50000;
              previewHtml = `
                <div class="mt-8">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-3">
                      <h3 class="font-semibold text-surface-800">Content Preview</h3>
                      <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Text Content</span>
                    </div>
                    <div class="relative">
                      <input type="text" id="preview-search" placeholder="Filter lines..." class="text-xs border border-surface-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 w-48 transition-all">
                    </div>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                    <pre id="preview-box" class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[600px] whitespace-pre-wrap break-all">${escapeHtml(text)}${showingAll ? '' : '\n\n... [remaining data truncated]'}</pre>
                  </div>
                </div>
              `;
            } else {
              const hexDump = generateHexDump(decompressed, 4096);
              const showingAll = decompressed.length <= 4096;
              previewHtml = `
                <div class="mt-8">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Decompressed Hex View ${showingAll ? '' : '(First 4KB)'}</h3>
                    <span class="text-[10px] bg-surface-200 text-surface-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Binary Stream</span>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                    <pre class="p-4 text-[11px] font-mono bg-white text-surface-800 overflow-x-auto leading-tight max-h-[600px]">${escapeHtml(hexDump)}</pre>
                  </div>
                </div>
              `;
            }
          } else {
            const hexDump = generateHexDump(content, 4096);
            previewHtml = `
              <div class="mt-8">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Source Archive (Hex View)</h3>
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Decompression Failed</span>
                  </div>
                </div>
                <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                  <pre class="p-4 text-[11px] font-mono bg-white text-surface-800 overflow-x-auto leading-tight max-h-[400px]">${escapeHtml(hexDump)}</pre>
                </div>
                <div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-800">
                  <strong>Notice:</strong> ${escapeHtml(decompressError || 'The archive could not be unpacked. Showing raw compressed data instead.')}
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
                <span class="text-surface-500">.xz archive</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Main Status Card -->
                <div class="md:col-span-2 bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                  <div class="px-6 py-4 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">
                    <h2 class="font-bold text-surface-800">Extraction Report</h2>
                    <div class="flex items-center gap-2">
                       <span class="w-2 h-2 rounded-full ${decompressed ? 'bg-green-500' : 'bg-amber-500'}"></span>
                       <span class="text-[10px] font-bold uppercase tracking-wider ${decompressed ? 'text-green-700' : 'text-amber-700'}">
                         ${decompressed ? 'Unpacked Successfully' : 'Analysis Complete'}
                       </span>
                    </div>
                  </div>
                  <div class="p-6">
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-6">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Compressed Size</div>
                        <div class="text-xl font-mono font-bold text-surface-900">${formatSize(file.size)}</div>
                      </div>
                      ${decompressed ? `
                        <div>
                          <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Unpacked Size</div>
                          <div class="text-xl font-mono font-bold text-brand-600">${formatSize(decompressed.length)}</div>
                        </div>
                        <div class="col-span-2 sm:col-span-1">
                          <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Savings</div>
                          <div class="text-xl font-mono font-bold text-orange-600">${((1 - (file.size / decompressed.length)) * 100).toFixed(1)}%</div>
                        </div>
                      ` : `
                        <div>
                          <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-tight">Shannon Entropy</div>
                          <div class="text-xl font-mono font-bold text-surface-900">${entropy.toFixed(3)}</div>
                        </div>
                      `}
                    </div>

                    <div class="mt-8 pt-6 border-t border-surface-100">
                      <div class="flex flex-col sm:flex-row items-center gap-4 bg-surface-50 p-4 rounded-xl border border-surface-100">
                        <div class="w-12 h-12 rounded-xl bg-white border border-surface-200 flex items-center justify-center text-2xl shadow-sm">📦</div>
                        <div class="flex-1 min-w-0 text-center sm:text-left">
                          <div class="text-sm font-bold text-surface-900 truncate">${escapeHtml(decompressed ? originalName : file.name)}</div>
                          <div class="text-[10px] text-surface-500 uppercase font-bold tracking-tight">
                            ${decompressed ? 'Extracted file ready' : 'Source file analysis'}
                          </div>
                        </div>
                        <button id="btn-main-dl" class="w-full sm:w-auto px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Sidebar Metadata -->
                <div class="space-y-4">
                  <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 shadow-sm">
                    <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-4 tracking-widest">Digital Fingerprint</h4>
                    <div class="space-y-4">
                      <div>
                        <label class="text-[10px] text-surface-400 uppercase font-bold block mb-1.5">SHA-256 (Archive)</label>
                        <div class="bg-white border border-surface-200 rounded-lg p-2.5 flex items-center gap-2">
                          <code class="text-[10px] text-surface-600 break-all flex-1 font-mono leading-tight">${hashHex}</code>
                          <button id="btn-copy-hash" class="p-1.5 hover:bg-surface-100 rounded-md transition-colors text-surface-400 hover:text-brand-600" title="Copy Hash">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                          </button>
                        </div>
                      </div>
                      <div class="pt-2">
                         <div class="flex items-center gap-2 text-xs text-surface-600">
                           <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                           <span>XZ (LZMA2 / Container)</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  
                  <div class="bg-brand-50 rounded-2xl p-5 border border-brand-100 shadow-sm shadow-brand-100/20">
                    <h4 class="text-[10px] font-bold text-brand-600 uppercase mb-2 tracking-widest">Client-Side Processing</h4>
                    <p class="text-[11px] text-brand-700 leading-relaxed opacity-90">
                      Archive decompression is handled locally via the <code>lzma-js</code> library. No data is ever sent to our servers.
                    </p>
                  </div>
                </div>
              </div>

              ${previewHtml}
            </div>
          `);

          // B9: Attach event listeners after render
          document.getElementById('btn-main-dl').onclick = function() {
            if (decompressed) {
              h.download(originalName, decompressed);
            } else {
              h.download(file.name, content);
            }
          };
          
          document.getElementById('btn-copy-hash').onclick = function(e) {
            h.copyToClipboard(hashHex, e.currentTarget);
          };

          // PART 4: Data Excellence - Filter/Search
          const searchInput = document.getElementById('preview-search');
          if (searchInput && decompressed) {
            const previewBox = document.getElementById('preview-box');
            // Decode a larger chunk for searching
            const fullText = new TextDecoder().decode(decompressed.slice(0, 100000));
            const hasMore = decompressed.length > 100000;
            
            searchInput.oninput = function() {
              const query = this.value.toLowerCase();
              if (!query) {
                previewBox.textContent = fullText + (hasMore ? '\n\n... [remaining data truncated]' : '');
                return;
              }
              const lines = fullText.split('\n');
              const filtered = lines.filter(l => l.toLowerCase().includes(query)).slice(0, 1000).join('\n');
              previewBox.textContent = filtered || '-- No matching lines found --';
              if (filtered && lines.length > 1000) {
                 previewBox.textContent += '\n\n-- Showing first 1000 matches --';
              }
            };
          }
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
              h.showError('Not Ready', 'Please wait for decompression to complete.');
            }
          }
        },
        {
          label: '📋 Copy Hash',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.hashHex) h.copyToClipboard(state.hashHex, btn);
          }
        }
      ]
    });
  };
})();
