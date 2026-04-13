(function() {
  'use strict';

  /**
   * P7S Opener - A Production-Grade PKCS#7 / CMS Signature Viewer
   * Part of the OmniOpener Suite (omniopener.dev)
   */

  const FORGE_URL = 'https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  function getCommonName(dn) {
    if (!dn || !dn.attributes) return 'Unknown';
    const cn = dn.attributes.find(a => a.name === 'commonName' || a.type === '2.5.4.3');
    return cn ? cn.value : 'Unknown';
  }

  function getExpiryStatus(date) {
    if (!date) return '';
    const now = new Date();
    const expiry = new Date(date);
    const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
    
    if (diffDays < 0) return 'text-red-600 font-semibold';
    if (diffDays < 30) return 'text-amber-600 font-semibold';
    return 'text-surface-600';
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.p7s,.p7m,.p7b',
      dropLabel: 'Drop a .p7s, .p7m or .p7b file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript(FORGE_URL);
      },
      onFile: async function(file, content, helpers) {
        // B1: Wait for library if not ready
        if (typeof forge === 'undefined') {
          helpers.showLoading('Initializing crypto engine...');
          let retries = 0;
          while (typeof forge === 'undefined' && retries < 20) {
            await new Promise(r => setTimeout(r, 250));
            retries++;
          }
          if (typeof forge === 'undefined') {
            helpers.showError('Engine Load Failure', 'Could not load the crypto library. Please check your connection and try again.');
            return;
          }
        }

        helpers.showLoading('Analyzing signature structure...');

        try {
          const bytes = new Uint8Array(content);
          // Convert to binary string for Forge (it prefers it for some parsers)
          // B2: Use a safer conversion for large files
          let binaryString = '';
          const chunkSize = 1024 * 32;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binaryString += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
          }

          let p7;
          if (binaryString.includes('-----BEGIN PKCS7-----') || binaryString.includes('-----BEGIN CMS-----')) {
            p7 = forge.pkcs7.messageFromPem(binaryString);
          } else {
            const asn1 = forge.asn1.fromDer(binaryString);
            p7 = forge.pkcs7.messageFromAsn1(asn1);
          }

          if (!p7) throw new Error('Failed to parse PKCS#7 structure.');

          renderTool(p7, file, helpers, bytes);
        } catch (e) {
          console.error('[P7S Parser]', e);
          helpers.showError(
            'Invalid Signature File',
            'This file does not appear to be a valid PKCS#7 / CMS message. Ensure it is not a raw certificate or a different format.'
          );
        }
      },
      actions: [
        {
          label: '📋 Copy Signer Details',
          id: 'copy-signer',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.signerSummary) {
              helpers.copyToClipboard(state.signerSummary, btn);
            }
          }
        },
        {
          label: '📥 Save Encapsulated Content',
          id: 'dl-content',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.hasContent && state.rawContent) {
              helpers.download(state.suggestedName || 'extracted_content.bin', state.rawContent);
            } else {
              alert('This is a detached signature (contains no encapsulated data).');
            }
          }
        }
      ],
      infoHtml: '<strong>Secure Verification:</strong> All cryptographic operations happen locally in your browser. No data is sent to any server.'
    });
  };

  function renderTool(p7, file, helpers, originalBytes) {
    const signers = p7.signerInfos || [];
    const certs = p7.certificates || [];
    
    // Extract content
    let rawContent = null;
    let hasContent = false;
    if (p7.content) {
      if (typeof p7.content === 'string') {
        rawContent = p7.content;
        hasContent = true;
      } else if (p7.content.data) {
        rawContent = p7.content.data;
        hasContent = true;
      } else if (p7.content instanceof forge.util.ByteBuffer) {
        rawContent = p7.content.getBytes();
        hasContent = true;
      }
    }

    // Prepare signer summary for clipboard
    const signerSummary = signers.map((s, i) => {
      const cert = p7.getReceiver(s);
      const name = cert ? getCommonName(cert.subject) : 'Unknown';
      const issuer = cert ? getCommonName(cert.issuer) : 'Unknown';
      return `Signer #${i+1}: ${name}\nIssuer: ${issuer}\nAlgorithm: ${s.digestAlgorithm || 'N/A'}`;
    }).join('\n\n');

    helpers.setState({
      signerSummary,
      hasContent,
      rawContent,
      suggestedName: file.name.replace(/\.p7s$|\.p7m$|\.p7b$/i, '.bin')
    });

    // Content Detection & Preview
    let isText = false;
    let previewHtml = '';
    if (hasContent) {
      const previewSlice = rawContent.slice(0, 10000);
      isText = /^[\x20-\x7E\s]*$/.test(previewSlice);
      
      if (isText) {
        previewHtml = `
          <div class="rounded-xl overflow-hidden border border-surface-200">
            <pre class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[500px] whitespace-pre-wrap">${escapeHtml(previewSlice)}${rawContent.length > 10000 ? '\n\n... [Content Truncated]' : ''}</pre>
          </div>`;
      } else {
        // Hex dump
        const bytes = new Uint8Array(rawContent.split('').map(c => c.charCodeAt(0))).slice(0, 512);
        let hexRows = '';
        for (let i = 0; i < bytes.length; i += 16) {
          const row = bytes.slice(i, i + 16);
          const offset = i.toString(16).padStart(4, '0').toUpperCase();
          const hex = Array.from(row).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
          const ascii = Array.from(row).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
          hexRows += `<div class="grid grid-cols-[60px_1fr_120px] gap-4 py-0.5 border-b border-white/5 last:border-0">
            <span class="text-gray-500">${offset}</span>
            <span class="text-brand-400 font-medium">${hex.padEnd(48)}</span>
            <span class="text-gray-400 border-l border-white/10 pl-4">${escapeHtml(ascii)}</span>
          </div>`;
        }
        previewHtml = `
          <div class="rounded-xl overflow-hidden border border-surface-200 bg-gray-950 p-4 font-mono text-[11px] leading-tight overflow-x-auto">
            ${hexRows}
            ${rawContent.length > 512 ? `<div class="mt-4 pt-4 border-t border-white/10 text-center text-gray-500 italic">Showing first 512 bytes of ${formatSize(rawContent.length)}</div>` : ''}
          </div>`;
      }
    }

    const html = `
      <div class="p-6 space-y-8">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500 font-medium">PKCS#7 Signature</span>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Encapsulated Content</p>
            <p class="text-lg font-semibold ${hasContent ? 'text-brand-600' : 'text-surface-400'}">
              ${hasContent ? formatSize(rawContent.length) : 'Detached Signature'}
            </p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Signers</p>
            <p class="text-lg font-semibold text-surface-800">${signers.length}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
            <p class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Chain Depth</p>
            <p class="text-lg font-semibold text-surface-800">${certs.length} Certificates</p>
          </div>
        </div>

        <!-- Signer Cards (U9) -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Signer Identities</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${signers.length}</span>
          </div>
          
          <div class="grid grid-cols-1 gap-4">
            ${signers.map((s, i) => {
              const cert = p7.getReceiver(s);
              const subject = cert ? cert.subject.attributes : [];
              const issuer = cert ? cert.issuer.attributes : [];
              const cn = cert ? getCommonName(cert.subject) : 'Unknown Identity';
              const issuerCn = cert ? getCommonName(cert.issuer) : 'Unknown Issuer';
              
              return `
                <div class="rounded-xl border border-surface-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                  <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-2">
                        <div class="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        </div>
                        <h4 class="font-bold text-surface-900 truncate">${escapeHtml(cn)}</h4>
                      </div>
                      
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 mt-4">
                        <div>
                          <p class="text-[10px] text-surface-400 font-bold uppercase mb-1">Subject DN</p>
                          <p class="text-xs text-surface-600 leading-relaxed">${subject.map(a => `<span class="inline-block mr-2"><b class="text-surface-400">${a.shortName || a.name}:</b> ${escapeHtml(a.value)}</span>`).join('')}</p>
                        </div>
                        <div>
                          <p class="text-[10px] text-surface-400 font-bold uppercase mb-1">Issuer DN</p>
                          <p class="text-xs text-surface-600 leading-relaxed">${issuer.map(a => `<span class="inline-block mr-2"><b class="text-surface-400">${a.shortName || a.name}:</b> ${escapeHtml(a.value)}</span>`).join('')}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div class="flex flex-col items-end gap-2 text-right">
                      <span class="text-[10px] font-mono bg-surface-100 px-2 py-1 rounded text-surface-600">Hash: ${s.digestAlgorithm || 'Unknown'}</span>
                      ${cert ? `
                        <div class="text-[11px] space-y-1 mt-2">
                          <p class="text-surface-400 italic">Serial: ${cert.serialNumber}</p>
                          <p class="${getExpiryStatus(cert.validity.notAfter)}">Expires: ${formatDate(cert.validity.notAfter)}</p>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
            ${signers.length === 0 ? '<div class="p-8 text-center border-2 border-dashed border-surface-200 rounded-xl text-surface-400">No signers found in this message.</div>' : ''}
          </div>
        </div>

        <!-- Certificate Table (U7) -->
        ${certs.length > 0 ? `
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-surface-800">Certificate Chain</h3>
              <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${certs.length} items</span>
            </div>
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50">
                    <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Common Name</th>
                    <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Issuer</th>
                    <th class="sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Expiry Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${certs.map(cert => `
                    <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors">
                      <td class="px-4 py-3 text-surface-800 font-medium">${escapeHtml(getCommonName(cert.subject))}</td>
                      <td class="px-4 py-3 text-surface-500">${escapeHtml(getCommonName(cert.issuer))}</td>
                      <td class="px-4 py-3 text-right ${getExpiryStatus(cert.validity.notAfter)}">${formatDate(cert.validity.notAfter).split(',')[0]}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Content Preview (U8) -->
        ${hasContent ? `
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-surface-800">
                Encapsulated Content Preview 
                <span class="ml-2 font-normal text-surface-400 text-xs">${isText ? '(UTF-8 Text)' : '(Binary Hex Dump)'}</span>
              </h3>
            </div>
            ${previewHtml}
          </div>
        ` : `
          <div class="p-6 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-sm flex gap-3">
            <svg class="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <div>
              <p class="font-semibold mb-1">Detached Signature Detected</p>
              <p class="opacity-90">This file only contains the signature and certificate chain. The signed data itself is kept in a separate file and is not included here.</p>
            </div>
          </div>
        `}
      </div>
    `;

    helpers.render(html);
  }

})();
