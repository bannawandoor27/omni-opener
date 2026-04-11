(function() {
  'use strict';

  // Global state for cleanup
  let currentFontUrl = null;

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.otf,.ttf,.woff,.woff2',
      dropLabel: 'Drop an OTF, TTF, or WOFF font file here',
      binary: true,
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');
      },

      onFile: async function(file, content, helpers) {
        // B1. Race condition check
        if (typeof opentype === 'undefined') {
          helpers.showLoading('Initializing font engine...');
          await new Promise((resolve) => {
            const check = setInterval(() => {
              if (typeof opentype !== 'undefined') {
                clearInterval(check);
                resolve();
              }
            }, 100);
          });
        }
        processFont(file, content, helpers);
      },

      actions: [
        {
          label: '📋 Copy Font Name',
          id: 'copy-name',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state && state.fontName) {
              helpers.copyToClipboard(state.fontName, btn);
            }
          }
        },
        {
          label: '📥 Download Font',
          id: 'dl',
          onClick: function(helpers) {
            const file = helpers.getFile();
            const content = helpers.getContent();
            helpers.download(file.name, content, 'font/otf');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Font processing happens entirely in your browser. No font data is ever sent to our servers.'
    });
  };

  /**
   * Main processing logic
   */
  async function processFont(file, content, helpers) {
    // U6. Show loading immediately
    helpers.showLoading('Parsing font tables...');

    // B2. ArrayBuffer check
    if (!(content instanceof ArrayBuffer)) {
      helpers.showError('Invalid file data', 'The file content could not be read as binary data.');
      return;
    }

    try {
      // B3. Wrap heavy parsing
      const font = opentype.parse(content);
      if (!font || !font.supported) {
        throw new Error('This font format is not fully supported or the file is corrupted.');
      }

      // U5. Check for empty font
      if (font.numGlyphs === 0) {
        helpers.showError('Empty Font', 'This font file contains no glyphs.');
        return;
      }

      renderFontViewer(font, file, content, helpers);
    } catch (e) {
      console.error('Font parsing error:', e);
      // U3. Friendly error messages
      helpers.showError('Could not open font file', 'The file may be corrupted or in an unsupported variant. ' + (e.message || ''));
    }
  }

  /**
   * UI Rendering
   */
  function renderFontViewer(font, file, content, helpers) {
    const fontName = getFontName(font);
    const subFamily = font.names.fontSubfamily?.en || font.names.fontSubfamily?.[''] || 'Regular';
    const copyright = font.names.copyright?.en || font.names.copyright?.[''] || '';
    
    helpers.setState({ fontName: fontName });

    // B5. Manage Font Injection & Memory
    if (currentFontUrl) URL.revokeObjectURL(currentFontUrl);
    
    const fontId = 'omni-font-' + Math.random().toString(36).substring(2, 9);
    const blob = new Blob([content], { type: 'font/otf' });
    currentFontUrl = URL.createObjectURL(blob);

    const style = document.createElement('style');
    style.id = 'omni-font-style';
    style.textContent = `
      @font-face {
        font-family: '${fontId}';
        src: url(${currentFontUrl});
      }
      .font-custom-preview {
        font-family: '${fontId}', sans-serif;
        line-height: 1.2;
      }
      .glyph-canvas-container canvas {
        width: 100%;
        height: auto;
        max-width: 64px;
        image-rendering: -webkit-optimize-contrast;
      }
    `;
    const oldStyle = document.getElementById('omni-font-style');
    if (oldStyle) oldStyle.remove();
    document.head.appendChild(style);

    const html = `
      <div class="p-4 md:p-6 max-w-6xl mx-auto">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${esc(font.outlineFormat === 'truetype' ? 'TrueType' : 'OpenType')} Font</span>
          <span class="ml-auto bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold uppercase">${esc(subFamily)}</span>
        </div>

        <div class="mb-8">
          <h1 class="text-3xl font-bold text-surface-900 tracking-tight">${esc(fontName)}</h1>
          <p class="text-surface-500 mt-1 text-sm">${esc(copyright)}</p>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-1 bg-surface-100 p-1 rounded-xl mb-6 w-fit">
          <button class="omni-tab active px-4 py-2 text-sm font-medium rounded-lg transition-all bg-white text-brand-600 shadow-sm" data-tab="preview">Preview</button>
          <button class="omni-tab px-4 py-2 text-sm font-medium rounded-lg transition-all text-surface-600 hover:bg-white/50" data-tab="glyphs">Glyphs</button>
          <button class="omni-tab px-4 py-2 text-sm font-medium rounded-lg transition-all text-surface-600 hover:bg-white/50" data-tab="info">Details & Metrics</button>
        </div>

        <!-- Tab Content: Preview -->
        <div id="tab-preview" class="omni-tab-content space-y-8">
          <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div class="lg:col-span-1 space-y-6">
              <div class="bg-surface-50 p-4 rounded-xl border border-surface-200">
                <label class="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-3">Controls</label>
                <div class="space-y-4">
                  <div>
                    <span class="text-xs text-surface-400 block mb-1 font-medium">Font Size: <span id="size-val" class="text-brand-600">48</span>px</span>
                    <input type="range" id="size-slider" min="8" max="144" value="48" class="w-full accent-brand-500">
                  </div>
                  <div>
                    <span class="text-xs text-surface-400 block mb-1 font-medium">Preview Text</span>
                    <textarea id="preview-input" class="w-full p-3 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all resize-none" rows="3">The quick brown fox jumps over the lazy dog.</textarea>
                  </div>
                </div>
              </div>

              <div class="bg-surface-50 p-4 rounded-xl border border-surface-200">
                <label class="block text-xs font-bold text-surface-500 uppercase tracking-wider mb-3">Waterfall</label>
                <div class="space-y-4 overflow-hidden">
                  ${[12, 18, 24, 36, 48].map(size => `
                    <div class="border-b border-surface-100 pb-2 last:border-0">
                      <div class="text-[9px] text-surface-400 mb-1 font-mono uppercase">${size}px</div>
                      <div class="font-custom-preview truncate text-surface-800" style="font-size: ${size}px">OmniOpener</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
            
            <div class="lg:col-span-3">
              <div class="bg-white border border-surface-200 rounded-2xl p-6 min-h-[350px] flex items-center justify-center overflow-hidden">
                <div id="preview-display" class="font-custom-preview text-center w-full break-words outline-none" style="font-size: 48px;" contenteditable="true">
                  The quick brown fox jumps over the lazy dog.
                </div>
              </div>
              
              <div class="mt-8 space-y-8 border-t border-surface-100 pt-8">
                <div>
                   <h3 class="text-sm font-bold text-surface-400 uppercase tracking-widest mb-4">Type Specimen</h3>
                   <div class="space-y-6">
                    ${[
                      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                      'abcdefghijklmnopqrstuvwxyz',
                      '0123456789',
                      '.,:;?!@#$%^&*()_+-=[]{}|\\<>/'
                    ].map(text => `
                      <div class="border-b border-surface-50 pb-4">
                        <div class="text-[10px] text-surface-300 font-mono mb-1 select-none">${esc(text)}</div>
                        <div class="font-custom-preview text-2xl text-surface-800 break-all">${esc(text)}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tab Content: Glyphs -->
        <div id="tab-glyphs" class="omni-tab-content hidden">
          <!-- U10. Section Header -->
          <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h3 class="font-semibold text-surface-800">Character Map</h3>
              <p class="text-sm text-surface-500">Visual vectors stored in font file</p>
            </div>
            <div class="flex items-center gap-3">
              <div class="relative">
                <input type="text" id="glyph-search" placeholder="Search glyph name..." class="pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all w-48 md:w-64">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
              </div>
              <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-semibold" id="glyph-count">${font.numGlyphs} glyphs</span>
            </div>
          </div>

          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3" id="glyph-grid">
            <!-- Glyphs rendered here -->
          </div>
          
          <div id="glyph-load-more" class="mt-12 text-center hidden">
            <button class="px-8 py-3 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
              Load More Glyphs
            </button>
          </div>
        </div>

        <!-- Tab Content: Info -->
        <div id="tab-info" class="omni-tab-content hidden space-y-8">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="md:col-span-2">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Metadata Properties</h3>
              </div>
              <!-- U7. Beautiful Table -->
              <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th class="bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-1/3">Field</th>
                      <th class="bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Value</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${renderMetadataRows(font)}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="space-y-6">
              <h3 class="font-semibold text-surface-800">Technical Metrics</h3>
              <div class="grid grid-cols-1 gap-4">
                ${[
                  { label: 'Units Per Em', val: font.unitsPerEm },
                  { label: 'Ascender', val: font.ascender },
                  { label: 'Descender', val: font.descender },
                  { label: 'Line Gap', val: font.lineGap || 0 },
                  { label: 'Underline Pos', val: font.tables.post?.underlinePosition || 'N/A' },
                  { label: 'Italic Angle', val: font.tables.post?.italicAngle || '0' }
                ].map(m => `
                  <!-- U9. Content Card -->
                  <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm hover:border-brand-200 transition-colors">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1 tracking-wider select-none">${m.label}</div>
                    <div class="text-xl font-bold text-surface-800">${m.val}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // --- EVENT WIRING ---
    const renderEl = helpers.getRenderEl();
    const tabBtns = renderEl.querySelectorAll('.omni-tab');
    const tabContents = renderEl.querySelectorAll('.omni-tab-content');
    
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach(b => {
          b.classList.remove('bg-white', 'text-brand-600', 'shadow-sm', 'active');
          b.classList.add('text-surface-600', 'hover:bg-white/50');
        });
        btn.classList.add('bg-white', 'text-brand-600', 'shadow-sm', 'active');
        btn.classList.remove('text-surface-600', 'hover:bg-white/50');
        
        tabContents.forEach(c => c.classList.add('hidden'));
        const targetContent = renderEl.querySelector(`#tab-${target}`);
        if (targetContent) targetContent.classList.remove('hidden');

        // Initial glyph render when tab opened
        if (target === 'glyphs' && !renderEl.querySelector('#glyph-grid').children.length) {
          renderGlyphs(font, 0, 150, renderEl);
        }
      });
    });

    // Preview Logic
    const sizeSlider = renderEl.querySelector('#size-slider');
    const sizeVal = renderEl.querySelector('#size-val');
    const previewInput = renderEl.querySelector('#preview-input');
    const previewDisplay = renderEl.querySelector('#preview-display');
    
    const updatePreview = () => {
      const val = sizeSlider.value;
      sizeVal.textContent = val;
      previewDisplay.style.fontSize = val + 'px';
    };

    sizeSlider.addEventListener('input', updatePreview);
    previewInput.addEventListener('input', () => {
      previewDisplay.textContent = previewInput.value || 'The quick brown fox jumps over the lazy dog.';
    });
    previewDisplay.addEventListener('input', () => {
      previewInput.value = previewDisplay.textContent;
    });

    // Glyph Rendering with Search & Pagination
    const glyphSearch = renderEl.querySelector('#glyph-search');
    let currentGlyphIndex = 0;
    const PAGE_SIZE = 150;

    function renderGlyphs(font, start, count, container, filter = '') {
      const grid = container.querySelector('#glyph-grid');
      const loadMore = container.querySelector('#glyph-load-more');
      const countLabel = container.querySelector('#glyph-count');
      
      if (start === 0) grid.innerHTML = '';
      
      let itemsAdded = 0;
      let i = start;
      const lowerFilter = filter.toLowerCase();

      // B7. Large file handling: pagination
      while (i < font.numGlyphs && itemsAdded < count) {
        const glyph = font.glyphs.get(i);
        const name = (glyph.name || '').toLowerCase();
        const unicode = glyph.unicode ? glyph.unicode.toString(16).padStart(4, '0') : '';
        
        if (!filter || name.includes(lowerFilter) || i.toString().includes(filter) || unicode.includes(lowerFilter)) {
          const card = document.createElement('div');
          card.className = 'flex flex-col items-center justify-center p-3 bg-white border border-surface-200 rounded-xl hover:border-brand-400 hover:shadow-md transition-all group cursor-help';
          card.title = `Index: ${i}\nName: ${glyph.name || 'unnamed'}\nUnicode: U+${unicode.toUpperCase()}`;
          
          const canvasContainer = document.createElement('div');
          canvasContainer.className = 'glyph-canvas-container flex items-center justify-center h-16 w-full';
          
          const canvas = document.createElement('canvas');
          const size = 64;
          const dpr = window.devicePixelRatio || 1;
          canvas.width = size * dpr;
          canvas.height = size * dpr;
          const ctx = canvas.getContext('2d');
          ctx.scale(dpr, dpr);
          
          const scale = (size * 0.7) / font.unitsPerEm;
          const x = (size / 2) - (glyph.advanceWidth * scale / 2);
          const y = (size / 2) + (font.ascender * scale / 2);
          
          ctx.fillStyle = '#334155'; // surface-700
          glyph.draw(ctx, x, y, font.unitsPerEm * scale);
          
          canvasContainer.appendChild(canvas);
          card.appendChild(canvasContainer);
          
          const label = document.createElement('span');
          label.className = 'text-[9px] text-surface-400 mt-2 font-mono group-hover:text-brand-600 transition-colors';
          label.textContent = `idx ${i}`;
          card.appendChild(label);
          
          grid.appendChild(card);
          itemsAdded++;
        }
        i++;
      }

      currentGlyphIndex = i;

      if (currentGlyphIndex < font.numGlyphs && !filter) {
        loadMore.classList.remove('hidden');
        loadMore.onclick = () => renderGlyphs(font, currentGlyphIndex, PAGE_SIZE, container, filter);
      } else {
        loadMore.classList.add('hidden');
      }

      if (filter) {
        countLabel.textContent = `Search results`;
      } else {
        countLabel.textContent = `${font.numGlyphs} glyphs`;
      }
    }

    let searchTimeout;
    glyphSearch.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentGlyphIndex = 0;
        renderGlyphs(font, 0, 1000, renderEl, e.target.value);
      }, 250);
    });
  }

  /**
   * Helpers
   */
  function getFontName(font) {
    const names = font.names || {};
    return (names.fontFamily?.en || names.fontFamily?.[''] || 
            names.fullName?.en || names.fullName?.[''] || 'Unnamed Font');
  }

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  function renderMetadataRows(font) {
    const names = font.names;
    const fields = [
      { key: 'fontFamily', label: 'Family' },
      { key: 'fontSubfamily', label: 'Subfamily' },
      { key: 'fullName', label: 'Full Name' },
      { key: 'postScriptName', label: 'PostScript Name' },
      { key: 'version', label: 'Version' },
      { key: 'uniqueID', label: 'Unique ID' },
      { key: 'manufacturer', label: 'Manufacturer' },
      { key: 'designer', label: 'Designer' },
      { key: 'description', label: 'Description' },
      { key: 'license', label: 'License' },
      { key: 'licenseURL', label: 'License URL' },
      { key: 'copyright', label: 'Copyright' },
      { key: 'trademark', label: 'Trademark' }
    ];

    const rows = fields
      .map(f => {
        const val = names[f.key]?.en || names[f.key]?.[''];
        if (!val) return null;
        return `
          <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
            <td class="px-4 py-3 font-semibold text-surface-600 align-top whitespace-nowrap">${esc(f.label)}</td>
            <td class="px-4 py-3 text-surface-700 break-words leading-relaxed">${esc(val)}</td>
          </tr>
        `;
      })
      .filter(Boolean);

    if (rows.length === 0) {
      return '<tr><td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">No metadata found in this font file.</td></tr>';
    }

    return rows.join('');
  }

})();
