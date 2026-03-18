(function () {
  'use strict';

  let allCards = [];
  let currentFile = null;

  // Simple vCard parser to avoid dependency issues
  const vCardParser = {
    parse: function(content) {
      const cards = [];
      const rawBlocks = content.split(/BEGIN:VCARD/i);
      
      for (let block of rawBlocks) {
        if (!block.toUpperCase().includes('END:VCARD')) continue;
        
        const cardData = new Map();
        const lines = block.split(/\r?\n/);
        let currentKey = null;

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          if (!line.trim()) continue;

          // Handle unfolding (lines starting with space/tab are continuation of previous line)
          if ((line.startsWith(' ') || line.startsWith('\t')) && currentKey) {
            const prevVal = cardData.get(currentKey);
            if (Array.isArray(prevVal)) {
              prevVal[prevVal.length - 1] += line.substring(1);
            } else {
              cardData.set(currentKey, prevVal + line.substring(1));
            }
            continue;
          }

          const colonIndex = line.indexOf(':');
          if (colonIndex === -1) continue;

          const keyPart = line.substring(0, colonIndex);
          const value = line.substring(colonIndex + 1);
          
          // Extract the main property name (ignore parameters for simple view)
          const propertyName = keyPart.split(';')[0].toLowerCase().trim();
          currentKey = propertyName;

          if (cardData.has(propertyName)) {
            const existing = cardData.get(propertyName);
            if (Array.isArray(existing)) {
              existing.push(value);
            } else {
              cardData.set(propertyName, [existing, value]);
            }
          } else {
            cardData.set(propertyName, value);
          }
        }

        // Add helper methods to match the expected API
        const card = {
          _data: cardData,
          _raw: 'BEGIN:VCARD' + block.split(/END:VCARD/i)[0] + 'END:VCARD',
          get: function(key) {
            return this._data.get(key.toLowerCase());
          },
          toJSON: function() {
            const obj = {};
            this._data.forEach((val, key) => { obj[key] = val; });
            return obj;
          },
          toString: function() {
            return this._raw;
          }
        };
        cards.push(card);
      }
      return cards;
    }
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vcf',
      binary: false,
      onFile: function (file, content, helpers) {
        currentFile = file;
        try {
          allCards = vCardParser.parse(content);
          if (allCards.length === 0) {
            helpers.showError('Empty or Invalid VCF', 'No valid contact entries found.');
            return;
          }
          renderVcf(allCards, helpers);
        } catch (err) {
          helpers.showError('Parsing Error', err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy as JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            if (allCards.length > 0) {
              const jCards = allCards.map(card => card.toJSON());
              helpers.copyToClipboard(JSON.stringify(jCards, null, 2), btn);
            }
          } 
        }
      ]
    });
  };

  function renderVcf(cards, helpers) {
    let html = `
      <div class="p-4 max-w-5xl mx-auto">
        <div class="flex items-center justify-between mb-6">
          <h3 class="font-bold text-xl">${esc(currentFile.name)} (${cards.length} contacts)</h3>
          <input type="text" id="vcf-search" placeholder="Search..." class="px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500">
        </div>
        <div id="contact-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${renderCards(cards.slice(0, 100))}
        </div>
      </div>
    `;
    helpers.render(html);

    const searchInput = document.getElementById('vcf-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = cards.filter(card => {
          const fn = (card.get('fn') || '').toString().toLowerCase();
          const tel = (card.get('tel') || '').toString().toLowerCase();
          const email = (card.get('email') || '').toString().toLowerCase();
          return fn.includes(query) || tel.includes(query) || email.includes(query);
        });
        document.getElementById('contact-list').innerHTML = renderCards(filtered.slice(0, 100));
      });
    }
  }

  function renderCards(cards) {
    return cards.map(card => {
      const fn = card.get('fn') || card.get('n') || 'Unnamed';
      const email = card.get('email') || '';
      const tel = card.get('tel') || '';
      const initial = (typeof fn === 'string' ? fn : String(fn)).trim().charAt(0).toUpperCase();

      return `
        <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold">${esc(initial)}</div>
            <div class="overflow-hidden">
              <div class="font-bold truncate">${esc(fn)}</div>
              <div class="text-sm text-surface-500 truncate">${esc(email)}</div>
              <div class="text-sm text-surface-500 truncate">${esc(tel)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
