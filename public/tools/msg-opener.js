(function () {
  'use strict';

  /**
   * OmniOpener .msg File Tool
   * Senior Staff Engineer Edition
   */

  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@kenjiuno/msgreader@1.28.0/lib/MsgReader.js';

  // --- Helpers ---

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === undefined || bytes === null || bytes < 0) return '0 B';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function sanitizeBody(html) {
    if (!html) return '';
    // Basic sanitization: remove script tags and inline handlers
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
      .replace(/href\s*=\s*'javascript:[^']*'/gi, 'href="#"')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '');
  }

  window.initTool = function (toolConfig, mountEl) {
    let scriptLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.msg',
      binary: true,
      dropLabel: 'Drop an Outlook .msg file',
      infoHtml: '<strong>Privacy:</strong> This tool parses Outlook files locally. No data leaves your computer.',

      onInit: function (h) {
        h.loadScript(LIB_URL, function () {
          scriptLoaded = true;
        });
      },

      onDestroy: function (h) {
        // Cleanup if any object URLs were created (not explicitly used here but good practice)
        const state = h.getState();
        if (state && state.attachmentUrls) {
          state.attachmentUrls.forEach(url => URL.revokeObjectURL(url));
        }
      },

      onFile: function _onFile(file, content, h) {
        // Fix B8: Avoid "this" usage, use named function reference
        if (!scriptLoaded && typeof MsgReader === 'undefined') {
          h.showLoading('Loading engine...');
          setTimeout(function () {
            _onFile(file, content, h);
          }, 200);
          return;
        }

        h.showLoading('Parsing message structure...');

        try {
          // B2: content is ArrayBuffer (binary:true)
          const reader = new MsgReader(content);
          const data = reader.getFileData();

          if (!data) {
            throw new Error('Failed to extract message data');
          }

          // Store data in state
          h.setState('msgData', data);
          h.setState('fileInfo', {
            name: file.name,
            size: file.size,
            type: '.msg file'
          });
          h.setState('attachmentUrls', []);

          renderTool(data, h);
        } catch (err) {
          console.error('[MSG Reader Error]', err);
          h.showError(
            'Could not open .msg file',
            'The file may be corrupted, encrypted, or in an unsupported variant. Outlook "Message" files must be in the standard OLE format.'
          );
        }
      },

      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy-body',
          onClick: function (h, btn) {
            const data = h.getState().msgData;
            if (data) {
              const text = data.body || '';
              if (text) {
                h.copyToClipboard(text, btn);
              } else {
                h.showError('No text body', 'This message only contains an HTML body or is empty.');
              }
            }
          }
        },
        {
          label: '📥 Save as HTML',
          id: 'save-html',
          onClick: function (h) {
            const data = h.getState().msgData;
            if (!data) return;
            const fileName = (data.subject || 'email').replace(/[^a-z0-9]/gi, '_') + '.html';
            const htmlContent = data.bodyHTML || `<!DOCTYPE html><html><body style="font-family:sans-serif;white-space:pre-wrap">${esc(data.body)}</body></html>`;
            h.download(fileName, htmlContent, 'text/html');
          }
        },
        {
          label: '🖨️ Print',
          id: 'print-msg',
          onClick: function (h) {
            const frame = h.getRenderEl().querySelector('#msg-iframe');
            if (frame) {
              frame.contentWindow.focus();
              frame.contentWindow.print();
            } else {
              window.print();
            }
          }
        }
      ]
    });
  };

  function renderTool(data, h) {
    const fileInfo = h.getState().fileInfo;
    const atts = data.attachments || [];
    const recipients = data.recipients || [];
    
    // Header Data
    const subject = data.subject || '(No Subject)';
    const sender = (data.senderName || '') + (data.senderEmail ? ` <${data.senderEmail}>` : '') || 'Unknown Sender';
    const dateStr = data.creationTime ? new Date(data.creationTime).toLocaleString() : 'Unknown Date';

    // U1: File Info Bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${esc(fileInfo.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(fileInfo.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">${esc(fileInfo.type)}</span>
        ${atts.length > 0 ? `
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${atts.length} attachments</span>
        ` : ''}
      </div>
    `;

    // Email Header Card
    const headerCard = `
      <div class="bg-white rounded-xl border border-surface-200 p-6 mb-6 shadow-sm">
        <div class="flex flex-col gap-4">
          <h2 class="text-2xl font-bold text-surface-900 leading-tight">${esc(subject)}</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-[80px_1fr] gap-x-6 gap-y-3 text-sm">
            <div class="text-surface-400 font-bold uppercase tracking-wider text-[10px] pt-1">From</div>
            <div class="text-surface-800 font-medium">${esc(sender)}</div>
            
            <div class="text-surface-400 font-bold uppercase tracking-wider text-[10px] pt-1">To</div>
            <div class="flex flex-wrap gap-1">
              ${recipients.length > 0 ? recipients.map(r => `
                <span class="inline-flex items-center bg-surface-50 border border-surface-100 px-2 py-0.5 rounded text-surface-700">
                  ${esc(r.name || r.email || 'Unknown')}
                  ${r.email ? `<span class="ml-1 text-surface-400 font-normal text-xs">&lt;${esc(r.email)}&gt;</span>` : ''}
                </span>
              `).join('') : '<span class="text-surface-400 italic">No recipients listed</span>'}
            </div>
            
            <div class="text-surface-400 font-bold uppercase tracking-wider text-[10px] pt-1">Date</div>
            <div class="text-surface-600">${dateStr}</div>
          </div>
        </div>
      </div>
    `;

    // Tabs
    const tabs = `
      <div class="flex items-center gap-1 mb-4 border-b border-surface-200 overflow-x-auto no-scrollbar">
        <button data-tab="content" class="tab-btn px-4 py-2.5 text-sm font-semibold border-b-2 border-brand-500 text-brand-600 transition-all whitespace-nowrap">Message</button>
        <button data-tab="attachments" class="tab-btn px-4 py-2.5 text-sm font-medium text-surface-500 hover:text-surface-700 border-b-2 border-transparent transition-all whitespace-nowrap flex items-center gap-2">
          Attachments
          <span class="bg-surface-100 text-surface-600 px-1.5 py-0.5 rounded-full text-[10px]">${atts.length}</span>
        </button>
        <button data-tab="headers" class="tab-btn px-4 py-2.5 text-sm font-medium text-surface-500 hover:text-surface-700 border-b-2 border-transparent transition-all whitespace-nowrap">Technical Headers</button>
      </div>
    `;

    // Content Sections
    const bodyView = `
      <div id="tab-content" class="tab-pane">
        <div class="bg-white rounded-xl border border-surface-200 overflow-hidden min-h-[500px] shadow-sm">
          ${data.bodyHTML ? `
            <iframe id="msg-iframe" class="w-full min-h-[600px] border-0" sandbox="allow-same-origin"></iframe>
          ` : `
            <div class="p-8">
              ${data.body ? `
                <pre class="text-sm font-sans text-surface-800 whitespace-pre-wrap leading-relaxed">${esc(data.body)}</pre>
              ` : `
                <div class="flex flex-col items-center justify-center py-20 text-surface-400 italic">
                  <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                  <p>Message body is empty.</p>
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    `;

    const attachmentsView = `
      <div id="tab-attachments" class="tab-pane hidden">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between gap-4">
            <h3 class="font-semibold text-surface-800">Files (${atts.length})</h3>
            ${atts.length > 0 ? `
              <div class="relative w-full max-w-xs">
                <input type="text" id="att-search" placeholder="Search attachments..." 
                       class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
                <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            ` : ''}
          </div>
          
          ${atts.length > 0 ? `
            <div id="att-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              ${atts.map((att, i) => {
                const name = att.fileName || att.name || `attachment-${i}`;
                const size = att.contentLength || (att.data ? att.data.length : 0);
                return `
                  <div class="att-item bg-white border border-surface-200 p-4 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all group" data-name="${esc(name.toLowerCase())}">
                    <div class="flex items-center gap-3 mb-4">
                      <div class="w-10 h-10 flex items-center justify-center bg-surface-50 rounded-lg text-surface-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="text-sm font-semibold text-surface-800 truncate" title="${esc(name)}">${esc(name)}</div>
                        <div class="text-xs text-surface-400">${formatSize(size)}</div>
                      </div>
                    </div>
                    <button class="dl-att-btn w-full py-2 px-3 bg-surface-50 hover:bg-brand-500 hover:text-white text-surface-600 text-xs font-bold rounded-lg transition-all" data-index="${i}">
                      Download File
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="flex flex-col items-center justify-center py-16 bg-surface-50 rounded-xl border-2 border-dashed border-surface-200 text-surface-400">
              <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              <p class="text-sm">No attachments found in this message.</p>
            </div>
          `}
        </div>
      </div>
    `;

    const headersView = `
      <div id="tab-headers" class="tab-pane hidden">
        <div class="rounded-xl border border-surface-200 overflow-hidden bg-gray-950 shadow-sm">
          <div class="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
            <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Raw SMTP Headers</span>
            <button id="copy-headers-btn" class="text-xs text-gray-400 hover:text-white transition-colors">Copy Headers</button>
          </div>
          <pre class="p-6 text-[13px] font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[600px] custom-scrollbar">${esc(data.headers || 'No technical headers found.')}</pre>
        </div>
      </div>
    `;

    h.render(`
      <div class="max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
        ${infoBar}
        ${headerCard}
        ${tabs}
        <div class="mt-2 min-h-[600px] pb-12">
          ${bodyView}
          ${attachmentsView}
          ${headersView}
        </div>
      </div>
      <style>
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
      </style>
    `);

    const el = h.getRenderEl();

    // 1. Setup Iframe for HTML Body
    if (data.bodyHTML) {
      const frame = el.querySelector('#msg-iframe');
      if (frame) {
        // B6: Use sandboxed iframe + basic sanitization
        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  line-height: 1.6;
                  color: #1e293b;
                  padding: 24px;
                  margin: 0;
                  word-wrap: break-word;
                }
                a { color: #3b82f6; text-decoration: none; }
                a:hover { text-decoration: underline; }
                img { max-width: 100%; height: auto; border-radius: 4px; }
                blockquote { border-left: 3px solid #e2e8f0; padding-left: 16px; margin-left: 0; color: #64748b; }
                table { border-collapse: collapse; width: 100%; margin: 16px 0; }
                th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
                th { background-color: #f8fafc; font-weight: 600; }
              </style>
            </head>
            <body>${sanitizeBody(data.bodyHTML)}</body>
          </html>
        `);
        doc.close();
      }
    }

    // 2. Tab Switching Logic
    el.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        
        // Update Buttons
        el.querySelectorAll('[data-tab]').forEach(b => {
          b.classList.remove('border-brand-500', 'text-brand-600', 'font-semibold');
          b.classList.add('border-transparent', 'text-surface-500', 'font-medium');
        });
        btn.classList.add('border-brand-500', 'text-brand-600', 'font-semibold');
        btn.classList.remove('border-transparent', 'text-surface-500', 'font-medium');

        // Update Panes
        el.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
        el.querySelector(`#tab-${target}`).classList.remove('hidden');
      });
    });

    // 3. Attachment Download Logic
    el.querySelectorAll('.dl-att-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'));
        const att = atts[index];
        if (att && att.data) {
          const name = att.fileName || att.name || 'attachment';
          h.download(name, att.data, 'application/octet-stream');
        } else {
          h.showError('Download failed', 'Attachment data is missing or corrupted.');
        }
      });
    });

    // 4. Attachment Search Logic
    const searchInput = el.querySelector('#att-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const items = el.querySelectorAll('.att-item');
        
        items.forEach(item => {
          const name = item.getAttribute('data-name');
          const isVisible = name.includes(query);
          item.style.display = isVisible ? 'block' : 'none';
        });
      });
    }

    // 5. Header Copy Button
    const copyHeadsBtn = el.querySelector('#copy-headers-btn');
    if (copyHeadsBtn) {
      copyHeadsBtn.addEventListener('click', () => {
        h.copyToClipboard(data.headers || '', copyHeadsBtn);
      });
    }
  }

})();
