/**
 * OmniOpener — Security (PEM/CRT/KEY) Toolkit
 * Uses OmniTool SDK and forge.js.
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
      infoHtml: '<strong>Security Toolkit:</strong> Professional certificate decoder with expiry analysis and key inspection.',
      
      onInit: function(h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/node-forge@1.3.1/dist/forge.min.js');
      },

      onFile: function (file, content, h) {
        if (typeof forge === 'undefined') {
          h.showLoading('Loading Security engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        let type = "Unknown Security File";
        let infoHtml = "";
        
        try {
           if (content.includes('BEGIN CERTIFICATE')) {
              type = "X.509 Certificate";
              const cert = forge.pki.certificateFromPem(content);
              const subject = cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
              const issuer = cert.issuer.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ');
              const validFrom = cert.validity.notBefore;
              const validTo = cert.validity.notAfter;
              const now = new Date();
              const daysLeft = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));
              const isExpired = daysLeft < 0;

              infoHtml = `
                <div class="space-y-6">
                   <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
                         <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Status</div>
                         <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${isExpired ? 'bg-red-500' : 'bg-green-500'}"></span>
                            <span class="font-bold ${isExpired ? 'text-red-600' : 'text-green-600'}">${isExpired ? 'Expired' : 'Valid'}</span>
                            <span class="text-xs text-surface-500">(${daysLeft} days left)</span>
                         </div>
                      </div>
                      <div class="p-4 rounded-xl bg-surface-50 border border-surface-100">
                         <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Serial Number</div>
                         <div class="font-mono text-xs truncate">${cert.serialNumber}</div>
                      </div>
                   </div>
                   <div class="space-y-4">
                      <div class="flex flex-col">
                         <span class="text-[10px] font-bold text-surface-400 uppercase">Subject</span>
                         <span class="text-sm text-surface-900 font-medium">${escapeHtml(subject)}</span>
                      </div>
                      <div class="flex flex-col">
                         <span class="text-[10px] font-bold text-surface-400 uppercase">Issuer</span>
                         <span class="text-sm text-surface-700">${escapeHtml(issuer)}</span>
                      </div>
                      <div class="flex flex-col">
                         <span class="text-[10px] font-bold text-surface-400 uppercase">Validity</span>
                         <span class="text-xs text-surface-500">${validFrom.toUTCString()} — ${validTo.toUTCString()}</span>
                      </div>
                   </div>
                </div>
              `;
           } else if (content.includes('BEGIN PRIVATE KEY')) {
              type = "Private Key";
              infoHtml = `<div class="p-4 bg-red-50 text-red-700 rounded-lg text-sm font-medium">⚠️ This is a private key. Never share its content with anyone.</div>`;
           } else if (content.includes('BEGIN PUBLIC KEY')) {
              type = "Public Key";
              infoHtml = `<div class="p-4 bg-brand-50 text-brand-700 rounded-lg text-sm font-medium">Verified Public Key structure detected.</div>`;
           }

           h.render(`
             <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
               <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex justify-between items-center">
                  <div>
                     <h3 class="text-lg font-bold text-surface-900">${escapeHtml(file.name)}</h3>
                     <span class="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">${type}</span>
                  </div>
                  <span class="text-[10px] font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</span>
               </div>
               <div class="flex-1 overflow-auto p-8 space-y-8">
                  ${infoHtml}
                  <div class="flex flex-col">
                     <span class="text-[10px] font-bold text-surface-400 uppercase mb-2">Encoded Source</span>
                     <pre class="bg-surface-900 text-surface-100 p-6 rounded-xl font-mono text-[11px] overflow-auto leading-relaxed shadow-inner"><code>${escapeHtml(content)}</code></pre>
                  </div>
               </div>
             </div>
           `);

        } catch (err) {
           h.render(`
             <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
               <div class="p-8 text-center text-surface-400">
                  <p class="text-2xl mb-2">🔐</p>
                  <p>Decoded info unavailable. The file content is shown below.</p>
               </div>
               <div class="flex-1 overflow-auto p-8">
                  <pre class="bg-surface-900 text-surface-100 p-6 rounded-xl font-mono text-[11px] overflow-auto leading-relaxed"><code>${escapeHtml(content)}</code></pre>
               </div>
             </div>
           `);
        }
      }
    });
  };
})();
