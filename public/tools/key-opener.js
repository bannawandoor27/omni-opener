/**
 * OmniOpener — Security (PEM/CRT/KEY) Toolkit
 * Uses OmniTool SDK and node-forge.
 */
(function () {
  'use strict';

  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.key,.pub',
      dropLabel: 'Drop a PEM certificate or key here',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Professional certificate decoder with expiry analysis, fingerprints, and public key extraction. All processing is 100% client-side.',

      onInit: function (h) {
        return h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },

      actions: [
        {
          label: '📋 Copy PEM',
          id: 'copy-pem',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        },
        {
          label: '📥 Download Public Key',
          id: 'dl-pub',
          onClick: function (h, btn) {
            const pubKey = h.getState().pubKeyPem;
            if (pubKey) {
              h.download('public_key.pem', pubKey);
            } else {
              alert('No public key available to download from this file.');
            }
          }
        }
      ],

      onFile: function (file, content, h) {
        h.showLoading('Analyzing security file...');

        const run = () => {
          try {
            processPem(file, content, h);
          } catch (err) {
            console.error(err);
            h.showError('Decoding Error', 'Failed to parse PEM data. Ensure it is a valid PEM-encoded certificate or key.');
          }
        };

        if (typeof forge === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js')
            .then(run)
            .catch(err => h.showError('Dependency Error', 'Could not load node-forge library.'));
        } else {
          run();
        }
      }
    });
  };

  function processPem(file, content, h) {
    let type = "Unknown PEM";
    let detailsHtml = "";
    let pubKeyPem = null;

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
      const daysLeft = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));

      // Fingerprints
      const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
      const md5 = forge.md.md5.create().update(der).digest().toHex().match(/.{2}/g).join(':');
      const sha1 = forge.md.sha1.create().update(der).digest().toHex().match(/.{2}/g).join(':');
      const sha256 = forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':');

      pubKeyPem = forge.pki.publicKeyToPem(cert.publicKey);
      
      const statusColor = isExpired ? 'text-red-600' : (isNotYetValid ? 'text-yellow-600' : 'text-green-600');
      const statusLabel = isExpired ? 'Expired' : (isNotYetValid ? 'Not Yet Valid' : 'Valid');
      const dotColor = isExpired ? 'bg-red-500' : (isNotYetValid ? 'bg-yellow-500' : 'bg-green-500');

      detailsHtml = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
            <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Status</div>
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full ${dotColor}"></span>
              <span class="font-bold ${statusColor}">${statusLabel}</span>
              <span class="text-xs text-surface-500">(${daysLeft} days left)</span>
            </div>
          </div>
          <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
            <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Key Algorithm</div>
            <div class="font-bold text-surface-900">${cert.publicKey.n ? 'RSA' : 'ECC'} (${cert.publicKey.n ? cert.publicKey.n.bitLength() : 'Unknown'} bits)</div>
          </div>
        </div>
        <div class="space-y-4 mb-6">
          <div class="flex flex-col"><span class="text-[10px] font-bold text-surface-400 uppercase">Subject</span><span class="text-xs font-bold text-surface-900 break-all">${esc(subject)}</span></div>
          <div class="flex flex-col"><span class="text-[10px] font-bold text-surface-400 uppercase">Issuer</span><span class="text-xs text-surface-600 break-all">${esc(issuer)}</span></div>
          <div class="flex flex-col"><span class="text-[10px] font-bold text-surface-400 uppercase">Validity Period</span><span class="text-xs text-surface-600">${validFrom.toUTCString()} — ${validTo.toUTCString()}</span></div>
          <div class="flex flex-col"><span class="text-[10px] font-bold text-surface-400 uppercase">Serial Number</span><span class="text-xs text-surface-600 font-mono">${esc(cert.serialNumber)}</span></div>
        </div>
        <div class="p-4 rounded-xl bg-surface-900 text-brand-300 font-mono text-[10px] space-y-2 mb-6">
          <p><span class="text-surface-500 uppercase mr-2">MD5:</span> ${md5}</p>
          <p><span class="text-surface-500 uppercase mr-2">SHA1:</span> ${sha1}</p>
          <p><span class="text-surface-500 uppercase mr-2">SHA256:</span> ${sha256}</p>
        </div>
      `;
    } else if (content.includes('BEGIN PRIVATE KEY') || content.includes('BEGIN RSA PRIVATE KEY') || content.includes('BEGIN EC PRIVATE KEY')) {
      type = "Private Key";
      detailsHtml = `
        <div class="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm leading-relaxed mb-6">
          🔒 <strong>Private Key Detected.</strong> This file contains sensitive cryptographic material. Ensure you handle it securely. Never share your private keys or upload them to untrusted services.
        </div>
      `;
      try {
        const privKey = forge.pki.privateKeyFromPem(content);
        if (privKey.n && privKey.e) {
          const pubKey = forge.pki.setRsaPublicKey(privKey.n, privKey.e);
          pubKeyPem = forge.pki.publicKeyToPem(pubKey);
        }
      } catch (e) {}
    } else if (content.includes('BEGIN PUBLIC KEY') || content.includes('BEGIN RSA PUBLIC KEY')) {
      type = "Public Key";
      detailsHtml = `
        <div class="p-6 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-sm leading-relaxed mb-6">
          🔑 <strong>Public Key Detected.</strong> This is the public component of a key pair, safe for distribution.
        </div>
      `;
      pubKeyPem = content;
    } else {
      detailsHtml = `<div class="p-6 bg-surface-50 border border-surface-100 rounded-xl text-surface-600 text-sm leading-relaxed mb-6">Unknown PEM format. Raw source displayed below.</div>`;
    }

    h.setState({ pubKeyPem: pubKeyPem });

    h.render(`
      <div class="flex flex-col h-full font-sans">
        <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h3 class="text-lg font-bold text-surface-900">${esc(file.name)}</h3>
            <span class="text-[9px] font-bold uppercase bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${type}</span>
          </div>
          <span class="text-[10px] font-mono text-surface-400">${(content.length / 1024).toFixed(1)} KB</span>
        </div>
        <div class="flex-1 overflow-auto p-8">
          ${detailsHtml}
          <div class="flex flex-col">
            <span class="text-[10px] font-bold text-surface-400 uppercase mb-3">Raw PEM Source</span>
            <pre class="bg-surface-900 text-surface-100 p-6 rounded-xl font-mono text-[11px] overflow-auto shadow-inner leading-relaxed"><code>${esc(content)}</code></pre>
          </div>
        </div>
      </div>
    `);
  }
})();
