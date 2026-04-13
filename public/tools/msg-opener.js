(function () {
  'use strict';

  /**
   * OmniOpener .msg File Tool
   * Senior Staff Engineer & UX Perfectionist Edition
   */

  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@kenjiuno/msgreader@1.20.0/MsgReader.js';

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
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.msg',
      binary: true,
      dropLabel: 'Drop an Outlook .msg file here',
      infoHtml: 'Parsed entirely in your browser. No data is sent to any server.',

      onInit: function (h) {
        h.loadScript(LIB_URL);
      },

      onFile: async function (file, content, h) {
        h.showLoading('Preparing engine...');
        
        // B1: Race condition check
        if (typeof MsgReader === 'undefined') {
          await new Promise((resolve, reject) => {
            h.loadScript(LIB_URL, () => {
              if (typeof MsgReader !== 'undefined') resolve();
              else reject(new Error('Failed to load MsgReader library'));
            });
          });
        }

        h.setState('fileInfo', { name: file.name, size: file.size });
        processMsg(content, h);
      },

      actions: [
        {
          label: '📋 Copy Body',
          id: 'copy-body',
          onClick: function (h, btn) {
            const data = h.getState().msgData;
            if (data && (data.body || data.bodyHTML)) {
              h.copyToClipboard(data.body || data.bodyHTML, btn);
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
            const html = data.bodyHTML || `<html><body><pre>${esc(data.body)}</pre></body></html>`;
            h.download(fileName, html, 'text/html');
          }
        },
        {
          label: '🖨️ Print',
          id: 'print-msg',
          onClick: function () {
            const frame = document.getElementById('msg-iframe');
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

  function processMsg(content, h) {
    // U2: Descriptive loading
    h.showLoading('Parsing Outlook message structure...');
    
    try {
      // B2: binary:true ensures 'content' is ArrayBuffer. MsgReader handles it.
      const reader = new MsgReader(content);
      const data = reader.getFileData();
      
      if (!data) {
        throw new Error('Message data is empty or corrupted');
      }

      h.setState('msgData', data);
      renderTool(data, h);
    } catch (err) {
      console.error(err);
      // U3: Friendly error message
      h.showError(
        'Could not open .msg file',
        'This file might be a "sticky note", a calendar item, or an unsupported Outlook format. Try exporting it as a standard email message.'
      );
    }
  }

  function renderTool(data, h) {
    const fileInfo = h.getState().fileInfo;
    const attCount = data.attachments ? data.attachments.length : 0;
    const recipientCount = data.recipients ? data.recipients.length : 0;

    // U1: File info bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${esc(fileInfo.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(fileInfo.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">Outlook Message</span>
        ${attCount > 0 ? `
          <span class="text-surface-300">|</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${attCount} attachments</span>
        ` : ''}
      </div>
    `;

    // U9: Content Card for Header
    const headerCard = `
      <div class="bg-white rounded-xl border border-surface-200 p-6 mb-6 shadow-sm">
        <h2 class="text-2xl font-bold text-surface-900 mb-4 leading-tight">${esc(data.subject || '(No Subject)')}</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-[100px_1fr] gap-x-4 gap-y-3 text-sm">
          <div class="text-surface-400 font-bold uppercase tracking-wider text-[10px] self-center">From</div>
          <div class="text-surface-800 font-medium">
            <span class="bg-surface-100 px-2 py-1 rounded text-surface-700">${esc(data.senderName || 'Unknown')}</span>
            ${data.senderEmail ? `<span class="ml-2 text-surface-500 font-normal">&lt;${esc(data.senderEmail)}&gt;</span>` : ''}
          </div>

          <div class="text-surface-400 font-bold uppercase tracking-wider text-[10px] self-center">To</div>
          <div class="text-surface-800">
            ${data.recipients && data.recipients.length > 0 
              ? data.recipients.map(r => `
                  <span class="inline-block bg-surface-50 border border-surface-100 px-2 py-0.5 rounded mr-1 mb-1 text-surface-700">
                    ${esc(r.name || r.email || 'Unknown')}
                  </span>
                `).join('')
              : '<span class="text-surface-400 italic">No recipients listed</span>'
            }
          </div>

          ${data.creationTime ? `
            <div class="text-surface-400 font-bold uppercase tracking-wider text-[10px] self-center">Date</div>
            <div class="text-surface-600">${new Date(data.creationTime).toLocaleString()}</div>
          ` : ''}
        </div>
      </div>
    `;

    // Tabs & Body
    const tabs = `
      <div class="flex items-center gap-2 mb-4 border-b border-surface-200 pb-px">
        <button id="btn-view-body" class="px-4 py-2 text-sm font-semibold border-b-2 border-brand-500 text-brand-600 transition-all">Message</button>
        <button id="btn-view-attachments" class="px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-700 border-b-2 border-transparent transition-all">
          Attachments <span class="ml-1 px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded-full text-[10px]">${attCount}</span>
        </button>
        <button id="btn-view-headers" class="px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-700 border-b-2 border-transparent transition-all">Technical Headers</button>
      </div>
    `;

    // U10: Section headers with counts
    // U8: Code blocks for body/headers
    const content = `
      <div id="section-body" class="space-y-4">
        <div class="bg-white rounded-xl border border-surface-200 overflow-hidden min-h-[400px]">
          ${data.bodyHTML ? `
            <iframe id="msg-iframe" class="w-full min-h-[600px] border-0" sandbox="allow-same-origin"></iframe>
          ` : `
            <div class="p-6 overflow-x-auto">
              <pre class="text-sm font-sans text-surface-800 whitespace-pre-wrap leading-relaxed">${esc(data.body || 'No message content.')}</pre>
            </div>
          `}
        </div>
      </div>

      <div id="section-attachments" class="hidden">
        <div class="flex items-center justify-between mb-4">
           <h3 class="font-semibold text-surface-800">Attachments</h3>
           <input type="text" id="att-filter" placeholder="Filter files..." class="text-xs border border-surface-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none w-48">
        </div>
        ${attCount > 0 ? `
          <div id="att-grid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            ${data.attachments.map((att, i) => {
              const fileName = att.fileName || att.name || `attachment-${i}`;
              const fileSize = att.contentLength || (att.data ? att.data.length : 0);
              return `
                <div class="att-card bg-white border border-surface-200 p-4 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all group" data-name="${esc(fileName.toLowerCase())}">
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 shrink-0 bg-surface-50 rounded-lg flex items-center justify-center text-xl">📎</div>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-semibold text-surface-900 truncate" title="${esc(fileName)}">${esc(fileName)}</div>
                      <div class="text-xs text-surface-400 mt-0.5">${formatSize(fileSize)}</div>
                    </div>
                  </div>
                  <button 
                    class="dl-btn mt-4 w-full py-2 bg-surface-50 text-surface-600 hover:bg-brand-500 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                    data-idx="${i}"
                  >
                    Download File
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="flex flex-col items-center justify-center py-12 bg-surface-50 rounded-xl border border-dashed border-surface-300 text-surface-400">
            <span class="text-3xl mb-2">📥</span>
            <p class="text-sm italic">No attachments found in this message.</p>
          </div>
        `}
      </div>

      <div id="section-headers" class="hidden">
        <div class="rounded-xl overflow-hidden border border-surface-200">
          <pre class="p-6 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[600px]">${esc(data.headers || 'No technical headers available.')}</pre>
        </div>
      </div>
    `;

    h.render(`
      <div class="max-w-6xl mx-auto">
        ${infoBar}
        ${headerCard}
        ${tabs}
        <div class="mt-4 pb-12">
          ${content}
        </div>
      </div>
    `);

    // Setup Iframe for HTML content (B6: Sanitization/Security)
    if (data.bodyHTML) {
      const frame = document.getElementById('msg-iframe');
      if (frame) {
        // We use srcdoc for safety within the sandbox
        // We wrap it in a container to ensure fonts are reasonable if missing
        frame.srcdoc = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #334155; padding: 20px; }
                img { max-width: 100%; height: auto; }
              </style>
            </head>
            <body>${data.bodyHTML}</body>
          </html>
        `;
      }
    }

    // Logic for Tabs
    const btnBody = document.getElementById('btn-view-body');
    const btnAtts = document.getElementById('btn-view-attachments');
    const btnHeads = document.getElementById('btn-view-headers');
    const secBody = document.getElementById('section-body');
    const secAtts = document.getElementById('section-attachments');
    const secHeads = document.getElementById('section-headers');

    function showSection(id) {
      [secBody, secAtts, secHeads].forEach(s => s.classList.add('hidden'));
      [btnBody, btnAtts, btnHeads].forEach(b => {
        b.classList.remove('border-brand-500', 'text-brand-600', 'font-semibold');
        b.classList.add('border-transparent', 'text-surface-500', 'font-medium');
      });

      if (id === 'body') {
        secBody.classList.remove('hidden');
        btnBody.classList.add('border-brand-500', 'text-brand-600', 'font-semibold');
        btnBody.classList.remove('border-transparent', 'text-surface-500', 'font-medium');
      } else if (id === 'atts') {
        secAtts.classList.remove('hidden');
        btnAtts.classList.add('border-brand-500', 'text-brand-600', 'font-semibold');
        btnAtts.classList.remove('border-transparent', 'text-surface-500', 'font-medium');
      } else if (id === 'heads') {
        secHeads.classList.remove('hidden');
        btnHeads.classList.add('border-brand-500', 'text-brand-600', 'font-semibold');
        btnHeads.classList.remove('border-transparent', 'text-surface-500', 'font-medium');
      }
    }

    btnBody.onclick = () => showSection('body');
    btnAtts.onclick = () => showSection('atts');
    btnHeads.onclick = () => showSection('heads');

    // Logic for Downloads
    h.getRenderEl().querySelectorAll('.dl-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        const att = data.attachments[idx];
        const fileName = att.fileName || att.name || 'attachment';
        // B3: Handle data properly
        if (att.data) {
          h.download(fileName, att.data, 'application/octet-stream');
        } else {
          h.showError('Download Failed', 'This attachment has no data content.');
        }
      };
    });

    // ARCHIVES Excellence: Filter for attachments
    const filterInput = document.getElementById('att-filter');
    if (filterInput) {
      filterInput.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        h.getRenderEl().querySelectorAll('.att-card').forEach(card => {
          const name = card.dataset.name;
          card.style.display = name.includes(term) ? 'block' : 'none';
        });
      };
    }
  }
})();
