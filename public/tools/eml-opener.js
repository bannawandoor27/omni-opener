/**
 * OmniOpener — EML Toolkit
 * Uses OmniTool SDK and native DOM parsing for basic extraction.
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
      infoHtml: '<strong>EML Toolkit:</strong> Professional email viewer with header extraction and body rendering.',
      
      onFile: function (file, content, helpers) {
        // Very basic EML Parser
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
        const subject = headers.subject || 'No Subject';
        const from = headers.from || 'Unknown Sender';
        const to = headers.to || 'Unknown Recipient';
        const date = headers.date || 'Unknown Date';

        helpers.render(`
          <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
            <!-- Email Header Panel -->
            <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-6 space-y-4">
               <h2 class="text-2xl font-bold text-surface-900">${escapeHtml(subject)}</h2>
               <div class="grid grid-cols-[80px_1fr] gap-y-1 text-sm">
                  <span class="text-surface-400 font-bold uppercase text-[10px]">From:</span>
                  <span class="text-surface-700 font-medium">${escapeHtml(from)}</span>
                  <span class="text-surface-400 font-bold uppercase text-[10px]">To:</span>
                  <span class="text-surface-700">${escapeHtml(to)}</span>
                  <span class="text-surface-400 font-bold uppercase text-[10px]">Date:</span>
                  <span class="text-surface-500 text-[12px] font-mono">${escapeHtml(date)}</span>
               </div>
            </div>

            <!-- Email Body -->
            <div class="flex-1 overflow-auto p-8 bg-white selection:bg-brand-500/20">
               <div class="prose prose-sm max-w-none">
                  ${body ? `<pre class="whitespace-pre-wrap font-sans text-surface-800">${escapeHtml(body)}</pre>` : '<p class="text-surface-400 italic">This email has no body content.</p>'}
               </div>
            </div>
          </div>
        `);
      }
    });
  };
})();
