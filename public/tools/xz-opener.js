(function () {
  'use strict';

  /**
   * OmniOpener — XZ (LZMA2) Archive Toolkit
   * High-performance browser-based decompression and analysis.
   */

  const LZMA_CDN = 'https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/lzma-d-min.js';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function calculateEntropy(data) {
    if (!data || data.length === 0) return 0;
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
        h.loadScript(LZMA_CDN);
      },
      onDestroy: function (h) {
        const state = h.getState();
        if (state?.previewUrl) {
          URL.revokeObjectURL(state.previewUrl);
        }
      },
      onFile: function _onFileFn(file, content, h) {
        // B5: Revoke previous file's URLs
        const prevState = h.getState();
        if (prevState?.previewUrl) {
          URL.revokeObjectURL(prevState.previewUrl);
        }

        // B1, B8: Library load check
        if (typeof LZMA === 'undefined') {
          h.showLoading('Initializing decompression engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 150);
          return;
        }

        h.showLoading('Decompressing XZ archive...');

        const uint8 = new Uint8Array(content);
        
        // Verify Magic Bytes (FD 37 7A 58 5A 00)
        const isXZ = uint8.length >= 6 && 
                     uint8[0] === 0xFD && uint8[1] === 0x37 && uint8[2] === 0x7A && 
                     uint8[3] === 0x58 && uint8[4] === 0x5A && uint8[5] === 0x00;

        if (!isXZ) {
          h.showError('Unsupported Format', 'The file does not appear to be a valid XZ archive. Expected magic bytes "FD 37 7A 58 5A 00" were not found.');
          return;
        }

        // B3: Handle async decompression
        try {
          LZMA.decompress(uint8, function (result, error) {
            if (error) {
              console.error('[XZ] Decompression Error:', error);
              processResult(null, error);
            } else {
              // Normalize result to Uint8Array
              const decompressed = (result instanceof Uint8Array) ? result : 
                                   (Array.isArray(result) ? new Uint8Array(result) : 
                                   (typeof result === 'string' ? new TextEncoder().encode(result) : null));
              processResult(decompressed, null);
            }
          });
        } catch (e) {
          processResult(null, e.message);
        }

        async function processResult(decompressed, error) {
          if (error) {
            h.showError('Decompression Failed', `The XZ stream could not be decoded: ${error}`);
            return;
          }

          if (!decompressed || decompressed.length === 0) {
            h.showError('Empty Archive', 'The archive was decompressed successfully but contained no data.');
            return;
          }

          const hashBuffer = await crypto.subtle.digest('SHA-256', content);
          const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
          const entropy = calculateEntropy(uint8);
          const originalName = file.name.replace(/\.xz$/i, '') || 'unpacked_file';

          h.setState({
            decompressed,
            hashHex,
            originalName
          });

          // Detect content type for preview
          const sampleSize = Math.min(decompressed.length, 4096);
          const sample = decompressed.slice(0, sampleSize);
          let binaryCount = 0;
          for (let i = 0; i < sample.length; i++) {
            const b = sample[i];
            if (b < 7 || (b > 13 && b < 32)) binaryCount++;
          }
          const isProbablyText = (binaryCount / sample.length) < 0.05;

          let previewHtml = '';
          if (isProbablyText) {
            const textLimit = 100000;
            const text = new TextDecoder().decode(decompressed.slice(0, textLimit));
            const isTruncated = decompressed.length > textLimit;
            
            previewHtml = `
              <div class="mt-8">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div class="flex items-center gap-3">
                    <h3 class="font-semibold text-surface-800">Content Preview</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-0.5 rounded-full font-medium">Text Content</span>
                  </div>
                  <div class="relative max-w-xs w-full">
                    <input type="text" id="content-filter" placeholder="Search lines..." class="w-full text-sm border border-surface-200 rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                    <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </div>
                </div>
                <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm bg-gray-950">
                  <pre id="text-preview" class="p-4 text-sm font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[600px] whitespace-pre-wrap break-all">${escapeHtml(text)}${isTruncated ? '\n\n[... Remaining data truncated for performance ...]' : ''}</pre>
                </div>
              </div>
            `;
          } else {
            const hexDump = generateHexDump(decompressed, 4096);
            previewHtml = `
              <div class="mt-8">
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-semibold text-surface-800">Hex View (First 4KB)</h3>
                  <span class="text-xs bg-surface-200 text-surface-700 px-2.5 py-0.5 rounded-full font-medium">Binary Data</span>
                </div>
                <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                  <pre class="p-4 text-[11px] font-mono bg-white text-surface-800 overflow-x-auto leading-tight max-h-[500px]">${escapeHtml(hexDump)}</pre>
                </div>
              </div>
            `;
          }

          h.render(`
            <div class="max-w-6xl mx-auto p-4 md:p-6 font-sans animate-in fade-in duration-500">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.xz archive</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <!-- Main Stats Card -->
                <div class="lg:col-span-3 bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                  <div class="px-6 py-4 border-b border-surface-100 bg-surface-50/50 flex justify-between items-center">
                    <h2 class="font-bold text-surface-800">Extraction Results</h2>
                    <span class="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-wider border border-green-100">
                      <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      Success
                    </span>
                  </div>
                  
                  <div class="p-6 md:p-8">
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-8">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase mb-1.5 tracking-wider">Archive Size</div>
                        <div class="text-2xl font-mono font-bold text-surface-900">${formatSize(file.size)}</div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase mb-1.5 tracking-wider">Unpacked Size</div>
                        <div class="text-2xl font-mono font-bold text-brand-600">${formatSize(decompressed.length)}</div>
                      </div>
                      <div class="col-span-2 md:col-span-1">
                        <div class="text-[10px] font-bold text-surface-400 uppercase mb-1.5 tracking-wider">Compression Ratio</div>
                        <div class="text-2xl font-mono font-bold text-orange-600">${(decompressed.length / file.size).toFixed(2)}x</div>
                      </div>
                    </div>

                    <div class="mt-10 p-5 bg-surface-50 rounded-2xl border border-surface-200 flex flex-col sm:flex-row items-center gap-5">
                      <div class="w-14 h-14 rounded-xl bg-white border border-surface-200 flex items-center justify-center text-3xl shadow-sm flex-shrink-0">
                        📦
                      </div>
                      <div class="flex-1 min-w-0 text-center sm:text-left">
                        <div class="text-base font-bold text-surface-900 truncate">${escapeHtml(originalName)}</div>
                        <div class="text-[10px] text-surface-500 uppercase font-bold tracking-widest mt-0.5">Extracted Payload</div>
                      </div>
                      <button id="main-download-btn" class="w-full sm:w-auto px-8 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-200 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Download Unpacked
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Metadata Sidebar -->
                <div class="space-y-4">
                  <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 shadow-sm">
                    <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-4 tracking-widest flex items-center gap-2">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                      Verification
                    </h4>
                    <div class="space-y-5">
                      <div>
                        <label class="text-[10px] text-surface-400 uppercase font-bold block mb-1.5">SHA-256 Hash</label>
                        <div class="bg-white border border-surface-200 rounded-xl p-3 relative group">
                          <code class="text-[10px] text-surface-600 break-all font-mono leading-relaxed block pr-8">${hashHex}</code>
                          <button id="copy-hash-btn" class="absolute right-2 top-2 p-1.5 hover:bg-surface-100 rounded-md transition-colors text-surface-400 hover:text-brand-600" title="Copy to clipboard">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                          </button>
                        </div>
                      </div>
                      <div>
                        <label class="text-[10px] text-surface-400 uppercase font-bold block mb-1.5">Shannon Entropy</label>
                        <div class="flex items-center gap-3">
                          <div class="flex-1 h-1.5 bg-surface-200 rounded-full overflow-hidden">
                            <div class="h-full bg-blue-500 rounded-full" style="width: ${(entropy / 8) * 100}%"></div>
                          </div>
                          <span class="text-xs font-mono font-bold text-surface-700">${entropy.toFixed(3)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="bg-blue-50 rounded-2xl p-5 border border-blue-100">
                    <h4 class="text-[10px] font-bold text-blue-600 uppercase mb-2 tracking-widest">XZ Container</h4>
                    <p class="text-[11px] text-blue-700 leading-relaxed">
                      Utilizes LZMA2 compression for extreme ratios. This tool decompressess the stream locally in your browser sandbox.
                    </p>
                  </div>
                </div>
              </div>

              ${previewHtml}
            </div>
          `);

          // B9: Event Listeners
          const dlBtn = document.getElementById('main-download-btn');
          if (dlBtn) dlBtn.onclick = () => h.download(originalName, decompressed);

          const copyBtn = document.getElementById('copy-hash-btn');
          if (copyBtn) copyBtn.onclick = (e) => h.copyToClipboard(hashHex, e.currentTarget);

          // PART 4: Data Excellence - Live Filter
          const filterInput = document.getElementById('content-filter');
          if (filterInput && isProbablyText) {
            const previewBox = document.getElementById('text-preview');
            const fullText = new TextDecoder().decode(decompressed.slice(0, 150000));
            const hasMore = decompressed.length > 150000;
            
            filterInput.oninput = function() {
              const query = this.value.toLowerCase().trim();
              if (!query) {
                previewBox.textContent = fullText + (hasMore ? '\n\n[... Remaining data truncated for performance ...]' : '');
                return;
              }
              const lines = fullText.split('\n');
              const filtered = lines.filter(line => line.toLowerCase().includes(query)).slice(0, 1000);
              
              if (filtered.length === 0) {
                previewBox.innerHTML = `<div class="text-center py-10 text-surface-500 font-sans italic">No lines matching "${escapeHtml(query)}"</div>`;
              } else {
                let resultText = filtered.join('\n');
                if (filtered.length === 1000) resultText += '\n\n-- Showing first 1000 matches --';
                previewBox.textContent = resultText;
              }
            };
          }
        }
      },
      actions: [
        {
          label: '📥 Download',
          id: 'dl-action',
          onClick: function (h) {
            const state = h.getState();
            if (state?.decompressed) {
              h.download(state.originalName, state.decompressed);
            } else {
              h.showError('Not Ready', 'Please wait for decompression to finish.');
            }
          }
        },
        {
          label: '📋 Copy Hash',
          id: 'copy-hash-action',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state?.hashHex) h.copyToClipboard(state.hashHex, btn);
          }
        }
      ]
    });
  };
})();
