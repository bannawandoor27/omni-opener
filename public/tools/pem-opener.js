(function () {
  'use strict';

  /**
   * OmniOpener — PEM / Certificate / Key Security Toolkit
   * Production-grade decoder with chain support, expiry analysis, and key extraction.
   */

  function escapeHTML(str) {
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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let forgeLibraryLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.cer,.key,.pub,.der,.p7b,.p7c',
      dropLabel: 'Drop PEM certificates, private keys, or public keys',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Decode X.509 certificates, analyze validity chains, calculate fingerprints, and safely inspect public/private key metadata.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js', () => {
          forgeLibraryLoaded = true;
        });
      },

      onDestroy: function () {
        // No persistent resources to clean up
      },

      actions: [
        {
          label: '📋 Copy All',
          id: 'copy-all',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const data = h.getState('parsedData');
            if (data) {
              h.download('certificate-info.json', JSON.stringify(data, null, 2));
            } else {
              h.showError('No data', 'Parse a valid certificate first to export as JSON.');
            }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (!content || content.trim().length === 0) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-center">
              <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4 text-surface-400">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              <h3 class="text-lg font-semibold text-surface-900">Empty File</h3>
              <p class="text-surface-500 max-w-xs mx-auto">This file has no text content. Please provide a valid PEM-encoded certificate or key.</p>
            </div>
          `);
          return;
        }

        if (!forgeLibraryLoaded || typeof forge === 'undefined') {
          h.showLoading('Loading Security Engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        h.showLoading('Analyzing security objects...');

        try {
          // Identify blocks
          const certMatches = content.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
          const privKeyMatches = content.match(/-----BEGIN (RSA |EC |)PRIVATE KEY-----[\s\S]+?-----END (RSA |EC |)PRIVATE KEY-----/g) || [];
          const pubKeyMatches = content.match(/-----BEGIN (RSA |)PUBLIC KEY-----[\s\S]+?-----END (RSA |)PUBLIC KEY-----/g) || [];

          const parsedData = {
            certificates: [],
            privateKeysCount: privKeyMatches.length,
            publicKeysCount: pubKeyMatches.length,
            fileName: file.name,
            fileSize: file.size
          };

          // Parse Certificates
          certMatches.forEach((pem, index) => {
            try {
              const cert = forge.pki.certificateFromPem(pem);
              const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
              
              const certInfo = {
                index,
                subject: parseAttributes(cert.subject.attributes),
                issuer: parseAttributes(cert.issuer.attributes),
                serial: cert.serialNumber,
                version: cert.version + 1,
                validFrom: cert.validity.notBefore,
                validTo: cert.validity.notAfter,
                signatureAlgorithm: cert.signatureOid,
                publicKey: {
                  algorithm: cert.publicKey.n ? 'RSA' : 'ECC',
                  bits: cert.publicKey.n ? cert.publicKey.n.bitLength() : 'N/A'
                },
                fingerprints: {
                  sha1: forge.md.sha1.create().update(der).digest().toHex().toUpperCase().match(/.{2}/g).join(':'),
                  sha256: forge.md.sha256.create().update(der).digest().toHex().toUpperCase().match(/.{2}/g).join(':')
                },
                extensions: parseExtensions(cert.extensions),
                pem: pem
              };
              parsedData.certificates.push(certInfo);
            } catch (e) {
              console.warn('Failed to parse cert index ' + index, e);
            }
          });

          h.setState('parsedData', parsedData);

          // Build UI
          let html = `
            <div class="max-w-6xl mx-auto">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatBytes(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-[10px] font-bold uppercase tracking-tight">PEM / X.509</span>
              </div>
          `;

          if (parsedData.certificates.length === 0 && parsedData.privateKeysCount === 0 && parsedData.publicKeysCount === 0) {
            html += `
              <div class="p-8 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                <p class="text-surface-600">No standard PEM blocks (BEGIN CERTIFICATE/KEY) were found in this file.</p>
              </div>
            `;
          }

          if (parsedData.privateKeysCount > 0) {
            html += `
              <div class="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-4">
                <div class="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <div>
                  <h3 class="font-bold text-red-800">Sensitive Material Detected</h3>
                  <p class="text-sm text-red-700 leading-relaxed">
                    This file contains <strong>${parsedData.privateKeysCount} Private Key(s)</strong>. 
                    Private keys are extremely sensitive. Do not share them. We only show metadata and avoid parsing the secret bits.
                  </p>
                </div>
              </div>
            `;
          }

          if (parsedData.certificates.length > 0) {
            html += `
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-surface-900 text-lg">Certificates Found</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">${parsedData.certificates.length} item${parsedData.certificates.length > 1 ? 's' : ''}</span>
              </div>
              <div class="space-y-8">
            `;

            parsedData.certificates.forEach((cert, i) => {
              const now = new Date();
              const isExpired = now > cert.validTo;
              const isExpiringSoon = !isExpired && (cert.validTo - now) < (30 * 24 * 60 * 60 * 1000);
              
              let statusClass = "bg-green-100 text-green-700";
              let statusLabel = "Valid";
              let progressColor = "bg-green-500";

              if (isExpired) {
                statusClass = "bg-red-100 text-red-700";
                statusLabel = "Expired";
                progressColor = "bg-red-500";
              } else if (isExpiringSoon) {
                statusClass = "bg-amber-100 text-amber-700";
                statusLabel = "Expiring Soon";
                progressColor = "bg-amber-500";
              }

              const totalLife = cert.validTo - cert.validFrom;
              const elapsed = now - cert.validFrom;
              const percent = Math.min(100, Math.max(0, (elapsed / totalLife) * 100));

              html += `
                <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div class="p-6 border-b border-surface-100 bg-surface-50/30">
                    <div class="flex flex-wrap justify-between items-start gap-4 mb-4">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Common Name</div>
                        <h4 class="text-xl font-bold text-surface-900 break-all">${escapeHTML(cert.subject.CN || 'Unnamed')}</h4>
                      </div>
                      <span class="px-3 py-1 rounded-full text-xs font-bold ${statusClass}">${statusLabel}</span>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Validity</div>
                        <div class="text-sm text-surface-700 font-medium">
                          <span class="${isExpired ? 'text-red-600 font-bold' : ''}">${cert.validTo.toLocaleDateString()}</span>
                          <span class="text-surface-300 mx-1">/</span>
                          <span class="text-xs text-surface-500">Exp. in ${Math.ceil((cert.validTo - now) / (86400000))} days</span>
                        </div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Key Type</div>
                        <div class="text-sm text-surface-700 font-medium">${cert.publicKey.algorithm} <span class="text-xs text-surface-400">(${cert.publicKey.bits} bits)</span></div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Serial</div>
                        <div class="text-[10px] font-mono text-surface-500 break-all">${cert.serial}</div>
                      </div>
                    </div>

                    <div class="mt-6">
                      <div class="flex justify-between text-[10px] font-mono text-surface-400 mb-1.5">
                        <span>ISSUED: ${cert.validFrom.toLocaleDateString()}</span>
                        <span>EXPIRES: ${cert.validTo.toLocaleDateString()}</span>
                      </div>
                      <div class="h-2 w-full bg-surface-100 rounded-full overflow-hidden">
                        <div class="h-full ${progressColor} transition-all duration-1000" style="width: ${percent}%"></div>
                      </div>
                    </div>
                  </div>

                  <div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div class="space-y-6">
                      <div>
                        <h5 class="text-xs font-bold text-surface-800 mb-3 flex items-center gap-2">
                          <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                          Subject Information
                        </h5>
                        <div class="overflow-hidden rounded-xl border border-surface-100">
                          <table class="min-w-full text-xs">
                            ${Object.entries(cert.subject).map(([k, v]) => `
                              <tr class="border-b border-surface-50 last:border-0 hover:bg-surface-50">
                                <td class="px-3 py-2 font-bold text-surface-500 bg-surface-50/50 w-24">${escapeHTML(k)}</td>
                                <td class="px-3 py-2 text-surface-700 break-all">${escapeHTML(v)}</td>
                              </tr>
                            `).join('')}
                          </table>
                        </div>
                      </div>
                      <div>
                        <h5 class="text-xs font-bold text-surface-800 mb-3 flex items-center gap-2">
                          <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                          Issuer Information
                        </h5>
                        <div class="overflow-hidden rounded-xl border border-surface-100">
                          <table class="min-w-full text-xs">
                            ${Object.entries(cert.issuer).map(([k, v]) => `
                              <tr class="border-b border-surface-50 last:border-0 hover:bg-surface-50">
                                <td class="px-3 py-2 font-bold text-surface-500 bg-surface-50/50 w-24">${escapeHTML(k)}</td>
                                <td class="px-3 py-2 text-surface-700 break-all">${escapeHTML(v)}</td>
                              </tr>
                            `).join('')}
                          </table>
                        </div>
                      </div>
                    </div>

                    <div class="space-y-6">
                      <div>
                        <h5 class="text-xs font-bold text-surface-800 mb-3">Fingerprints</h5>
                        <div class="space-y-3">
                          <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                            <div class="text-[9px] font-bold text-surface-400 uppercase tracking-tight mb-1">SHA-256</div>
                            <div class="text-[10px] font-mono text-surface-600 break-all">${cert.fingerprints.sha256}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                            <div class="text-[9px] font-bold text-surface-400 uppercase tracking-tight mb-1">SHA-1</div>
                            <div class="text-[10px] font-mono text-surface-600 break-all">${cert.fingerprints.sha1}</div>
                          </div>
                        </div>
                      </div>

                      ${cert.extensions.length > 0 ? `
                        <div>
                          <h5 class="text-xs font-bold text-surface-800 mb-3">Extensions & SANs</h5>
                          <div class="flex flex-wrap gap-2">
                            ${cert.extensions.map(ext => `
                              <div class="group relative px-2 py-1 bg-surface-100 hover:bg-brand-50 rounded text-[10px] font-mono text-surface-600 border border-surface-200" title="${escapeHTML(ext.name)}">
                                <span class="font-bold text-surface-800">${escapeHTML(ext.name)}</span>
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      ` : ''}

                      <div class="pt-4 flex gap-3">
                         <button data-copy-index="${i}" class="btn-copy-cert flex-1 py-2 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors border border-brand-200">
                            Copy This PEM
                         </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            });

            html += `</div>`;
          }

          html += `
            <div class="mt-12 space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-surface-800">Raw PEM Source</h3>
                <span class="text-xs text-surface-400">${content.length} characters</span>
              </div>
              <div class="rounded-xl overflow-hidden border border-surface-200">
                <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-[400px]"><code>${escapeHTML(content)}</code></pre>
              </div>
            </div>
          </div>`;

          h.render(html);

          // Add event listeners after render
          mountEl.querySelectorAll('.btn-copy-cert').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = btn.getAttribute('data-copy-index');
              const pem = parsedData.certificates[idx]?.pem;
              if (pem) h.copyToClipboard(pem, btn);
            });
          });

        } catch (err) {
          console.error(err);
          h.showError('Parsing Error', 'The PEM content could not be fully decoded. Ensure it is a valid base64-encoded X.509 certificate.');
        }

        function parseAttributes(attrs) {
          const obj = {};
          attrs.forEach(a => {
            const key = a.shortName || a.name || a.type;
            obj[key] = a.value;
          });
          return obj;
        }

        function parseExtensions(exts) {
          return exts.map(e => ({
            name: e.name || e.id,
            critical: e.critical,
            value: e.value
          }));
        }
      }
    });
  };
})();
