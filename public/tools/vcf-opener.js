/**
 * OmniOpener — VCF (vCard) Viewer/Converter Tool
 * Uses OmniTool SDK. Parses and renders .vcf files with jCard support.
 */
(function () {
  'use strict';

  let vcards = [];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vcf',
      dropLabel: 'Drop a .vcf file here',
      binary: false,
      infoHtml: '<strong>VCF Viewer:</strong> View and convert vCard contact files safely in your browser. All processing happens locally.',
      
      actions: [
        {
          label: '📋 Copy JSON (jCard)', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            if (vcards.length > 0) {
              const jCards = vcards.map(card => card.toJSON());
              helpers.copyToClipboard(JSON.stringify(jCards, null, 2), btn);
            }
          } 
        },
        {
          label: '📥 Download JSON', 
          id: 'dl-json', 
          onClick: function (helpers) {
            if (vcards.length > 0) {
              const jCards = vcards.map(card => card.toJSON());
              const originalFilename = helpers.getFile().name;
              const newFilename = originalFilename.replace(/\.vcf$/i, '.json');
              helpers.download(newFilename, JSON.stringify(jCards, null, 2), 'application/json');
            }
          }
        }
      ],

      onInit: function(helpers) {
        // Load vcf.js from CDN
        helpers.loadScript('https://cdn.jsdelivr.net/npm/vcf@2.1.0/dist/vcf.min.js');
      },

      onFile: function (file, content, helpers) {
        if (typeof vCard === 'undefined') {
          helpers.showError('Dependency not loaded', 'The vCard parser library is still loading. Please try again in a moment.');
          return;
        }

        helpers.showLoading('Parsing vCard(s)...');
        
        try {
          // vCard.parse returns an array of vCard objects
          vcards = vCard.parse(content);
          
          if (!vcards || vcards.length === 0) {
            throw new Error('No valid vCards found in the file.');
          }

          renderVcards(vcards, helpers);

        } catch (err) {
          helpers.showError('Failed to parse VCF', 'Ensure the file is a valid vCard format. ' + err.message);
          vcards = [];
        }
      }
    });
  };

  /**
   * Renders the parsed vCards as a list of contact cards
   */
  function renderVcards(cards, helpers) {
    let html = `
      <div class="p-4 md:p-8 space-y-6 bg-surface-50 min-h-full">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-surface-800">${cards.length} Contact${cards.length === 1 ? '' : 's'} Found</h2>
        </div>
        <div class="grid grid-cols-1 gap-6">
    `;

    cards.forEach((card, index) => {
      // Helper to safely get property values
      const getVal = (prop) => {
        const p = card.get(prop);
        if (!p) return null;
        if (Array.isArray(p)) return p.map(x => x.valueOf()).join(', ');
        return p.valueOf();
      };

      const fn = getVal('fn') || getVal('n') || 'Unnamed Contact';
      const email = getVal('email');
      const tel = getVal('tel');
      const org = getVal('org');
      const title = getVal('title');
      const adr = getVal('adr');
      const note = getVal('note');

      html += `
        <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
          <div class="bg-brand-50 px-6 py-4 border-b border-brand-100 flex justify-between items-center">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold text-lg">
                ${escapeHtml(fn.charAt(0).toUpperCase())}
              </div>
              <h3 class="font-bold text-brand-900 text-lg">${escapeHtml(fn)}</h3>
            </div>
            <span class="text-xs font-mono text-brand-400 bg-white px-2 py-1 rounded-md border border-brand-100">#${index + 1}</span>
          </div>
          
          <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
            ${renderField('📧 Email', email)}
            ${renderField('📞 Phone', tel)}
            ${renderField('🏢 Company', org)}
            ${renderField('👔 Job Title', title)}
            ${renderField('📍 Address', adr)}
            ${renderField('📝 Notes', note)}
          </div>

          <details class="border-t border-surface-100 group">
            <summary class="px-6 py-3 text-xs text-surface-400 cursor-pointer hover:bg-surface-50 transition-colors flex items-center justify-between list-none">
              <span>View Raw vCard Data</span>
              <svg class="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </summary>
            <div class="p-6 bg-surface-950 text-surface-100 font-mono text-[10px] overflow-auto max-h-64 selection:bg-brand-500/30">
              <pre class="whitespace-pre-wrap">${escapeHtml(card.toString())}</pre>
            </div>
          </details>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
    helpers.render(html);
  }

  /**
   * Helper to render a field with label and value
   */
  function renderField(label, value) {
    if (!value) return '';
    return `
      <div class="space-y-1">
        <label class="block text-[10px] uppercase tracking-widest text-surface-400 font-bold">${label}</label>
        <div class="text-surface-700 font-medium break-words">${escapeHtml(value)}</div>
      </div>
    `;
  }

  /**
   * Helper function to escape HTML characters
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
