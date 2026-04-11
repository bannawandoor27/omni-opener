(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ttf,.otf,.woff,.woff2',
      dropLabel: 'Drop a font file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');
      },
      onFile: function _onFile(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          if (!confirm('This font file is very large (' + formatSize(file.size) + '). Processing it may slow down your browser. Continue?')) {
            helpers.reset();
            return;
          }
        }

        if (typeof opentype === 'undefined') {
          helpers.showLoading('Loading opentype.js...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing font...');
        try {
          const font = opentype.parse(content);
          renderFontViewer(font, file, content, helpers);
        } catch(e) {
          helpers.showError('Could not parse font file', e.message);
        }
      },
      actions: [
        {
          label: '📋 Copy Name',
          id: 'copy-name',
          onClick: function(helpers, btn) {
            const font = helpers.getState().font;
            if (font) {
              const name = getFontName(font);
              helpers.copyToClipboard(name, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers, btn) {
            const file = helpers.getFile();
            const content = helpers.getContent();
            helpers.download(file.name, content, 'font/ttf');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Your fonts are processed entirely in your browser. We never see your files.'
    });
  };

  function getFontName(font) {
    return font.names.fontFamily?.en || font.names.fontFamily?.[''] || 'Unknown Font';
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderFontViewer(font, file, content, helpers) {
    helpers.setState('font', font);
    const fontName = getFontName(font);
    const subFamily = font.names.fontSubfamily?.en || font.names.fontSubfamily?.[''] || '';
    
    // Create a Blob URL for the font to use in @font-face
    const blob = new Blob([content], { type: 'font/ttf' });
    const fontUrl = URL.createObjectURL(blob);
    const fontId = 'omni-font-' + Math.random().toString(36).substring(7);

    // Inject @font-face
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: '${fontId}';
        src: url(${fontUrl});
      }
      .font-preview-text {
        font-family: '${fontId}', sans-serif;
      }
    `;
    document.head.appendChild(style);

    const html = `
      <div class="p-6">
        <!-- File Info Bar -->
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6">
          <span class="font-medium">${escapeHtml(file.name)}</span>
          <span class="text-surface-400">·</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-400">·</span>
          <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-xs font-bold uppercase">${escapeHtml(subFamily)}</span>
        </div>

        <h2 class="text-2xl font-bold text-surface-900 mb-6">${escapeHtml(fontName)}</h2>

        <!-- Tabs -->
        <div class="flex border-b border-surface-200 mb-6">
          <button class="omni-tab px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600" data-tab="preview">Preview</button>
          <button class="omni-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700" data-tab="glyphs">Glyphs</button>
          <button class="omni-tab px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700" data-tab="info">Font Info</button>
        </div>

        <!-- Tab Contents -->
        <div id="tab-preview" class="omni-tab-content space-y-6">
          <div class="space-y-4">
            <label class="block text-xs font-bold text-surface-400 uppercase tracking-wider">Custom Preview</label>
            <textarea id="preview-input" class="w-full p-4 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all" rows="2">The quick brown fox jumps over the lazy dog.</textarea>
          </div>
          
          <div class="space-y-8 py-4">
            <div class="space-y-1">
              <span class="text-[10px] text-surface-400 font-mono">12px</span>
              <div class="font-preview-text text-xs break-all overflow-hidden" id="p-12">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-surface-400 font-mono">18px</span>
              <div class="font-preview-text text-lg break-all overflow-hidden" id="p-18">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-surface-400 font-mono">24px</span>
              <div class="font-preview-text text-2xl break-all overflow-hidden" id="p-24">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-surface-400 font-mono">36px</span>
              <div class="font-preview-text text-4xl break-all overflow-hidden" id="p-36">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-surface-400 font-mono">48px</span>
              <div class="font-preview-text text-5xl break-all overflow-hidden" id="p-48">The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div class="space-y-1">
              <span class="text-[10px] text-surface-400 font-mono">64px</span>
              <div class="font-preview-text text-6xl break-all overflow-hidden" id="p-64">The quick brown fox jumps over the lazy dog.</div>
            </div>
          </div>
        </div>

        <div id="tab-glyphs" class="omni-tab-content hidden">
          <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2" id="glyph-grid">
            <!-- Glyphs will be rendered here -->
          </div>
          <div id="glyph-load-more" class="mt-8 text-center hidden">
            <button class="px-6 py-2 bg-surface-100 hover:bg-surface-200 text-surface-600 text-sm font-medium rounded-lg transition-colors">Load More Glyphs</button>
          </div>
        </div>

        <div id="tab-info" class="omni-tab-content hidden">
          <div class="bg-surface-50 rounded-xl overflow-hidden border border-surface-200">
            <table class="w-full text-sm">
              <tbody class="divide-y divide-surface-200">
                ${renderMetadataRows(font)}
              </tbody>
            </table>
          </div>
          
          <h3 class="text-sm font-bold text-surface-900 mt-8 mb-4">Metrics</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
              <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Units per Em</div>
              <div class="text-lg font-semibold text-surface-700">${font.unitsPerEm}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
              <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Ascender</div>
              <div class="text-lg font-semibold text-surface-700">${font.ascender}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
              <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Descender</div>
              <div class="text-lg font-semibold text-surface-700">${font.descender}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-surface-200 shadow-sm">
              <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Glyph Count</div>
              <div class="text-lg font-semibold text-surface-700">${font.numGlyphs}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Tab Switching
    const tabBtns = helpers.getRenderEl().querySelectorAll('.omni-tab');
    const tabContents = helpers.getRenderEl().querySelectorAll('.omni-tab-content');
    
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach(b => {
          b.classList.remove('border-brand-500', 'text-brand-600');
          b.classList.add('border-transparent', 'text-surface-500');
        });
        btn.classList.add('border-brand-500', 'text-brand-600');
        btn.classList.remove('border-transparent', 'text-surface-500');
        
        tabContents.forEach(c => c.classList.add('hidden'));
        document.getElementById('tab-' + target).classList.remove('hidden');

        if (target === 'glyphs' && !document.getElementById('glyph-grid').children.length) {
          renderGlyphs(font, 0, 200);
        }
      });
    });

    // Preview Input
    const previewInput = document.getElementById('preview-input');
    const previewDivs = [12, 18, 24, 36, 48, 64].map(size => document.getElementById('p-' + size));
    
    previewInput.addEventListener('input', () => {
      const text = previewInput.value || 'The quick brown fox jumps over the lazy dog.';
      previewDivs.forEach(div => div.textContent = text);
    });

    // Glyph Rendering
    function renderGlyphs(font, start, count) {
      const grid = document.getElementById('glyph-grid');
      const loadMore = document.getElementById('glyph-load-more');
      const end = Math.min(start + count, font.numGlyphs);
      
      for (let i = start; i < end; i++) {
        const glyph = font.glyphs.get(i);
        const glyphCard = document.createElement('div');
        glyphCard.className = 'flex flex-col items-center justify-center p-2 bg-white border border-surface-100 rounded-lg hover:border-brand-300 transition-colors group cursor-help';
        glyphCard.title = `Glyph Index: ${i}\nName: ${glyph.name || 'unnamed'}\nUnicode: ${glyph.unicode || 'none'}`;
        
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        
        // Draw glyph on small canvas
        const size = 30;
        const x = 5;
        const y = 32;
        glyph.draw(ctx, x, y, size);
        
        glyphCard.appendChild(canvas);
        const label = document.createElement('span');
        label.className = 'text-[9px] text-surface-400 mt-1 font-mono';
        label.textContent = i;
        glyphCard.appendChild(label);
        
        grid.appendChild(glyphCard);
      }

      if (end < font.numGlyphs) {
        loadMore.classList.remove('hidden');
        loadMore.onclick = () => renderGlyphs(font, end, 200);
      } else {
        loadMore.classList.add('hidden');
      }
    }
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

    return fields
      .map(f => {
        const val = names[f.key]?.en || names[f.key]?.[''];
        if (!val) return '';
        return `
          <tr>
            <td class="px-4 py-3 font-medium text-surface-500 w-1/3 bg-surface-50/50">${escapeHtml(f.label)}</td>
            <td class="px-4 py-3 text-surface-700 break-words">${escapeHtml(val)}</td>
          </tr>
        `;
      })
      .filter(Boolean)
      .join('');
  }
})();
