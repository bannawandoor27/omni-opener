/**
 * OmniOpener — EML Toolkit
 * Uses OmniTool SDK.
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
      accept: '.eml',
      dropLabel: 'Drop an .eml file here',
      binary: false,
      infoHtml: '<strong>EML Toolkit:</strong> Professional email viewer with HTML rendering, header extraction, and metadata inspection.',
      
      onFile: function (file, content, helpers) {
        const lines = content.split('\n');
        const headers = {};
        let bodyIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
           const line = lines[i];
           if (line.trim() === "") { bodyIndex = i; break; }
           const colon = line.indexOf(':');
           if (colon !== -1) {
              const key = line.substring(0, colon).trim().toLowerCase();
              headers[key] = line.substring(colon + 1).trim();
           }
        }

        const body = lines.slice(bodyIndex).join('\n').trim();
        const isHtml = body.includes('<html') || body.includes('<body') || body.includes('<div');

        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
            <!-- Header Panel -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-6">
               <div class="flex justify-between items-start mb-4">
                  <h2 class="text-xl font-bold text-surface-900">${escapeHtml(headers.subject || 'No Subject')}</h2>
                  <div class="flex px-1 bg-white border border-surface-200 rounded-lg">
                     <button id="tab-body" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Email</button>
                     <button id="tab-headers" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400">Headers</button>
                  </div>
               </div>
               <div class="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                  <span class="text-surface-400 font-bold uppercase text-[10px]">From:</span>
                  <span class="text-surface-700 font-medium">${escapeHtml(headers.from || 'Unknown')}</span>
                  <span class="text-surface-400 font-bold uppercase text-[10px]">Date:</span>
                  <span class="text-surface-500 text-[12px]">${escapeHtml(headers.date || '')}</span>
               </div>
            </div>

            <!-- Body Area -->
            <div class="flex-1 overflow-hidden relative">
               <div id="view-body" class="absolute inset-0 overflow-auto p-8 bg-white">
                  ${isHtml ? `
                    <iframe id="eml-frame" sandbox="allow-same-origin" class="w-full h-full border-0"></iframe>
                  ` : `
                    <pre class="whitespace-pre-wrap font-sans text-surface-800 text-sm leading-relaxed">${escapeHtml(body)}</pre>
                  `}
               </div>
               <div id="view-headers" class="absolute inset-0 hidden overflow-auto p-6 bg-surface-50 font-mono text-[11px]">
                  <table class="w-full border-collapse">
                     ${Object.entries(headers).map(([k, v]) => `
                        <tr>
                           <td class="py-1 pr-4 font-bold text-brand-600 uppercase w-32 border-b border-surface-100">${escapeHtml(k)}</td>
                           <td class="py-1 text-surface-600 border-b border-surface-100 break-all">${escapeHtml(v)}</td>
                        </tr>
                     `).join('')}
                  </table>
               </div>
            </div>
          </div>
        `);

        if (isHtml) {
           const frame = document.getElementById('eml-frame');
           frame.srcdoc = body;
        }

        const tabBody = document.getElementById('tab-body');
        const tabHeaders = document.getElementById('tab-headers');
        const viewBody = document.getElementById('view-body');
        const viewHeaders = document.getElementById('view-headers');

        tabBody.onclick = () => {
           tabBody.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
           tabHeaders.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400";
           viewBody.classList.remove('hidden');
           viewHeaders.classList.add('hidden');
        };

        tabHeaders.onclick = () => {
           tabHeaders.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
           tabBody.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400";
           viewHeaders.classList.remove('hidden');
           viewBody.classList.add('hidden');
        };
      }
    });
  };
})();

