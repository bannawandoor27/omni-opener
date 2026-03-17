/**
 * OmniOpener — VCF (vCard) Viewer/Converter Tool
 * Uses OmniTool SDK. Parses and renders .vcf files with jCard support.
 */
(function () {
  'use strict';

  let allCards = [];
  let currentFile = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vcf',
      dropLabel: 'Drop a .vcf file here',
      binary: false,
      infoHtml: '<strong>VCF Viewer:</strong> View and manage contact files (.vcf) safely. All processing happens locally in your browser.',
      
      actions: [
        {
          label: '📋 Copy as JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            if (allCards.length > 0) {
              try {
                const jCards = allCards.map(card => card.toJSON());
                helpers.copyToClipboard(JSON.stringify(jCards, null, 2), btn);
              } catch (err) {
                helpers.showError('Copy failed', 'Could not convert vCards to JSON format.');
              }
            }
          } 
        },
        {
          label: '📥 Download JSON', 
          id: 'dl-json', 
          onClick: function (helpers) {
            if (allCards.length > 0) {
              try {
                const jCards = allCards.map(card => card.toJSON());
                const name = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : 'contacts';
                helpers.download(`${name}.json`, JSON.stringify(jCards, null, 2), 'application/json');
              } catch (err) {
                helpers.showError('Download failed', 'Could not generate JSON file.');
              }
            }
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/vcf@2.1.0/dist/vcf.min.js');
      },

      onFile: function (file, content, helpers) {
        currentFile = file;
        
        // B1. Race condition check
        if (typeof vCard === 'undefined') {
          helpers.showLoading('Loading vCard parser...');
          let attempts = 0;
          const checkLoad = setInterval(() => {
            attempts++;
            if (typeof vCard !== 'undefined') {
              clearInterval(checkLoad);
              processFile(content, helpers);
            } else if (attempts > 50) {
              clearInterval(checkLoad);
              helpers.showError('Dependency timeout', 'The vCard parser library failed to load. Please check your connection.');
            }
          }, 100);
          return;
        }

        processFile(content, helpers);
      }
    });
  };

  /**
   * Main processing logic
   */
  function processFile(content, helpers) {
    // U2. Descriptive loading
    helpers.showLoading('Parsing vCard entries...');
    
    // B3. Ensure parsing is handled safely
    try {
      // vCard.parse returns an array of vCard objects
      allCards = vCard.parse(content);
      
      // U5. Empty state
      if (!allCards || allCards.length === 0) {
        helpers.showError('Empty vCard file', 'No valid contact entries were found. The file may be empty or in an unsupported format.');
        return;
      }

      renderVcf(allCards, helpers);

    } catch (err) {
      console.error(err);
      // U3. Friendly error messages
      helpers.showError('Could not open vcf file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
    }
  }

  /**
   * Renders the VCF content with search and cards
   */
  function renderVcf(cards, helpers) {
    const file = currentFile;
    const size = formatBytes(file.size);
    
    // U1. File info bar
    // U10. Section header with count
    // PART 4: Search/filter box
    let html = `
      <div class="p-4 md:p-6 max-w-5xl mx-auto">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${size}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.vcf file</span>
        </div>

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div class="flex items-center gap-3">
            <h3 class="font-bold text-xl text-surface-800">Contacts</h3>
            <span id="contact-count" class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${cards.length} items</span>
          </div>
          <div class="relative flex-1 max-w-md">
            <input type="text" id="vcf-search" placeholder="Search by name, email, or phone..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            </div>
          </div>
        </div>

        <div id="contact-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${renderCards(cards.slice(0, 500))}
          ${cards.length > 500 ? `<div class="col-span-full py-4 text-center text-surface-400 text-sm italic">Showing first 500 contacts. Use search to find others.</div>` : ''}
        </div>
      </div>
    `;

    helpers.render(html);

    // Search logic
    const searchInput = document.getElementById('vcf-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = query === '' ? cards : cards.filter(card => {
          const fn = (card.get('fn')?.toString() || '').toLowerCase();
          const n = (card.get('n')?.toString() || '').toLowerCase();
          const email = (card.get('email')?.toString() || '').toLowerCase();
          const tel = (card.get('tel')?.toString() || '').toLowerCase();
          const org = (card.get('org')?.toString() || '').toLowerCase();
          return fn.includes(query) || n.includes(query) || email.includes(query) || tel.includes(query) || org.includes(query);
        });
        
        const countEl = document.getElementById('contact-count');
        const listEl = document.getElementById('contact-list');
        
        countEl.textContent = `${filtered.length} items`;
        listEl.innerHTML = renderCards(filtered.slice(0, 500)) + 
          (filtered.length > 500 ? `<div class="col-span-full py-4 text-center text-surface-400 text-sm italic">Showing first 500 results. Filter more specifically to find others.</div>` : '');
      });
    }
  }

  /**
   * Helper to render multiple contact cards
   */
  function renderCards(cards) {
    if (cards.length === 0) {
      return `
        <div class="col-span-full py-20 text-center text-surface-500 bg-surface-50 rounded-2xl border border-dashed border-surface-200">
          <div class="mb-3 text-surface-300">
            <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          </div>
          <p class="font-medium">No contacts found</p>
          <p class="text-xs text-surface-400 mt-1">Try a different search term or check the file.</p>
        </div>
      `;
    }

    return cards.map((card) => {
      const getVal = (key) => {
        const val = card.get(key);
        if (!val) return '';
        // B2. Ensure we don't call valueOf on something that doesn't have it or handle arrays
        if (Array.isArray(val)) return val.map(v => v.valueOf ? v.valueOf() : v.toString()).join(', ');
        return val.valueOf ? val.valueOf() : val.toString();
      };

      const fn = getVal('fn') || getVal('n') || 'Unnamed Contact';
      const email = getVal('email');
      const tel = getVal('tel');
      const org = getVal('org');
      const title = getVal('title');
      const adr = getVal('adr');
      const note = getVal('note');
      const bday = getVal('bday');
      
      const initial = fn.trim().charAt(0).toUpperCase() || '?';

      // U9. Content cards
      return `
        <div class="group rounded-xl border border-surface-200 p-5 hover:border-brand-300 hover:shadow-md transition-all bg-white flex flex-col h-full">
          <div class="flex items-start gap-4 mb-5">
            <div class="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:bg-brand-500 group-hover:text-white transition-all shadow-sm">
              ${esc(initial)}
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="font-bold text-surface-900 truncate text-lg leading-tight group-hover:text-brand-600 transition-colors">${esc(fn)}</h4>
              ${title ? `<p class="text-sm text-surface-500 truncate mt-0.5 font-medium">${esc(title)}</p>` : ''}
              ${org ? `<p class="text-[11px] text-surface-400 truncate mt-0.5 uppercase tracking-wider">${esc(org)}</p>` : ''}
            </div>
          </div>

          <div class="space-y-3 flex-1">
            ${renderRow('📧', email, true)}
            ${renderRow('📞', tel)}
            ${renderRow('🎂', bday)}
            ${renderRow('📍', adr)}
            ${renderRow('📝', note)}
          </div>

          <details class="mt-4 pt-4 border-t border-surface-100 group/details">
            <summary class="text-[10px] font-bold uppercase tracking-widest text-surface-400 cursor-pointer list-none flex items-center justify-between hover:text-brand-500 transition-colors">
              <span>View Raw vCard Data</span>
              <svg class="w-3 h-3 transition-transform group-open/details:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            </summary>
            <!-- U8. Code/pre blocks -->
            <div class="mt-3 rounded-lg overflow-hidden border border-surface-200">
              <pre class="p-3 text-[10px] font-mono bg-gray-950 text-gray-300 overflow-x-auto leading-relaxed scrollbar-thin scrollbar-thumb-surface-700">${esc(card.toString())}</pre>
            </div>
          </details>
        </div>
      `;
    }).join('');
  }

  /**
   * Helper to render a field row in the card
   */
  function renderRow(icon, val, isEmail = false) {
    if (!val) return '';
    return `
      <div class="flex gap-3 text-sm items-start">
        <span class="flex-shrink-0 w-5 text-center opacity-70">${icon}</span>
        <span class="text-surface-600 break-words font-medium leading-snug">
          ${isEmail ? `<a href="mailto:${esc(val)}" class="text-brand-600 hover:underline">${esc(val)}</a>` : esc(val)}
        </span>
      </div>
    `;
  }

  /**
   * Human readable file size
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Robust HTML escaping
   */
  function esc(str) {
    if (!str) return '';
    if (typeof str !== 'string') str = String(str);
    // B6. Basic sanitization
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

})();
