/**
 * OmniOpener — vCard (VCF) Toolkit
 * Uses OmniTool SDK and qrcode.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  const vCardParser = {
    parse: function(content) {
      const cards = [];
      const rawBlocks = content.split(/BEGIN:VCARD/i);
      for (let block of rawBlocks) {
        if (!block.toUpperCase().includes('END:VCARD')) continue;
        const cardData = new Map();
        const lines = block.split(/\r?\n/);
        let currentKey = null;
        for (let line of lines) {
          if (!line.trim()) continue;
          if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
            const prev = cardData.get(currentKey);
            if (Array.isArray(prev)) prev[prev.length - 1] += line.substring(1);
            else cardData.set(currentKey, prev + line.substring(1));
            continue;
          }
          const idx = line.indexOf(':');
          if (idx === -1) continue;
          const key = line.substring(0, idx).split(';')[0].toLowerCase().trim();
          const val = line.substring(idx + 1).trim();
          currentKey = key;
          if (cardData.has(key)) {
            const ex = cardData.get(key);
            if (Array.isArray(ex)) ex.push(val);
            else cardData.set(key, [ex, val]);
          } else cardData.set(key, val);
        }
        cards.push({
          data: Object.fromEntries(cardData),
          raw: 'BEGIN:VCARD' + block.split(/END:VCARD/i)[0] + 'END:VCARD'
        });
      }
      return cards;
    }
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vcf',
      binary: false,
      infoHtml: '<strong>VCF Toolkit:</strong> Professional contact viewer with QR code generation and individual export.',
      
      onInit: function(h) {
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
      },

      onFile: function (file, content, h) {
        const cards = vCardParser.parse(content);
        if (cards.length === 0) {
           h.render(`<div class="p-12 text-center text-surface-400">No valid contacts found in this file.</div>`);
           return;
        }

        const renderCards = (filtered) => `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${filtered.map((c, i) => {
               const name = c.data.fn || c.data.n || 'Unnamed';
               const initial = String(name).trim().charAt(0).toUpperCase();
               return `
                 <div class="contact-card bg-white p-4 rounded-xl border border-surface-200 shadow-sm hover:shadow-md transition-all cursor-pointer group" data-index="${i}">
                    <div class="flex items-center gap-4">
                       <div class="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-lg group-hover:bg-brand-600 group-hover:text-white transition-colors">${escapeHtml(initial)}</div>
                       <div class="overflow-hidden">
                          <div class="font-bold text-surface-900 truncate">${escapeHtml(name)}</div>
                          <div class="text-xs text-surface-500 truncate">${escapeHtml(c.data.tel || c.data.email || 'No details')}</div>
                       </div>
                    </div>
                 </div>
               `;
            }).join('')}
          </div>
        `;

        h.render(`
          <div class="flex flex-col h-[85vh] space-y-6 max-w-6xl mx-auto">
            <div class="flex items-center justify-between">
               <h3 class="font-bold text-xl text-surface-900">${escapeHtml(file.name)} <span class="text-surface-400 font-medium ml-2">(${cards.length} contacts)</span></h3>
               <input type="text" id="vcf-search" placeholder="Search contacts..." class="px-4 py-2 border border-surface-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 w-64">
            </div>
            <div id="vcf-list" class="flex-1 overflow-auto">
               ${renderCards(cards)}
            </div>
            <!-- Modal -->
            <div id="contact-modal" class="fixed inset-0 bg-surface-900/60 backdrop-blur-sm z-[2000] flex items-center justify-center hidden p-4">
               <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                  <div id="modal-header" class="p-6 bg-surface-50 border-b border-surface-100 flex justify-between items-start">
                     <div>
                        <h2 id="modal-name" class="text-2xl font-bold text-surface-900"></h2>
                        <p id="modal-title" class="text-sm text-surface-500"></p>
                     </div>
                     <button id="close-modal" class="text-surface-400 hover:text-surface-600">✕</button>
                  </div>
                  <div id="modal-body" class="p-6 space-y-6 overflow-auto max-h-[60vh]">
                     <div id="qrcode" class="flex justify-center bg-white p-4 rounded-xl border border-surface-100"></div>
                     <div id="modal-fields" class="space-y-3"></div>
                  </div>
                  <div class="p-4 bg-surface-50 border-t border-surface-100 flex gap-2">
                     <button id="btn-dl-card" class="flex-1 py-2 bg-brand-600 text-white rounded-lg font-bold text-xs hover:bg-brand-700 transition-colors">📥 Download vCard</button>
                  </div>
               </div>
            </div>
          </div>
        `);

        const list = document.getElementById('vcf-list');
        const modal = document.getElementById('contact-modal');
        const qrContainer = document.getElementById('qrcode');
        let currentCard = null;

        const openCard = (idx) => {
           currentCard = cards[idx];
           document.getElementById('modal-name').textContent = currentCard.data.fn || 'Unnamed';
           document.getElementById('modal-title').textContent = currentCard.data.title || 'Contact';
           
           const fields = document.getElementById('modal-fields');
           fields.innerHTML = Object.entries(currentCard.data).map(([k, v]) => `
              <div class="flex flex-col">
                 <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">${escapeHtml(k)}</span>
                 <span class="text-sm text-surface-700 break-all">${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</span>
              </div>
           `).join('');

           qrContainer.innerHTML = "";
           if (typeof QRCode !== 'undefined') {
              new QRCode(qrContainer, { text: currentCard.raw, width: 128, height: 128 });
           }
           modal.classList.remove('hidden');
        };

        list.onclick = (e) => {
           const card = e.target.closest('.contact-card');
           if (card) openCard(card.getAttribute('data-index'));
        };

        document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
        document.getElementById('vcf-search').oninput = (e) => {
           const term = e.target.value.toLowerCase();
           const filtered = cards.filter(c => JSON.stringify(c.data).toLowerCase().includes(term));
           list.innerHTML = renderCards(filtered);
        };
        document.getElementById('btn-dl-card').onclick = () => {
           if (currentCard) h.download(`${currentCard.data.fn || 'contact'}.vcf`, currentCard.raw);
        };
      }
    });
  };
})();
