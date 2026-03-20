/**
 * OmniOpener — Security (PEM/CRT/KEY) Toolkit
 * Uses OmniTool SDK and node-forge.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.key,.pub',
      dropLabel: 'Drop a certificate or key file here',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Professional certificate decoder with expiry analysis, fingerprints, and public key extraction.',
      
      onInit: function(h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },

      actions: [
        {
          label: '📋 Copy PEM',
          id: 'copy',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        }
      ],

      onFile: function (file, content, h) {
        if (typeof forge === 'undefined') {
          h.showLoading('Loading Security engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        let type = "Unknown PEM";
        let infoHtml = "";
        let pubKeyPem = null;
        
        try {
           if (content.includes('BEGIN CERTIFICATE')) {
              type = "X.509 Certificate";
              const cert = forge.pki.certificateFromPem(content);
              const subject = cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
              const issuer = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
              const validTo = cert.validity.notAfter;
              const daysLeft = Math.ceil((validTo - new Date()) / (1000 * 60 * 60 * 24));
              
              // Fingerprints
              const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
              const md5 = forge.md.md5.create().update(der).digest().toHex().match(/.{2}/g).join(':');
              const sha1 = forge.md.sha1.create().update(der).digest().toHex().match(/.{2}/g).join(':');
              const sha256 = forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':');

              pubKeyPem = forge.pki.publicKeyToPem(cert.publicKey);

              infoHtml = `
                <div class="space-y-6">
                   <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
                         <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Status</div>
                         <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${daysLeft < 0 ? 'bg-red-500' : 'bg-green-500'}"></span>
                            <span class="font-bold ${daysLeft < 0 ? 'text-red-600' : 'text-green-600'}">${daysLeft < 0 ? 'Expired' : 'Valid'}</span>
                            <span class="text-xs text-surface-500">(${daysLeft} days left)</span>
                         </div>
                      </div>
                      <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
                         <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Key Type</div>
                         <div class="font-bold text-surface-900">${cert.publicKey.n ? 'RSA' : 'ECC'} (${cert.publicKey.n?.bitLength() || 'Unknown'} bits)</div>
                      </div>
                   </div>
                   <div class="space-y-4">
                      <div class="flex flex-col"><span class="text-[10px] font-bold text-surface-400 uppercase">Subject</span><span class="text-xs font-bold text-surface-900 break-all">${escapeHtml(subject)}</span></div>
                      <div class="flex flex-col"><span class="text-[10px] font-bold text-surface-400 uppercase">Issuer</span><span class="text-xs text-surface-600 break-all">${escapeHtml(issuer)}</span></div>
                   </div>
                   <div class="p-4 rounded-xl bg-surface-900 text-brand-300 font-mono text-[10px] space-y-2">
                      <p><span class="text-surface-500 uppercase mr-2">MD5:</span> ${md5}</p>
                      <p><span class="text-surface-500 uppercase mr-2">SHA1:</span> ${sha1}</p>
                      <p><span class="text-surface-500 uppercase mr-2">SHA256:</span> ${sha256}</p>
                   </div>
                   <button id="btn-extract-pub" class="w-full py-2 bg-brand-600 text-white font-bold rounded-lg text-xs hover:bg-brand-700 transition-all">📥 Download Public Key</button>
                </div>
              `;
           } else if (content.includes('BEGIN PRIVATE KEY')) {
              type = "Private Key";
              infoHtml = `<div class="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm leading-relaxed">🔒 <strong>Private Key Detected.</strong> This file contains sensitive cryptographic material. Ensure you handle it securely.</div>`;
           }

           h.render(`
             <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
               <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex justify-between items-center">
                  <div><h3 class="text-lg font-bold text-surface-900">${escapeHtml(file.name)}</h3><span class="text-[9px] font-bold uppercase bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${type}</span></div>
                  <span class="text-[10px] font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</span>
               </div>
               <div class="flex-1 overflow-auto p-8 space-y-8">
                  ${infoHtml}
                  <div class="flex flex-col">
                     <span class="text-[10px] font-bold text-surface-400 uppercase mb-3">Raw PEM Source</span>
                     <pre class="bg-surface-900 text-surface-100 p-6 rounded-xl font-mono text-[11px] overflow-auto shadow-inner leading-relaxed"><code>${escapeHtml(content)}</code></pre>
                  </div>
               </div>
            </div>
           `);

           if (pubKeyPem) {
              document.getElementById('btn-extract-pub').onclick = () => h.download('public_key.pem', pubKeyPem);
           }

        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Failed to decode PEM. Invalid or corrupted data.</div>`);
        }
      }
    });
  };
})();

