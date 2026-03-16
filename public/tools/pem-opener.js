(function() {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function formatDate(date) {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(date);
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.pem,.crt,.key,.pub,.der,.cer',
      dropLabel: 'Drop a .pem file here',
      binary: false,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },
      onFile: function(file, content, helpers) {
        if (typeof forge === 'undefined') {
          helpers.showLoading('Loading encryption engine...');
          setTimeout(function() { helpers.onFile(file, content, helpers); }, 500);
          return;
        }

        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This file is larger than 20MB. Parsing might be slow. Continue?')) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Parsing PEM blocks...');

        try {
          const pems = forge.pem.decode(content);
          if (!pems || pems.length === 0) {
            throw new Error('No valid PEM blocks found in file.');
          }

          let html = `
            <div class="p-6 max-w-5xl mx-auto">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
                <span class="font-medium">${escapeHtml(file.name)}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-400">·</span>
                <span>${pems.length} blocks detected</span>
              </div>
              <div class="space-y-6">
          `;

          pems.forEach((pem, index) => {
            html += renderPemBlock(pem, index, helpers);
          });

          html += `
              </div>
            </div>
          `;

          helpers.render(html);
        } catch (e) {
          helpers.showError('Could not parse PEM file', e.message);
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
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your files never leave your device.'
    });
  };

  function renderPemBlock(pem, index, helpers) {
    const type = pem.type || 'UNKNOWN';
    let detailsHtml = '';
    let badgeColor = 'bg-surface-100 text-surface-600';

    try {
      if (type.includes('CERTIFICATE')) {
        badgeColor = 'bg-blue-100 text-blue-700';
        const cert = forge.pki.certificateFromPem(forge.pem.encode(pem));
        detailsHtml = renderCertificate(cert);
      } else if (type.includes('PRIVATE KEY')) {
        badgeColor = 'bg-red-100 text-red-700';
        detailsHtml = renderKeyInfo(pem, 'Private');
      } else if (type.includes('PUBLIC KEY')) {
        badgeColor = 'bg-green-100 text-green-700';
        detailsHtml = renderKeyInfo(pem, 'Public');
      } else {
        detailsHtml = `<div class="text-surface-400 italic">No detailed parser for block type: ${type}</div>`;
      }
    } catch (err) {
      detailsHtml = `<div class="text-red-500 text-sm">Error parsing block: ${escapeHtml(err.message)}</div>`;
    }

    return `
      <div class="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
        <div class="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold uppercase tracking-wider ${badgeColor} px-2 py-0.5 rounded-md">
              ${escapeHtml(type)}
            </span>
            <span class="text-xs text-surface-400 font-mono">#${index + 1}</span>
          </div>
        </div>
        <div class="p-4">
          ${detailsHtml}
        </div>
      </div>
    `;
  }

  function renderCertificate(cert) {
    const subject = formatAttributes(cert.subject.attributes);
    const issuer = formatAttributes(cert.issuer.attributes);
    const now = new Date();
    const isValid = now >= cert.validity.notBefore && now <= cert.validity.notAfter;
    
    // Fingerprints
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const mdSha1 = forge.md.sha1.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase();
    const mdSha256 = forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase();

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div class="space-y-4">
          <div>
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-tight mb-2">Subject</h4>
            <div class="bg-surface-50 p-3 rounded-lg font-mono text-xs break-all border border-surface-100">
              ${escapeHtml(subject || 'Unknown')}
            </div>
          </div>
          <div>
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-tight mb-2">Issuer</h4>
            <div class="bg-surface-50 p-3 rounded-lg font-mono text-xs break-all border border-surface-100">
              ${escapeHtml(issuer || 'Unknown')}
            </div>
          </div>
        </div>
        <div class="space-y-4">
          <div>
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-tight mb-2">Validity</h4>
            <div class="space-y-1">
              <div class="flex justify-between">
                <span class="text-surface-500">Not Before:</span>
                <span class="font-medium">${formatDate(cert.validity.notBefore)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-surface-500">Not After:</span>
                <span class="font-medium ${!isValid && now > cert.validity.notAfter ? 'text-red-600' : ''}">${formatDate(cert.validity.notAfter)}</span>
              </div>
              <div class="mt-2">
                ${isValid 
                  ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">✓ Currently Valid</span>' 
                  : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">✕ Expired or Not Yet Valid</span>'}
              </div>
            </div>
          </div>
          <div>
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-tight mb-2">Fingerprints</h4>
            <div class="space-y-2">
              <div>
                <span class="text-[10px] text-surface-400 font-bold block uppercase">SHA-256</span>
                <div class="font-mono text-[10px] break-all text-surface-600">${mdSha256}</div>
              </div>
              <div>
                <span class="text-[10px] text-surface-400 font-bold block uppercase">SHA-1</span>
                <div class="font-mono text-[10px] break-all text-surface-600">${mdSha1}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="mt-4 pt-4 border-t border-surface-100">
        <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <div>
            <span class="text-surface-500">Serial Number:</span>
            <span class="font-mono ml-1">${cert.serialNumber}</span>
          </div>
          <div>
            <span class="text-surface-500">Version:</span>
            <span class="font-mono ml-1">v${cert.version + 1}</span>
          </div>
          <div>
            <span class="text-surface-500">Signature Algo:</span>
            <span class="font-mono ml-1">${cert.signatureOid}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderKeyInfo(pem, kind) {
    let key;
    const pemStr = forge.pem.encode(pem);
    try {
      if (kind === 'Private') {
        key = forge.pki.privateKeyFromPem(pemStr);
      } else {
        key = forge.pki.publicKeyFromPem(pemStr);
      }
    } catch (e) {
      return `<div class="text-surface-400 italic">Encrypted or unsupported key format.</div>`;
    }

    const type = key.n ? 'RSA' : (key.curve ? 'EC' : 'Unknown');
    const bits = key.n ? key.n.bitLength() : (key.curve ? 'N/A' : 'Unknown');

    return `
      <div class="flex items-center gap-8 py-2">
        <div>
          <span class="text-xs font-bold text-surface-400 uppercase block mb-1">Type</span>
          <span class="text-lg font-semibold text-surface-700">${type}</span>
        </div>
        <div>
          <span class="text-xs font-bold text-surface-400 uppercase block mb-1">Length</span>
          <span class="text-lg font-semibold text-surface-700">${bits} bits</span>
        </div>
        ${key.e ? `
        <div>
          <span class="text-xs font-bold text-surface-400 uppercase block mb-1">Exponent</span>
          <span class="text-lg font-semibold text-surface-700">${key.e.data ? key.e.toString(10) : key.e}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  function formatAttributes(attrs) {
    return attrs.map(attr => {
      const name = attr.shortName || attr.name || attr.type;
      return `${name}=${attr.value}`;
    }).join(', ');
  }

})();
