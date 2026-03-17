(function() {
  'use strict';

  // Helper for safe HTML escaping
  const esc = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Human-readable file size
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Date formatting
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  };

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.cer,.key,.pub,.der,.csr',
      dropLabel: 'Drop a PEM certificate or key file',
      binary: false,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },
      onFile: async function(file, content, helpers) {
        // B1: Wait for library
        if (typeof forge === 'undefined') {
          helpers.showLoading('Initializing security engine...');
          let attempts = 0;
          while (typeof forge === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof forge === 'undefined') {
            helpers.showError('Dependency Error', 'Failed to load forge security library. Please check your connection.');
            return;
          }
        }

        helpers.showLoading('Parsing PEM structures...');

        try {
          // B7: Large file safety
          if (content.length > 5 * 1024 * 1024) {
            content = content.substring(0, 5 * 1024 * 1024) + '\n... (truncated for performance)';
          }

          const pems = forge.pem.decode(content);
          
          // U5: Empty state
          if (!pems || pems.length === 0) {
            helpers.showError('Empty or Invalid File', 'No valid PEM blocks (e.g., -----BEGIN CERTIFICATE-----) were found in this file.');
            return;
          }

          // U1: File info bar
          let html = `
            <div class="max-w-5xl mx-auto p-4 md:p-8">
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${esc(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.pem file</span>
                <span class="ml-auto bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${pems.length} blocks</span>
              </div>
          `;

          // U10: Section Header
          html += `
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-surface-900">Detected PEM Blocks</h2>
            </div>
            <div class="grid gap-6">
          `;

          pems.forEach((pem, index) => {
            html += renderBlock(pem, index, helpers);
          });

          html += `
              </div>
              
              <div class="mt-12">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Raw Content</h3>
                </div>
                <div class="rounded-xl overflow-hidden border border-surface-200">
                  <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-96">${esc(content)}</pre>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);
        } catch (err) {
          // U3: Friendly error
          helpers.showError('Analysis Failed', 'We could not parse the PEM structure. The file might be corrupted or use an unsupported encoding.');
          console.error(err);
        }
      },
      actions: [
        {
          label: '📋 Copy All',
          id: 'copy-all',
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Secure parsing:</strong> All cryptographic analysis happens locally in your browser.'
    });
  };

  function renderBlock(pem, index, helpers) {
    const type = pem.type || 'UNKNOWN';
    let detailsHtml = '';
    let typeLabel = type;
    let badgeClass = 'bg-surface-100 text-surface-600';

    try {
      if (type.includes('CERTIFICATE')) {
        badgeClass = 'bg-blue-100 text-blue-700';
        const cert = forge.pki.certificateFromPem(forge.pem.encode(pem));
        detailsHtml = renderCertificateDetails(cert);
      } else if (type.includes('PRIVATE KEY')) {
        badgeClass = 'bg-red-100 text-red-700';
        detailsHtml = renderKeyDetails(pem, 'Private');
      } else if (type.includes('PUBLIC KEY')) {
        badgeClass = 'bg-green-100 text-green-700';
        detailsHtml = renderKeyDetails(pem, 'Public');
      } else if (type.includes('CERTIFICATE REQUEST')) {
        badgeClass = 'bg-amber-100 text-amber-700';
        detailsHtml = `<div class="text-surface-500 italic">CSR (Certificate Signing Request) details viewing not yet fully implemented.</div>`;
      } else {
        detailsHtml = `<div class="text-surface-400 italic">No detailed info for block type: ${esc(type)}</div>`;
      }
    } catch (e) {
      detailsHtml = `<div class="text-amber-600 text-sm bg-amber-50 p-3 rounded-lg border border-amber-100">
        <span class="font-bold">Parsing Warning:</span> ${esc(e.message || 'Malformed block')}
      </div>`;
    }

    // U9: Content cards
    return `
      <div class="rounded-xl border border-surface-200 p-6 hover:border-brand-300 hover:shadow-md transition-all bg-white">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <span class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${badgeClass}">
              ${esc(typeLabel)}
            </span>
            <span class="text-xs text-surface-400 font-mono">Index #${index}</span>
          </div>
        </div>
        
        ${detailsHtml}
      </div>
    `;
  }

  function renderCertificateDetails(cert) {
    const subject = formatAttrs(cert.subject.attributes);
    const issuer = formatAttrs(cert.issuer.attributes);
    const now = new Date();
    const expiry = cert.validity.notAfter;
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    // Format-specific: Expiry coloring
    let expiryColor = 'text-surface-700';
    let expiryStatus = '';
    
    if (diffDays < 0) {
      expiryColor = 'text-red-600 font-bold';
      expiryStatus = '<span class="ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold uppercase">Expired</span>';
    } else if (diffDays < 30) {
      expiryColor = 'text-amber-600 font-bold';
      expiryStatus = `<span class="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold uppercase">Expires in ${diffDays}d</span>`;
    }

    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const sha256 = forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase();

    return `
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div class="space-y-4">
          <div>
            <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Subject (Distinguished Name)</label>
            <div class="bg-surface-50 p-3 rounded-lg border border-surface-100 text-xs font-mono break-all leading-relaxed text-surface-700">
              ${esc(subject)}
            </div>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Issuer</label>
            <div class="bg-surface-50 p-3 rounded-lg border border-surface-100 text-xs font-mono break-all leading-relaxed text-surface-700">
              ${esc(issuer)}
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Valid From</label>
              <div class="text-sm font-medium text-surface-700">${formatDate(cert.validity.notBefore)}</div>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Valid Until</label>
              <div class="text-sm font-medium ${expiryColor}">
                ${formatDate(expiry)}
                ${expiryStatus}
              </div>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">SHA-256 Fingerprint</label>
            <div class="text-[11px] font-mono text-surface-500 break-all bg-surface-50 p-2 rounded border border-surface-100">
              ${sha256}
            </div>
          </div>

          <div class="flex flex-wrap gap-4 pt-2">
             <div class="text-[11px]">
                <span class="text-surface-400 font-medium">Serial:</span>
                <span class="text-surface-600 font-mono ml-1">${cert.serialNumber}</span>
             </div>
             <div class="text-[11px]">
                <span class="text-surface-400 font-medium">Algo:</span>
                <span class="text-surface-600 font-mono ml-1">${cert.signatureOid}</span>
             </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderKeyDetails(pem, kind) {
    const pemStr = forge.pem.encode(pem);
    let key;
    try {
      if (kind === 'Private') {
        key = forge.pki.privateKeyFromPem(pemStr);
      } else {
        key = forge.pki.publicKeyFromPem(pemStr);
      }
    } catch (e) {
      return `<div class="bg-surface-50 p-4 rounded-xl border border-surface-100 text-surface-500 text-sm italic">
        This ${kind.toLowerCase()} key is likely encrypted (passphrase protected) or uses a format not supported for deep inspection.
      </div>`;
    }

    const type = key.n ? 'RSA' : (key.curve ? `EC (${key.curve})` : 'Unknown');
    const bits = key.n ? key.n.bitLength() : 'N/A';

    return `
      <div class="flex flex-wrap items-center gap-10">
        <div>
          <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Algorithm</label>
          <div class="text-2xl font-bold text-surface-800">${esc(type)}</div>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Key Length</label>
          <div class="text-2xl font-bold text-surface-800">${bits} <span class="text-sm font-medium text-surface-400">bits</span></div>
        </div>
        ${key.e ? `
        <div>
          <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Public Exponent</label>
          <div class="text-2xl font-bold text-surface-800">${key.e.toString(10)}</div>
        </div>
        ` : ''}
      </div>
    `;
  }

  function formatAttrs(attrs) {
    if (!attrs || !attrs.length) return 'None';
    return attrs.map(a => {
      const label = a.shortName || a.name || a.type || '?';
      return `${label}=${a.value}`;
    }).join(', ');
  }

})();
