(function() {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.crt,.pem,.key,.cer,.der',
      dropLabel: 'Drop a .crt or .pem file here',
      binary: false,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024 && !helpers.getState().proceedLarge) {
          helpers.render(`
            <div class="p-8 text-center h-full flex flex-col items-center justify-center">
              <div class="text-4xl mb-4">⚠️</div>
              <p class="text-surface-700 font-bold mb-2 text-xl">Large File Warning</p>
              <p class="text-sm text-surface-500 mb-6 max-w-sm mx-auto">This file is ${formatSize(file.size)}, which may cause performance issues during parsing.</p>
              <button id="proceed-large-file" class="px-6 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors shadow-sm">
                Proceed Anyway
              </button>
            </div>
          `);
          document.getElementById('proceed-large-file').onclick = () => {
            helpers.setState('proceedLarge', true);
            helpers.onFile(file, content, helpers);
          };
          return;
        }

        if (typeof forge === 'undefined') {
          helpers.showLoading('Loading parsing engine...');
          setTimeout(() => helpers.onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing certificate...');
        
        try {
          const trimmedContent = content.trim();
          let certs = [];
          
          // Try parsing as PEM
          if (trimmedContent.includes('-----BEGIN CERTIFICATE-----')) {
            const pemBlocks = trimmedContent.split('-----END CERTIFICATE-----');
            pemBlocks.forEach(block => {
              const pem = block.trim() + '\n-----END CERTIFICATE-----';
              if (pem.includes('-----BEGIN CERTIFICATE-----')) {
                try {
                  certs.push(forge.pki.certificateFromPem(pem));
                } catch (e) {
                  console.warn('Failed to parse a certificate block', e);
                }
              }
            });
          } else if (trimmedContent.includes('-----BEGIN RSA PRIVATE KEY-----') || 
                     trimmedContent.includes('-----BEGIN PRIVATE KEY-----') ||
                     trimmedContent.includes('-----BEGIN PUBLIC KEY-----')) {
            // It's a key, not a certificate
            renderKeyInfo(file, content, helpers);
            return;
          } else {
            // Try DER (binary usually, but SDK might have read it as text if binary:false)
            // If binary:false, we might have corrupted binary data here.
            // But the prompt says crt/pem are text formats.
            // Most .crt files are PEM.
            throw new Error('Unsupported or invalid certificate format. Please ensure it is a PEM-encoded certificate.');
          }

          if (certs.length === 0) {
            throw new Error('No valid certificates found in file.');
          }

          renderCertificates(certs, file, content, helpers);
        } catch (e) {
          helpers.showError('Could not parse certificate', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy PEM',
          id: 'copy',
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download PEM',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/x-x509-ca-cert');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your certificates never leave your device. Parsing is done using node-forge.'
    });
  };

  function renderCertificates(certs, file, rawContent, helpers) {
    let html = `
      <div class="p-6">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span>${certs.length} Certificate${certs.length > 1 ? 's' : ''} found</span>
        </div>
        
        <div class="space-y-8">
    `;

    certs.forEach((cert, index) => {
      const subject = formatAttributes(cert.subject.attributes);
      const issuer = formatAttributes(cert.issuer.attributes);
      const validFrom = cert.validity.notBefore;
      const validTo = cert.validity.notAfter;
      const now = new Date();
      const isExpired = now > validTo;
      const isNotYetValid = now < validFrom;
      
      const serialNumber = cert.serialNumber;
      const fingerprintSha1 = forge.md.sha1.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex().match(/.{2}/g).join(':');
      const fingerprintSha256 = forge.md.sha256.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex().match(/.{2}/g).join(':');

      html += `
        <div class="border border-surface-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 flex justify-between items-center">
            <h3 class="font-bold text-surface-800">Certificate ${certs.length > 1 ? index + 1 : ''}</h3>
            <span class="px-2 py-0.5 rounded text-xs font-bold uppercase ${isExpired ? 'bg-red-100 text-red-700' : isNotYetValid ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}">
              ${isExpired ? 'Expired' : isNotYetValid ? 'Not Yet Valid' : 'Valid'}
            </span>
          </div>
          
          <div class="p-4 space-y-6">
            <!-- Subject -->
            <section>
              <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Subject</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                ${renderAttributeList(subject)}
              </div>
            </section>

            <!-- Issuer -->
            <section>
              <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Issuer</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                ${renderAttributeList(issuer)}
              </div>
            </section>

            <!-- Validity -->
            <section>
              <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Validity Period</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-surface-50 p-3 rounded-lg">
                  <div class="text-[10px] text-surface-400 uppercase font-bold">Not Before</div>
                  <div class="text-sm text-surface-700 font-medium">${formatDate(validFrom)}</div>
                </div>
                <div class="bg-surface-50 p-3 rounded-lg">
                  <div class="text-[10px] text-surface-400 uppercase font-bold">Not After</div>
                  <div class="text-sm text-surface-700 font-medium">${formatDate(validTo)}</div>
                </div>
              </div>
            </section>

            <!-- Details -->
            <section>
              <h4 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Technical Details</h4>
              <div class="space-y-3">
                <div>
                  <div class="text-[10px] text-surface-400 uppercase font-bold">Serial Number</div>
                  <div class="text-sm font-mono text-surface-600 break-all">${serialNumber}</div>
                </div>
                <div>
                  <div class="text-[10px] text-surface-400 uppercase font-bold">SHA-256 Fingerprint</div>
                  <div class="text-sm font-mono text-surface-600 break-all">${fingerprintSha256}</div>
                </div>
                <div>
                  <div class="text-[10px] text-surface-400 uppercase font-bold">SHA-1 Fingerprint</div>
                  <div class="text-sm font-mono text-surface-600 break-all">${fingerprintSha1}</div>
                </div>
                <div>
                  <div class="text-[10px] text-surface-400 uppercase font-bold">Public Key</div>
                  <div class="text-sm text-surface-600">${cert.publicKey.n ? 'RSA (' + cert.publicKey.n.bitLength() + ' bits)' : 'Unknown Type'}</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    helpers.render(html);
  }

  function renderKeyInfo(file, content, helpers) {
    const isPrivate = content.includes('PRIVATE KEY');
    const type = content.includes('RSA') ? 'RSA' : content.includes('EC') ? 'EC' : 'Unknown';
    
    let html = `
      <div class="p-6">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
        </div>

        <div class="border border-surface-200 rounded-xl overflow-hidden shadow-sm bg-white p-8 text-center">
          <div class="text-4xl mb-4">🔑</div>
          <h3 class="text-xl font-bold text-surface-800 mb-2">${type} ${isPrivate ? 'Private' : 'Public'} Key</h3>
          <p class="text-surface-500 mb-6">This file contains a cryptographic key rather than a certificate.</p>
          
          <div class="text-left bg-surface-900 rounded-lg p-4 font-mono text-xs text-brand-300 overflow-auto max-h-96">
            <pre>${escapeHtml(content)}</pre>
          </div>
        </div>
      </div>
    `;
    helpers.render(html);
  }

  function formatAttributes(attributes) {
    const map = {};
    attributes.forEach(attr => {
      const name = attr.shortName || attr.name;
      if (name) {
        map[name] = attr.value;
      }
    });
    return map;
  }

  function renderAttributeList(map) {
    const labels = {
      'CN': 'Common Name',
      'O': 'Organization',
      'OU': 'Organizational Unit',
      'L': 'Locality',
      'ST': 'State',
      'C': 'Country',
      'E': 'Email',
      'serialName': 'Serial Name'
    };

    return Object.entries(map).map(([key, value]) => `
      <div class="flex flex-col">
        <span class="text-[10px] text-surface-400 uppercase font-bold">${labels[key] || key}</span>
        <span class="text-sm text-surface-700 truncate" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
      </div>
    `).join('');
  }

})();
