(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.eml',
      dropLabel: 'Drop a .eml file here',
      binary: false,
      onInit: function(helpers) {
        // No external dependencies needed for this robust EML parser
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing email structure...');
        
        // Use a small timeout to allow UI to show loading state
        setTimeout(function() {
          try {
            if (!content || content.trim().length === 0) {
              helpers.showError('Empty File', 'The uploaded .eml file contains no data.');
              return;
            }

            const eml = parseEml(content);
            helpers.setState('eml', eml);
            renderEml(eml, file, helpers);
          } catch (e) {
            console.error(e);
            helpers.showError('Could not open eml file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
          }
        }, 50);
      },
      actions: [
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            const text = state.eml ? (state.eml.body || state.eml.plainText || '') : '';
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '🖨️ Print',
          id: 'print',
          onClick: function() {
            window.print();
          }
        }
      ],
      infoHtml: '<strong>Security:</strong> All EML parsing and rendering happens locally in your browser.'
    });
  };

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
    let currentKey = null;
    headerLines.forEach(line => {
      if (/^[ \t]/.test(line) && currentKey) {
        headers[currentKey] += ' ' + line.trim();
      } else {
        const match = line.match(/^([^:]+):(.*)$/s);
        if (match) {
          currentKey = match[1].trim().toLowerCase();
          headers[currentKey] = match[2].trim();
        }
      }
    });

    const bodyText = bodyLines.join('\n');
    const eml = {
      subject: decodeHeader(headers['subject'] || '(No Subject)'),
      from: decodeHeader(headers['from'] || 'Unknown Sender'),
      to: decodeHeader(headers['to'] || 'Unknown Recipient'),
      date: decodeHeader(headers['date'] || 'Unknown Date'),
      cc: decodeHeader(headers['cc'] || ''),
      body: '',
      htmlBody: '',
      attachments: [],
      headers: headers
    };

    const contentType = headers['content-type'] || 'text/plain';
    const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);

    if (boundaryMatch) {
      parseMultipart(bodyText, boundaryMatch[1], eml);
    } else {
      const encoding = headers['content-transfer-encoding'] || '';
      const decoded = decodeContent(bodyText, encoding);
      if (contentType.toLowerCase().includes('text/html')) {
        eml.htmlBody = decoded;
      } else {
        eml.body = decoded;
      }
    }

    // Fallback for plain text
    eml.plainText = eml.body || (eml.htmlBody ? stripHtml(eml.htmlBody) : '');
    
    return eml;
  }

  function parseMultipart(bodyText, boundary, eml) {
    const parts = bodyText.split('--' + boundary);
    parts.forEach(part => {
      part = part.trim();
      if (!part || part === '--') return;

      const splitIdx = part.search(/\r?\n\r?\n/);
      const headerLines = splitIdx > -1 ? part.substring(0, splitIdx).split(/\r?\n/) : [part];
      const partBody = splitIdx > -1 ? part.substring(splitIdx).trim() : '';

      const headers = {};
      let currentKey = null;
      headerLines.forEach(line => {
        if (/^[ \t]/.test(line) && currentKey) {
          headers[currentKey] += ' ' + line.trim();
        } else {
          const match = line.match(/^([^:]+):(.*)$/s);
          if (match) {
            currentKey = match[1].trim().toLowerCase();
            headers[currentKey] = match[2].trim();
          }
        }
      });

      const contentType = headers['content-type'] || 'text/plain';
      const disposition = headers['content-disposition'] || '';
      const encoding = headers['content-transfer-encoding'] || '';

      if (disposition.toLowerCase().includes('attachment')) {
        const nameMatch = disposition.match(/filename="?([^";\s]+)"?/i) || contentType.match(/name="?([^";\s]+)"?/i);
        eml.attachments.push({
          name: decodeHeader(nameMatch ? nameMatch[1] : 'attachment'),
          size: partBody.length,
          type: contentType.split(';')[0].trim()
        });
      } else if (contentType.toLowerCase().includes('multipart/')) {
        const subBoundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i);
        if (subBoundaryMatch) parseMultipart(partBody, subBoundaryMatch[1], eml);
      } else if (contentType.toLowerCase().includes('text/html')) {
        const decoded = decodeContent(partBody, encoding);
        if (decoded) eml.htmlBody = decoded;
      } else if (contentType.toLowerCase().includes('text/plain')) {
        const decoded = decodeContent(partBody, encoding);
        if (decoded) eml.body = decoded;
      }
    });
  }

  function decodeHeader(val) {
    if (!val) return '';
    return val.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (match, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          const bin = atob(text);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder(charset).decode(bytes);
        } else {
          const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
          const bytes = new Uint8Array(decoded.length);
          for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
          return new TextDecoder(charset).decode(bytes);
        }
      } catch (e) { return match; }
    });
  }

  function decodeContent(text, encoding) {
    encoding = (encoding || '').toLowerCase();
    if (encoding === 'base64') {
      try {
        const bin = atob(text.replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch (e) { 
        try { return atob(text.replace(/\s/g, '')); } catch (e2) { return text; }
      }
    } else if (encoding === 'quoted-printable') {
      const decoded = text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      try {
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch (e) { return decoded; }
    }
    return text;
  }

  function renderEml(eml, file, helpers) {
    const hasHtml = eml.htmlBody && eml.htmlBody.trim().length > 0;
    const hasPlain = eml.body && eml.body.trim().length > 0;
    const hasContent = hasHtml || hasPlain;

    const html = `
      <div class="max-w-5xl mx-auto p-4 md:p-6 print:p-0">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 print:hidden">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.eml file</span>
        </div>

        <!-- Email Headers Section -->
        <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden mb-6">
          <div class="p-6 border-b border-surface-100 bg-surface-50/30">
            <h1 class="text-2xl font-bold text-surface-900 leading-tight mb-4">${esc(eml.subject)}</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div class="space-y-2">
                <div>
                  <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider block">From</span>
                  <span class="text-surface-800 font-semibold">${esc(eml.from)}</span>
                </div>
                <div>
                  <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider block">To</span>
                  <span class="text-surface-800">${esc(eml.to)}</span>
                </div>
                ${eml.cc ? `
                <div>
                  <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider block">Cc</span>
                  <span class="text-surface-800">${esc(eml.cc)}</span>
                </div>` : ''}
              </div>
              <div class="md:text-right">
                <span class="text-surface-400 font-medium uppercase text-[10px] tracking-wider block">Date</span>
                <span class="text-surface-800">${esc(eml.date)}</span>
              </div>
            </div>
          </div>

          <!-- Format Specific Excellence: Live Search -->
          <div class="px-6 py-3 bg-white border-b border-surface-100 flex items-center gap-3 print:hidden">
            <svg class="w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" id="eml-search" placeholder="Search in email content..." 
              class="w-full text-sm bg-transparent border-none focus:ring-0 text-surface-700 placeholder-surface-400"
              oninput="window.filterEmlContent(this.value)">
          </div>

          <!-- Email Body -->
          <div class="p-6 eml-content-area">
            ${!hasContent ? `
              <div class="flex flex-col items-center justify-center py-12 text-surface-400">
                <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                <p>No message body found in this email.</p>
              </div>
            ` : (hasHtml ? `
              <div class="prose max-w-none eml-html-container overflow-x-auto">
                ${sanitizeHtml(eml.htmlBody)}
              </div>
            ` : `
              <div class="whitespace-pre-wrap font-sans text-surface-700 leading-relaxed eml-plain-container">
                ${esc(eml.body)}
              </div>
            `)}
          </div>
        </div>

        <!-- U10: Attachments Section -->
        ${eml.attachments.length > 0 ? `
          <div class="mt-8 print:hidden">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-surface-800">Attachments</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${eml.attachments.length} items</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              ${eml.attachments.map(att => `
                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-surface-50 flex items-center justify-center text-surface-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-surface-800 truncate" title="${esc(att.name)}">${esc(att.name)}</p>
                    <p class="text-[10px] text-surface-400 uppercase font-medium">${formatSize(att.size)} • ${esc(att.type)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Raw Headers (Collapsible) -->
        <div class="mt-8 border-t border-surface-200 pt-8 print:hidden">
          <details class="group">
            <summary class="flex items-center justify-between cursor-pointer list-none text-surface-500 hover:text-surface-800 transition-colors">
              <span class="text-sm font-medium">View Technical Headers</span>
              <svg class="w-4 h-4 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </summary>
            <div class="mt-4 rounded-xl overflow-hidden border border-surface-200">
              <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed max-h-64">
${Object.entries(eml.headers).map(([k, v]) => `<span class="text-brand-400">${esc(k)}</span>: ${esc(v)}`).join('\n')}
              </pre>
            </div>
          </details>
        </div>
      </div>
    `;

    helpers.render(html);

    // Global filtering function for live search
    window.filterEmlContent = function(query) {
      const q = query.toLowerCase().trim();
      const container = document.querySelector('.eml-content-area');
      if (!container) return;
      
      const elements = container.querySelectorAll('p, div, span, td, li, h1, h2, h3, h4, h5, h6');
      if (q === '') {
        elements.forEach(el => {
          el.style.backgroundColor = '';
          if (el.classList.contains('hidden-by-filter')) {
            el.classList.remove('hidden-by-filter');
            el.style.display = '';
          }
        });
        return;
      }

      elements.forEach(el => {
        if (el.children.length === 0 && el.textContent.trim().length > 0) {
          const text = el.textContent.toLowerCase();
          if (text.includes(q)) {
            el.style.backgroundColor = '#fef08a'; // brand-200 highlight
          } else {
            el.style.backgroundColor = '';
          }
        }
      });
    };
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatSize(b) {
    if (!b) return '0 B';
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function sanitizeHtml(html) {
    if (!html) return '';
    // Enhanced sanitization for EML
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/ on\w+="[^"]*"/g, '')
      .replace(/ on\w+='[^']*'/g, '')
      .replace(/javascript:/gi, 'no-js:');
  }

})();
