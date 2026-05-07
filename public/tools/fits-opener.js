(function () {
  'use strict';

  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.fits,.fit,.fts,.fits.gz',
      dropLabel: 'Drop a FITS file here',
      dropSub: 'Astronomical data (.fits, .fit, .fts, .gz)',
      
      actions: [
        {
          label: '📋 Copy Header',
          id: 'copy-header',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.headerText) h.copyToClipboard(state.headerText, btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const state = h.getState();
            if (state.headerJson) {
              const fileName = h.getFile().name.replace(/\.[^/.]+$/, "") + ".json";
              h.download(fileName, JSON.stringify(state.headerJson, null, 2));
            }
          }
        },
        {
          label: '📥 Download File',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing FITS file...');

        let data = content;
        if (file.name.endsWith('.gz')) {
          try {
            if (typeof pako === 'undefined') {
                await h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
            }
            data = pako.ungzip(new Uint8Array(content)).buffer;
          } catch (e) {
            h.showError('Decompression failed', 'This does not appear to be a valid GZIP file.');
            return;
          }
        }

        const bytes = new Uint8Array(data);
        const decoder = new TextDecoder('ascii');
        const CARD_SIZE = 80;

        const keywords = {};
        const allCards = [];
        let headerText = '';
        let headerEndFound = false;

        for (let i = 0; i < bytes.length; i += CARD_SIZE) {
          if (i + CARD_SIZE > bytes.length) break;
          const card = decoder.decode(bytes.slice(i, i + CARD_SIZE));
          headerText += card + '\n';
          
          const key = card.substring(0, 8).trim();
          if (key === 'END') {
            headerEndFound = true;
            break;
          }
          
          if (key && card.substring(8, 10) === '= ') {
            let val = '';
            let rawVal = card.substring(10).split('/')[0].trim();
            if (rawVal.startsWith("'")) {
                const lastQuote = rawVal.lastIndexOf("'");
                val = lastQuote > 0 ? rawVal.substring(1, lastQuote).trim() : rawVal.substring(1);
            } else {
                val = rawVal;
            }
            keywords[key] = val;
            allCards.push({ key, value: val });
          } else if (key) {
            allCards.push({ key, value: card.substring(8).trim() });
          }
        }

        h.setState({ 
          headerText: headerText,
          headerJson: keywords
        });

        const bitpix = keywords['BITPIX'];
        const naxis = parseInt(keywords['NAXIS'] || 0);
        const dims = [];
        for(let i=1; i<=naxis; i++) dims.push(keywords['NAXIS'+i] || '?');

        let summaryHtml = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-left">
            <div class="bg-surface-50 p-4 rounded-xl border border-surface-200">
              <p class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">File Info</p>
              <table class="w-full text-sm">
                <tr><td class="text-surface-500 py-1 pr-4">Name</td><td class="font-medium truncate max-w-[150px]">${esc(file.name)}</td></tr>
                <tr><td class="text-surface-500 py-1">Size</td><td class="font-medium">${formatBytes(data.byteLength)}</td></tr>
                <tr><td class="text-surface-500 py-1">Format</td><td class="font-medium">${keywords['SIMPLE'] === 'T' ? 'Standard FITS' : 'FITS Extension'}</td></tr>
              </table>
            </div>
            <div class="bg-surface-50 p-4 rounded-xl border border-surface-200">
              <p class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Metadata Summary</p>
              <table class="w-full text-sm">
                <tr><td class="text-surface-500 py-1 pr-4">BITPIX</td><td class="font-medium">${esc(bitpix || 'N/A')}</td></tr>
                <tr><td class="text-surface-500 py-1">Dimensions</td><td class="font-medium">${naxis > 0 ? dims.join(' × ') : 'No Data'}</td></tr>
                <tr><td class="text-surface-500 py-1">Object</td><td class="font-medium italic">${esc(keywords['OBJECT'] || 'Unknown')}</td></tr>
              </table>
            </div>
          </div>
        `;

        let cardsHtml = allCards.map(c => `
          <div class="flex border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
            <div class="w-24 shrink-0 font-mono text-brand-600 py-1.5 px-3 bg-surface-50/30 text-xs">${esc(c.key)}</div>
            <div class="grow font-mono text-surface-700 py-1.5 px-3 break-all text-xs">${esc(c.value)}</div>
          </div>
        `).join('');

        h.render(`
          <div class="p-6 max-w-4xl mx-auto">
            <div class="flex items-center gap-4 mb-8">
              <div class="w-14 h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-brand-100">🔭</div>
              <div class="text-left">
                <h2 class="text-2xl font-bold text-surface-900 leading-tight">FITS Analyzer</h2>
                <p class="text-surface-500">Flexible Image Transport System</p>
              </div>
            </div>

            ${summaryHtml}

            <div class="border border-surface-200 rounded-2xl overflow-hidden bg-white shadow-sm text-left">
              <div class="bg-surface-50 px-4 py-3 border-b border-surface-200 flex items-center justify-between">
                <span class="text-xs font-bold text-surface-500 uppercase tracking-wider">Primary Header HDU</span>
                <span class="text-xs text-surface-400 font-medium">${allCards.length} Cards</span>
              </div>
              <div class="max-h-[500px] overflow-auto">
                ${cardsHtml || '<div class="p-8 text-center text-surface-400">No header cards found</div>'}
              </div>
            </div>

            <div class="mt-8 p-5 bg-blue-50 border border-blue-100 rounded-2xl flex gap-4 text-left">
              <span class="text-blue-500 text-2xl shrink-0">🪐</span>
              <div>
                <p class="text-sm font-semibold text-blue-900 mb-1">About FITS Files</p>
                <p class="text-sm text-blue-700 leading-relaxed">
                  FITS is the most commonly used digital format in astronomy. This tool extracts metadata from the 
                  header blocks. For advanced image processing or visualization, consider using 
                  <strong>SAOImageDS9</strong> or the <strong>Astropy</strong> library.
                </p>
              </div>
            </div>
          </div>
        `);
      }
    });
  };
})();
