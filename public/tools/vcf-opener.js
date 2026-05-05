/**
 * OmniOpener — vCard (VCF) Toolkit
 * Uses OmniTool SDK, qrcode.js, and PapaParse.
 */
(function () {
  'use strict';

  /**
   * Simple but robust VCF Parser
   * Handles folded lines, multiple cards, and common fields.
   */
  const vCardParser = {
    parse: function (content) {
      const cards = [];
      // Split by BEGIN:VCARD, but keep it in mind that we might have empty first element
      const rawBlocks = content.split(/BEGIN:VCARD/i);

      for (let i = 0; i < rawBlocks.length; i++) {
        let block = rawBlocks[i].trim();
        if (!block || !block.toUpperCase().includes('END:VCARD')) continue;

        // Clean up the block to only contain the card data
        const endIdx = block.toUpperCase().indexOf('END:VCARD');
        const cardContent = block.substring(0, endIdx).trim();
        const raw = 'BEGIN:VCARD\r\n' + cardContent + '\r\nEND:VCARD';

        const data = {};
        // Unfold lines: VCF lines starting with space or tab are continuations
        const unfolded = cardContent.replace(/\r?\n[ \t]/g, '');
        const lines = unfolded.split(/\r?\n/);

        lines.forEach(line => {
          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) return;

          const keyPart = line.substring(0, colonIdx);
          const value = line.substring(colonIdx + 1).trim();

          // Split key and parameters (e.g., TEL;TYPE=CELL)
          const keyMatch = keyPart.split(';');
          const key = keyMatch[0].toUpperCase().trim();

          if (!data[key]) {
            data[key] = value;
          } else {
            // Handle multiple entries for the same key (like TEL or EMAIL)
            if (Array.isArray(data[key])) {
              data[key].push(value);
            } else {
              data[key] = [data[key], value];
            }
          }
        });

        cards.push({ data, raw });
      }
      return cards;
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vcf',
      binary: false,
      infoHtml: '<strong>VCF Toolkit:</strong> Securely view, search, and convert vCard files. All processing happens locally in your browser.',

      onInit: function (h) {
        h.loadScripts([
          'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
          'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'
        ]);
      },

      actions: [
        {
          label: '📋 Copy as JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const cards = h.getState().cards;
            if (cards) h.copyToClipboard(JSON.stringify(cards.map(c => c.data), null, 2), btn);
          }
        },
        {
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const cards = h.getState().cards;
            if (cards && typeof Papa !== 'undefined') {
              const flatData = cards.map(c => {
                const row = {};
                for (const k in c.data) {
                  row[k] = Array.isArray(c.data[k]) ? c.data[k].join('; ') : c.data[k];
                }
                return row;
              });
              const csv = Papa.unparse(flatData);
              h.download(h.getFile().name.replace(/\.vcf$/i, '') + '.csv', csv, 'text/csv');
            }
          }
        }
      ],

      onFile: function (file, content, h) {
        const cards = vCardParser.parse(content);
        h.setState('cards', cards);

        if (cards.length === 0) {
          h.showError('No Contacts Found', 'The file does not appear to contain valid vCard data.');
          return;
        }

        const renderList = (filtered) => {
          if (filtered.length === 0) {
            return `<div class="p-12 text-center text-surface-400">No contacts match your search.</div>`;
          }
          return `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              ${filtered.map((c, i) => {
                const name = c.data.FN || c.data.N || 'Unnamed Contact';
                const sub = c.data.TEL || c.data.EMAIL || c.data.ORG || '';
                const displaySub = Array.isArray(sub) ? sub[0] : sub;
                const initial = String(name).trim().charAt(0).toUpperCase() || '?';
                
                return `
                  <div class="contact-card bg-white p-4 rounded-xl border border-surface-200 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-center gap-4" data-index="${cards.indexOf(c)}">
                    <div class="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-lg group-hover:bg-brand-600 group-hover:text-white transition-colors flex-shrink-0">
                      ${escapeHtml(initial)}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="font-bold text-surface-900 truncate">${escapeHtml(name)}</div>
                      <div class="text-xs text-surface-500 truncate">${escapeHtml(displaySub)}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        };

        h.render(`
          <div class="flex flex-col h-[700px] max-h-[85vh] font-sans">
            <div class="p-6 border-b border-surface-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-50/50">
              <div>
                <h3 class="font-bold text-lg text-surface-900">${escapeHtml(file.name)}</h3>
                <p class="text-sm text-surface-500">${cards.length} contacts loaded</p>
              </div>
              <div class="relative">
                <input type="text" id="vcf-search" placeholder="Search contacts..." 
                  class="pl-10 pr-4 py-2 border border-surface-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-64 bg-white">
                <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
              </div>
            </div>
            
            <div id="vcf-container" class="flex-1 overflow-auto bg-surface-50/20">
              ${renderList(cards)}
            </div>

            <!-- Detail Overlay -->
            <div id="vcf-modal" class="fixed inset-0 bg-surface-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center hidden p-4">
              <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                <div class="p-6 bg-surface-50 border-b border-surface-100 flex justify-between items-start">
                  <div class="flex items-center gap-4">
                    <div id="modal-initial" class="w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-2xl"></div>
                    <div>
                      <h2 id="modal-name" class="text-xl font-bold text-surface-900"></h2>
                      <p id="modal-org" class="text-sm text-surface-500"></p>
                    </div>
                  </div>
                  <button id="close-modal" class="p-2 hover:bg-surface-200 rounded-full transition-colors text-surface-400">✕</button>
                </div>
                <div class="p-6 space-y-6 overflow-auto max-h-[60vh]">
                  <div class="flex flex-col md:flex-row gap-6">
                    <div id="modal-qrcode" class="flex-shrink-0 bg-white p-2 rounded-lg border border-surface-100 w-[144px] h-[144px] flex items-center justify-center"></div>
                    <div id="modal-fields" class="flex-1 space-y-4"></div>
                  </div>
                </div>
                <div class="p-4 bg-surface-50 border-t border-surface-100 flex gap-3">
                  <button id="btn-copy-vcf" class="flex-1 py-2.5 bg-white border border-surface-200 text-surface-700 rounded-xl font-bold text-sm hover:bg-surface-100 transition-colors">📋 Copy vCard</button>
                  <button id="btn-download-vcf" class="flex-1 py-2.5 bg-brand-600 text-white rounded-xl font-bold text-sm hover:bg-brand-700 transition-colors">📥 Download</button>
                </div>
              </div>
            </div>
          </div>
        `);

        const container = document.getElementById('vcf-container');
        const search = document.getElementById('vcf-search');
        const modal = document.getElementById('vcf-modal');
        const qrContainer = document.getElementById('modal-qrcode');
        let activeCard = null;

        const openCard = (idx) => {
          activeCard = cards[idx];
          const name = activeCard.data.FN || activeCard.data.N || 'Unnamed Contact';
          
          document.getElementById('modal-name').textContent = name;
          document.getElementById('modal-initial').textContent = name.charAt(0).toUpperCase();
          document.getElementById('modal-org').textContent = activeCard.data.ORG || (activeCard.data.TITLE || 'Contact Detail');
          
          const fields = document.getElementById('modal-fields');
          fields.innerHTML = '';
          
          const importantKeys = ['TEL', 'EMAIL', 'ADR', 'URL', 'BDAY', 'NOTE'];
          const allKeys = Object.keys(activeCard.data).filter(k => !['FN', 'N', 'PHOTO', 'PRODID', 'REV', 'VERSION'].includes(k));
          
          // Sort keys to put important ones first
          const displayKeys = [...new Set([...importantKeys.filter(k => activeCard.data[k]), ...allKeys])];

          displayKeys.forEach(k => {
            if (!activeCard.data[k]) return;
            const val = activeCard.data[k];
            const displayVal = Array.isArray(val) ? val.join('\n') : val;
            
            const div = document.createElement('div');
            div.className = 'border-b border-surface-50 pb-2';
            div.innerHTML = `
              <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-0.5">${escapeHtml(k)}</div>
              <div class="text-sm text-surface-800 whitespace-pre-wrap break-all">${escapeHtml(displayVal)}</div>
            `;
            fields.appendChild(div);
          });

          qrContainer.innerHTML = "";
          if (typeof QRCode !== 'undefined') {
            try {
              new QRCode(qrContainer, { text: activeCard.raw, width: 128, height: 128 });
            } catch (e) {
              qrContainer.innerHTML = '<span class="text-[10px] text-surface-300">QR Error</span>';
            }
          }
          
          modal.classList.remove('hidden');
        };

        container.addEventListener('click', (e) => {
          const card = e.target.closest('.contact-card');
          if (card) openCard(parseInt(card.dataset.index));
        });

        search.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase();
          const filtered = cards.filter(c => {
            const searchStr = JSON.stringify(c.data).toLowerCase();
            return searchStr.includes(term);
          });
          container.innerHTML = renderList(filtered);
        });

        document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
        modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };

        document.getElementById('btn-copy-vcf').onclick = (e) => {
          if (activeCard) h.copyToClipboard(activeCard.raw, e.target);
        };

        document.getElementById('btn-download-vcf').onclick = () => {
          if (activeCard) {
            const filename = (activeCard.data.FN || 'contact').replace(/[^a-z0-9]/gi, '_') + '.vcf';
            h.download(filename, activeCard.raw, 'text/vcard');
          }
        };
      }
    });
  };
})();
