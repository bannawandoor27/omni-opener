/**
 * OmniOpener — vCard (VCF) Professional Toolkit
 * A high-performance, secure browser-based VCF viewer and converter.
 */
(function () {
  'use strict';

  // Helper for HTML escaping
  const e = (str) => {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  /**
   * Robust vCard Parser
   */
  const vCardParser = {
    parse: function (content) {
      const cards = [];
      // Normalize line endings and unfold lines
      const unfolded = content.replace(/\r?\n[ \t]/g, '');
      const sections = unfolded.split(/BEGIN:VCARD/i);

      sections.forEach(section => {
        if (!section.toUpperCase().includes('END:VCARD')) return;

        const lines = section.split(/\r?\n/);
        const data = {};
        const rawLines = ['BEGIN:VCARD'];

        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          rawLines.push(trimmed);
          
          const colonIdx = trimmed.indexOf(':');
          if (colonIdx === -1) return;

          const keyPart = trimmed.substring(0, colonIdx);
          let value = trimmed.substring(colonIdx + 1).trim();

          const params = keyPart.split(';');
          const key = params[0].toUpperCase();

          if (keyPart.toUpperCase().includes('ENCODING=QUOTED-PRINTABLE')) {
            try {
              value = value.replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
              // Handle soft line breaks if any remained after unfolding
              value = value.replace(/=\r?\n/g, '');
            } catch (err) { /* ignore decode errors */ }
          }

          if (!data[key]) data[key] = [];
          data[key].push({ value: value, params: params.slice(1) });
        });

        if (Object.keys(data).length > 0) {
          cards.push({
            data,
            raw: rawLines.join('\r\n') + (rawLines[rawLines.length - 1].toUpperCase().includes('END:VCARD') ? '' : '\r\nEND:VCARD')
          });
        }
      });

      return cards;
    }
  };

  window.initTool = function (toolConfig, mountEl) {
    let _activeModal = null;
    let _qrInstance = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.vcf',
      binary: false,
      onInit: function (h) {
        return h.loadScripts([
          'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
          'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'
        ]);
      },

      onDestroy: function() {
        if (_activeModal) {
          _activeModal.remove();
          _activeModal = null;
        }
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.cards) return;
            const json = JSON.stringify(state.cards.map(c => {
              const obj = {};
              for (const k in c.data) obj[k] = c.data[k].map(v => v.value);
              return obj;
            }), null, 2);
            h.copyToClipboard(json, btn);
          }
        },
        {
          label: '📥 Export CSV',
          id: 'export-csv',
          onClick: function (h) {
            const state = h.getState();
            if (!state.cards) return;
            if (typeof Papa === 'undefined') {
              h.showError('Library not loaded', 'CSV export library (PapaParse) is still loading. Please try again in a moment.');
              return;
            }
            const flat = state.cards.map(c => {
              const row = {};
              for (const k in c.data) row[k] = c.data[k].map(v => v.value).join('; ');
              return row;
            });
            const csv = Papa.unparse(flat);
            h.download(h.getFile().name.replace(/\.vcf$/i, '') + '.csv', csv, 'text/csv');
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        h.showLoading('Parsing vCards and extracting contacts...');

        setTimeout(function() {
          try {
            const cards = vCardParser.parse(content);
            if (cards.length === 0) {
              h.showError('No Contacts Found', 'The file appears to be empty or does not contain any valid vCard entries. VCF files must start with BEGIN:VCARD.');
              return;
            }

            h.setState('cards', cards);
            h.setState('filtered', cards);
            
            _renderMain(file, cards, h);
          } catch (err) {
            h.showError('Parsing Failed', 'Could not open vcf file. The file may be corrupted or in an unsupported format variant. ' + err.message);
          }
        }, 100);
      }
    });

    function _renderMain(file, cards, h) {
      h.render(`
        <div class="flex flex-col h-full bg-white font-sans text-surface-900">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 mx-4 mt-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${e(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">vCard Contact File</span>
            <div class="ml-auto flex items-center gap-2">
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium" id="contact-count">${cards.length} contacts</span>
            </div>
          </div>

          <!-- Live Search Box -->
          <div class="px-4 pb-4">
            <div class="relative group">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
              <input type="text" id="vcf-search" placeholder="Search by name, email, phone or company..." 
                class="w-full pl-12 pr-4 py-3 bg-surface-50 border border-surface-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
            </div>
          </div>

          <!-- Section Header with Count -->
          <div class="px-4 mb-3 flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Contact Entries</h3>
          </div>

          <!-- Content Area -->
          <div id="vcf-grid" class="flex-1 overflow-y-auto px-4 pb-8 min-h-0 custom-scrollbar">
            ${_renderGrid(cards)}
          </div>

          <!-- Contact Details Modal -->
          <div id="vcf-modal" class="fixed inset-0 bg-surface-950/40 backdrop-blur-sm z-[50] flex items-center justify-center hidden p-4 animate-in fade-in duration-200">
            <div class="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
              <div class="relative h-32 bg-gradient-to-br from-brand-500 to-brand-700">
                 <button id="close-modal" class="absolute top-4 right-4 p-2 bg-black/10 hover:bg-black/20 text-white rounded-full transition-colors backdrop-blur-md">
                   <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                 </button>
                 <div class="absolute -bottom-10 left-8">
                    <div id="modal-avatar" class="w-24 h-24 rounded-2xl bg-white shadow-xl flex items-center justify-center text-3xl font-bold text-brand-600 border-4 border-white"></div>
                 </div>
              </div>
              
              <div class="pt-14 px-8 pb-6">
                <h2 id="modal-name" class="text-2xl font-bold text-surface-900 leading-tight"></h2>
                <p id="modal-org" class="text-surface-500 font-medium"></p>
                
                <div class="mt-8 space-y-6 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar" id="modal-fields"></div>
                
                <div class="mt-8 pt-6 border-t border-surface-100 flex items-center justify-between gap-6">
                  <div id="modal-qrcode" class="w-24 h-24 bg-surface-50 rounded-xl p-1 border border-surface-100 flex items-center justify-center overflow-hidden flex-shrink-0"></div>
                  <div class="flex-1 flex flex-col gap-2">
                    <button id="btn-copy-vcf" class="w-full py-2.5 px-4 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
                      Copy vCard
                    </button>
                    <button id="btn-download-single" class="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-brand-500/20 transition-all flex items-center justify-center gap-2">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                      Download .vcf
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      const grid = document.getElementById('vcf-grid');
      const searchInput = document.getElementById('vcf-search');
      const modal = document.getElementById('vcf-modal');
      const countEl = document.getElementById('contact-count');
      let activeCard = null;

      // Filter logic
      searchInput.addEventListener('input', (event) => {
        const query = event.target.value.toLowerCase().trim();
        const allCards = h.getState().cards;
        const filtered = allCards.filter(c => {
          if (!query) return true;
          const searchable = [
            c.data.FN?.[0]?.value,
            c.data.N?.[0]?.value,
            c.data.ORG?.[0]?.value,
            c.data.TITLE?.[0]?.value,
            ...(c.data.TEL || []).map(t => t.value),
            ...(c.data.EMAIL || []).map(e => e.value),
            ...(c.data.ADR || []).map(a => a.value)
          ].join(' ').toLowerCase();
          return searchable.includes(query);
        });
        
        h.setState('filtered', filtered);
        grid.innerHTML = _renderGrid(filtered);
        countEl.textContent = `${filtered.length} matches`;
      });

      // Delegate click for grid items
      grid.addEventListener('click', (e) => {
        const cardEl = e.target.closest('.contact-card');
        if (!cardEl) return;
        const index = parseInt(cardEl.dataset.index);
        const filtered = h.getState().filtered;
        activeCard = filtered[index];
        if (activeCard) _openModal(activeCard, modal, h);
      });

      // Modal controls
      document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
      modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
      
      document.getElementById('btn-copy-vcf').onclick = (e) => {
        if (activeCard) h.copyToClipboard(activeCard.raw, e.currentTarget);
      };
      
      document.getElementById('btn-download-single').onclick = () => {
        if (activeCard) {
          const name = (activeCard.data.FN?.[0]?.value || 'contact').replace(/[^a-z0-9]/gi, '_');
          h.download(`${name}.vcf`, activeCard.raw, 'text/vcard');
        }
      };
    }

    function _renderGrid(cards) {
      if (cards.length === 0) {
        return `<div class="flex flex-col items-center justify-center py-20 text-surface-400">
          <svg class="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          <p class="text-lg font-medium">No matches found</p>
          <p class="text-sm">Try a different search term or clear the filter.</p>
        </div>`;
      }

      // Cap rendering for extreme performance with massive VCFs
      const maxDisplay = 500;
      const displayCards = cards.slice(0, maxDisplay);
      const remaining = cards.length - maxDisplay;

      let html = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
      html += displayCards.map((c, i) => {
        const fn = c.data.FN?.[0]?.value || c.data.N?.[0]?.value || 'Unknown Contact';
        const org = c.data.ORG?.[0]?.value || c.data.TITLE?.[0]?.value || '';
        const email = c.data.EMAIL?.[0]?.value || '';
        const tel = c.data.TEL?.[0]?.value || '';
        const initial = fn.trim().charAt(0).toUpperCase() || '?';
        
        return `
          <div class="contact-card group p-4 bg-white border border-surface-200 rounded-2xl hover:border-brand-400 hover:shadow-xl hover:shadow-brand-500/5 transition-all cursor-pointer flex items-center gap-4" data-index="${i}">
            <div class="w-12 h-12 rounded-xl bg-surface-50 text-surface-400 group-hover:bg-brand-50 group-hover:text-brand-600 flex items-center justify-center font-bold text-xl transition-colors flex-shrink-0">
              ${e(initial)}
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="font-bold text-surface-900 truncate group-hover:text-brand-700 transition-colors">${e(fn)}</h4>
              <p class="text-xs text-surface-500 truncate">${e(org || email || tel || 'Click to view details')}</p>
            </div>
            <div class="text-surface-300 group-hover:text-brand-400 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </div>
          </div>`;
      }).join('');
      html += `</div>`;

      if (remaining > 0) {
        html += `
          <div class="mt-8 p-4 bg-surface-50 rounded-xl text-center text-surface-500 text-sm border border-dashed border-surface-200">
            Showing first ${maxDisplay} contacts. Use search to find others among the total ${cards.length} entries.
          </div>
        `;
      }

      return html;
    }

    function _openModal(card, modal, h) {
      const fn = card.data.FN?.[0]?.value || card.data.N?.[0]?.value || 'Unknown Contact';
      const org = card.data.ORG?.[0]?.value || card.data.TITLE?.[0]?.value || '';
      
      document.getElementById('modal-name').textContent = fn;
      document.getElementById('modal-avatar').textContent = fn.trim().charAt(0).toUpperCase();
      document.getElementById('modal-org').textContent = org;
      
      const fieldsContainer = document.getElementById('modal-fields');
      fieldsContainer.innerHTML = '';
      
      const fieldConfig = [
        { key: 'TEL', label: 'Phone', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>' },
        { key: 'EMAIL', label: 'Email', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>' },
        { key: 'ADR', label: 'Address', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>' },
        { key: 'URL', label: 'Website', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>' },
        { key: 'NOTE', label: 'Notes', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>' },
        { key: 'BDAY', label: 'Birthday', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18z"/>' }
      ];

      let hasFields = false;
      fieldConfig.forEach(conf => {
        const values = card.data[conf.key];
        if (!values) return;
        hasFields = true;
        values.forEach(v => {
          const item = document.createElement('div');
          item.className = 'flex items-start gap-4 animate-in slide-in-from-left-2 duration-300';
          item.innerHTML = `
            <div class="mt-1 p-2 bg-surface-50 text-surface-400 rounded-lg flex-shrink-0">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">${conf.icon}</svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">${e(conf.label)}</p>
              <p class="text-sm text-surface-800 break-words whitespace-pre-wrap">${e(v.value)}</p>
            </div>
          `;
          fieldsContainer.appendChild(item);
        });
      });

      if (!hasFields) {
        fieldsContainer.innerHTML = `<p class="text-center py-4 text-surface-400 text-sm italic">No additional contact fields found.</p>`;
      }

      // QR Code handling with check
      const qrContainer = document.getElementById('modal-qrcode');
      qrContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        try {
          // Clean up old instance if it exists (though we clear the container)
          new QRCode(qrContainer, { 
            text: card.raw, 
            width: 88, 
            height: 88, 
            colorDark: "#0f172a", 
            colorLight: "#f8fafc", 
            correctLevel: QRCode.CorrectLevel.L 
          });
        } catch (err) {
          qrContainer.innerHTML = '<span class="text-[8px] text-surface-400 font-bold uppercase">QR Error</span>';
        }
      } else {
        qrContainer.innerHTML = '<span class="text-[8px] text-surface-400 font-bold uppercase">Loading QR...</span>';
      }

      modal.classList.remove('hidden');
    }
  };
})();
