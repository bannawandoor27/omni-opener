(function() {
  window.initTool = function(toolConfig, mountEl) {
    let _forgeLoaded = false;
    let _currentFile = null;
    let _currentContent = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.p12,.pfx',
      dropLabel: 'Drop a .p12 or .pfx file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js', () => {
          _forgeLoaded = true;
        });
      },
      onFile: function _onFileFn(file, content, helpers) {
        _currentFile = file;
        _currentContent = content;
        
        if (!_forgeLoaded || typeof forge === 'undefined') {
          helpers.showLoading('Initializing encryption engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 300);
          return;
        }

        renderPasswordPrompt(file, content, helpers);
      },
      onDestroy: function() {
        _currentFile = null;
        _currentContent = null;
      },
      actions: [
        {
          label: '📋 Copy Summary',
          id: 'copy-summary',
          onClick: function(helpers, btn) {
            const data = helpers.getState().copyText;
            if (data) {
              helpers.copyToClipboard(data, btn);
            } else {
              helpers.showError('No data to copy', 'Please unlock the file first.');
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'download-raw',
          onClick: function(helpers) {
            const file = helpers.getFile();
            const content = helpers.getContent();
            if (file && content) {
              helpers.download(file.name, content);
            }
          }
        }
      ],
      infoHtml: '<strong>Security:</strong> All decryption happens locally in your browser. Your password and keys are never sent to any server.'
    });

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escape(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function renderPasswordPrompt(file, content, helpers) {
      const html = `
        <div class="max-w-2xl mx-auto p-6">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${escape(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">PKCS#12 Archive</span>
          </div>

          <div class="bg-white border border-surface-200 rounded-2xl p-8 shadow-sm text-center">
            <div class="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <h3 class="text-xl font-bold text-surface-900 mb-2">Password Required</h3>
            <p class="text-surface-500 mb-8 max-w-sm mx-auto">This file is encrypted. Enter the password to view the certificates and private keys inside.</p>
            
            <div class="max-w-xs mx-auto space-y-4">
              <div class="relative">
                <input type="password" id="p12-pass" 
                  class="w-full pl-4 pr-4 py-3 bg-surface-50 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-center font-medium"
                  placeholder="Enter password"
                  autofocus
                >
              </div>
              <button id="p12-unlock-btn" class="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-brand-100 flex items-center justify-center gap-2">
                <span>Unlock & Parse</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
              <div id="p12-err" class="hidden text-sm font-medium text-red-600 bg-red-50 py-2 rounded-lg border border-red-100"></div>
            </div>
          </div>
        </div>
      `;
      
      helpers.render(html);
      
      const input = document.getElementById('p12-pass');
      const btn = document.getElementById('p12-unlock-btn');
      
      const doUnlock = function() {
        const password = input.value;
        helpers.showLoading('Decrypting archive...');
        
        // Give UI time to show loading
        setTimeout(function() {
          try {
            const p12Der = forge.util.createBuffer(content);
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
            processP12(p12, file, helpers);
          } catch (e) {
            console.error('P12 Parse Error:', e);
            helpers.render(html); 
            const newErr = document.getElementById('p12-err');
            if (newErr) {
              newErr.textContent = 'Invalid password or corrupted file.';
              newErr.classList.remove('hidden');
            }
          }
        }, 100);
      };
      
      btn.onclick = doUnlock;
      input.onkeydown = (e) => { if (e.key === 'Enter') doUnlock(); };
    }

    function processP12(p12, file, helpers) {
      const items = [];
      
      // 1. Certificates
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      for (const bagId in certBags) {
        certBags[bagId].forEach(bag => {
          const c = bag.cert;
          items.push({
            type: 'Certificate',
            name: (bag.attributes.friendlyName && bag.attributes.friendlyName[0]) || 'Untitled Certificate',
            subject: formatAttrs(c.subject.attributes),
            issuer: formatAttrs(c.issuer.attributes),
            validFrom: c.validity.notBefore,
            validTo: c.validity.notAfter,
            serial: c.serialNumber,
            fingerprint: forge.pki.getPublicKeyFingerprint(c.publicKey, { encoding: 'hex', delimiter: ':' }).toUpperCase(),
            pem: forge.pki.certificateToPem(c)
          });
        });
      }

      // 2. Private Keys
      [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].forEach(oid => {
        const keyBags = p12.getBags({ bagType: oid });
        for (const bagId in keyBags) {
          keyBags[bagId].forEach(bag => {
            const k = bag.key;
            items.push({
              type: 'Private Key',
              name: (bag.attributes.friendlyName && bag.attributes.friendlyName[0]) || 'Untitled Key',
              algorithm: k.n ? 'RSA' : 'Unknown',
              bits: k.n ? k.n.bitLength() : 'N/A',
              pem: forge.pki.privateKeyToPem(k)
            });
          });
        }
      });

      if (items.length === 0) {
        helpers.showError('Empty Archive', 'The file was decrypted successfully, but no certificates or keys were found.');
        return;
      }

      renderResults(items, file, helpers);
    }

    function formatAttrs(attributes) {
      return attributes.map(attr => {
        const name = attr.shortName || attr.name || 'Unknown';
        return `${name}=${attr.value}`;
      }).join(', ');
    }

    function renderResults(items, file, helpers) {
      let summaryText = `File: ${file.name}\nSize: ${formatSize(file.size)}\nItems: ${items.length}\n\n`;
      const now = new Date();

      const html = `
        <div class="p-6 max-w-5xl mx-auto">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${escape(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${items.length} items found</span>
          </div>

          <div class="flex items-center justify-between mb-4 px-1">
            <h3 class="text-lg font-bold text-surface-900">Archive Contents</h3>
            <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full uppercase tracking-wider">${items.length} Items</span>
          </div>

          <div class="grid grid-cols-1 gap-6">
            ${items.map((item, idx) => {
              const isCert = item.type === 'Certificate';
              let expiryClass = 'text-surface-700';
              let expiryLabel = '';

              if (isCert) {
                const daysToExpiry = (item.validTo - now) / (1000 * 60 * 60 * 24);
                if (daysToExpiry < 0) {
                  expiryClass = 'text-red-600 font-bold';
                  expiryLabel = ' (EXPIRED)';
                } else if (daysToExpiry < 30) {
                  expiryClass = 'text-amber-600 font-bold';
                  expiryLabel = ' (EXPIRING SOON)';
                }
              }

              summaryText += `[${item.type}] ${item.name}\n`;
              if (isCert) {
                summaryText += `  Subject: ${item.subject}\n  Issuer: ${item.issuer}\n  Expires: ${item.validTo.toISOString()}\n`;
              } else {
                summaryText += `  Algorithm: ${item.algorithm} (${item.bits} bits)\n`;
              }
              summaryText += '\n';

              return `
                <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm hover:border-brand-300 transition-all group">
                  <div class="px-5 py-4 bg-surface-50 border-b border-surface-200 flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-xl ${isCert ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'} flex items-center justify-center border border-current border-opacity-10">
                        ${isCert ? '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>' : '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>'}
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest leading-none mb-1">${item.type}</div>
                        <div class="text-base font-bold text-surface-900">${escape(item.name)}</div>
                      </div>
                    </div>
                    <button class="copy-pem-btn flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-surface-200 text-xs font-bold text-surface-700 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-all shadow-sm active:scale-95" data-idx="${idx}">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
                      <span>Copy PEM</span>
                    </button>
                  </div>
                  <div class="p-0 overflow-x-auto">
                    <table class="min-w-full text-sm">
                      <tbody class="divide-y divide-surface-100">
                        ${isCert ? `
                          <tr class="hover:bg-surface-50/50">
                            <td class="px-5 py-4 text-xs font-bold text-surface-400 uppercase tracking-tight w-40 bg-surface-50/30">Subject</td>
                            <td class="px-5 py-4 text-surface-700 break-all font-medium leading-relaxed">${escape(item.subject)}</td>
                          </tr>
                          <tr class="hover:bg-surface-50/50">
                            <td class="px-5 py-4 text-xs font-bold text-surface-400 uppercase tracking-tight w-40 bg-surface-50/30">Issuer</td>
                            <td class="px-5 py-4 text-surface-600 break-all leading-relaxed">${escape(item.issuer)}</td>
                          </tr>
                          <tr class="hover:bg-surface-50/50">
                            <td class="px-5 py-4 text-xs font-bold text-surface-400 uppercase tracking-tight w-40 bg-surface-50/30">Validity Period</td>
                            <td class="px-5 py-4">
                              <div class="flex flex-col gap-1.5">
                                <div class="flex items-center gap-2">
                                  <span class="text-[10px] font-bold text-surface-300 uppercase w-8">From</span>
                                  <span class="text-xs text-surface-500 font-mono">${item.validFrom.toUTCString()}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                  <span class="text-[10px] font-bold text-surface-300 uppercase w-8">To</span>
                                  <span class="text-sm font-mono ${expiryClass}">${item.validTo.toUTCString()}${expiryLabel}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                          <tr class="hover:bg-surface-50/50">
                            <td class="px-5 py-4 text-xs font-bold text-surface-400 uppercase tracking-tight w-40 bg-surface-50/30">Fingerprint</td>
                            <td class="px-5 py-4 text-surface-700 font-mono text-xs tracking-widest bg-brand-50/20">${item.fingerprint}</td>
                          </tr>
                        ` : `
                          <tr class="hover:bg-surface-50/50">
                            <td class="px-5 py-4 text-xs font-bold text-surface-400 uppercase tracking-tight w-40 bg-surface-50/30">Algorithm</td>
                            <td class="px-5 py-4 text-surface-900 font-bold">${item.algorithm}</td>
                          </tr>
                          <tr class="hover:bg-surface-50/50">
                            <td class="px-5 py-4 text-xs font-bold text-surface-400 uppercase tracking-tight w-40 bg-surface-50/30">Key Bit Depth</td>
                            <td class="px-5 py-4 text-surface-700 font-mono">${item.bits} bits</td>
                          </tr>
                        `}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      helpers.setState('copyText', summaryText);
      helpers.render(html);

      document.querySelectorAll('.copy-pem-btn').forEach(btn => {
        btn.onclick = function() {
          const idx = parseInt(this.getAttribute('data-idx'));
          helpers.copyToClipboard(items[idx].pem, this);
        };
      });
    }
  };
})();
