/**
 * OmniOpener — Security (PEM/CRT/KEY) Toolkit
 * Uses OmniTool SDK and node-forge.
 */
(function () {
  'use strict';

  const FORGE_CDN = 'https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js';

  /**
   * Escape HTML to prevent XSS.
   */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format bytes to human readable string.
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.key,.pub',
      dropLabel: 'Drop a PEM certificate or key here',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Professional certificate decoder with expiry analysis, fingerprints, and public key extraction. All processing is 100% client-side.',

      onInit: function (helpers) {
        return helpers.loadScript(FORGE_CDN);
      },

      onDestroy: function () {
        // No persistent resources to clean up in this tool
      },

      actions: [
        {
          label: '📋 Copy PEM',
          id: 'copy-pem',
          onClick: function (h, btn) {
            const content = h.getState().rawContent;
            if (content) {
              h.copyToClipboard(content, btn);
            }
          }
        },
        {
          label: '📥 Download Public Key',
          id: 'dl-pub',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.pubKeyPem) {
              h.download(state.fileName.replace(/\.[^/.]+$/, "") + '_public.pem', state.pubKeyPem);
            } else {
              h.showError('No Public Key', 'A public key could not be extracted from this file.');
            }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (!content || content.trim().length === 0) {
          return h.showError('Empty File', 'The uploaded file contains no content.');
        }

        h.showLoading('Analyzing security file...');
        h.setState({ rawContent: content, fileName: file.name });

        // Ensure dependency is loaded
        const checkLibrary = () => {
          if (window.forge) {
            processPem(file, content, h);
          } else {
            h.loadScript(FORGE_CDN)
              .then(() => processPem(file, content, h))
              .catch(() => h.showError('Library Error', 'Failed to load cryptographic library. Please check your connection.'));
          }
        };

        // Small delay to ensure loading message is visible
        setTimeout(checkLibrary, 100);
      }
    });
  };

  /**
   * Core logic for parsing PEM files and rendering the results.
   */
  function processPem(file, content, h) {
    try {
      const forge = window.forge;
      let type = "Unknown PEM";
      let detailsHtml = "";
      let pubKeyPem = null;
      let extraActions = [];

      if (content.includes('BEGIN CERTIFICATE')) {
        type = "X.509 Certificate";
        const cert = forge.pki.certificateFromPem(content);
        
        const subject = cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
        const issuer = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
        
        const validFrom = cert.validity.notBefore;
        const validTo = cert.validity.notAfter;
        const now = new Date();
        const isExpired = now > validTo;
        const isNotYetValid = now < validFrom;
        
        const diffMs = validTo - now;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        // Fingerprints
        const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
        const md5 = forge.md.md5.create().update(der).digest().toHex().match(/.{2}/g).join(':');
        const sha1 = forge.md.sha1.create().update(der).digest().toHex().match(/.{2}/g).join(':');
        const sha256 = forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':');

        pubKeyPem = forge.pki.publicKeyToPem(cert.publicKey);
        
        let statusColor = 'text-green-600';
        let statusBg = 'bg-green-50';
        let statusBorder = 'border-green-100';
        let statusLabel = 'Valid Certificate';
        let dotColor = 'bg-green-500';

        if (isExpired) {
          statusColor = 'text-red-600';
          statusBg = 'bg-red-50';
          statusBorder = 'border-red-100';
          statusLabel = 'Expired';
          dotColor = 'bg-red-500';
        } else if (daysLeft < 30) {
          statusColor = 'text-yellow-600';
          statusBg = 'bg-yellow-50';
          statusBorder = 'border-yellow-100';
          statusLabel = 'Expiring Soon';
          dotColor = 'bg-yellow-500';
        } else if (isNotYetValid) {
          statusColor = 'text-blue-600';
          statusBg = 'bg-blue-50';
          statusBorder = 'border-blue-100';
          statusLabel = 'Not Yet Valid';
          dotColor = 'bg-blue-500';
        }

        detailsHtml = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div class="p-4 rounded-xl ${statusBg} border ${statusBorder}">
              <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Status</div>
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${dotColor}"></span>
                <span class="font-bold ${statusColor}">${statusLabel}</span>
                <span class="text-xs text-surface-500">${isExpired ? `Expired ${Math.abs(daysLeft)} days ago` : `(${daysLeft} days remaining)`}</span>
              </div>
            </div>
            <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
              <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Key Algorithm</div>
              <div class="font-bold text-surface-900">${cert.publicKey.n ? 'RSA' : 'ECC'} (${cert.publicKey.n ? cert.publicKey.n.bitLength() : 'Unknown'} bits)</div>
            </div>
          </div>

          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Certificate Details</h3>
          </div>
          
          <div class="space-y-4 mb-8">
            <div class="flex flex-col p-3 rounded-lg hover:bg-surface-50 transition-colors">
              <span class="text-[10px] font-bold text-surface-400 uppercase">Subject</span>
              <span class="text-sm font-semibold text-surface-900 break-all">${esc(subject)}</span>
            </div>
            <div class="flex flex-col p-3 rounded-lg hover:bg-surface-50 transition-colors">
              <span class="text-[10px] font-bold text-surface-400 uppercase">Issuer</span>
              <span class="text-sm text-surface-700 break-all">${esc(issuer)}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col p-3 rounded-lg hover:bg-surface-50 transition-colors">
                <span class="text-[10px] font-bold text-surface-400 uppercase">Valid From</span>
                <span class="text-sm text-surface-700">${validFrom.toUTCString()}</span>
              </div>
              <div class="flex flex-col p-3 rounded-lg hover:bg-surface-50 transition-colors">
                <span class="text-[10px] font-bold text-surface-400 uppercase">Valid Until</span>
                <span class="text-sm text-surface-700">${validTo.toUTCString()}</span>
              </div>
            </div>
            <div class="flex flex-col p-3 rounded-lg hover:bg-surface-50 transition-colors">
              <span class="text-[10px] font-bold text-surface-400 uppercase">Serial Number</span>
              <span class="text-xs text-surface-600 font-mono break-all">${esc(cert.serialNumber)}</span>
            </div>
          </div>

          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Fingerprints</h3>
          </div>
          <div class="p-4 rounded-xl bg-gray-950 text-brand-300 font-mono text-[10px] space-y-3 mb-8 shadow-inner">
            <div class="flex flex-col gap-1">
              <span class="text-gray-500 uppercase">MD5</span>
              <span class="text-gray-200 select-all">${md5}</span>
            </div>
            <div class="flex flex-col gap-1 border-t border-gray-800 pt-2">
              <span class="text-gray-500 uppercase">SHA-1</span>
              <span class="text-gray-200 select-all">${sha1}</span>
            </div>
            <div class="flex flex-col gap-1 border-t border-gray-800 pt-2">
              <span class="text-gray-500 uppercase">SHA-256</span>
              <span class="text-gray-200 select-all">${sha256}</span>
            </div>
          </div>
        `;
      } else if (content.includes('BEGIN PRIVATE KEY') || content.includes('BEGIN RSA PRIVATE KEY') || content.includes('BEGIN EC PRIVATE KEY')) {
        type = "Private Key";
        detailsHtml = `
          <div class="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm leading-relaxed mb-8 flex gap-4">
            <span class="text-2xl">🔒</span>
            <div>
              <strong class="block mb-1">Private Key Detected</strong>
              This file contains sensitive cryptographic material. Ensure you handle it securely. All parsing happened locally in your browser.
            </div>
          </div>
          
          <div class="p-4 rounded-xl bg-surface-50 border border-surface-100 mb-8">
             <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Key Type</div>
             <div class="font-bold text-surface-900">
               ${content.includes('RSA') ? 'RSA' : (content.includes('EC') ? 'Elliptic Curve' : 'PKCS#8 Private Key')}
             </div>
          </div>
        `;
        try {
          const privKey = forge.pki.privateKeyFromPem(content);
          if (privKey.n && privKey.e) {
            const pubKey = forge.pki.setRsaPublicKey(privKey.n, privKey.e);
            pubKeyPem = forge.pki.publicKeyToPem(pubKey);
          } else if (privKey.publicKey) {
            pubKeyPem = forge.pki.publicKeyToPem(privKey.publicKey);
          }
        } catch (e) {
          console.warn('Could not extract public key from private key:', e);
        }
      } else if (content.includes('BEGIN PUBLIC KEY') || content.includes('BEGIN RSA PUBLIC KEY')) {
        type = "Public Key";
        detailsHtml = `
          <div class="p-6 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-sm leading-relaxed mb-8 flex gap-4">
            <span class="text-2xl">🔑</span>
            <div>
              <strong class="block mb-1">Public Key Detected</strong>
              This is the public component of a key pair, safe for distribution.
            </div>
          </div>
        `;
        pubKeyPem = content;
      } else {
        detailsHtml = `
          <div class="p-6 bg-surface-50 border border-surface-100 rounded-xl text-surface-600 text-sm leading-relaxed mb-8">
            The PEM file format is recognized but specific parsing for this variant is not yet implemented.
          </div>
        `;
      }

      h.setState({ pubKeyPem: pubKeyPem });

      h.render(`
        <div class="flex flex-col h-full">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500 font-medium bg-surface-100 px-2 py-0.5 rounded text-[10px] uppercase">${type}</span>
          </div>

          <div class="flex-1 overflow-auto pr-2">
            ${detailsHtml}
            
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Raw PEM Source</h3>
              <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${content.trim().split('\n').length} lines</span>
            </div>
            
            <!-- U8. Code/pre block -->
            <div class="rounded-xl overflow-hidden border border-surface-200 mb-8">
              <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-gray-700"><code>${esc(content.trim())}</code></pre>
            </div>
          </div>
        </div>
      `);

    } catch (err) {
      console.error(err);
      h.showError('Parsing Failed', 'The security file could not be parsed. Ensure it is a valid PEM-encoded certificate or key.');
    }
  }
})();