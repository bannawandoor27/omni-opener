/**
 * OmniOpener — EML Toolkit
 * Uses OmniTool SDK, PostalMime, and DOMPurify for secure email rendering.
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
      binary: true,
      infoHtml: '<strong>EML Toolkit:</strong> Professional email viewer with HTML rendering, header extraction, and attachment management. Processing is 100% client-side.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/postal-mime@1.1.2/dist/postal-mime.min.js');
        h.loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.0.9/dist/purify.min.js');
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy-text',
          onClick: function (h, btn) {
            const data = h.getState().emailData;
            if (data) {
              const text = data.text || data.html || '';
              h.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '📥 Save as JSON',
          id: 'save-json',
          onClick: function (h) {
            const data = h.getState().emailData;
            if (data) {
              const cleanData = { ...data };
              delete cleanData.attachments; // Avoid bloating JSON with binary data
              h.download(h.getFile().name.replace(/\.eml$/i, '.json'), JSON.stringify(data, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        if (typeof PostalMime === 'undefined' || typeof DOMPurify === 'undefined') {
          h.showLoading('Loading email engine...');
          setTimeout(() => _onFileFn(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing email...');

        const parser = new PostalMime();
        parser.parse(content)
          .then(email => {
            h.setState('emailData', email);
            renderEmail(email, file, h);
          })
          .catch(err => {
            h.showError('Failed to parse email', err.message);
          });
      }
    });
  };

  function renderEmail(email, file, h) {
    const hasAttachments = email.attachments && email.attachments.length > 0;
    const bodyHtml = email.html ? DOMPurify.sanitize(email.html) : (email.text ? `<pre class="whitespace-pre-wrap font-sans text-sm">${escapeHtml(email.text)}</pre>` : '<p class="text-surface-400 italic">No message content.</p>');

    h.render(`
      <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
        <!-- Header Panel -->
        <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-6">
           <div class="flex justify-between items-start mb-4">
              <h2 class="text-xl font-bold text-surface-900 leading-tight">${escapeHtml(email.subject || 'No Subject')}</h2>
              <div class="flex px-1 bg-white border border-surface-200 rounded-lg shrink-0">
                 <button id="tab-email" class="px-3 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600 transition-all">Message</button>
                 <button id="tab-headers" class="px-3 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all">Headers</button>
                 ${hasAttachments ? `<button id="tab-files" class="px-3 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all">Files (${email.attachments.length})</button>` : ''}
              </div>
           </div>
           
           <div class="grid grid-cols-[60px_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span class="text-surface-400 font-bold uppercase text-[9px] mt-0.5">From</span>
              <div class="text-surface-700 font-medium">
                ${email.from ? `<strong>${escapeHtml(email.from.name || '')}</strong> &lt;${escapeHtml(email.from.address)}&gt;` : 'Unknown'}
              </div>
              
              <span class="text-surface-400 font-bold uppercase text-[9px] mt-0.5">To</span>
              <div class="text-surface-600">
                ${email.to ? email.to.map(t => `${escapeHtml(t.name || '')} &lt;${escapeHtml(t.address)}&gt;`).join(', ') : 'Unknown'}
              </div>

              <span class="text-surface-400 font-bold uppercase text-[9px] mt-0.5">Date</span>
              <div class="text-surface-500 text-xs">${email.date ? new Date(email.date).toLocaleString() : 'No Date'}</div>
           </div>
        </div>

        <!-- Body Area -->
        <div class="flex-1 overflow-hidden relative bg-white">
           <!-- Email Body View -->
           <div id="view-email" class="absolute inset-0 overflow-auto p-8">
              ${email.html ? `<div class="max-w-4xl mx-auto">${bodyHtml}</div>` : bodyHtml}
           </div>

           <!-- Headers View -->
           <div id="view-headers" class="absolute inset-0 hidden overflow-auto p-6 bg-surface-50 font-mono text-[11px]">
              <div class="max-w-4xl mx-auto space-y-1">
                 ${email.headers ? email.headers.map(h => `
                    <div class="flex border-b border-surface-100 py-1 hover:bg-surface-100 transition-colors">
                       <span class="w-40 shrink-0 font-bold text-brand-600 uppercase tracking-tighter">${escapeHtml(h.key)}</span>
                       <span class="text-surface-600 break-all">${escapeHtml(h.value)}</span>
                    </div>
                 `).join('') : '<p class="text-surface-400 italic">No headers found.</p>'}
              </div>
           </div>

           <!-- Attachments View -->
           ${hasAttachments ? `
           <div id="view-files" class="absolute inset-0 hidden overflow-auto p-8 bg-surface-50">
              <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                 ${email.attachments.map((att, idx) => `
                    <div class="flex items-center gap-4 p-4 bg-white border border-surface-200 rounded-xl shadow-sm hover:shadow-md transition-all">
                       <div class="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center text-2xl text-brand-500">
                          ${getIconForMime(att.mimeType)}
                       </div>
                       <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-surface-900 truncate">${escapeHtml(att.filename || 'unnamed-file')}</p>
                          <p class="text-[10px] text-surface-400 font-medium uppercase">${att.mimeType} • ${formatSize(att.content.byteLength)}</p>
                       </div>
                       <button class="att-download px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-brand-500 hover:text-white text-surface-600 text-xs font-bold transition-all" data-idx="${idx}">
                          Download
                       </button>
                    </div>
                 `).join('')}
              </div>
           </div>
           ` : ''}
        </div>
      </div>
    `);

    // Tab Logic
    const tabs = {
      email: { btn: document.getElementById('tab-email'), view: document.getElementById('view-email') },
      headers: { btn: document.getElementById('tab-headers'), view: document.getElementById('view-headers') },
      files: { btn: document.getElementById('tab-files'), view: document.getElementById('view-files') }
    };

    Object.keys(tabs).forEach(key => {
      const tab = tabs[key];
      if (!tab.btn) return;
      tab.btn.onclick = () => {
        Object.values(tabs).forEach(t => {
          if (!t.btn) return;
          t.btn.className = "px-3 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-all";
          if (t.view) t.view.classList.add('hidden');
        });
        tab.btn.className = "px-3 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600 transition-all";
        if (tab.view) tab.view.classList.remove('hidden');
      };
    });

    // Attachment Downloads
    document.querySelectorAll('.att-download').forEach(btn => {
       btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          const att = email.attachments[idx];
          h.download(att.filename || `attachment-${idx}`, att.content, att.mimeType);
       };
    });
  }

  function getIconForMime(mime) {
    if (mime.includes('image')) return '🖼️';
    if (mime.includes('pdf')) return '📄';
    if (mime.includes('zip') || mime.includes('archive')) return '📦';
    if (mime.includes('audio')) return '🎵';
    if (mime.includes('video')) return '🎬';
    return '📎';
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
})();
