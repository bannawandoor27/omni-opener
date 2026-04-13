(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.p12,.pfx',
      dropLabel: 'Drop a .p12 or .pfx file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },
      onFile: function _onFile(file, content, helpers) {
        if (typeof forge === 'undefined') {
          helpers.showLoading('Loading encryption engine...');
          setTimeout(() => _onFile(file, content, helpers), 200);
          return;
        }
        renderPasswordPrompt(file, content, helpers);
      },
      actions: [
        {
          label: '📋 Copy Details',
          id: 'copy',
          onClick: function(helpers, btn) {
            const data = helpers.getState().parsedData;
            if (data) {
              helpers.copyToClipboard(data, btn);
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your password and file stay in your browser. Powered by node-forge.'
    });
  };

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderPasswordPrompt(file, content, helpers) {
    const html = `
      <div class="p-8 max-w-md mx-auto">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
        </div>
        
        <div class="bg-white border border-surface-200 rounded-2xl p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-surface-900 mb-2">Password Protected</h3>
          <p class="text-sm text-surface-500 mb-6">This P12 file requires a password to unlock its contents.</p>
          
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-surface-400 uppercase mb-1">Password</label>
              <input type="password" id="p12-password" 
                class="w-full px-4 py-2 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                placeholder="Enter password..."
                autofocus
              >
            </div>
            <button id="p12-unlock" class="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors shadow-sm shadow-brand-200">
              Unlock File
            </button>
            <div id="p12-error" class="hidden text-sm text-red-500 text-center mt-2"></div>
          </div>
        </div>
      </div>
    `;
    
    helpers.render(html);
    
    const input = document.getElementById('p12-password');
    const btn = document.getElementById('p12-unlock');
    
    const attemptUnlock = () => {
      const password = input.value;
      helpers.showLoading('Decrypting P12...');
      
      // Use a timeout to allow the loading spinner to show
      setTimeout(() => {
        try {
          parseP12(content, password, file, helpers);
        } catch (e) {
          console.error(e);
          helpers.render(html); // Re-render prompt
          const newErrorEl = document.getElementById('p12-error');
          if (newErrorEl) {
            newErrorEl.textContent = 'Invalid password or corrupted file.';
            newErrorEl.classList.remove('hidden');
          }
        }
      }, 50);
    };
    
    btn.onclick = attemptUnlock;
    input.onkeydown = (e) => { if (e.key === 'Enter') attemptUnlock(); };
  }

  function parseP12(content, password, file, helpers) {
    const p12Der = forge.util.createBuffer(content);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const bags = [];
    
    // Extract certificates
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    for (const bagId in certBags) {
      const bagList = certBags[bagId];
      bagList.forEach(bag => {
        const cert = bag.cert;
        bags.push({
          type: 'Certificate',
          friendlyName: bag.attributes.friendlyName ? bag.attributes.friendlyName[0] : 'N/A',
          subject: getAttributes(cert.subject.attributes),
          issuer: getAttributes(cert.issuer.attributes),
          validFrom: cert.validity.notBefore,
          validTo: cert.validity.notAfter,
          serialNumber: cert.serialNumber,
          fingerprint: forge.pki.getPublicKeyFingerprint(cert.publicKey, { encoding: 'hex', delimiter: ':' }),
          pem: forge.pki.certificateToPem(cert)
        });
      });
    }

    // Extract keys (shrouded and plain)
    [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag].forEach(oid => {
      const keyBags = p12.getBags({ bagType: oid });
      for (const bagId in keyBags) {
        const bagList = keyBags[bagId];
        bagList.forEach(bag => {
          const key = bag.key;
          bags.push({
            type: 'Private Key',
            friendlyName: bag.attributes.friendlyName ? bag.attributes.friendlyName[0] : 'N/A',
            algorithm: key.n ? 'RSA' : 'Unknown',
            bits: key.n ? key.n.bitLength() : 'N/A',
            pem: forge.pki.privateKeyToPem(key)
          });
        });
      }
    });

    if (bags.length === 0) {
      throw new Error('No certificates or keys found in this P12 file.');
    }

    renderBags(bags, file, helpers);
  }

  function getAttributes(attributes) {
    const map = {};
    attributes.forEach(attr => {
      const name = attr.shortName || attr.name;
      if (name) map[name] = attr.value;
    });
    return map;
  }

  function renderBags(bags, file, helpers) {
    let copyText = `File: ${file.name}\n\n`;
    
    const html = `
      <div class="p-6">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${bags.length} items found</span>
        </div>

        <div class="space-y-6">
          ${bags.map((bag, i) => {
            const isCert = bag.type === 'Certificate';
            let detailLines = [];
            
            if (isCert) {
              const subjectStr = Object.entries(bag.subject).map(([k,v]) => `${k}=${v}`).join(', ');
              const issuerStr = Object.entries(bag.issuer).map(([k,v]) => `${k}=${v}`).join(', ');
              detailLines = [
                ['Subject', subjectStr],
                ['Issuer', issuerStr],
                ['Valid From', bag.validFrom.toUTCString()],
                ['Valid To', bag.validTo.toUTCString()],
                ['Fingerprint', bag.fingerprint.toUpperCase()],
                ['Serial', bag.serialNumber]
              ];
            } else {
              detailLines = [
                ['Algorithm', bag.algorithm],
                ['Bits', bag.bits]
              ];
            }

            copyText += `[${bag.type}] ${bag.friendlyName}\n`;
            detailLines.forEach(([k, v]) => copyText += `  ${k}: ${v}\n`);
            copyText += '\n';

            return `
              <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
                <div class="px-5 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="px-2 py-0.5 rounded bg-brand-100 text-brand-700 text-[10px] font-bold uppercase tracking-wider">${bag.type}</span>
                    <span class="text-sm font-semibold text-surface-900">${escapeHtml(bag.friendlyName)}</span>
                  </div>
                  <button class="text-xs text-brand-600 hover:text-brand-700 font-medium p12-copy-pem" data-index="${i}">Copy PEM</button>
                </div>
                <div class="p-5">
                  <table class="w-full text-sm">
                    <tbody>
                      ${detailLines.map(([label, value]) => `
                        <tr class="align-top">
                          <td class="py-1.5 w-32 text-surface-400 font-medium text-xs uppercase tracking-tight">${escapeHtml(label)}</td>
                          <td class="py-1.5 text-surface-700 break-all font-mono text-[13px] leading-relaxed">${escapeHtml(String(value))}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    helpers.setState('parsedData', copyText);
    helpers.render(html);

    // Add Copy PEM listeners
    document.querySelectorAll('.p12-copy-pem').forEach(btn => {
      btn.onclick = () => {
        const index = parseInt(btn.getAttribute('data-index'));
        const pem = bags[index].pem;
        helpers.copyToClipboard(pem, btn);
      };
    });
  }
})();
