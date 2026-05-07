(function() {
  window.initTool = function(toolConfig, mountEl) {
    let fontStyleEl = null;
    let fontUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ttf,.otf,.woff,.woff2',
      dropLabel: 'Drop a font file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');
      },
      onFile: function _onFileFn(file, content, helpers) {
        if (typeof opentype === 'undefined') {
          helpers.showLoading('Loading font engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 300);
          return;
        }

        helpers.showLoading('Parsing font metadata...');

        // Cleanup previous font
        if (fontStyleEl) {
          fontStyleEl.remove();
          fontStyleEl = null;
        }
        if (fontUrl) {
          URL.revokeObjectURL(fontUrl);
          fontUrl = null;
        }

        try {
          const font = opentype.parse(content);
          if (!font || !font.supported) {
            throw new Error('Unsupported or invalid font format.');
          }
          
          helpers.setState('font', font);
          renderViewer(font, file, content, helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open font file', 'The file might be corrupted or in an unsupported format. Error: ' + err.message);
        }
      },
      onDestroy: function() {
        if (fontStyleEl) fontStyleEl.remove();
        if (fontUrl) URL.revokeObjectURL(fontUrl);
      },
      actions: [
        {
          label: '📋 Copy Name',
          id: 'copy-name',
          onClick: function(helpers, btn) {
            const font = helpers.getState().font;
            if (font) {
              const name = font.names.fontFamily?.en || font.names.fontFamily?.[''] || 'Font';
              helpers.copyToClipboard(name, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function(helpers) {
            const file = helpers.getFile();
            helpers.download(file.name, helpers.getContent(), 'font/ttf');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Fonts are processed locally in your browser using opentype.js.'
    });

    function renderViewer(font, file, content, helpers) {
      const name = font.names.fontFamily?.en || font.names.fontFamily?.[''] || file.name;
      const subFamily = font.names.fontSubfamily?.en || font.names.fontSubfamily?.[''] || 'Regular';
      const sizeStr = formatBytes(file.size);
      
      const fontId = 'omni-font-' + Math.random().toString(36).substring(2, 9);
      const blob = new Blob([content], { type: 'font/ttf' });
      fontUrl = URL.createObjectURL(blob);

      fontStyleEl = document.createElement('style');
      fontStyleEl.textContent = `
        @font-face {
          font-family: '${fontId}';
          src: url(${fontUrl});
        }
        .preview-text-${fontId} {
          font-family: '${fontId}', sans-serif;
        }
      `;
      document.head.appendChild(fontStyleEl);
      // Revoke after load attempt
      setTimeout(() => { if (fontUrl) URL.revokeObjectURL(fontUrl); fontUrl = null; }, 5000);

      const html = `
        <div class="p-4 max-w-5xl mx-auto">
          <!-- U1: File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${sizeStr}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.ttf file</span>
            <span class="ml-auto bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${escapeHtml(subFamily)}</span>
          </div>

          <div class="mb-6">
            <h1 class="text-2xl font-bold text-surface-900">${escapeHtml(name)}</h1>
            <p class="text-surface-500 text-sm">${escapeHtml(font.names.copyright?.en || '')}</p>
          </div>

          <!-- Tabs -->
          <div class="flex items-center gap-1 border-b border-surface-200 mb-6 overflow-x-auto no-scrollbar">
            <button class="tab-btn active px-4 py-2 text-sm font-medium text-brand-600 border-b-2 border-brand-500 transition-colors whitespace-nowrap" data-tab="preview">Preview</button>
            <button class="tab-btn px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-700 border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="glyphs">Character Map</button>
            <button class="tab-btn px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-700 border-b-2 border-transparent transition-colors whitespace-nowrap" data-tab="metadata">Metadata</button>
          </div>

          <div id="tab-preview" class="tab-pane">
            <div class="mb-6">
              <label class="block text-xs font-bold text-surface-400 uppercase mb-2">Custom Preview</label>
              <input type="text" id="preview-input" value="The quick brown fox jumps over the lazy dog 1234567890" 
                class="w-full px-4 py-3 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm">
            </div>

            <div class="space-y-6">
              ${[12, 16, 24, 36, 48, 64].map(size => `
                <div class="group border-b border-surface-100 pb-4 last:border-0">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-mono text-surface-400">${size}px</span>
                  </div>
                  <div class="preview-text-${fontId} text-surface-900 break-all leading-normal whitespace-pre-wrap" style="font-size: ${size}px;" id="preview-${size}">The quick brown fox jumps over the lazy dog 1234567890</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div id="tab-glyphs" class="tab-pane hidden">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
               <div>
                 <h3 class="font-semibold text-surface-800">Glyphs</h3>
                 <p class="text-xs text-surface-500">${font.numGlyphs} total characters</p>
               </div>
               <div class="flex items-center gap-2">
                 <input type="text" id="glyph-search" placeholder="Search glyph name..." class="px-3 py-1.5 text-sm border border-surface-200 rounded-lg outline-none focus:border-brand-500 w-48">
               </div>
            </div>
            <div id="glyph-grid" class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
              <!-- Glyphs rendered here -->
            </div>
            <div id="glyph-loading" class="py-12 text-center text-surface-400 text-sm hidden">Loading more glyphs...</div>
          </div>

          <div id="tab-metadata" class="tab-pane hidden">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Units per Em</div>
                <div class="text-xl font-bold text-surface-800">${font.unitsPerEm}</div>
              </div>
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Ascender / Descender</div>
                <div class="text-xl font-bold text-surface-800">${font.ascender} / ${font.descender}</div>
              </div>
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Glyph Count</div>
                <div class="text-xl font-bold text-surface-800">${font.numGlyphs}</div>
              </div>
            </div>

            <div class="rounded-xl border border-surface-200 overflow-hidden">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Property</th>
                    <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Value</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${renderMetadataRows(font)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      const renderEl = helpers.getRenderEl();
      
      // Tab Logic
      const tabBtns = renderEl.querySelectorAll('.tab-btn');
      const tabPanes = renderEl.querySelectorAll('.tab-pane');
      tabBtns.forEach(btn => {
        btn.onclick = () => {
          const tab = btn.dataset.tab;
          tabBtns.forEach(b => {
            b.classList.remove('active', 'text-brand-600', 'border-brand-500');
            b.classList.add('text-surface-500', 'border-transparent');
          });
          btn.classList.add('active', 'text-brand-600', 'border-brand-500');
          btn.classList.remove('text-surface-500', 'border-transparent');
          
          tabPanes.forEach(p => p.classList.add('hidden'));
          renderEl.querySelector(`#tab-${tab}`).classList.remove('hidden');

          if (tab === 'glyphs' && !renderEl.querySelector('#glyph-grid').children.length) {
            renderGlyphs(font, 0, 192);
          }
        };
      });

      // Preview Sync
      const input = renderEl.querySelector('#preview-input');
      const previews = renderEl.querySelectorAll('[id^="preview-"]');
      input.oninput = () => {
        const val = input.value || ' ';
        previews.forEach(p => p.textContent = val);
      };

      // Glyph Rendering & Infinite Scroll
      let currentGlyphIndex = 0;
      let isRendering = false;
      const glyphGrid = renderEl.querySelector('#glyph-grid');
      const glyphSearch = renderEl.querySelector('#glyph-search');

      function renderGlyphs(font, start, count) {
        if (isRendering) return;
        isRendering = true;
        
        const limit = Math.min(start + count, font.numGlyphs);
        const fragment = document.createDocumentFragment();

        for (let i = start; i < limit; i++) {
          const glyph = font.glyphs.get(i);
          const div = document.createElement('div');
          div.className = 'flex flex-col items-center justify-center p-2 bg-white border border-surface-100 rounded-lg hover:border-brand-300 transition-all group relative cursor-pointer';
          div.title = `Index: ${i}\nName: ${glyph.name || 'unnamed'}\nUnicode: ${glyph.unicode ? 'U+' + glyph.unicode.toString(16).toUpperCase().padStart(4, '0') : 'none'}`;
          
          const canvas = document.createElement('canvas');
          canvas.width = 48;
          canvas.height = 48;
          const ctx = canvas.getContext('2d');
          
          // Center and scale glyph for preview
          const size = 32;
          const x = 8;
          const y = 38;
          try {
            glyph.draw(ctx, x, y, size);
          } catch (e) {}

          div.appendChild(canvas);
          const label = document.createElement('span');
          label.className = 'text-[9px] font-mono text-surface-400 mt-1 opacity-60 group-hover:opacity-100 transition-opacity';
          label.textContent = i;
          div.appendChild(label);
          
          div.onclick = () => {
            const char = glyph.unicode ? String.fromCharCode(glyph.unicode) : '';
            if (char) helpers.copyToClipboard(char);
          };

          fragment.appendChild(div);
        }

        glyphGrid.appendChild(fragment);
        currentGlyphIndex = limit;
        isRendering = false;
        
        if (currentGlyphIndex < font.numGlyphs) {
          checkScroll();
        }
      }

      function checkScroll() {
        const container = renderEl.closest('.omni-mount') || document.documentElement;
        const rect = glyphGrid.getBoundingClientRect();
        if (rect.bottom < window.innerHeight + 500 && currentGlyphIndex < font.numGlyphs && !glyphSearch.value) {
          renderGlyphs(font, currentGlyphIndex, 96);
        }
      }

      const mountScrollParent = renderEl.closest('.omni-mount') || window;
      mountScrollParent.addEventListener('scroll', checkScroll);

      glyphSearch.oninput = () => {
        const query = glyphSearch.value.toLowerCase();
        if (!query) {
          glyphGrid.innerHTML = '';
          currentGlyphIndex = 0;
          renderGlyphs(font, 0, 192);
          return;
        }

        // Search in all glyphs (performance warning if too many, but usually ok)
        glyphGrid.innerHTML = '';
        const found = [];
        for (let i = 0; i < font.numGlyphs; i++) {
          const glyph = font.glyphs.get(i);
          if ((glyph.name && glyph.name.toLowerCase().includes(query)) || i.toString() === query) {
            found.push(i);
          }
          if (found.length >= 100) break; // Limit search results
        }
        
        const fragment = document.createDocumentFragment();
        found.forEach(i => {
          const glyph = font.glyphs.get(i);
          const div = document.createElement('div');
          div.className = 'flex flex-col items-center justify-center p-2 bg-white border border-surface-100 rounded-lg hover:border-brand-300 transition-all group cursor-pointer';
          const canvas = document.createElement('canvas');
          canvas.width = 48;
          canvas.height = 48;
          glyph.draw(canvas.getContext('2d'), 8, 38, 32);
          div.appendChild(canvas);
          const label = document.createElement('span');
          label.className = 'text-[9px] font-mono text-surface-400 mt-1';
          label.textContent = i;
          div.appendChild(label);
          div.onclick = () => {
            const char = glyph.unicode ? String.fromCharCode(glyph.unicode) : '';
            if (char) helpers.copyToClipboard(char);
          };
          fragment.appendChild(div);
        });
        glyphGrid.appendChild(fragment);
      };
    }

    function renderMetadataRows(font) {
      const names = font.names;
      const rows = [
        { l: 'Font Family', v: names.fontFamily },
        { l: 'Font Subfamily', v: names.fontSubfamily },
        { l: 'Full Name', v: names.fullName },
        { l: 'PostScript Name', v: names.postScriptName },
        { l: 'Version', v: names.version },
        { l: 'Unique ID', v: names.uniqueID },
        { l: 'Description', v: names.description },
        { l: 'Manufacturer', v: names.manufacturer },
        { l: 'Designer', v: names.designer },
        { l: 'License', v: names.license },
        { l: 'License URL', v: names.licenseURL },
        { l: 'Copyright', v: names.copyright }
      ];

      return rows.map(r => {
        const val = r.v ? (r.v.en || r.v[''] || Object.values(r.v)[0]) : '';
        if (!val) return '';
        return `
          <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
            <td class="px-4 py-3 text-surface-500 font-medium whitespace-nowrap">${escapeHtml(r.l)}</td>
            <td class="px-4 py-3 text-surface-700 break-words">${escapeHtml(String(val))}</td>
          </tr>
        `;
      }).filter(Boolean).join('');
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
