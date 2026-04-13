(function () {
  'use strict';
  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing BZip2 archive...');

        const buffer = content;
        
        // 1. Compute Hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // 2. Magic Bytes
        const magicBytes = Array.from(new Uint8Array(buffer.slice(0, 16)))
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');

        // 3. BZip2 Analysis
        let isBZ2 = false;
        const view = new Uint8Array(buffer);
        if (view.length >= 3) {
          if (view[0] === 0x42 && view[1] === 0x5A && view[2] === 0x68) {
            isBZ2 = true;
          }
        }

        // 4. Entropy Calculation
        const entropy = calculateEntropy(new Uint8Array(buffer));

        // 5. Hex Dump (first 4KB)
        const hexDump = generateHexDump(buffer.slice(0, 4096));

        // Render UI
        h.render(`
          <div class="p-6 space-y-6 font-sans">
            <div class="flex items-center justify-between border-b border-surface-200 pb-4">
              <div>
                <h3 class="text-xl font-bold text-surface-900">${file.name}</h3>
                <p class="text-sm text-surface-500">${(file.size / 1024).toFixed(2)} KB • BZip2 Compressed Archive</p>
              </div>
              <div class="flex gap-2">
                <button id="btn-copy-hash" class="px-3 py-1 text-xs font-medium border border-surface-200 rounded hover:bg-surface-50 transition-colors">Copy SHA-256</button>
                <button id="btn-dl" class="px-3 py-1 text-xs font-medium bg-brand-600 text-white rounded hover:bg-brand-700 transition-colors">Download</button>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Metadata Card -->
              <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                <h4 class="text-sm font-bold text-surface-700 mb-3 uppercase tracking-wider">File Analysis</h4>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between"><span class="text-surface-500">Magic Bytes:</span> <span class="font-mono text-xs">${magicBytes.slice(0, 23)}...</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">SHA-256:</span> <span class="font-mono text-[10px] break-all ml-4">${hashHex}</span></div>
                  <div class="flex justify-between"><span class="text-surface-500">Entropy:</span> <span>${entropy.toFixed(4)} bits/byte</span></div>
                </div>
              </div>

              <!-- BZip2 Info Card -->
              <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                <h4 class="text-sm font-bold text-surface-700 mb-3 uppercase tracking-wider">Format Info</h4>
                ${isBZ2 ? `
                  <div class="text-sm text-surface-600">
                    <p>Verified <strong>BZip2</strong> compression format.</p>
                    <p class="mt-2 text-xs">Signature 'BZh' detected at start of file.</p>
                  </div>
                ` : `
                  <div class="text-sm text-surface-400 italic">No BZip2 'BZh' signature detected.</div>
                `}
              </div>
            </div>

            <!-- Hex Viewer -->
            <div class="border border-surface-200 rounded-xl overflow-hidden">
              <div class="bg-surface-100 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                <span class="text-xs font-bold text-surface-700 uppercase">Hex Viewer (First 4KB)</span>
              </div>
              <pre class="p-4 font-mono text-[11px] leading-tight overflow-auto max-h-96 bg-white text-surface-800">${hexDump}</pre>
            </div>
          </div>
        `);

        document.getElementById('btn-dl').onclick = () => h.download(file.name, content);
        document.getElementById('btn-copy-hash').onclick = (e) => h.copyToClipboard(hashHex, e.target);
      }
    });

    // Helper functions
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
