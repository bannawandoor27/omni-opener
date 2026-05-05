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
    let _forgeLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.cer,.key,.pub,.der,.p7b,.p7c',
      dropLabel: 'Drop PEM certificates, private keys, or public keys',
      binary: false,
      infoHtml: '<strong>Security Toolkit:</strong> Decode X.509 certificates, analyze validity chains, calculate fingerprints, and safely inspect public/private key metadata.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js', () => {
          _forgeLoaded = true;
        });
      },

      onDestroy: function () {
        // No persistent resources like ObjectURLs to clean up in this tool
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
              h.download(`${data.fileName || 'cert'}-info.json`, JSON.stringify(data, null, 2));
            } else {
              h.showError('No data', 'Parse a valid certificate first to export as JSON.');
            }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        // B8: Strict mode self-reference crash check - using _onFileFn name
        
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

        // B1: Race conditions - check if library is loaded
        if (!_forgeLoaded || typeof forge === 'undefined') {
          h.showLoading('Initializing Security Engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        // B7: Large file handling (PEM files > 2MB are rare and likely logs or garbage)
        if (content.length > 2 * 1024 * 1024) {
           h.showError('File too large', 'This tool is optimized for standard PEM files under 2MB.');
           return;
        }

        h.showLoading('Analyzing security objects...');

        try {
          // Identify blocks using regex
          const certMatches = content.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || [];
          const privKeyMatches = content.match(/-----BEGIN (RSA |EC |)PRIVATE KEY-----[\s\S]+?-----END (RSA |EC |)PRIVATE KEY-----/g) || [];
          const pubKeyMatches = content.match(/-----BEGIN (RSA |)PUBLIC KEY-----[\s\S]+?-----END (RSA |)PUBLIC KEY-----/g) || [];

          const parsedData = {
            certificates: [],
            privateKeys: [],
            publicKeys: [],
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
                  bits: cert.publicKey.n ? cert.publicKey.n.bitLength() : (cert.publicKey.curve ? cert.publicKey.curve : 'N/A')
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
              console.warn('Failed to parse certificate at block ' + index, e);
            }
          });

          // Private Key Metadata (Avoid showing secrets, just metadata)
          privKeyMatches.forEach((pem, index) => {
            try {
              // We just want to know what it is
              let type = 'Private Key';
              if (pem.includes('RSA')) type = 'RSA Private Key';
              else if (pem.includes('EC')) type = 'EC Private Key';
              
              parsedData.privateKeys.push({ index, type });
            } catch (e) {}
          });

          h.setState('parsedData', parsedData);

          renderUI(h, file, content, parsedData, mountEl);

        } catch (err) {
          console.error(err);
          h.showError('Could not open PEM file', 'The file may be corrupted or in an unsupported format. Ensure it contains standard PEM blocks.');
        }

        function parseAttributes(attrs) {
          const obj = {};
          attrs.forEach(a => {
            const key = a.shortName || a.name || a.type;
            if (key) obj[key] = a.value;
          });
          return obj;
        }

        function parseExtensions(exts) {
          return (exts || []).map(e => ({
            name: e.name || e.id,
            critical: e.critical,
            value: e.value
          }));
        }
      }
    });

    function renderUI(h, file, content, data, mountEl) {
      const now = new Date();
      
      let html = `
        <div class="max-w-6xl mx-auto pb-12">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHTML(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">PEM Security Tool</span>
          </div>

          <!-- Live Filter for Certificate Chain -->
          ${data.certificates.length > 1 ? `
            <div class="mb-6">
              <div class="relative">
                <input type="text" id="cert-filter" placeholder="Filter certificates by Common Name, Issuer, or Serial..." 
                  class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
                <div class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Warnings for Private Keys -->
          ${data.privateKeys.length > 0 ? `
            <div class="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-4">
              <div class="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <div class="flex-1">
                <h3 class="font-bold text-amber-900">Sensitive Material Detected</h3>
                <p class="text-sm text-amber-800 leading-relaxed">
                  This file contains <strong>${data.privateKeys.length} Private Key(s)</strong>. 
                  Private keys should never be shared or uploaded to untrusted tools. This tool processes them locally in your browser.
                </p>
              </div>
            </div>
          ` : ''}

          <!-- U10: Section Header with Counts -->
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 text-lg">Certificate Chain</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-bold">${data.certificates.length} Certificate${data.certificates.length === 1 ? '' : 's'}</span>
          </div>

          <div id="cert-list" class="space-y-6">
            ${data.certificates.length === 0 ? `
              <div class="p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                <p class="text-surface-500 font-medium">No valid X.509 certificates found in this file.</p>
              </div>
            ` : data.certificates.map((cert, i) => {
              const isExpired = now > cert.validTo;
              const isExpiringSoon = !isExpired && (cert.validTo - now) < (30 * 24 * 60 * 60 * 1000);
              
              let statusClass = "bg-green-100 text-green-700";
              let statusLabel = "Valid";
              let dateColor = "text-surface-700";

              if (isExpired) {
                statusClass = "bg-red-100 text-red-700";
                statusLabel = "Expired";
                dateColor = "text-red-600 font-bold";
              } else if (isExpiringSoon) {
                statusClass = "bg-amber-100 text-amber-700";
                statusLabel = "Expiring Soon";
                dateColor = "text-amber-600 font-bold";
              }

              const totalLife = cert.validTo - cert.validFrom;
              const elapsed = now - cert.validFrom;
              const percent = Math.min(100, Math.max(0, (elapsed / totalLife) * 100));

              return `
                <div class="cert-card bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow" 
                     data-search="${escapeHTML(cert.subject.CN || '')} ${escapeHTML(cert.issuer.CN || '')} ${escapeHTML(cert.serial)}">
                  
                  <!-- Header / Status Area -->
                  <div class="p-6 border-b border-surface-100 bg-surface-50/30">
                    <div class="flex flex-wrap justify-between items-start gap-4 mb-4">
                      <div class="flex-1 min-w-0">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Common Name (Subject)</div>
                        <h4 class="text-xl font-bold text-surface-900 break-all">${escapeHTML(cert.subject.CN || 'Unknown Certificate')}</h4>
                      </div>
                      <div class="flex flex-col items-end gap-2">
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${statusClass}">${statusLabel}</span>
                        <span class="text-[10px] font-mono text-surface-400">#${i + 1} in chain</span>
                      </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Expiration</div>
                        <div class="text-sm ${dateColor}">${cert.validTo.toLocaleDateString(undefined, { dateStyle: 'medium' })}</div>
                        <div class="text-[10px] text-surface-500 mt-1">${Math.abs(Math.ceil((cert.validTo - now) / 86400000))} days ${isExpired ? 'ago' : 'remaining'}</div>
                      </div>
                      <div>
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Public Key</div>
                        <div class="text-sm text-surface-700 font-medium">${cert.publicKey.algorithm} <span class="text-xs text-surface-400">(${cert.publicKey.bits} bits)</span></div>
                      </div>
                      <div class="sm:col-span-2">
                        <div class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Serial Number</div>
                        <div class="text-[10px] font-mono text-surface-500 break-all leading-tight">${cert.serial}</div>
                      </div>
                    </div>

                    <div class="mt-6">
                      <div class="flex justify-between text-[10px] font-mono text-surface-400 mb-1.5">
                        <span>Issued: ${cert.validFrom.toLocaleDateString()}</span>
                        <span>Expires: ${cert.validTo.toLocaleDateString()}</span>
                      </div>
                      <div class="h-1.5 w-full bg-surface-200 rounded-full overflow-hidden">
                        <div class="h-full ${isExpired ? 'bg-red-500' : (isExpiringSoon ? 'bg-amber-500' : 'bg-brand-500')} transition-all duration-1000" style="width: ${percent}%"></div>
                      </div>
                    </div>
                  </div>

                  <div class="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- U7: Tables for Details -->
                    <div class="space-y-6">
                      <div>
                        <h5 class="text-xs font-bold text-surface-800 mb-3 flex items-center gap-2">
                          <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                          Subject Details
                        </h5>
                        <div class="overflow-hidden rounded-xl border border-surface-200">
                          <table class="min-w-full text-xs">
                            ${Object.entries(cert.subject).map(([k, v]) => `
                              <tr class="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
                                <td class="px-3 py-2.5 font-bold text-surface-500 bg-surface-50 w-24 align-top">${escapeHTML(k)}</td>
                                <td class="px-3 py-2.5 text-surface-700 break-all">${escapeHTML(v)}</td>
                              </tr>
                            `).join('')}
                          </table>
                        </div>
                      </div>
                      <div>
                        <h5 class="text-xs font-bold text-surface-800 mb-3 flex items-center gap-2">
                          <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                          Issuer Details
                        </h5>
                        <div class="overflow-hidden rounded-xl border border-surface-200">
                          <table class="min-w-full text-xs">
                            ${Object.entries(cert.issuer).map(([k, v]) => `
                              <tr class="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
                                <td class="px-3 py-2.5 font-bold text-surface-500 bg-surface-50 w-24 align-top">${escapeHTML(k)}</td>
                                <td class="px-3 py-2.5 text-surface-700 break-all">${escapeHTML(v)}</td>
                              </tr>
                            `).join('')}
                          </table>
                        </div>
                      </div>
                    </div>

                    <div class="space-y-6">
                      <div>
                        <h5 class="text-xs font-bold text-surface-800 mb-3">Trust Fingerprints</h5>
                        <div class="space-y-3">
                          <div class="p-3 bg-surface-50 rounded-xl border border-surface-200">
                            <div class="text-[9px] font-bold text-surface-400 uppercase tracking-tight mb-1">SHA-256 Digest</div>
                            <div class="text-[10px] font-mono text-surface-600 break-all leading-relaxed">${cert.fingerprints.sha256}</div>
                          </div>
                          <div class="p-3 bg-surface-50 rounded-xl border border-surface-200">
                            <div class="text-[9px] font-bold text-surface-400 uppercase tracking-tight mb-1">SHA-1 Digest</div>
                            <div class="text-[10px] font-mono text-surface-600 break-all leading-relaxed">${cert.fingerprints.sha1}</div>
                          </div>
                        </div>
                      </div>

                      ${cert.extensions.length > 0 ? `
                        <div>
                          <div class="flex items-center justify-between mb-3">
                            <h5 class="text-xs font-bold text-surface-800">Extensions</h5>
                            <span class="text-[10px] text-surface-400">${cert.extensions.length} items</span>
                          </div>
                          <div class="flex flex-wrap gap-1.5">
                            ${cert.extensions.map(ext => `
                              <div class="px-2 py-1 bg-surface-100 rounded text-[10px] font-mono text-surface-600 border border-surface-200 hover:border-brand-300 hover:bg-brand-50 cursor-default transition-all" title="${escapeHTML(ext.name)}: ${escapeHTML(ext.value)}">
                                ${escapeHTML(ext.name)}
                              </div>
                            `).join('')}
                          </div>
                        </div>
                      ` : ''}

                      <div class="pt-2 flex gap-3">
                        <button data-copy-cert="${i}" class="btn-copy-cert flex-1 py-2 text-xs font-bold text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg transition-all border border-brand-200 shadow-sm active:scale-95">
                          Copy Certificate PEM
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Raw View -->
          <div class="mt-12 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-surface-800">Complete PEM Source</h3>
              <div class="flex items-center gap-3">
                <span class="text-xs text-surface-400">${content.length.toLocaleString()} characters</span>
                <button id="toggle-raw" class="text-xs font-bold text-brand-600 hover:underline">Show/Hide Code</button>
              </div>
            </div>
            <!-- U8: Code Block -->
            <div id="raw-container" class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
              <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-[400px]"><code>${escapeHTML(content)}</code></pre>
            </div>
          </div>
        </div>
      `;

      h.render(html);

      // Event Listeners
      const filterInput = mountEl.querySelector('#cert-filter');
      if (filterInput) {
        filterInput.addEventListener('input', (e) => {
          const val = e.target.value.toLowerCase();
          mountEl.querySelectorAll('.cert-card').forEach(card => {
            const text = card.getAttribute('data-search').toLowerCase();
            card.style.display = text.includes(val) ? '' : 'none';
          });
        });
      }

      const toggleBtn = mountEl.querySelector('#toggle-raw');
      const rawContainer = mountEl.querySelector('#raw-container');
      if (toggleBtn && rawContainer) {
        toggleBtn.addEventListener('click', () => {
          const isHidden = rawContainer.style.display === 'none';
          rawContainer.style.display = isHidden ? '' : 'none';
        });
      }

      mountEl.querySelectorAll('[data-copy-cert]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.getAttribute('data-copy-cert');
          const pem = data.certificates[idx]?.pem;
          if (pem) h.copyToClipboard(pem, btn);
        });
      });
    }
  };
})();
