/**
 * OmniOpener — Key Opener & Converter
 * Browser-based viewer and converter for SSH keys, PEM files, and Certificates.
 * Uses node-forge for 100% client-side processing.
 */
(function () {
  'use strict';

  // Helper to escape HTML and prevent XSS
  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Helper to format dates
  function formatDate(d) {
    if (!d || !(d instanceof Date)) return 'N/A';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + 
           ' ' + d.toLocaleTimeString();
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.key,.pub,.pem,.crt,.der,.cer',
      dropLabel: 'Drop a key or certificate file here',
      infoHtml: '<strong>Privacy:</strong> All processing happens 100% in your browser. Your keys and certificates are never uploaded to any server.',

      onInit: function (h) {
        // Load node-forge for cryptographic operations if not already present
        if (typeof forge === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Analyzing key content...');
        
        // Small delay to ensure forge is ready, following the drawio-viewer pattern
        setTimeout(function () {
          try {
            if (typeof forge === 'undefined') {
              throw new Error('Cryptographic engine (node-forge) failed to load.');
            }
            parseAndRender(content, file, h);
          } catch (err) {
            h.showError('Failed to parse key', err.message);
          }
        }, 100);
      },

      actions: [
        {
          label: '📋 Copy Public (SSH)',
          id: 'copy-ssh',
          onClick: function (h, btn) {
            var ssh = h.getState().sshPubKey;
            if (ssh) {
              h.copyToClipboard(ssh, btn);
            }
          }
        },
        {
          label: '📋 Copy PEM',
          id: 'copy-pem',
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
      ]
    });
  };

  /**
   * Main parsing and rendering logic
   */
  function parseAndRender(content, file, h) {
    var trimmed = content.trim();
    var blocks = [];
    var sshPubKey = null;

    // 1. Detect format and decode
    if (trimmed.indexOf('-----BEGIN') !== -1) {
      // PEM Format
      var pems = forge.pem.decode(content);
      if (!pems || pems.length === 0) throw new Error('No valid PEM blocks found.');
      
      pems.forEach(function (pem) {
        blocks.push(processPemBlock(pem));
      });
    } else if (trimmed.indexOf('ssh-') === 0 || trimmed.indexOf('ecdsa-') === 0) {
      // OpenSSH Public Key Format
      try {
        var pub = forge.ssh.publicKeyFromOpenSSH(trimmed);
        blocks.push({
          type: 'OPENSSH PUBLIC KEY',
          details: getPublicKeyDetails(pub),
          forgeObj: pub
        });
        sshPubKey = trimmed;
      } catch (e) {
        throw new Error('Could not parse OpenSSH public key: ' + e.message);
      }
    } else {
      throw new Error('Unrecognized format. Please provide a PEM file or an OpenSSH public key.');
    }

    // 2. Try to derive an SSH Public Key for the "Copy SSH" action
    if (!sshPubKey && blocks.length > 0) {
      sshPubKey = deriveSshPubKey(blocks[0]);
    }
    h.setState('sshPubKey', sshPubKey);

    // 3. Build HTML Output
    var html = '<div class="p-6 space-y-6 max-w-4xl mx-auto">';
    
    // Header info
    html += '<div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-2">' +
              '<span class="font-medium">' + esc(file.name) + '</span>' +
              '<span class="text-surface-400">·</span>' +
              '<span>' + blocks.length + ' block(s) detected</span>' +
            '</div>';

    // Render each block
    blocks.forEach(function (block, idx) {
      html += renderBlock(block, idx);
    });

    html += '</div>';
    h.render(html);
  }

  /**
   * Processes a single PEM block (Certificate, Private Key, or Public Key)
   */
  function processPemBlock(pem) {
    var type = pem.type || 'UNKNOWN';
    var pemStr = forge.pem.encode(pem);
    var details = {};
    var forgeObj = null;

    try {
      if (type.indexOf('CERTIFICATE') !== -1) {
        forgeObj = forge.pki.certificateFromPem(pemStr);
        details = getCertificateDetails(forgeObj);
      } else if (type.indexOf('PRIVATE KEY') !== -1) {
        forgeObj = forge.pki.privateKeyFromPem(pemStr);
        details = getPrivateKeyDetails(forgeObj);
      } else if (type.indexOf('PUBLIC KEY') !== -1) {
        forgeObj = forge.pki.publicKeyFromPem(pemStr);
        details = getPublicKeyDetails(forgeObj);
      } else {
        details.info = 'Generic PEM block content.';
      }
    } catch (e) {
      details.error = 'Detail parsing failed: ' + e.message;
    }

    return { type: type, details: details, forgeObj: forgeObj };
  }

  function getCertificateDetails(cert) {
    var der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    return {
      subject: cert.subject.attributes.map(function(a){ return (a.shortName||a.name)+'='+a.value; }).join(', '),
      issuer: cert.issuer.attributes.map(function(a){ return (a.shortName||a.name)+'='+a.value; }).join(', '),
      validFrom: cert.validity.notBefore,
      validUntil: cert.validity.notAfter,
      fingerprint256: forge.md.sha256.create().update(der).digest().toHex().match(/.{2}/g).join(':').toUpperCase()
    };
  }

  function getPublicKeyDetails(key) {
    var type = key.n ? 'RSA' : (key.curve ? 'EC (' + key.curve + ')' : 'Unknown');
    var bits = key.n ? key.n.bitLength() : 'N/A';
    var fp = null;
    try {
      fp = forge.ssh.getPublicKeyFingerprint(key, { encoding: 'hex', delimiter: ':' }).toUpperCase();
    } catch (e) {}
    return { type: type, bits: bits, fingerprint: fp };
  }

  function getPrivateKeyDetails(key) {
    var type = key.n ? 'RSA' : (key.curve ? 'EC (' + key.curve + ')' : 'Unknown');
    var bits = key.n ? key.n.bitLength() : 'N/A';
    return { type: type, bits: bits, isPrivate: true };
  }

  /**
   * Helper to derive an SSH Public Key string from various objects
   */
  function deriveSshPubKey(block) {
    try {
      var pub = null;
      if (!block.forgeObj) return null;

      if (block.type.indexOf('CERTIFICATE') !== -1) {
        pub = block.forgeObj.publicKey;
      } else if (block.type.indexOf('PUBLIC KEY') !== -1) {
        pub = block.forgeObj;
      } else if (block.type.indexOf('PRIVATE KEY') !== -1) {
        var priv = block.forgeObj;
        if (priv.n && priv.e) {
          pub = forge.pki.setRsaPublicKey(priv.n, priv.e);
        }
      }

      if (pub) {
        return forge.ssh.publicKeyToOpenSSH(pub, 'omniopener-derived');
      }
    } catch (e) {}
    return null;
  }

  /**
   * Renders a block as HTML
   */
  function renderBlock(block, idx) {
    var d = block.details;
    var badgeClass = 'bg-surface-100 text-surface-600';
    
    if (block.type.indexOf('CERTIFICATE') !== -1) badgeClass = 'bg-blue-100 text-blue-700';
    else if (block.type.indexOf('PRIVATE') !== -1) badgeClass = 'bg-red-100 text-red-700';
    else if (block.type.indexOf('PUBLIC') !== -1) badgeClass = 'bg-green-100 text-green-700';

    var html = '<div class="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">' +
      '<div class="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">' +
        '<span class="text-xs font-bold uppercase tracking-wider ' + badgeClass + ' px-2 py-0.5 rounded">' + esc(block.type) + '</span>' +
        '<span class="text-xs text-surface-400 font-mono">#' + (idx + 1) + '</span>' +
      '</div>' +
      '<div class="p-4">';

    if (d.error) {
      html += '<p class="text-red-500 text-sm">' + esc(d.error) + '</p>';
    } else if (block.type.indexOf('CERTIFICATE') !== -1) {
      html += '<div class="space-y-3 text-sm">' +
        '<div><p class="text-[10px] font-bold text-surface-400 uppercase tracking-tight">Subject</p><p class="font-mono text-xs break-all">' + esc(d.subject) + '</p></div>' +
        '<div><p class="text-[10px] font-bold text-surface-400 uppercase tracking-tight">Validity</p><p class="text-xs">' + formatDate(d.validFrom) + ' <span class="text-surface-300 mx-1">to</span> ' + formatDate(d.validUntil) + '</p></div>' +
        '<div><p class="text-[10px] font-bold text-surface-400 uppercase tracking-tight">SHA-256 Fingerprint</p><p class="font-mono text-[10px] break-all text-surface-500">' + d.fingerprint256 + '</p></div>' +
      '</div>';
    } else {
      html += '<div class="flex flex-wrap gap-x-12 gap-y-4 text-sm">' +
        '<div><p class="text-[10px] font-bold text-surface-400 uppercase tracking-tight mb-1">Algorithm</p><p class="text-lg font-semibold text-surface-800">' + esc(d.type) + '</p></div>' +
        '<div><p class="text-[10px] font-bold text-surface-400 uppercase tracking-tight mb-1">Bits</p><p class="text-lg font-semibold text-surface-800">' + esc(d.bits) + '</p></div>' +
        (d.fingerprint ? '<div class="flex-1 min-w-[240px]"><p class="text-[10px] font-bold text-surface-400 uppercase tracking-tight mb-1">SSH Fingerprint (MD5)</p><p class="font-mono text-xs break-all text-surface-600">' + esc(d.fingerprint) + '</p></div>' : '') +
      '</div>';
      
      if (block.type.indexOf('PRIVATE') !== -1) {
        html += '<div class="mt-4 p-2 bg-red-50 rounded border border-red-100 text-[10px] text-red-600 flex items-center gap-2">' +
                '<span>⚠️</span> <span>Sensitive private key detected. Avoid sharing this content.</span>' +
                '</div>';
      }
    }

    html += '</div></div>';
    return html;
  }

})();
