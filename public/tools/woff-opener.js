(function() {
  'use strict';

  /**
   * OmniOpener — WOFF Font Viewer
   * Uses opentype.js to parse and preview Web Open Font Format files.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.woff',
      dropLabel: 'Drop a .woff file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');
      },
      onFile: function _onFile(file, content, helpers) {
        if (typeof opentype === 'undefined') {
          helpers.showLoading('Loading font engine...');
          setTimeout(function() { _onFile(file, content, helpers); }, 500);
          return;
        }

        helpers.showLoading('Parsing font data...');
        try {
          // opentype.parse expects an ArrayBuffer
          const font = opentype.parse(content);
          renderFont(font, file, content, helpers);
        } catch (e) {
          console.error(e);
          helpers.showError('Could not parse WOFF file', 'This file might be corrupted or in an unsupported format (like WOFF2).');
        }
      },
      actions: [
        {
          label: '📋 Copy CSS',
          id: 'copy-css',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state.cssSnippet) {
              helpers.copyToClipboard(state.cssSnippet, btn);
            } else {
              const file = helpers.getFile();
              const snippet = `@font-face {\n  font-family: 'Selected Font';\n  src: url('${file ? file.name : 'font.woff'}') format('woff');\n}`;
              helpers.copyToClipboard(snippet, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'font/woff');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Your fonts are processed entirely in your browser. No font data is ever uploaded to any server.'
    });
  };

  function renderFont(font, file, buffer, helpers) {
    // Create a unique font-family name for the preview
    const fontId = 'font-' + Math.random().toString(36).substring(2, 9);
    const blob = new Blob([buffer], { type: 'font/woff' });
    const url = URL.createObjectURL(blob);
    // Revoke blob URL after font has loaded
    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
    
    // Inject @font-face style
    const styleId = 'omni-font-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent += `
      @font-face {
        font-family: "${fontId}";
        src: url("${url}") format("woff");
      }
    `;

    const getName = (obj) => {
      if (!obj) return 'Unknown';
      if (typeof obj === 'string') return obj;
      return obj.en || obj[Object.keys(obj)[0]] || 'Unknown';
    };

    const fontName = getName(font.names.fontFamily);
    const fontSubfamily = getName(font.names.fontSubfamily);
    const cssSnippet = `@font-face {\n  font-family: '${fontName.replace(/'/g, "\\'")}';\n  src: url('${file.name}') format('woff');\n}`;
    
    helpers.setState({ fontId, cssSnippet });

    // Generate Glyphs HTML (limited to first 300 for performance)
    const glyphsHtml = [];
    let glyphCount = 0;
    const maxGlyphs = 300;
    
    for (let i = 0; i < font.numGlyphs && glyphCount < maxGlyphs; i++) {
      const glyph = font.glyphs.get(i);
      if (glyph.unicode) {
        glyphCount++;
        const char = String.fromCodePoint(glyph.unicode);
        glyphsHtml.push(`
          <div class="flex flex-col items-center justify-center p-3 border border-surface-100 rounded-xl hover:bg-surface-50 transition-all group cursor-default" title="U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}">
            <div style="font-family: '${fontId}'; font-size: 28px;" class="text-surface-900 group-hover:scale-125 transition-transform duration-200">${escapeHtml(char)}</div>
            <div class="text-[9px] font-mono text-surface-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">U+${glyph.unicode.toString(16).toUpperCase().padStart(4, '0')}</div>
          </div>
        `);
      }
    }

    const renderMetaRow = (label, value) => `
      <div class="flex justify-between items-center py-2.5 border-b border-surface-50 last:border-0">
        <span class="text-xs font-medium text-surface-400">${escapeHtml(label)}</span>
        <span class="text-xs text-surface-700 font-semibold truncate ml-4" title="${escapeHtml(String(value))}">${escapeHtml(String(value))}</span>
      </div>
    `;

    const html = `
      <div class="p-6 bg-white">
        <!-- File Info Bar -->
        <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-6 border border-surface-100">
          <div class="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center text-white shrink-0 shadow-sm">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div class="flex flex-col truncate">
            <span class="font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
            <span class="text-xs text-surface-500">${formatSize(file.size)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div class="lg:col-span-2 space-y-8">
            <!-- Type Tester / Preview -->
            <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100 flex items-center justify-between bg-surface-50/50">
                <h3 class="text-xs font-bold text-surface-500 uppercase tracking-widest">Type Tester</h3>
                <div class="flex items-center gap-4">
                   <input type="range" id="font-size-slider" min="12" max="144" value="48" class="w-32 accent-brand-500 cursor-pointer">
                   <span id="font-size-val" class="text-xs font-mono text-surface-600 w-12 text-right">48px</span>
                </div>
              </div>
              <div class="p-8">
                <textarea id="preview-text" class="w-full border-none focus:ring-0 resize-none overflow-hidden p-0 text-surface-900 bg-transparent leading-tight placeholder-surface-300" 
                  style="font-family: '${fontId}'; font-size: 48px; min-height: 200px;"
                  spellcheck="false" placeholder="Type something to test the font...">The quick brown fox jumps over the lazy dog. 1234567890 & @ ! ?</textarea>
              </div>
            </div>

            <!-- Character Map -->
            <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                <h3 class="text-xs font-bold text-surface-500 uppercase tracking-widest">Character Map</h3>
                <span class="text-[10px] bg-surface-200 text-surface-600 px-2 py-0.5 rounded-full font-bold uppercase">${font.numGlyphs} Glyphs</span>
              </div>
              <div class="p-6 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 max-h-[500px] overflow-auto">
                ${glyphsHtml.join('')}
                ${font.numGlyphs > maxGlyphs ? `<div class="col-span-full py-6 text-center text-xs text-surface-400 border-t border-dashed border-surface-100 mt-4">Showing first ${maxGlyphs} glyphs only</div>` : ''}
              </div>
            </div>
          </div>

          <div class="space-y-8">
            <!-- Metadata Panel -->
            <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50">
                <h3 class="text-xs font-bold text-surface-500 uppercase tracking-widest">Metadata</h3>
              </div>
              <div class="p-4">
                ${renderMetaRow('Family', fontName)}
                ${renderMetaRow('Style', fontSubfamily)}
                ${renderMetaRow('Version', getName(font.names.version))}
                ${renderMetaRow('Designer', getName(font.names.designer))}
                ${renderMetaRow('Manufacturer', getName(font.names.manufacturer))}
                ${renderMetaRow('Copyright', getName(font.names.copyright))}
                ${renderMetaRow('License', getName(font.names.license))}
                ${renderMetaRow('Units/Em', font.unitsPerEm)}
              </div>
            </div>

            <!-- CSS Snippet Panel -->
            <div class="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm">
              <div class="p-4 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                <h3 class="text-xs font-bold text-surface-500 uppercase tracking-widest">Web Implementation</h3>
                <button id="copy-css-inner" class="text-[10px] bg-brand-50 text-brand-600 hover:bg-brand-100 px-2.5 py-1 rounded-lg font-bold transition-colors">COPY</button>
              </div>
              <div class="p-4">
                <pre id="css-pre" class="text-[10px] font-mono text-surface-600 bg-surface-50 p-4 rounded-xl overflow-x-auto border border-surface-100 leading-relaxed">${escapeHtml(cssSnippet)}</pre>
                <p class="text-[10px] text-surface-400 mt-3 leading-relaxed">Add this to your CSS file to use this font on your website.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Wire up interactivity
    const renderEl = helpers.getRenderEl();
    const slider = renderEl.querySelector('#font-size-slider');
    const preview = renderEl.querySelector('#preview-text');
    const sizeVal = renderEl.querySelector('#font-size-val');
    const copyBtn = renderEl.querySelector('#copy-css-inner');

    if (slider && preview && sizeVal) {
      slider.oninput = function() {
        const val = this.value;
        preview.style.fontSize = val + 'px';
        sizeVal.textContent = val + 'px';
      };
    }

    if (copyBtn) {
      copyBtn.onclick = function() {
        helpers.copyToClipboard(cssSnippet, this);
      };
    }
    
    // Auto-resize textarea for preview
    if (preview) {
      const adjustHeight = () => {
        preview.style.height = 'auto';
        preview.style.height = Math.max(200, preview.scrollHeight) + 'px';
      };
      preview.oninput = adjustHeight;
      // Slight delay to ensure initial height is correct after rendering
      setTimeout(adjustHeight, 50);
    }
  }
})();
