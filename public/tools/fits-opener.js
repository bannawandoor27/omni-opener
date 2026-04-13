/**
 * OmniOpener — FITS Explorer
 * Uses OmniTool SDK and astrojs/fitsjs.
 * Renders FITS (Flexible Image Transport System) images and tables client-side.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.fits,.fit,.fts',
      binary: true,
      infoHtml: '<strong>FITS Explorer:</strong> Professional astronomy viewer for images and tabular data. Runs entirely in your browser using astrojs/fitsjs.',
      
      actions: [
        {
          label: '📋 Copy Header',
          id: 'copy-header',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state.headerJson) {
              h.copyToClipboard(JSON.stringify(state.headerJson, null, 2), btn);
            } else {
              h.copyToClipboard('No header data loaded', btn);
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const state = h.getState();
            if (state.headerJson) {
              h.download(h.getFile().name + '.json', JSON.stringify(state.headerJson, null, 2), 'application/json');
            }
          }
        },
        {
          label: '🖼️ Export PNG',
          id: 'export-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              h.download(h.getFile().name + '.png', canvas.toDataURL(), 'image/png');
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/fitsjs@0.10.4/dist/fits.min.js');
      },

      onFile: function (file, content, h) {
        const FITS_LIB = (window.astrojs && window.astrojs.fits) ? window.astrojs.fits : (window.FITS ? { FITS: window.FITS } : null);
        
        if (!FITS_LIB) {
          h.showLoading('Preparing FITS engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Analyzing FITS HDUs...');
        
        try {
          new FITS_LIB.FITS(content, function(f) {
            const hdus = f.hdus;
            if (!hdus || hdus.length === 0) {
              h.showError('Invalid FITS', 'No HDUs found in this file.');
              return;
            }

            h.setState({
              fits: f,
              headerJson: hdus.map(hdu => hdu.header.cards)
            });

            renderHDUTabs(f, 0, h, file);
          });
        } catch (err) {
          h.showError('Parse Failed', err.message);
        }
      }
    });
  };

  function renderHDUTabs(fits, activeIdx, h, file) {
    const hdus = fits.hdus;
    let tabsHtml = '';
    if (hdus.length > 1) {
      tabsHtml = '<div class="flex gap-1 p-2 bg-surface-50 border-b border-surface-200 overflow-x-auto">';
      hdus.forEach((hdu, i) => {
        const type = hdu.header.get('XTENSION') || 'PRIMARY';
        const active = i === activeIdx ? 'bg-brand-600 text-white' : 'bg-white text-surface-600 hover:bg-surface-100';
        tabsHtml += `<button class="hdu-tab px-3 py-1 rounded-md text-[10px] font-bold border border-surface-200 transition-colors ${active}" data-idx="${i}">${type} #${i}</button>`;
      });
      tabsHtml += '</div>';
    }

    h.render(`
      <div class="flex flex-col h-[80vh] bg-surface-100 rounded-xl overflow-hidden border border-surface-200">
        ${tabsHtml}
        <div id="hdu-content" class="flex-1 overflow-auto bg-white relative">
          <div class="p-8 flex items-center justify-center h-full"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div></div>
        </div>
      </div>
    `);

    // Bind tabs
    h.getRenderEl().querySelectorAll('.hdu-tab').forEach(btn => {
      btn.onclick = () => renderHDUTabs(fits, parseInt(btn.dataset.idx), h, file);
    });

    renderHDU(hdus[activeIdx], activeIdx, h, file);
  }

  function renderHDU(hdu, idx, h, file) {
    const container = document.getElementById('hdu-content');
    const header = hdu.header;
    const type = header.get('XTENSION') || 'PRIMARY';
    const bitpix = header.get('BITPIX');
    const naxis = header.get('NAXIS');
    
    let infoHtml = `
      <div class="sticky top-0 z-10 bg-surface-50 border-b border-surface-200 p-3 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-surface-900 text-sm">${type} HDU #${idx}</h3>
          <p class="text-[10px] text-surface-500 font-mono uppercase">BITPIX: ${bitpix} | NAXIS: ${naxis}</p>
        </div>
        <button id="btn-show-hdr" class="px-3 py-1 text-[10px] font-bold bg-white border border-surface-200 rounded-lg hover:bg-surface-100 transition-colors shadow-sm">View Raw Header</button>
      </div>
      <div id="header-cards" class="hidden p-4 bg-surface-900 text-green-400 font-mono text-[10px] overflow-auto max-h-[300px] whitespace-pre border-b border-surface-800 shadow-inner"></div>
    `;

    container.innerHTML = infoHtml + '<div id="hdu-view" class="p-8 flex flex-col items-center justify-center min-h-[400px]"></div>';

    // Populate header cards
    const cardsEl = document.getElementById('header-cards');
    let cardsStr = '';
    header.cards.forEach(c => {
      const key = (c.key || '').padEnd(8);
      const val = String(c.value !== undefined ? c.value : '').padEnd(20);
      const comm = c.comment ? ' / ' + c.comment : '';
      cardsStr += `${key} = ${val}${comm}\n`;
    });
    cardsEl.textContent = cardsStr;

    document.getElementById('btn-show-hdr').onclick = function() {
      cardsEl.classList.toggle('hidden');
      this.textContent = cardsEl.classList.contains('hidden') ? 'View Raw Header' : 'Hide Raw Header';
    };

    const view = document.getElementById('hdu-view');

    // Handle Image Data
    if (naxis >= 2 && bitpix) {
      view.innerHTML = `
        <div class="flex flex-col items-center gap-6 w-full">
           <div class="relative group">
             <canvas id="fits-canvas" class="shadow-2xl rounded-lg bg-black max-w-full h-auto cursor-crosshair"></canvas>
             <div class="absolute bottom-2 right-2 bg-black/50 backdrop-blur text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
               ${header.get('NAXIS1')} x ${header.get('NAXIS2')}
             </div>
           </div>
           <div id="fits-meta" class="bg-surface-50 px-4 py-2 rounded-full border border-surface-200 text-[10px] font-medium text-surface-600 shadow-sm"></div>
        </div>
      `;
      const canvas = document.getElementById('fits-canvas');
      const meta = document.getElementById('fits-meta');
      
      const width = header.get('NAXIS1');
      const height = header.get('NAXIS2');
      canvas.width = width;
      canvas.height = height;
      
      const dataUnit = hdu.data;
      dataUnit.getFrame(0, function(data) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(width, height);
        
        // Linear scaling for display
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < data.length; i++) {
          const v = data[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        
        const range = max - min || 1;
        for (let i = 0; i < data.length; i++) {
          const val = ((data[i] - min) / range) * 255;
          const pxIdx = i * 4;
          imgData.data[pxIdx] = val;
          imgData.data[pxIdx+1] = val;
          imgData.data[pxIdx+2] = val;
          imgData.data[pxIdx+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        meta.textContent = `Auto-stretched visualization (Min: ${min.toFixed(2)}, Max: ${max.toFixed(2)})`;
      });
    } 
    // Handle Table Data
    else if (type === 'BINTABLE' || type === 'TABLE') {
      view.innerHTML = `
        <div class="w-full h-full overflow-auto border border-surface-200 rounded-lg shadow-sm bg-white">
          <table id="fits-table" class="min-w-full text-[11px] text-left border-collapse">
            <thead class="bg-surface-50 sticky top-0"></thead>
            <tbody class="divide-y divide-surface-100"></tbody>
          </table>
          <div id="table-loading" class="p-8 text-center text-surface-400">Loading table rows...</div>
        </div>
      `;
      const table = document.getElementById('fits-table');
      const dataUnit = hdu.data;
      
      dataUnit.getRows(0, 100, function(rows) {
        document.getElementById('table-loading').remove();
        const columns = dataUnit.columns;
        
        const head = table.querySelector('thead');
        let headRow = '<tr class="border-b border-surface-200">';
        columns.forEach(col => {
          headRow += `<th class="px-4 py-2 font-bold text-surface-700 whitespace-nowrap">${escapeHtml(col)}</th>`;
        });
        headRow += '</tr>';
        head.innerHTML = headRow;
        
        const body = table.querySelector('tbody');
        rows.forEach(row => {
          let bodyRow = '<tr class="hover:bg-surface-50 transition-colors">';
          columns.forEach(col => {
            const val = row[col];
            bodyRow += `<td class="px-4 py-2 text-surface-600 whitespace-nowrap font-mono">${escapeHtml(val)}</td>`;
          });
          bodyRow += '</tr>';
          body.insertAdjacentHTML('beforeend', bodyRow);
        });
        
        if (dataUnit.rows > 100) {
          const footer = document.createElement('div');
          footer.className = 'p-4 bg-surface-50 text-center text-xs text-surface-400 italic';
          footer.textContent = `Showing first 100 rows of ${dataUnit.rows} total.`;
          table.parentElement.appendChild(footer);
        }
      });
    } 
    // Fallback
    else {
      view.innerHTML = `
        <div class="text-center space-y-3">
          <div class="text-4xl">📊</div>
          <div class="text-surface-900 font-bold">Metadata Only HDU</div>
          <p class="text-surface-500 text-xs max-w-xs">This HDU contains header metadata but no renderable image or table data.</p>
        </div>
      `;
    }
  }

})();
