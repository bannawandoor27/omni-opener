/**
 * OmniOpener — Security (PEM/CRT/KEY) Toolkit
 * Professional certificate decoder with expiry analysis and key extraction.
 */
(function () {
  'use strict';

  /**
   * Simple HTML escaping to prevent XSS.
   */
  function escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Human-readable file size.
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    // Closure variables for cleanup
    let forgeLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.cer,.key,.pub,.der',
      dropLabel: 'Drop a certificate, public key, or private key file',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Decode X.509 certificates, analyze expiry dates, calculate fingerprints, and extract public keys from PEM files.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js', () => {
          forgeLoaded = true;
        });
      },

      onDestroy: function (h) {
        // Cleanup if necessary
      },

      actions: [
        {
          label: '📋 Copy PEM',
          id: 'copy-pem',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        // Handle empty file
        if (!content || content.trim().length === 0) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-center">
              <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <h3 class="text-lg font-semibold text-surface-900">Empty File</h3>
              <p class="text-surface-500 max-w-xs mx-auto">This file appears to have no content. Please upload a valid PEM certificate or key.</p>
            </div>
          `);
          return;
        }

        // Wait for library
        if (!forgeLoaded || typeof forge === 'undefined') {
          h.showLoading('Initializing Security Engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Decoding security object...');

        try {
          const isCert = content.includes('BEGIN CERTIFICATE');
          const isPrivKey = content.includes('BEGIN PRIVATE KEY') || content.includes('BEGIN RSA PRIVATE KEY');
          const isPubKey = content.includes('BEGIN PUBLIC KEY') || (content.includes('BEGIN RSA PUBLIC KEY') && !isCert);

          let typeLabel = "Unknown PEM";
          let detailsHtml = "";
          let extractedPubKey = null;

          // Common File Info Bar
          const infoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
              <span class="font-semibold text-surface-800">${escape(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatSize(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">Security PEM File</span>
            </div>
          `;

          if (isCert) {
            typeLabel = "X.509 Certificate";
            const cert = forge.pki.certificateFromPem(content);
            
            // Validity Analysis
            const validFrom = cert.validity.notBefore;
            const validTo = cert.validity.notAfter;
            const now = new Date();
            const totalDuration = validTo - validFrom;
            const elapsed = now - validFrom;
            const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
            const daysLeft = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));
            
            let statusColor = "text-green-600";
            let statusBg = "bg-green-100";
            let statusDot = "bg-green-500";
            let statusText = "Valid";

            if (daysLeft < 0) {
              statusColor = "text-red-600";
              statusBg = "bg-red-100";
              statusDot = "bg-red-500";
              statusText = "Expired";
            } else if (daysLeft < 30) {
              statusColor = "text-amber-600";
              statusBg = "bg-amber-100";
              statusDot = "bg-amber-500";
              statusText = "Expiring Soon";
            }

            // Fingerprints
            const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
            const fingerprints = {
              md5: forge.md.md5.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase(),
              sha1: forge.md.sha1.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase(),
              sha256: forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase()
            };

            // Subject / Issuer
            const formatAttr = (attrs) => attrs.map(a => `<span class="inline-block bg-surface-100 px-1.5 py-0.5 rounded text-[10px] font-mono mr-1 mb-1">${escape(a.shortName || a.name)}=${escape(a.value)}</span>`).join('');
            
            extractedPubKey = forge.pki.publicKeyToPem(cert.publicKey);

            detailsHtml = `
              <div class="space-y-6">
                <!-- Status Cards -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="p-4 rounded-xl border border-surface-200 bg-white shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Status</div>
                    <div class="flex items-center gap-2">
                      <span class="w-2.5 h-2.5 rounded-full ${statusDot} animate-pulse"></span>
                      <span class="font-bold ${statusColor}">${statusText}</span>
                    </div>
                    <div class="mt-1 text-xs text-surface-500">${daysLeft < 0 ? Math.abs(daysLeft) + ' days ago' : daysLeft + ' days remaining'}</div>
                  </div>
                  
                  <div class="p-4 rounded-xl border border-surface-200 bg-white shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Public Key</div>
                    <div class="font-bold text-surface-900">${cert.publicKey.n ? 'RSA' : 'ECC'}</div>
                    <div class="mt-1 text-xs text-surface-500">${cert.publicKey.n ? cert.publicKey.n.bitLength() + ' bits' : 'Elliptic Curve'}</div>
                  </div>

                  <div class="p-4 rounded-xl border border-surface-200 bg-white shadow-sm">
                    <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Serial Number</div>
                    <div class="font-mono text-xs text-surface-700 break-all">${cert.serialNumber}</div>
                  </div>
                </div>

                <!-- Identity -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div class="space-y-3">
                    <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                      <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                      Subject
                    </h3>
                    <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/50">
                      ${formatAttr(cert.subject.attributes)}
                    </div>
                  </div>
                  <div class="space-y-3">
                    <h3 class="font-semibold text-surface-800 flex items-center gap-2">
                      <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                      Issuer
                    </h3>
                    <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/50">
                      ${formatAttr(cert.issuer.attributes)}
                    </div>
                  </div>
                </div>

                <!-- Validity Timeline -->
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Validity Period</h3>
                    <span class="text-[10px] font-mono text-surface-400">${validFrom.toLocaleDateString()} — ${validTo.toLocaleDateString()}</span>
                  </div>
                  <div class="h-2 w-full bg-surface-100 rounded-full overflow-hidden">
                    <div class="h-full ${statusDot}" style="width: ${progress}%"></div>
                  </div>
                </div>

                <!-- Fingerprints -->
                <div class="space-y-3">
                  <h3 class="font-semibold text-surface-800">Fingerprints</h3>
                  <div class="rounded-xl border border-surface-200 overflow-hidden">
                    <table class="min-w-full text-xs font-mono">
                      <tr class="border-b border-surface-100">
                        <td class="px-4 py-2 bg-surface-50 font-bold text-surface-500 w-24">MD5</td>
                        <td class="px-4 py-2 text-surface-700 break-all">${fingerprints.md5}</td>
                      </tr>
                      <tr class="border-b border-surface-100">
                        <td class="px-4 py-2 bg-surface-50 font-bold text-surface-500 w-24">SHA-1</td>
                        <td class="px-4 py-2 text-surface-700 break-all">${fingerprints.sha1}</td>
                      </tr>
                      <tr>
                        <td class="px-4 py-2 bg-surface-50 font-bold text-surface-500 w-24">SHA-256</td>
                        <td class="px-4 py-2 text-surface-700 break-all">${fingerprints.sha256}</td>
                      </tr>
                    </table>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex flex-wrap gap-3">
                  <button id="btn-dl-pub" class="inline-flex items-center px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Download Public Key (.pem)
                  </button>
                </div>
              </div>
            `;
          } else if (isPrivKey) {
            typeLabel = "Private Key";
            detailsHtml = `
              <div class="p-6 bg-red-50 border border-red-100 rounded-xl flex items-start gap-4">
                <div class="p-2 bg-red-100 rounded-lg text-red-600">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                </div>
                <div class="space-y-1">
                  <h3 class="font-bold text-red-800">Sensitive Material Detected</h3>
                  <p class="text-sm text-red-700 leading-relaxed">
                    This file contains a <strong>Private Key</strong>. Private keys should never be shared or uploaded to untrusted systems. 
                    Parsing is disabled for security.
                  </p>
                </div>
              </div>
            `;
          } else if (isPubKey) {
            typeLabel = "Public Key";
            detailsHtml = `
              <div class="p-6 bg-brand-50 border border-brand-100 rounded-xl flex items-start gap-4">
                <div class="p-2 bg-brand-100 rounded-lg text-brand-600">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                </div>
                <div class="space-y-1">
                  <h3 class="font-bold text-brand-800">Public Key Detected</h3>
                  <p class="text-sm text-brand-700 leading-relaxed">
                    This is a standalone public key file. You can use it for encryption or signature verification.
                  </p>
                </div>
              </div>
            `;
          }

          h.render(`
            <div class="max-w-5xl mx-auto">
              ${infoBar}

              <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <!-- Left: Analysis -->
                <div class="xl:col-span-2 space-y-8">
                  <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-surface-900">${typeLabel}</h2>
                    <span class="px-2.5 py-1 bg-brand-100 text-brand-700 rounded-full text-xs font-bold uppercase tracking-wider">${typeLabel}</span>
                  </div>
                  
                  ${detailsHtml}
                </div>

                <!-- Right: Raw Content -->
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Raw PEM Source</h3>
                    <button id="btn-copy-mini" class="text-xs text-brand-600 hover:text-brand-700 font-medium">Copy</button>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-[10px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-[600px] scrollbar-thin scrollbar-thumb-gray-800"><code>${escape(content)}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          `);

          // Event Listeners
          const dlBtn = document.getElementById('btn-dl-pub');
          if (dlBtn && extractedPubKey) {
            dlBtn.onclick = () => h.download('public_key.pem', extractedPubKey);
          }

          const copyMiniBtn = document.getElementById('btn-copy-mini');
          if (copyMiniBtn) {
            copyMiniBtn.onclick = (e) => h.copyToClipboard(content, e.target);
          }

        } catch (err) {
          console.error(err);
          h.showError('Parsing Failed', 'The PEM content could not be decoded. Ensure it is a valid X.509 certificate or key in text format.');
        }
      }
    });
  };
})();
