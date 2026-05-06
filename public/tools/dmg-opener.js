(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      dropLabel: 'Drop an Apple Disk Image (.dmg) here',
      infoHtml: '<strong>Privacy:</strong> This tool parses DMG metadata (Koly block and XML Plist) directly in your browser. No data is uploaded to any server.',
      
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
          label: '📥 Download DMG',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        },
        {
          label: '📄 Export Plist',
          id: 'export-plist',
          onClick: function (h) {
            const plistXml = h.getState().plistXml;
            if (plistXml) {
              h.download(h.getFile().name + '.plist', plistXml, 'text/xml');
            } else {
              alert('No Plist metadata found in this DMG.');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof plist === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/plist@3.1.0/dist/plist.min.js');
        }
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing Apple Disk Image...');

        // Ensure plist library is loaded
        if (typeof plist === 'undefined') {
          await h.loadScript('https://cdn.jsdelivr.net/npm/plist@3.1.0/dist/plist.min.js');
        }

        const buffer = content;
        const view = new DataView(buffer);
        
        // 1. Compute SHA-256 Hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        h.setState('hashHex', hashHex);

        // 2. Identify DMG (Koly block is at the end)
        let dmgInfo = null;
        let plistXml = null;
        let isDMG = false;

        if (buffer.byteLength >= 512) {
          const kolyOffset = buffer.byteLength - 512;
          const kolySignature = new TextDecoder().decode(buffer.slice(kolyOffset, kolyOffset + 4));
          
          if (kolySignature === 'koly') {
            isDMG = true;
            // UDIF Header (Koly block) offsets:
            // XML Offset is typically at 216 or 320
            // XML Length is typically at 224 or 328
            let xmlOffset = view.getBigUint64(kolyOffset + 216, false);
            let xmlLength = view.getBigUint64(kolyOffset + 224, false);
            
            // Check if values look like valid offsets (within file bounds)
            if (xmlOffset === 0n || xmlOffset > BigInt(buffer.byteLength)) {
              xmlOffset = view.getBigUint64(kolyOffset + 320, false);
              xmlLength = view.getBigUint64(kolyOffset + 328, false);
            }
            
            if (xmlOffset > 0n && xmlLength > 0n && (xmlOffset + xmlLength) <= BigInt(buffer.byteLength)) {
              const xmlBuffer = buffer.slice(Number(xmlOffset), Number(xmlOffset + xmlLength));
              plistXml = new TextDecoder().decode(xmlBuffer);
              h.setState('plistXml', plistXml);
              
              if (typeof plist !== 'undefined') {
                try {
                  dmgInfo = plist.parse(plistXml);
                } catch (e) {
                  console.error('Failed to parse Plist', e);
                }
              }
            }
          }
        }

        // 3. Hex Dump (first 1KB)
        const hexDump = generateHexDump(buffer.slice(0, 1024));

        // Render UI
        h.render(`
          <div class="p-6 space-y-6 font-sans">
            <div class="flex flex-col md:flex-row md:items-center justify-between border-b border-surface-200 pb-4 gap-4">
              <div>
                <h3 class="text-xl font-bold text-surface-900">${file.name}</h3>
                <p class="text-sm text-surface-500">${formatBytes(file.size)} • Apple Disk Image</p>
              </div>
              <div class="flex items-center gap-2">
                ${isDMG ? '<span class="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">VALID UDIF</span>' : '<span class="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded">FLAT/RAW IMAGE</span>'}
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Metadata Column -->
              <div class="lg:col-span-1 space-y-6">
                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-xs font-bold text-surface-400 mb-3 uppercase tracking-wider">File Hash</h4>
                  <div class="font-mono text-[10px] break-all p-2 bg-white border border-surface-100 rounded text-surface-600">
                    ${hashHex}
                  </div>
                </div>

                <div class="bg-surface-50 rounded-xl p-4 border border-surface-200">
                  <h4 class="text-xs font-bold text-surface-400 mb-3 uppercase tracking-wider">DMG Properties</h4>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between"><span class="text-surface-500">Format:</span> <span class="font-mono">UDIF (DMG)</span></div>
                    <div class="flex justify-between"><span class="text-surface-500">Koly Header:</span> <span class="font-mono">${isDMG ? 'Detected' : 'Not Found'}</span></div>
                    ${dmgInfo && dmgInfo['resource-fork'] && dmgInfo['resource-fork']['blkx'] ? `
                      <div class="flex justify-between"><span class="text-surface-500">Partitions:</span> <span>${dmgInfo['resource-fork']['blkx'].length}</span></div>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- Main Info Column -->
              <div class="lg:col-span-2 space-y-6">
                ${dmgInfo && dmgInfo['resource-fork'] && dmgInfo['resource-fork']['blkx'] ? `
                  <div class="bg-white rounded-xl border border-surface-200 overflow-hidden">
                    <div class="bg-surface-50 px-4 py-2 border-b border-surface-200">
                      <h4 class="text-xs font-bold text-surface-700 uppercase">Partitions / Block Maps</h4>
                    </div>
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-sm">
                        <thead class="bg-surface-50 text-surface-500 text-xs uppercase">
                          <tr>
                            <th class="px-4 py-2">Name</th>
                            <th class="px-4 py-2">Type</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100">
                          ${dmgInfo['resource-fork']['blkx'].map(block => `
                            <tr>
                              <td class="px-4 py-2 font-medium">${block.Name || 'Untitled'}</td>
                              <td class="px-4 py-2 text-surface-500 font-mono text-xs">${block.CFName || 'Unknown'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ` : `
                  <div class="bg-surface-50 rounded-xl p-8 border border-surface-200 text-center">
                    <p class="text-surface-500 italic">
                      ${isDMG ? 'DMG header detected but no partition map found in Plist.' : 'This file does not have a standard UDIF (Apple Disk Image) header at the end.'}
                    </p>
                  </div>
                `}

                <!-- Hex Viewer -->
                <div class="border border-surface-200 rounded-xl overflow-hidden">
                  <div class="bg-surface-50 px-4 py-2 border-b border-surface-200">
                    <span class="text-xs font-bold text-surface-700 uppercase">Hex Preview (Header)</span>
                  </div>
                  <pre class="p-4 font-mono text-[10px] leading-tight overflow-auto max-h-64 bg-white text-surface-800">${hexDump}</pre>
                </div>
              </div>
            </div>
          </div>
        `);
      }
    });

    // Helper: Format bytes
    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Helper: Generate Hex Dump
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
