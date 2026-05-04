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
      ],

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing AppImage structure...');

        try {
          const buffer = content;
          const view = new Uint8Array(buffer);

          // 1. Compute Hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          h.setState('hashHex', hashHex);

          // 2. Magic Bytes
          const magicBytes = Array.from(view.slice(0, 16))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');

          // 3. AppImage Analysis
          let appImageInfo = {
            isValid: false,
            type: 'Unknown',
            arch: 'Unknown'
          };

          if (view.length >= 64) {
            // ELF magic: 7F 45 4C 46
            if (view[0] === 0x7F && view[1] === 0x45 && view[2] === 0x4C && view[3] === 0x46) {
              // AppImage magic at offset 8: 41 49
              if (view[8] === 0x41 && view[9] === 0x49) {
                appImageInfo.isValid = true;
                appImageInfo.type = view[10] === 0x01 ? 'Type 1 (ISO 9660)' : (view[10] === 0x02 ? 'Type 2 (SquashFS)' : 'Unknown');
              }
              
              // ELF Class (32/64 bit)
              const elfClass = view[4];
              const archType = view[18] | (view[19] << 8);
              
              const archMap = {
                0x03: 'x86',
                0x3E: 'x86_64',
                0x28: 'ARM',
                0xB7: 'AArch64'
              };
              appImageInfo.arch = (archMap[archType] || 'Unknown') + ' (' + (elfClass === 1 ? '32-bit' : '64-bit') + ')';
            }
          }

          // 4. Entropy Calculation
          const entropy = calculateEntropy(view);

          // 5. Hex Dump (first 4KB)
          const hexDump = generateHexDump(buffer.slice(0, 4096));

          // Render UI
          h.render(`
            <div class="p-6 space-y-6">
              <div class="flex items-center justify-between border-b border-surface-200 pb-4">
                <div>
                  <h3 class="text-xl font-bold text-surface-900">${file.name}</h3>
                  <p class="text-sm text-surface-500">${(file.size / (1024 * 1024)).toFixed(2)} MB • AppImage Package</p>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-xs font-bold text-surface-400 mb-3 uppercase tracking-wider">Identification</h4>
                  <div class="space-y-3">
                    <div>
                      <span class="block text-xs text-surface-500 mb-1">Status:</span>
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${appImageInfo.isValid ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${appImageInfo.isValid ? 'Valid AppImage Signature' : 'Generic ELF Binary'}
                      </span>
                    </div>
                    <div>
                      <span class="block text-xs text-surface-500 mb-1">Format Type:</span>
                      <span class="text-sm font-semibold text-surface-700">${appImageInfo.type}</span>
                    </div>
                    <div>
                      <span class="block text-xs text-surface-500 mb-1">Architecture:</span>
                      <span class="text-sm font-semibold text-surface-700">${appImageInfo.arch}</span>
                    </div>
                  </div>
                </div>

                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-xs font-bold text-surface-400 mb-3 uppercase tracking-wider">Security & Integrity</h4>
                  <div class="space-y-3">
                    <div>
                      <span class="block text-xs text-surface-500 mb-1">SHA-256 Hash:</span>
                      <code class="text-[10px] break-all bg-white p-1 rounded border border-surface-200 block">${hashHex}</code>
                    </div>
                    <div class="flex justify-between items-end">
                      <div>
                        <span class="block text-xs text-surface-500 mb-1">Entropy:</span>
                        <span class="text-sm font-semibold text-surface-700">${entropy.toFixed(4)} bits/byte</span>
                      </div>
                      <div class="text-right">
                        <span class="block text-xs text-surface-500 mb-1">Magic:</span>
                        <code class="text-[10px] text-surface-400">${magicBytes.slice(0, 23)}...</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="border border-surface-200 rounded-xl overflow-hidden">
                <div class="bg-surface-100 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                  <span class="text-xs font-bold text-surface-700 uppercase">Binary Preview (First 4KB)</span>
                </div>
                <div class="bg-white overflow-x-auto">
                  <pre class="p-4 font-mono text-[11px] leading-tight text-surface-800 whitespace-pre">${hexDump}</pre>
                </div>
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('Analysis Failed', err.message);
        }
      }
    });
  };

  function calculateEntropy(data) {
    const freq = new Uint32Array(256);
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
})();
