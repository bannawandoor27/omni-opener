(function() {
  window.initTool = function(toolConfig, mountEl) {
    let _forgeLoaded = false;
    let _p12Items = null;

    /**
     * Escapes HTML for safe rendering
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
     * Human-readable file size
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
          helpers.showLoading('Initializing security engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 200);
          return;
        }

        _p12Items = null;
        renderPasswordPrompt(file, content, helpers);
      },
      onDestroy: function() {
        _p12Items = null;
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
              helpers.showError('Unlock file first', 'You need to enter the password to view and copy file details.');
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
          <span>Privacy: All decryption happens locally in your browser.</span>
        </div>
      `
    });

    /**
     * Renders the password entry screen
     */
    function renderPasswordPrompt(file, content, helpers) {
      const html = `
        <div class="max-w-2xl mx-auto p-4 md:p-8">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${h(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">PKCS#12 File</span>
          </div>
          
          <div class="bg-white border border-surface-200 rounded-3xl p-8 md:p-12 shadow-sm text-center">
            <div class="w-20 h-20 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <h3 class="text-2xl font-bold text-surface-900 mb-2">Encrypted Archive</h3>
            <p class="text-surface-500 mb-8 max-w-sm mx-auto">This file requires a password to be decrypted and viewed.</p>
            
            <div class="max-w-xs mx-auto space-y-4">
              <input type="password" id="p12-password" 
                class="w-full px-5 py-4 bg-surface-50 border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all text-center text-lg font-medium"
                placeholder="Enter password..."
                autofocus
              >
              <button id="p12-unlock-btn" class="w-full py-4 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white font-bold rounded-2xl transition-all shadow-lg shadow-brand-200 flex items-center justify-center gap-2">
                <span>Unlock & Decrypt</span>
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
        helpers.showLoading('Decrypting archive...');
        
        setTimeout(() => {
          try {
            const p12Der = forge.util.createBuffer(content);
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
            _p12Items = extractP12Items(p12);
            
            if (_p12Items.length === 0) {
              helpers.showError('No content', 'The archive was decrypted, but no certificates or private keys were found.');
              return;
            }
            
            renderMainView(file, helpers);
          } catch (e) {
            console.error('[P12 Decryption Error]', e);
            const errEl = document.getElementById('p12-error-msg');
            if (errEl) {
              errEl.textContent = 'Incorrect password or invalid file format.';
              errEl.classList.remove('hidden');
            }
            helpers.hideLoading();
          }
        }, 100);
      };
      
      btn.onclick = attemptUnlock;
      input.onkeydown = (e) => { if (e.key === 'Enter') attemptUnlock(); };
    }

    /**
     * Extracts items from the decrypted p12 object
     */
    function extractP12Items(p12) {
      const items = [];
      
      // Extract Certificates
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      for (const id in certBags) {
        certBags[id].forEach(bag => {
          const c = bag.cert;
          if (!c) return;
          items.push({
            type: 'Certificate',
            id: 'cert-' + Math.random().toString(36).substr(2, 9),
            name: (bag.attributes.friendlyName && bag.attributes.friendlyName[0]) || 'Unnamed Certificate',
            subject: formatCertAttributes(c.subject.attributes),
            issuer: formatCertAttributes(c.issuer.attributes),
            validFrom: c.validity.notBefore,
            validTo: c.validity.notAfter,
            serial: c.serialNumber,
            fingerprint: forge.pki.getPublicKeyFingerprint(c.publicKey, { encoding: 'hex', delimiter: ':' }).toUpperCase(),
            pem: forge.pki.certificateToPem(c)
          });
        });
      }

      // Extract Private Keys
      [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].forEach(oid => {
        const keyBags = p12.getBags({ bagType: oid });
        for (const id in keyBags) {
          keyBags[id].forEach(bag => {
            const k = bag.key;
            if (!k) return;
            items.push({
              type: 'Private Key',
              id: 'key-' + Math.random().toString(36).substr(2, 9),
              name: (bag.attributes.friendlyName && bag.attributes.friendlyName[0]) || 'Unnamed Key',
              algorithm: k.n ? 'RSA' : 'Unknown',
              bits: k.n ? k.n.bitLength() : 'Unknown',
              pem: forge.pki.privateKeyToPem(k)
            });
          });
        }
      });

      return items;
    }

    function formatCertAttributes(attrs) {
      return attrs.map(a => `${a.shortName || a.name || '?'}=${a.value}`).join(', ');
    }

    /**
     * Renders the main results view with filtering
     */
    function renderMainView(file, helpers, filter = '') {
      const now = new Date();
      const filtered = _p12Items.filter(it => 
        it.name.toLowerCase().includes(filter.toLowerCase()) || 
        it.type.toLowerCase().includes(filter.toLowerCase()) ||
        (it.subject && it.subject.toLowerCase().includes(filter.toLowerCase()))
      );

      // Update summary for clipboard action
      let summary = `OMNIOPENER P12 DECRYPTED REPORT\nFile: ${file.name}\nTotal Entries: ${_p12Items.length}\n\n`;
      _p12Items.forEach(it => {
        summary += `[${it.type.toUpperCase()}] ${it.name}\n`;
        if (it.type === 'Certificate') {
          summary += `Subject: ${it.subject}\nExpires: ${it.validTo.toISOString()}\n`;
        } else {
          summary += `Algo: ${it.algorithm} (${it.bits} bits)\n`;
        }
        summary += '\n';
      });
      helpers.setState('summary', summary);

      const html = `
        <div class="max-w-5xl mx-auto p-4 md:p-6 animate-in fade-in duration-500">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${h(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-green-600 font-medium">Decrypted & Verified</span>
          </div>

          <div class="mb-8 relative">
            <div class="absolute inset-y-0 left-4 flex items-center pointer-events-none text-surface-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input type="text" id="p12-search" 
              class="w-full pl-12 pr-4 py-4 bg-white border border-surface-200 rounded-2xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm"
              placeholder="Search by name, subject, or type..."
              value="${h(filter)}"
            >
          </div>

          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 text-lg">Archive Contents</h3>
            <span class="text-xs font-bold bg-brand-100 text-brand-700 px-3 py-1 rounded-full">${filtered.length} entries shown</span>
          </div>

          ${filtered.length === 0 ? `
            <div class="py-20 text-center bg-surface-50 rounded-3xl border border-dashed border-surface-200">
              <p class="text-surface-500 font-medium">No results matching "${h(filter)}"</p>
            </div>
          ` : `
            <div class="grid grid-cols-1 gap-6">
              ${filtered.map(item => renderEntry(item, now)).join('')}
            </div>
          `}
        </div>
      `;

      helpers.render(html);

      const searchInput = document.getElementById('p12-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(filter.length, filter.length);
        searchInput.oninput = (e) => {
          renderMainView(file, helpers, e.target.value);
        };
      }

      // Add click handlers for copy buttons
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.onclick = function() {
          const id = this.getAttribute('data-id');
          const item = _p12Items.find(it => it.id === id);
          if (item) helpers.copyToClipboard(item.pem, this);
        };
      });
    }

    /**
     * Renders an individual cert/key card
     */
    function renderEntry(item, now) {
      const isCert = item.type === 'Certificate';
      let expiryLabel = '';
      let expiryClass = 'text-surface-600';
      
      if (isCert) {
        const diff = item.validTo - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (diff < 0) {
          expiryLabel = 'EXPIRED';
          expiryClass = 'text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded';
        } else if (days <= 30) {
          expiryLabel = `EXPIRING SOON (${days}d)`;
          expiryClass = 'text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded';
        }
      }

      return `
        <div class="rounded-xl border border-surface-200 overflow-hidden hover:border-brand-300 hover:shadow-md transition-all bg-white group">
          <div class="px-5 py-4 bg-surface-50/50 border-b border-surface-200 flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl ${isCert ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'} flex items-center justify-center font-bold">
                ${isCert ? 'C' : 'K'}
              </div>
              <div>
                <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-0.5">${item.type}</div>
                <div class="text-base font-bold text-surface-900 leading-tight">${h(item.name)}</div>
              </div>
            </div>
            <button class="copy-btn px-4 py-2 bg-white border border-surface-200 rounded-xl text-xs font-bold text-surface-700 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-all active:scale-95" data-id="${item.id}">
              Copy PEM
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <tbody class="divide-y divide-surface-100">
                ${isCert ? `
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Subject</td>
                    <td class="px-5 py-3 text-surface-700 leading-relaxed font-medium">${h(item.subject)}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Issuer</td>
                    <td class="px-5 py-3 text-surface-600 leading-relaxed">${h(item.issuer)}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Validity</td>
                    <td class="px-5 py-3">
                      <div class="flex flex-col gap-1 text-xs">
                        <div class="flex items-center gap-2">
                          <span class="text-surface-400 w-8">From</span>
                          <span class="font-mono text-surface-500">${item.validFrom.toUTCString()}</span>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="text-surface-400 w-8">To</span>
                          <span class="font-mono ${expiryClass}">${item.validTo.toUTCString()} ${expiryLabel ? `<span class="ml-1">${expiryLabel}</span>` : ''}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Serial</td>
                    <td class="px-5 py-3 text-surface-500 font-mono text-xs">${item.serial}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Fingerprint</td>
                    <td class="px-5 py-3 text-brand-700 font-mono text-[10px] break-all tracking-wider uppercase">${item.fingerprint}</td>
                  </tr>
                ` : `
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Algorithm</td>
                    <td class="px-5 py-3 text-surface-800 font-bold">${item.algorithm}</td>
                  </tr>
                  <tr class="hover:bg-brand-50/20">
                    <td class="px-5 py-3 text-xs font-semibold text-surface-400 uppercase w-32 bg-surface-50/20">Key Size</td>
                    <td class="px-5 py-3 text-surface-700 font-mono">${item.bits} bits</td>
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
