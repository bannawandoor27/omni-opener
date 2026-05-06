(function() {
  window.initTool = function(toolConfig, mountEl) {
    let _forgeLoaded = false;
    let _p12Data = null; // Store decrypted data for filtering

    /**
     * Helper to escape HTML and prevent XSS
     */
    function h(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    /**
     * Format file size
     */
    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

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
        if (!_forgeLoaded || typeof forge === 'undefined') {
          helpers.showLoading('Loading security engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 200);
          return;
        }

        _p12Data = null; // Reset on new file
        renderPasswordPrompt(file, content, helpers);
      },
      onDestroy: function() {
        _p12Data = null;
      },
      actions: [
        {
          label: '📋 Copy Summary',
          id: 'copy-summary',
          onClick: function(helpers, btn) {
            const data = helpers.getState().summary;
            if (data) {
              helpers.copyToClipboard(data, btn);
            } else {
              helpers.showError('No content found', 'Please unlock the file first to copy its contents.');
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
      infoHtml: `
        <div class="flex items-center gap-2 text-surface-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          <span>All decryption happens locally. Your password and keys never leave your device.</span>
        </div>
      `
    });

    /**
     * Renders the initial password entry screen
     */
    function renderPasswordPrompt(file, content, helpers) {
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${h(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">PKCS#12 Archive</span>
        </div>
      `;

      const html = `
        <div class="max-w-2xl mx-auto p-4 md:p-8">
          ${infoBar}
          
          <div class="bg-white border border-surface-200 rounded-2xl p-8 md:p-12 shadow-sm text-center">
            <div class="w-20 h-20 bg-brand-50 text-brand-600 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <h3 class="text-2xl font-bold text-surface-900 mb-3">Locked Archive</h3>
            <p class="text-surface-500 mb-10 max-w-sm mx-auto">This PKCS#12 file is encrypted. Enter the archive password to view its contents.</p>
            
            <div class="max-w-xs mx-auto space-y-4">
              <input type="password" id="p12-password" 
                class="w-full px-5 py-4 bg-surface-50 border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all text-center text-lg font-medium placeholder:text-surface-300"
                placeholder="Password"
                autofocus
              >
              <button id="p12-unlock-btn" class="w-full py-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all shadow-lg shadow-brand-200 flex items-center justify-center gap-2">
                <span>Unlock & Decrypt</span>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
              </button>
              <div id="p12-error-msg" class="hidden text-sm font-semibold text-red-600 bg-red-50 p-4 rounded-xl border border-red-100 animate-in fade-in slide-in-from-top-2"></div>
            </div>
          </div>
        </div>
      `;
      
      helpers.render(html);
      
      const input = document.getElementById('p12-password');
      const btn = document.getElementById('p12-unlock-btn');
      
      const attemptUnlock = () => {
        const password = input.value;
        helpers.showLoading('Decrypting PKCS#12 archive...');
        
        // Use timeout to ensure loading state renders
        setTimeout(() => {
          try {
            const p12Der = forge.util.createBuffer(content);
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
            _p12Data = extractItems(p12);
            
            if (_p12Data.length === 0) {
              helpers.showError('Empty Archive', 'Decryption successful, but no certificates or private keys were found in this file.');
              return;
            }
            
            renderResults(_p12Data, file, helpers);
          } catch (e) {
            console.error('[P12 Error]', e);
            const errEl = document.getElementById('p12-error-msg');
            if (errEl) {
              errEl.textContent = 'Incorrect password or corrupted file format.';
              errEl.classList.remove('hidden');
            }
            helpers.hideLoading();
          }
        }, 50);
      };
      
      btn.onclick = attemptUnlock;
      input.onkeydown = (e) => { if (e.key === 'Enter') attemptUnlock(); };
    }

    /**
     * Extracts certs and keys from the forge p12 object
     */
    function extractItems(p12) {
      const items = [];
      
      // Certificates
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      for (const bagId in certBags) {
        certBags[bagId].forEach(bag => {
          const c = bag.cert;
          if (!c) return;
          
          items.push({
            type: 'Certificate',
            id: 'cert-' + Math.random().toString(36).substr(2, 9),
            name: (bag.attributes.friendlyName && bag.attributes.friendlyName[0]) || 'Unnamed Certificate',
            subject: formatAttributes(c.subject.attributes),
            issuer: formatAttributes(c.issuer.attributes),
            notBefore: c.validity.notBefore,
            notAfter: c.validity.notAfter,
            serial: c.serialNumber,
            fingerprint: forge.pki.getPublicKeyFingerprint(c.publicKey, { encoding: 'hex', delimiter: ':' }).toUpperCase(),
            pem: forge.pki.certificateToPem(c)
          });
        });
      }

      // Keys (PKCS#8 or standard)
      [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].forEach(oid => {
        const keyBags = p12.getBags({ bagType: oid });
        for (const bagId in keyBags) {
          keyBags[bagId].forEach(bag => {
            const k = bag.key;
            if (!k) return;
            
            items.push({
              type: 'Private Key',
              id: 'key-' + Math.random().toString(36).substr(2, 9),
              name: (bag.attributes.friendlyName && bag.attributes.friendlyName[0]) || 'Unnamed Key',
              algorithm: k.n ? 'RSA' : 'Other',
              bits: k.n ? k.n.bitLength() : 'Unknown',
              pem: forge.pki.privateKeyToPem(k)
            });
          });
        }
      });

      return items;
    }

    function formatAttributes(attrs) {
      return attrs.map(a => {
        const key = a.shortName || a.name || 'Unknown';
        return `${key}=${a.value}`;
      }).join(', ');
    }

    /**
     * Main results rendering
     */
    function renderResults(items, file, helpers, filter = '') {
      const now = new Date();
      const filtered = items.filter(it => 
        it.name.toLowerCase().includes(filter.toLowerCase()) || 
        it.type.toLowerCase().includes(filter.toLowerCase()) ||
        (it.subject && it.subject.toLowerCase().includes(filter.toLowerCase()))
      );

      // Prepare summary text for clipboard action
      let summaryText = `OMNIOPENER P12 SUMMARY\nFile: ${file.name}\nTotal Items: ${items.length}\n---\n\n`;
      items.forEach(it => {
        summaryText += `[${it.type}] ${it.name}\n`;
        if (it.type === 'Certificate') {
          summaryText += `Expires: ${it.notAfter.toISOString()}\nSubject: ${it.subject}\n`;
        } else {
          summaryText += `Algorithm: ${it.algorithm} (${it.bits} bits)\n`;
        }
        summaryText += '\n';
      });
      helpers.setState('summary', summaryText);

      const html = `
        <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${h(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">Decrypted successfully</span>
          </div>

          <!-- Format-specific Search Box -->
          <div class="mb-8 relative group">
            <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none text-surface-400 group-focus-within:text-brand-500 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input type="text" id="p12-search" 
              class="w-full pl-12 pr-4 py-4 bg-white border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm"
              placeholder="Search entries by name, type, or subject..."
              value="${h(filter)}"
            >
          </div>

          <!-- U10. Section header -->
          <div class="flex items-center justify-between mb-4 px-1">
            <h3 class="font-bold text-surface-800 text-lg">Archive Entries</h3>
            <span class="text-xs font-bold bg-brand-100 text-brand-700 px-3 py-1 rounded-full">${filtered.length} visible</span>
          </div>

          ${filtered.length === 0 ? `
            <div class="py-20 text-center bg-surface-50 rounded-3xl border border-dashed border-surface-200">
              <div class="text-surface-300 mb-3">
                <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <p class="text-surface-500 font-medium">No matches found for "${h(filter)}"</p>
            </div>
          ` : `
            <div class="grid grid-cols-1 gap-6">
              ${filtered.map(item => renderItemCard(item, now)).join('')}
            </div>
          `}
        </div>
      `;

      helpers.render(html);

      // Search event listener
      const searchInput = document.getElementById('p12-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(filter.length, filter.length);
        searchInput.oninput = (e) => {
          renderResults(items, file, helpers, e.target.value);
        };
      }

      // Copy buttons event listeners
      document.querySelectorAll('.copy-item-btn').forEach(btn => {
        btn.onclick = function() {
          const itemId = this.getAttribute('data-id');
          const item = items.find(it => it.id === itemId);
          if (item) helpers.copyToClipboard(item.pem, this);
        };
      });
    }

    /**
     * Renders an individual cert or key card
     */
    function renderItemCard(item, now) {
      const isCert = item.type === 'Certificate';
      let expiryStatus = '';
      let expiryColorClass = 'text-surface-700';
      
      if (isCert) {
        const daysToExpiry = (item.notAfter - now) / (1000 * 60 * 60 * 24);
        if (daysToExpiry < 0) {
          expiryStatus = 'EXPIRED';
          expiryColorClass = 'text-red-600 font-bold';
        } else if (daysToExpiry < 30) {
          expiryStatus = `EXPIRING SOON (${Math.ceil(daysToExpiry)} days)`;
          expiryColorClass = 'text-amber-600 font-bold';
        }
      }

      return `
        <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm hover:border-brand-300 hover:shadow-md transition-all group">
          <!-- Card Header -->
          <div class="px-5 py-4 bg-surface-50/50 border-b border-surface-200 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-2xl ${isCert ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'} flex items-center justify-center border border-current border-opacity-10 transition-transform group-hover:scale-110">
                ${isCert 
                  ? '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>'
                  : '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>'
                }
              </div>
              <div>
                <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest leading-none mb-1">${item.type}</div>
                <div class="text-base font-bold text-surface-900 leading-tight">${h(item.name)}</div>
              </div>
            </div>
            
            <button class="copy-item-btn flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-surface-200 text-xs font-bold text-surface-700 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-all shadow-sm active:scale-95" data-id="${item.id}">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"></path></svg>
              <span>Copy PEM</span>
            </button>
          </div>

          <!-- U7. Card Table -->
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <tbody class="divide-y divide-surface-100">
                ${isCert ? `
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Subject</td>
                    <td class="px-6 py-4 text-surface-700 font-medium leading-relaxed">${h(item.subject)}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Issuer</td>
                    <td class="px-6 py-4 text-surface-600 leading-relaxed">${h(item.issuer)}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Validity Period</td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col gap-2">
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-bold text-surface-300 uppercase w-10">From</span>
                          <span class="text-xs text-surface-500 font-mono bg-surface-100 px-2 py-0.5 rounded">${item.notBefore.toUTCString()}</span>
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="text-[10px] font-bold text-surface-300 uppercase w-10">To</span>
                          <span class="text-xs font-mono bg-surface-100 px-2 py-0.5 rounded ${expiryColorClass}">
                            ${item.notAfter.toUTCString()}
                            ${expiryStatus ? `<span class="ml-2 font-black">${expiryStatus}</span>` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Serial Number</td>
                    <td class="px-6 py-4 text-surface-600 font-mono text-xs">${item.serial}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Fingerprint</td>
                    <td class="px-6 py-4 text-brand-700 font-mono text-xs tracking-widest break-all bg-brand-50/50">${item.fingerprint}</td>
                  </tr>
                ` : `
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Algorithm</td>
                    <td class="px-6 py-4 text-surface-900 font-bold text-base">${item.algorithm}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/30 transition-colors">
                    <td class="px-6 py-4 text-xs font-bold text-surface-400 uppercase tracking-wider w-44 bg-surface-50/30">Bit Depth</td>
                    <td class="px-6 py-4 text-surface-700 font-mono text-base">${item.bits} <span class="text-xs font-normal text-surface-400">bits</span></td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  };
})();
