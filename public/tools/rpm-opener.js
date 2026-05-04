(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop an RPM package here',
      actions: [
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().hash;
            if (hash) h.copyToClipboard(hash, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing RPM package...');

        try {
          const buffer = content;
          const view = new DataView(buffer);
          
          // 1. Compute Hash
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          h.setState('hash', hashHex);

          // 2. RPM Analysis
          let rpmInfo = {
            isValid: false,
            version: 'Unknown',
            type: 'Unknown',
            arch: 'Unknown',
            name: 'Unknown',
            os: 'Unknown'
          };

          if (buffer.byteLength >= 96) {
            const magic = view.getUint32(0, false);
            if (magic === 0xEDABEEDB) {
              rpmInfo.isValid = true;
              // RPM Lead (96 bytes)
              const major = view.getUint8(4);
              const minor = view.getUint8(5);
              rpmInfo.version = `${major}.${minor}`;
              
              const type = view.getUint16(6, false);
              rpmInfo.type = type === 0 ? 'Binary' : (type === 1 ? 'Source' : 'Unknown');
              
              const arch = view.getUint16(8, false);
              rpmInfo.arch = getRpmArch(arch);

              // Name (66 bytes starting at offset 10)
              const nameBytes = new Uint8Array(buffer, 10, 66);
              let name = '';
              for (let i = 0; i < nameBytes.length && nameBytes[i] !== 0; i++) {
                name += String.fromCharCode(nameBytes[i]);
              }
              rpmInfo.name = name || 'N/A';

              const os = view.getUint16(76, false);
              rpmInfo.os = getRpmOS(os);
            }
          }

          // 3. Entropy & Hex
          const entropy = calculateEntropy(new Uint8Array(buffer));
          const hexDump = generateHexDump(buffer.slice(0, 4096));

          // 4. Render UI
          h.render(`
            <div class="p-6 space-y-6">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Metadata Card -->
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-xs font-bold text-surface-400 mb-3 uppercase tracking-wider">File Metadata</h4>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between"><span class="text-surface-500">Filename:</span> <span class="font-medium truncate ml-4">${file.name}</span></div>
                    <div class="flex justify-between"><span class="text-surface-500">Size:</span> <span class="font-medium">${(file.size / 1024).toFixed(2)} KB</span></div>
                    <div class="flex justify-between"><span class="text-surface-500">Entropy:</span> <span class="font-medium">${entropy.toFixed(4)} bits/byte</span></div>
                    <div class="pt-2">
                      <span class="text-surface-500 block mb-1">SHA-256:</span>
                      <span class="font-mono text-[10px] break-all bg-white p-2 rounded border border-surface-100 block">${hashHex}</span>
                    </div>
                  </div>
                </div>

                <!-- RPM Info Card -->
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-xs font-bold text-surface-400 mb-3 uppercase tracking-wider">RPM Header (Lead)</h4>
                  ${rpmInfo.isValid ? `
                    <div class="space-y-2 text-sm">
                      <div class="flex justify-between"><span class="text-surface-500">Internal Name:</span> <span class="font-bold text-brand-600">${rpmInfo.name}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">RPM Format:</span> <span>${rpmInfo.version}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">Type:</span> <span>${rpmInfo.type}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">Architecture:</span> <span>${rpmInfo.arch}</span></div>
                      <div class="flex justify-between"><span class="text-surface-500">Operating System:</span> <span>${rpmInfo.os}</span></div>
                    </div>
                  ` : `
                    <div class="flex flex-col items-center justify-center h-32 text-surface-400 italic">
                      <span class="text-2xl mb-2">⚠️</span>
                      <span>No valid RPM lead found</span>
                    </div>
                  `}
                </div>
              </div>

              <!-- Hex Viewer -->
              <div class="border border-surface-200 rounded-xl overflow-hidden shadow-sm">
                <div class="bg-surface-100 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                  <span class="text-xs font-bold text-surface-600 uppercase">Binary Preview (First 4KB)</span>
                </div>
                <pre class="p-4 font-mono text-[11px] leading-tight overflow-auto max-h-96 bg-white text-surface-800">${hexDump}</pre>
              </div>
            </div>
          `);
        } catch (err) {
          h.showError('Analysis Error', err.message);
        }
      }
    });

    // Helper functions
    function getRpmArch(arch) {
      const arches = { 1: 'i386', 2: 'Alpha', 3: 'SPARC', 4: 'MIPS', 5: 'PowerPC', 6: '68000', 7: 'SGI', 8: 'RS6000', 9: 'IA64', 10: 'SPARC64', 11: 'x86_64', 12: 'ARM', 13: 'M68K', 14: 'S390', 15: 'S390X', 16: 'PPC64', 17: 'SH', 18: 'XTENSA', 19: 'AARCH64' };
      return arches[arch] || `Unknown (${arch})`;
    }

    function getRpmOS(os) {
      const oss = { 1: 'Linux', 2: 'IRIX', 3: 'Solaris', 4: 'SunOS', 5: 'AmigaOS', 6: 'AIX', 7: 'HP-UX', 8: 'OSF1', 9: 'FreeBSD', 10: 'SCO_SV', 11: 'Apple Darwin', 12: 'NextStep', 13: 'BSD/OS', 14: 'MachTen', 15: 'Cygwin', 16: 'AS/400', 17: 'OS/390', 18: 'VMS', 19: 'Psion', 20: 'QNX' };
      return oss[os] || `Unknown (${os})`;
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
