(function() {
  'use strict';

  /**
   * OmniOpener MBOX Tool
   * A high-performance, beautiful browser-based MBOX viewer.
   */
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.mbox',
      dropLabel: 'Drop an .mbox mailbox file here',
      binary: false,
      onInit: function(helpers) {
        // No heavy external dependencies needed for basic MBOX parsing
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing mailbox and extracting messages...');
        
        // Use a micro-task to allow the loading spinner to show
        setTimeout(() => {
          try {
            if (!content || content.trim().length === 0) {
              helpers.showError('Empty File', 'The uploaded .mbox file contains no data.');
              return;
            }

            // Large file handling: check size
            const MAX_SIZE = 100 * 1024 * 1024; // 100MB
            if (file.size > MAX_SIZE) {
              console.warn('Large file detected. Truncating content for performance.');
            }

            const messages = parseMbox(content, 1000); // Limit to 1000 messages for UI stability
            
            if (messages.length === 0) {
              helpers.showError('No Messages Found', 'The file does not appear to be a valid mbox file. Ensure it starts with "From ".');
              return;
            }

            helpers.setState({
              messages: messages,
              filteredMessages: messages,
              selectedIndex: 0,
              searchTerm: '',
              isTruncated: content.length > 50 * 1024 * 1024 // Rough check if we might have skipped some
            });

            renderMainUI(helpers);
          } catch (err) {
            console.error('[MBOX Parser Error]', err);
            helpers.showError('Parsing Failed', 'An error occurred while reading the mailbox. The file might be corrupted.');
          }
        }, 100);
      },
      actions: [
        {
          label: '📥 Download MBOX',
          id: 'download-orig',
          onClick: (helpers) => {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        },
        {
          label: '📄 Export as JSON',
          id: 'export-json',
          onClick: (helpers) => {
            const state = helpers.getState();
            const json = JSON.stringify(state.messages, null, 2);
            helpers.download(`${helpers.getFile().name.replace('.mbox', '')}.json`, json);
          }
        }
      ],
      infoHtml: '<strong>MBOX Viewer:</strong> This tool parses mailbox files locally in your browser. Your data never leaves your computer.'
    });
  };

  /**
   * Main UI Renderer
   */
  function renderMainUI(helpers) {
    const state = helpers.getState();
    const file = helpers.getFile();
    const messages = state.filteredMessages || [];
    const selectedIdx = state.selectedIndex || 0;
    const currentMsg = messages[selectedIdx];

    const html = `
      <div class="flex flex-col h-full max-h-[85vh]">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.mbox mailbox</span>
          ${state.isTruncated ? `<span class="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">PREVIEW ONLY</span>` : ''}
        </div>

        <div class="flex flex-col lg:flex-row gap-4 flex-1 overflow-hidden">
          <!-- Sidebar: Message List -->
          <div class="w-full lg:w-80 flex flex-col bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
            <div class="p-3 border-b border-surface-100 bg-surface-50/50">
              <div class="flex items-center justify-between mb-2">
                <h3 class="font-semibold text-surface-800 text-sm">Messages</h3>
                <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">${messages.length}</span>
              </div>
              <div class="relative">
                <input type="text" id="mbox-search" 
                  placeholder="Filter by subject, sender..." 
                  class="w-full text-xs p-2 pl-8 border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                  value="${esc(state.searchTerm)}"
                  oninput="window.omniMboxFilter(this.value)">
                <svg class="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto divide-y divide-surface-100 scrollbar-thin">
              ${messages.length === 0 ? `
                <div class="p-8 text-center">
                  <p class="text-xs text-surface-400 italic">No matching messages</p>
                </div>
              ` : messages.map((m, i) => `
                <div class="group p-3 cursor-pointer hover:bg-brand-50 transition-colors ${i === selectedIdx ? 'bg-brand-50/50 border-l-4 border-brand-500' : 'border-l-4 border-transparent'}"
                     onclick="window.omniMboxSelect(${i})">
                  <div class="flex justify-between items-start mb-1">
                    <span class="text-[10px] text-surface-400 font-medium">${formatRelativeDate(m.date)}</span>
                    ${m.attachments?.length > 0 ? `
                      <svg class="w-3 h-3 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                    ` : ''}
                  </div>
                  <p class="text-xs font-bold text-surface-800 truncate mb-0.5 group-hover:text-brand-700" title="${esc(m.subject)}">${esc(m.subject || '(No Subject)')}</p>
                  <p class="text-[11px] text-surface-500 truncate italic">${esc(cleanEmail(m.from))}</p>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Main View -->
          <div class="flex-1 flex flex-col bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm min-h-0">
            ${currentMsg ? renderMessageDetail(currentMsg) : `
              <div class="flex-1 flex flex-col items-center justify-center p-12 text-surface-300">
                <svg class="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <p class="text-lg font-medium">Select a message to read</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Global Handlers
    window.omniMboxSelect = function(idx) {
      const state = helpers.getState();
      helpers.setState({ selectedIndex: idx });
      renderMainUI(helpers);
    };

    window.omniMboxFilter = function(val) {
      const state = helpers.getState();
      const query = val.toLowerCase().trim();
      const filtered = state.messages.filter(m => 
        (m.subject || '').toLowerCase().includes(query) || 
        (m.from || '').toLowerCase().includes(query) ||
        (m.plainText || '').toLowerCase().includes(query)
      );
      helpers.setState({ 
        searchTerm: val, 
        filteredMessages: filtered,
        selectedIndex: 0
      });
      renderMainUI(helpers);
    };

    window.omniMboxToggleHeaders = function() {
      const el = document.getElementById('raw-headers');
      if (el) el.classList.toggle('hidden');
    };
  }

  /**
   * Render Single Message Details
   */
  function renderMessageDetail(m) {
    const hasAttachments = m.attachments && m.attachments.length > 0;
    
    return `
      <div class="flex flex-col h-full">
        <!-- Message Header Card -->
        <div class="p-5 border-b border-surface-100 bg-surface-50/30">
          <div class="flex justify-between items-start gap-4 mb-4">
            <h2 class="text-xl font-bold text-surface-900 leading-tight">${esc(m.subject || '(No Subject)')}</h2>
            <button onclick="window.omniMboxToggleHeaders()" class="text-[10px] font-bold text-surface-400 hover:text-brand-600 uppercase tracking-wider px-2 py-1 border border-surface-200 rounded transition-colors whitespace-nowrap">
              Headers
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                ${(m.from || '?').charAt(0).toUpperCase()}
              </div>
              <div class="min-w-0">
                <p class="text-[10px] text-surface-400 font-bold uppercase tracking-tight">From</p>
                <p class="text-sm font-semibold text-surface-800 truncate">${esc(m.from)}</p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-surface-500 text-xs shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div>
                <p class="text-[10px] text-surface-400 font-bold uppercase tracking-tight">Date</p>
                <p class="text-sm text-surface-700">${esc(m.date)}</p>
              </div>
            </div>
          </div>

          <!-- Raw Headers (Hidden by default) -->
          <div id="raw-headers" class="hidden mt-4 rounded-xl overflow-hidden border border-surface-200">
            <pre class="p-3 text-[10px] font-mono bg-gray-900 text-gray-300 overflow-x-auto max-h-40 scrollbar-thin">${esc(JSON.stringify(m.headers, null, 2))}</pre>
          </div>
        </div>

        <!-- Message Body -->
        <div class="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div class="max-w-none">
            ${m.htmlBody ? `
              <div class="prose prose-sm max-w-none mbox-content-html overflow-x-auto">
                ${sanitizeHtml(m.htmlBody)}
              </div>
            ` : `
              <div class="whitespace-pre-wrap font-sans text-surface-700 leading-relaxed text-sm">
                ${esc(m.body || m.plainText || '(No content)')}
              </div>
            `}
          </div>

          <!-- Attachments Section -->
          ${hasAttachments ? `
            <div class="mt-8 pt-6 border-t border-surface-100">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Attachments</h3>
                <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full font-bold">${m.attachments.length} items</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                ${m.attachments.map(att => `
                  <div class="p-3 rounded-xl border border-surface-200 flex items-center gap-3 hover:border-brand-300 transition-all bg-white shadow-sm group">
                    <div class="p-2 bg-surface-50 rounded-lg text-surface-400 group-hover:text-brand-500 transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-xs font-semibold text-surface-800 truncate">${esc(att.name)}</p>
                      <p class="text-[10px] text-surface-400 uppercase font-medium">${formatSize(att.size)} • ${esc(att.type?.split('/')[1] || 'FILE')}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * MBOX Parser
   * Splits the mailbox into individual messages and parses headers/body.
   */
  function parseMbox(text, limit) {
    // MBOXRD/MBOXO/MBOXCL formats all generally start messages with "From "
    // We split by newline + "From " to identify message boundaries safely
    const rawMessages = text.split(/\n(?=From )/);
    const messages = [];

    for (let i = 0; i < Math.min(rawMessages.length, limit); i++) {
      let content = rawMessages[i].trim();
      if (!content) continue;

      // Remove the envelope line (From sender@example.com Tue Jan 01 00:00:00 2024)
      const lines = content.split(/\r?\n/);
      if (lines[0].startsWith('From ')) {
        lines.shift();
      }

      const msg = parseEml(lines.join('\n'));
      msg.id = i;
      messages.push(msg);
    }
    return messages;
  }

  /**
   * EML/RFC822 Parser
   */
  function parseEml(text) {
    const lines = text.split(/\r?\n/);
    let headerLines = [];
    let bodyLines = [];
    let isHeader = true;

    for (let i = 0; i < lines.length; i++) {
      if (isHeader && lines[i].trim() === '') {
        isHeader = false;
        bodyLines = lines.slice(i + 1);
        break;
      }
      if (isHeader) headerLines.push(lines[i]);
    }

    const headers = {};
    let lastKey = null;
    headerLines.forEach(line => {
      if (/^[ \t]/.test(line) && lastKey) {
        headers[lastKey] += ' ' + line.trim();
      } else {
        const match = line.match(/^([^:]+):(.*)$/s);
        if (match) {
          lastKey = match[1].trim().toLowerCase();
          headers[lastKey] = match[2].trim();
        }
      }
    });

    const bodyText = bodyLines.join('\n');
    const eml = {
      subject: decodeMimeHeader(headers['subject'] || '(No Subject)'),
      from: decodeMimeHeader(headers['from'] || 'Unknown Sender'),
      to: decodeMimeHeader(headers['to'] || ''),
      date: decodeMimeHeader(headers['date'] || ''),
      headers: headers,
      body: '',
      htmlBody: '',
      attachments: []
    };

    const contentType = headers['content-type'] || 'text/plain';
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);

    if (boundaryMatch) {
      parseMultipart(bodyText, boundaryMatch[1], eml);
    } else {
      const encoding = headers['content-transfer-encoding'] || '';
      const decoded = decodeBody(bodyText, encoding);
      if (contentType.toLowerCase().includes('text/html')) {
        eml.htmlBody = decoded;
      } else {
        eml.body = decoded;
      }
    }

    eml.plainText = eml.body || (eml.htmlBody ? stripHtml(eml.htmlBody) : '');
    return eml;
  }

  function parseMultipart(body, boundary, eml) {
    const parts = body.split('--' + boundary);
    parts.forEach(part => {
      part = part.trim();
      if (!part || part === '--') return;

      const splitIdx = part.search(/\r?\n\r?\n/);
      const headerBlock = splitIdx > -1 ? part.substring(0, splitIdx) : part;
      const partBody = splitIdx > -1 ? part.substring(splitIdx).trim() : '';

      const pHeaders = {};
      headerBlock.split(/\r?\n/).forEach(line => {
        const m = line.match(/^([^:]+):(.*)$/s);
        if (m) pHeaders[m[1].trim().toLowerCase()] = m[2].trim();
      });

      const pContentType = pHeaders['content-type'] || 'text/plain';
      const pEncoding = pHeaders['content-transfer-encoding'] || '';
      const pDisposition = pHeaders['content-disposition'] || '';

      if (pDisposition.includes('attachment')) {
        const nameMatch = pDisposition.match(/filename="?([^";\s]+)"?/i) || pContentType.match(/name="?([^";\s]+)"?/i);
        eml.attachments.push({
          name: decodeMimeHeader(nameMatch ? nameMatch[1] : 'attachment'),
          size: partBody.length,
          type: pContentType.split(';')[0].trim()
        });
      } else if (pContentType.includes('text/html')) {
        eml.htmlBody = decodeBody(partBody, pEncoding);
      } else if (pContentType.includes('text/plain')) {
        eml.body = decodeBody(partBody, pEncoding);
      } else if (pContentType.includes('multipart/')) {
        const subBoundary = pContentType.match(/boundary="?([^";\s]+)"?/i);
        if (subBoundary) parseMultipart(partBody, subBoundary[1], eml);
      }
    });
  }

  /**
   * Helpers
   */
  function decodeMimeHeader(val) {
    if (!val) return '';
    return val.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          return new TextDecoder(charset).decode(Uint8Array.from(atob(text), c => c.charCodeAt(0)));
        } else {
          const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          return new TextDecoder(charset).decode(Uint8Array.from(decoded, c => c.charCodeAt(0)));
        }
      } catch (e) { return match; }
    });
  }

  function decodeBody(text, encoding) {
    encoding = (encoding || '').toLowerCase();
    if (encoding === 'base64') {
      try {
        return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
      } catch (e) { return text; }
    } else if (encoding === 'quoted-printable') {
      return text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    return text;
  }

  function sanitizeHtml(html) {
    if (!html) return '';
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/ on\w+="[^"]*"/g, '')
      .replace(/ on\w+='[^']*'/g, '')
      .replace(/javascript:/gi, 'no-js:')
      .replace(/href\s*=\s*"[^"]*"/gi, (match) => match.includes('javascript:') ? 'href="#"' : match);
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatRelativeDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const now = new Date();
      if (d.getFullYear() === now.getFullYear()) {
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return dateStr; }
  }

  function cleanEmail(from) {
    if (!from) return '';
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

})();
