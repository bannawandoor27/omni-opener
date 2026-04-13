(function() {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function parseDn(dn) {
    const fields = {};
    if (dn && dn.attributes) {
      dn.attributes.forEach(attr => {
        fields[attr.name || attr.type] = attr.value;
      });
    }
    return fields;
  }

  function getCommonName(dn) {
    const fields = parseDn(dn);
    return fields.commonName || fields.CN || 'Unknown';
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.p7s,.p7m,.p7b',
      dropLabel: 'Drop a .p7s file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },
      onFile: function(file, content, helpers) {
        if (typeof forge === 'undefined') {
          helpers.showLoading('Loading crypto engine...');
          setTimeout(() => helpers.onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing PKCS#7 signature...');

        try {
          let p7;
          const bytes = new Uint8Array(content);
          const binaryString = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
          
          if (binaryString.includes('-----BEGIN PKCS7-----') || binaryString.includes('-----BEGIN CMS-----')) {
            p7 = forge.pkcs7.messageFromPem(binaryString);
          } else {
            const asn1 = forge.asn1.fromDer(forge.util.createBuffer(binaryString));
            p7 = forge.pkcs7.messageFromAsn1(asn1);
          }

          renderP7s(p7, file, helpers);
        } catch (e) {
          console.error(e);
          helpers.showError('Could not parse PKCS#7 file', 'The file might be corrupted or in an unsupported format. Error: ' + e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Signer Info',
          id: 'copy-signer',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.signerText) {
              helpers.copyToClipboard(state.signerText, btn);
            }
          }
        },
        {
          label: '📥 Download Content',
          id: 'dl-content',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.p7content) {
              helpers.download('content.bin', state.p7content, 'application/octet-stream');
            } else {
              alert('This signature does not contain encapsulated content (detached signature).');
            }
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side parsing. Your sensitive signature files never leave your browser.'
    });
  };

  function renderP7s(p7, file, helpers) {
    const signers = p7.signerInfos || [];
    const certs = p7.certificates || [];
    
    let contentStr = null;
    let contentBytes = null;
    if (p7.content) {
      if (typeof p7.content === 'string') {
        contentStr = p7.content;
        contentBytes = p7.content;
      } else if (p7.content.data) {
        contentStr = p7.content.data;
        contentBytes = p7.content.data;
      } else if (p7.content instanceof forge.util.ByteBuffer) {
        contentStr = p7.content.getBytes();
        contentBytes = contentStr;
      }
    }

    helpers.setState({
      p7content: contentBytes,
      signerText: signers.map(s => {
        const cert = p7.getReceiver(s);
        return cert ? `Signer: ${getCommonName(cert.subject)}\nIssuer: ${getCommonName(cert.issuer)}` : 'Unknown Signer';
      }).join('\n\n')
    });

    const isProbableText = contentStr && contentStr.split('').every(char => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9;
    });

    let html = `
      <div class="p-6 space-y-6">
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-white border border-surface-200 rounded-xl p-4 shadow-sm">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Signature Summary</h3>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Status</span>
                <span class="font-medium text-green-600 flex items-center gap-1">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
                  Valid Format
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Signers</span>
                <span class="font-medium">${signers.length}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Certificates</span>
                <span class="font-medium">${certs.length}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Content Type</span>
                <span class="font-medium text-surface-700 truncate max-w-[120px]" title="${p7.contentType || ''}">${p7.contentType || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div class="bg-white border border-surface-200 rounded-xl p-4 shadow-sm">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">File Details</h3>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Encapsulated Content</span>
                <span class="font-medium ${contentBytes ? 'text-brand-600' : 'text-surface-400'}">
                  ${contentBytes ? formatSize(contentBytes.length) : 'None (Detached)'}
                </span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-surface-500">Version</span>
                <span class="font-medium text-surface-700">v${p7.version || '1'}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-sm font-bold text-surface-800 flex items-center gap-2">
            <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            Signer Information
          </h3>
          ${signers.length > 0 ? signers.map((s, i) => {
            const cert = p7.getReceiver(s);
            const subject = cert ? parseDn(cert.subject) : {};
            const issuer = cert ? parseDn(cert.issuer) : {};
            return `
              <div class="border border-surface-200 rounded-xl overflow-hidden">
                <div class="bg-surface-50 px-4 py-2 border-b border-surface-200 flex justify-between items-center">
                  <span class="text-xs font-bold text-surface-500">Signer #${i + 1}</span>
                  <span class="text-[10px] font-mono bg-surface-200 px-1.5 py-0.5 rounded text-surface-600">${s.digestAlgorithm || 'Unknown Alg'}</span>
                </div>
                <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p class="text-[10px] font-bold text-surface-400 uppercase mb-2">Subject</p>
                    <p class="text-sm font-semibold text-surface-800">${escapeHtml(subject.commonName || 'Unknown')}</p>
                    <p class="text-xs text-surface-500 mt-1">${escapeHtml(subject.emailAddress || subject.E || '')}</p>
                    <p class="text-xs text-surface-400 mt-0.5">${escapeHtml(subject.organizationName || '')}</p>
                  </div>
                  <div>
                    <p class="text-[10px] font-bold text-surface-400 uppercase mb-2">Issuer</p>
                    <p class="text-sm text-surface-700 font-medium">${escapeHtml(issuer.commonName || 'Unknown')}</p>
                    <p class="text-xs text-surface-500">${escapeHtml(issuer.organizationName || '')}</p>
                  </div>
                </div>
                ${cert ? `
                <div class="px-4 py-3 bg-surface-50/50 border-t border-surface-100 flex flex-col gap-2 text-[11px]">
                  <div class="flex gap-4">
                    <div>
                      <span class="text-surface-400 mr-1">Valid From:</span>
                      <span class="text-surface-600">${formatDate(cert.validity.notBefore)}</span>
                    </div>
                    <div>
                      <span class="text-surface-400 mr-1">Valid Until:</span>
                      <span class="text-surface-600">${formatDate(cert.validity.notAfter)}</span>
                    </div>
                  </div>
                  <div class="font-mono text-[10px] text-surface-400 break-all">
                    SHA-256: ${forge.pki.getPublicKeyFingerprint(cert.publicKey, {type: 'sha256', encoding: 'hex'}).match(/.{1,2}/g).join(':').toUpperCase()}
                  </div>
                </div>
                ` : ''}
              </div>
            `;
          }).join('') : '<p class="text-sm text-surface-400 italic">No signers found in this signature.</p>'}
        </div>

        ${certs.length > 0 ? `
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-surface-800 flex items-center gap-2">
            <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            Certificate Chain
          </h3>
          <div class="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr class="bg-surface-50 text-surface-500 font-bold uppercase tracking-wider border-b border-surface-200">
                  <th class="px-4 py-2">Subject</th>
                  <th class="px-4 py-2">Issuer</th>
                  <th class="px-4 py-2 text-right">Expires</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${certs.map(cert => `
                  <tr class="hover:bg-surface-50 transition-colors">
                    <td class="px-4 py-2 font-medium text-surface-700">${escapeHtml(getCommonName(cert.subject))}</td>
                    <td class="px-4 py-2 text-surface-500">${escapeHtml(getCommonName(cert.issuer))}</td>
                    <td class="px-4 py-2 text-right text-surface-400">${formatDate(cert.validity.notAfter).split(',')[0]}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ` : ''}

        ${contentStr ? `
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-surface-800 flex items-center gap-2">
            <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Content Preview ${isProbableText ? '(Decoded Text)' : '(Hex Dump)'}
          </h3>
          <div class="bg-surface-900 rounded-xl p-4 overflow-auto max-h-96 shadow-inner">
            ${isProbableText ? `
              <pre class="text-xs font-mono text-surface-300 whitespace-pre-wrap">${escapeHtml(contentStr.slice(0, 5000))}${contentStr.length > 5000 ? '\n\n... [Content Truncated]' : ''}</pre>
            ` : `
              <div class="grid grid-cols-[auto_1fr] gap-x-4 font-mono text-xs">
                ${(function() {
                  const bytes = new Uint8Array(contentStr.split('').map(c => c.charCodeAt(0))).slice(0, 256);
                  let hexStr = '';
                  for (let i = 0; i < bytes.length; i += 16) {
                    const row = bytes.slice(i, i + 16);
                    const offset = i.toString(16).padStart(4, '0').toUpperCase();
                    const hex = Array.from(row).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
                    const ascii = Array.from(row).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
                    hexStr += `<span class="text-surface-500">${offset}</span><span class="text-brand-400">${hex.padEnd(48)} <span class="text-surface-400">${ascii}</span></span>`;
                  }
                  return hexStr;
                })()}
              </div>
              ${contentStr.length > 256 ? '<p class="text-surface-500 text-[10px] mt-2 italic text-center">First 256 bytes shown</p>' : ''}
            `}
          </div>
        </div>
        ` : ''}
      </div>
    `;


    helpers.render(html);
  }
})();
