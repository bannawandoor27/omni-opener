/**
 * OmniOpener — Security (PEM/CRT/KEY) Toolkit
 * Uses OmniTool SDK and node-forge.
 */
(function () {
  'use strict';

  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.key,.pub,.der',
      dropLabel: 'Drop a certificate, key, or CSR file here',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Professional certificate decoder with expiry analysis, fingerprints, and public key extraction. All processing happens locally in your browser.',

      onInit: function (h) {
        return h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },

      actions: [
        {
          label: '📋 Copy Content',
          id: 'copy',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
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

      onFile: function _onFile(file, content, h) {
        if (typeof forge === 'undefined') {
          h.showLoading('Initializing Security engine...');
          setTimeout(function () { _onFile(file, content, h); }, 300);
          return;
        }

        h.showLoading('Decoding certificate data...');

        try {
          const trimmedContent = content.trim();
          let renderHtml = '';

          // UI - File Info Bar
          const infoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${escape(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatBytes(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">Security File</span>
            </div>
          `;

          if (trimmedContent.includes('BEGIN CERTIFICATE')) {
            const cert = forge.pki.certificateFromPem(trimmedContent);
            const subject = cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
            const issuer = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
            
            const notBefore = cert.validity.notBefore;
            const notAfter = cert.validity.notAfter;
            const now = new Date();
            const daysLeft = Math.ceil((notAfter - now) / (1000 * 60 * 60 * 24));
            
            let statusClass = 'bg-green-100 text-green-700';
            let statusDot = 'bg-green-500';
            let statusText = 'Valid';
            
            if (daysLeft < 0) {
              statusClass = 'bg-red-100 text-red-700';
              statusDot = 'bg-red-500';
              statusText = 'Expired';
            } else if (daysLeft <= 30) {
              statusClass = 'bg-yellow-100 text-yellow-700';
              statusDot = 'bg-yellow-500';
              statusText = 'Expiring Soon';
            }

            // Fingerprints
            const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
            const md5 = forge.md.md5.create().update(der).digest().toHex().match(/.{2}/g).join(':');
            const sha1 = forge.md.sha1.create().update(der).digest().toHex().match(/.{2}/g).join(':');
            const sha256 = forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':');

            const keyType = cert.publicKey.n ? 'RSA' : 'ECC';
            const keyBits = cert.publicKey.n ? cert.publicKey.n.bitLength() : 'Unknown';

            renderHtml = `
              <div class="p-4 md:p-6 space-y-6">
                ${infoBar}
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 transition-all">
                    <div class="text-xs font-bold text-surface-400 uppercase mb-2">Certificate Status</div>
                    <div class="flex items-center gap-2">
                      <span class="w-3 h-3 rounded-full ${statusDot} animate-pulse"></span>
                      <span class="px-2 py-0.5 rounded-full text-xs font-bold ${statusClass}">${statusText}</span>
                      <span class="text-sm text-surface-600">${daysLeft < 0 ? Math.abs(daysLeft) + ' days ago' : daysLeft + ' days remaining'}</span>
                    </div>
                  </div>
                  <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 transition-all">
                    <div class="text-xs font-bold text-surface-400 uppercase mb-2">Public Key</div>
                    <div class="text-sm font-semibold text-surface-800">${keyType} <span class="text-surface-500">(${keyBits} bits)</span></div>
                  </div>
                </div>

                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Identity Details</h3>
                  </div>
                  <div class="space-y-3">
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Subject</div>
                      <div class="text-sm text-surface-800 break-all font-medium">${escape(subject)}</div>
                    </div>
                    <div class="p-3 bg-surface-50 rounded-lg border border-surface-100">
                      <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Issuer</div>
                      <div class="text-sm text-surface-600 break-all">${escape(issuer)}</div>
                    </div>
                  </div>
                </div>

                <div class="space-y-4">
                  <h3 class="font-semibold text-surface-800">Validity Period</h3>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="p-3 border border-surface-100 rounded-lg">
                      <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Not Before</div>
                      <div class="text-sm text-surface-700">${notBefore.toUTCString()}</div>
                    </div>
                    <div class="p-3 border border-surface-100 rounded-lg">
                      <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Not After</div>
                      <div class="text-sm text-surface-700 font-semibold ${daysLeft <= 30 ? 'text-orange-600' : ''} ${daysLeft < 0 ? 'text-red-600' : ''}">${notAfter.toUTCString()}</div>
                    </div>
                  </div>
                </div>

                <div class="space-y-4">
                  <h3 class="font-semibold text-surface-800">Fingerprints</h3>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <div class="bg-gray-950 p-4 space-y-2 font-mono text-[11px]">
                      <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                        <span class="text-gray-500 w-16 uppercase">SHA256</span>
                        <span class="text-brand-400 break-all">${sha256}</span>
                      </div>
                      <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                        <span class="text-gray-500 w-16 uppercase">SHA1</span>
                        <span class="text-gray-300 break-all">${sha1}</span>
                      </div>
                      <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                        <span class="text-gray-500 w-16 uppercase">MD5</span>
                        <span class="text-gray-300 break-all">${md5}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2 pt-2">
                  <button id="btn-copy-pub" class="flex-1 min-w-[150px] px-4 py-2.5 bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold rounded-xl text-xs transition-all border border-brand-200">📋 Copy Public Key</button>
                  <button id="btn-dl-pub" class="flex-1 min-w-[150px] px-4 py-2.5 bg-surface-900 text-white hover:bg-black font-bold rounded-xl text-xs transition-all border border-transparent shadow-sm">📥 Download Public Key</button>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-surface-400 uppercase">PEM Source</span>
                    <button id="btn-copy-raw" class="text-[10px] text-brand-600 font-bold hover:underline">Copy Source</button>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-[10px] font-mono bg-gray-50 text-surface-700 overflow-x-auto max-h-40"><code>${escape(trimmedContent)}</code></pre>
                  </div>
                </div>
              </div>
            `;

            h.render(renderHtml);

            const pubKeyPem = forge.pki.publicKeyToPem(cert.publicKey);
            document.getElementById('btn-copy-pub').onclick = (e) => h.copyToClipboard(pubKeyPem, e.target);
            document.getElementById('btn-dl-pub').onclick = () => h.download('public_key.pem', pubKeyPem);
            document.getElementById('btn-copy-raw').onclick = (e) => h.copyToClipboard(trimmedContent, e.target);

          } else if (trimmedContent.includes('BEGIN PRIVATE KEY') || trimmedContent.includes('BEGIN RSA PRIVATE KEY') || trimmedContent.includes('BEGIN EC PRIVATE KEY')) {
            renderHtml = `
              <div class="p-4 md:p-6 space-y-6">
                ${infoBar}
                <div class="p-5 bg-red-50 border border-red-100 rounded-xl">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">🔒</span>
                    <h3 class="font-bold text-red-800">Private Key Detected</h3>
                  </div>
                  <p class="text-sm text-red-700 leading-relaxed">
                    This file contains sensitive cryptographic material. For security, parsing is restricted. 
                    Ensure you handle this file with extreme caution and do not share it.
                  </p>
                </div>
                
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-surface-400 uppercase">Secure Content</span>
                    <span class="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase">Sensitive</span>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
                    <pre class="p-5 text-[11px] font-mono bg-gray-950 text-red-400 overflow-x-auto leading-relaxed"><code>${escape(trimmedContent)}</code></pre>
                  </div>
                </div>
              </div>
            `;
            h.render(renderHtml);
          } else if (trimmedContent.includes('BEGIN PUBLIC KEY') || trimmedContent.includes('BEGIN RSA PUBLIC KEY')) {
            renderHtml = `
              <div class="p-4 md:p-6 space-y-6">
                ${infoBar}
                <div class="p-5 bg-blue-50 border border-blue-100 rounded-xl">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">🔑</span>
                    <h3 class="font-bold text-blue-800">Public Key</h3>
                  </div>
                  <p class="text-sm text-blue-700 leading-relaxed">
                    Standard PEM-encoded public key. This can be safely shared for encryption or signature verification.
                  </p>
                </div>
                
                <div class="space-y-2">
                  <div class="text-xs font-bold text-surface-400 uppercase">Key Data</div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-5 text-[11px] font-mono bg-gray-950 text-blue-300 overflow-x-auto leading-relaxed"><code>${escape(trimmedContent)}</code></pre>
                  </div>
                </div>
              </div>
            `;
            h.render(renderHtml);
          } else if (trimmedContent.includes('BEGIN CERTIFICATE REQUEST')) {
             renderHtml = `
              <div class="p-4 md:p-6 space-y-6">
                ${infoBar}
                <div class="p-5 bg-brand-50 border border-brand-100 rounded-xl">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="text-xl">📝</span>
                    <h3 class="font-bold text-brand-800">Certificate Signing Request (CSR)</h3>
                  </div>
                  <p class="text-sm text-brand-700 leading-relaxed">
                    This file is a request to a Certificate Authority (CA) to sign a public key.
                  </p>
                </div>
                
                <div class="space-y-2">
                  <div class="text-xs font-bold text-surface-400 uppercase">CSR Content</div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-5 text-[11px] font-mono bg-gray-950 text-brand-300 overflow-x-auto leading-relaxed"><code>${escape(trimmedContent)}</code></pre>
                  </div>
                </div>
              </div>
            `;
            h.render(renderHtml);
          } else {
            // Attempt to treat as generic PEM or throw
            if (trimmedContent.startsWith('-----BEGIN')) {
               renderHtml = `
                <div class="p-4 md:p-6 space-y-6">
                  ${infoBar}
                  <div class="space-y-2">
                    <div class="text-xs font-bold text-surface-400 uppercase">PEM Data</div>
                    <div class="rounded-xl overflow-hidden border border-surface-200">
                      <pre class="p-5 text-[11px] font-mono bg-gray-900 text-gray-100 overflow-x-auto"><code>${escape(trimmedContent)}</code></pre>
                    </div>
                  </div>
                </div>
              `;
              h.render(renderHtml);
            } else {
              throw new Error("The file format was not recognized as a valid PEM structure.");
            }
          }
        } catch (err) {
          console.error(err);
          h.showError(
            'Could not decode file',
            'The file may be corrupted, password protected, or in a binary format (DER) that is not currently supported. Try converting it to PEM first.'
          );
        }
      }
    });
  };
})();
