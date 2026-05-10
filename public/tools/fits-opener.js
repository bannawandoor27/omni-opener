/**
 * OmniOpener — FITS File Viewer
 * Uses OmniTool SDK. Parses and visualizes Flexible Image Transport System (FITS) files.
 */
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
          label: '📥 Download Original',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
          'https://cdn.jsdelivr.net/npm/fitsjs@0.10.1/lib/fits.js'
        ]);
      },

      onFile: async function (file, content, h) {
        h.showLoading('Reading FITS file...');

        // Ensure dependencies are loaded
        if (typeof pako === 'undefined' || typeof astro === 'undefined') {
          await h.loadScripts([
            'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
            'https://cdn.jsdelivr.net/npm/fitsjs@0.10.1/lib/fits.js'
          ]);
        }

        let data = content;
        if (file.name.endsWith('.gz')) {
          try {
            data = pako.ungzip(new Uint8Array(content)).buffer;
          } catch (e) {
            h.showError('Decompression failed', 'This does not appear to be a valid GZIP file.');
            return;
          }
        }

        try {
          new astro.FITS(data, function (f) {
            renderFits(f, file, data, h);
          });
        } catch (err) {
          h.showError('Failed to parse FITS', err.message);
        }
      }
    });
  };

  async function renderFits(f, file, data, h) {
    const header = f.getHeader();
    const primaryHDU = f.getHDU();
    const keywords = {};
    const allCards = [];
    let headerText = '';

    // Extract all header cards
    const cards = header.cards;
    for (const key in cards) {
      const card = cards[key];
      const value = card.value;
      const comment = card.comment;
      keywords[key] = value;
      allCards.push({ key, value, comment });
      headerText += `${key.padEnd(8)}= ${String(value).padEnd(20)} / ${comment || ''}\n`;
    }
    headerText += 'END';

    h.setState({ 
      headerText: headerText,
      headerJson: keywords
    });

    const bitpix = keywords['BITPIX'];
    const naxis = parseInt(keywords['NAXIS'] || 0);
    const dims = [];
    for (let i = 1; i <= naxis; i++) dims.push(keywords['NAXIS' + i] || '?');

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
        <div class="w-48 shrink-0 font-mono text-surface-400 py-1.5 px-3 italic text-[10px] truncate">${esc(c.comment || '')}</div>
      </div>
    `).join('');

    h.render(`
      <div class="p-6 max-w-4xl mx-auto">
        <div class="flex items-center gap-4 mb-8 text-left">
          <div class="w-14 h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-brand-100">🔭</div>
          <div>
            <h2 class="text-2xl font-bold text-surface-900 leading-tight">FITS Analyzer</h2>
            <p class="text-surface-500">Flexible Image Transport System</p>
          </div>
        </div>

        <div id="fits-visualization" class="mb-8 hidden">
          <div class="bg-black rounded-2xl overflow-hidden shadow-xl relative group">
            <canvas id="fits-canvas" class="w-full h-auto cursor-crosshair"></canvas>
            <div class="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
              Auto-stretched visualization
            </div>
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
              FITS is the standard digital format in astronomy. This tool extracts metadata and provides a 
              preview of the image data. For advanced scientific analysis, consider 
              <strong>DS9</strong> or <strong>Astropy</strong>.
            </p>
          </div>
        </div>
      </div>
    `);

    // Try to visualize image data
    const dataUnit = f.getDataUnit();
    if (dataUnit && naxis >= 2) {
      const width = keywords['NAXIS1'];
      const height = keywords['NAXIS2'];
      
      dataUnit.getFrame(0, function (pixels) {
        if (!pixels) return;
        
        const vizEl = document.getElementById('fits-visualization');
        const canvas = document.getElementById('fits-canvas');
        if (!vizEl || !canvas) return;
        
        vizEl.classList.remove('hidden');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(width, height);
        
        // Simple auto-stretch (Min-Max)
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < pixels.length; i++) {
          if (pixels[i] < min) min = pixels[i];
          if (pixels[i] > max) max = pixels[i];
        }
        
        const range = max - min || 1;
        for (let i = 0; i < pixels.length; i++) {
          const val = ((pixels[i] - min) / range) * 255;
          const idx = i * 4;
          // FITS images are typically stored bottom-to-top, but fitsjs handles some mapping.
          // We might need to flip if it looks upside down, but let's try standard first.
          imgData.data[idx] = val;     // R
          imgData.data[idx + 1] = val; // G
          imgData.data[idx + 2] = val; // B
          imgData.data[idx + 3] = 255; // A
        }
        
        ctx.putImageData(imgData, 0, 0);
      });
    }
  }
})();
