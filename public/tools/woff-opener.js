(function() {
  'use strict';

  /**
   * OmniOpener — WOFF Font Viewer
   * A production-perfect tool for inspecting and testing WOFF fonts.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    let currentObjectUrl = null;
    let currentStyleEl = null;

    function cleanup() {
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
      }
      if (currentStyleEl && currentStyleEl.parentNode) {
        currentStyleEl.parentNode.removeChild(currentStyleEl);
        currentStyleEl = null;
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.woff',
      dropLabel: 'Drop a .woff font here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');
      },
      onDestroy: function() {
        cleanup();
      },
      onFile: function _onFile(file, content, helpers) {
        // B1, B4: Ensure library is loaded
        if (typeof opentype === 'undefined') {
          helpers.showLoading('Initializing font engine...');
          setTimeout(function() { _onFile(file, content, helpers); }, 300);
          return;
        }

        cleanup();
        helpers.showLoading('Parsing font glyphs and metadata...');

        try {
          // opentype.parse supports ArrayBuffer directly
          const font = opentype.parse(content);
          
          if (!font || !font.supported) {
            throw new Error('Unsupported or invalid font format');
          }

          renderFont(font, file, content, helpers);
        } catch (err) {
          console.error('[WOFF Opener Error]', err);
          helpers.showError(
            'Could not open woff file',
            'The file may be corrupted, encrypted, or in an unsupported WOFF2 variant. Try a standard WOFF file.'
          );
        }
      },
      actions: [
        {
          label: '📋 Copy CSS',
          id: 'copy-css',
          primary: true,
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state && state.cssSnippet) {
              helpers.copyToClipboard(state.cssSnippet, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download-woff',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'font/woff');
          }
        }
      ]
    });

    function renderFont(font, file, buffer, helpers) {
      const fontId = 'font-' + Math.random().toString(36).substring(2, 9);
      const blob = new Blob([buffer], { type: 'font/woff' });
      currentObjectUrl = URL.createObjectURL(blob);

      // Inject @font-face
      currentStyleEl = document.createElement('style');
      currentStyleEl.textContent = `
        @font-face {
          font-family: "${fontId}";
          src: url("${currentObjectUrl}") format("woff");
        }
      `;
      document.head.appendChild(currentStyleEl);

      const getName = (obj) => {
        if (!obj) return 'Unknown';
        if (typeof obj === 'string') return obj;
        return obj.en || obj[Object.keys(obj)[0]] || 'Unknown';
      };

      const familyName = getName(font.names.fontFamily);
      const subFamily = getName(font.names.fontSubfamily);
      const fullName = getName(font.names.fullName) || `${familyName} ${subFamily}`;
      const cssSnippet = `@font-face {\n  font-family: '${familyName.replace(/'/g, "\\'")}';\n  src: url('${file.name}') format('woff');\n}`;

      helpers.setState({ cssSnippet });

      // Build Glyph Grid
      const glyphs = [];
      const maxGlyphs = 400;
      let glyphCount = 0;

      for (let i = 0; i < font.numGlyphs && glyphCount < maxGlyphs; i++) {
        const glyph = font.glyphs.get(i);
        if (glyph.unicode) {
          glyphCount++;
          const hex = 'U+' + glyph.unicode.toString(16).toUpperCase().padStart(4, '0');
          const char = String.fromCodePoint(glyph.unicode);
          glyphs.push(`
            <div class="group flex flex-col items-center justify-center p-3 rounded-xl border border-surface-200 bg-white hover:border-brand-300 hover:shadow-sm transition-all cursor-default" title="${hex}">
              <div class="text-3xl text-surface-900 group-hover:scale-110 transition-transform" style="font-family: '${fontId}'">${escapeHtml(char)}</div>
              <div class="mt-2 text-[10px] font-mono text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity">${hex}</div>
            </div>
          `);
        }
      }

      const meta = [
        { label: 'Family', value: familyName },
        { label: 'Subfamily', value: subFamily },
        { label: 'Version', value: getName(font.names.version) },
        { label: 'Designer', value: getName(font.names.designer) },
        { label: 'Manufacturer', value: getName(font.names.manufacturer) },
        { label: 'Copyright', value: getName(font.names.copyright) },
        { label: 'License', value: getName(font.names.license) },
        { label: 'Units Per Em', value: font.unitsPerEm }
      ].filter(m => m.value && m.value !== 'Unknown');

      const html = `
        <div class="max-w-6xl mx-auto p-4 md:p-6">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">WOFF Font</span>
            <span class="ml-auto text-[10px] uppercase tracking-wider font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">Production Ready</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left Column: Preview & Glyphs -->
            <div class="lg:col-span-8 space-y-6">
              <!-- Type Tester -->
              <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                  <h3 class="font-semibold text-surface-800">Type Tester</h3>
                  <div class="flex items-center gap-4">
                    <input type="range" id="size-slider" min="12" max="120" value="48" class="w-24 md:w-40 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                    <span id="size-label" class="text-xs font-mono text-surface-500 w-10 text-right">48px</span>
                  </div>
                </div>
                <div class="p-6 md:p-10">
                  <textarea id="tester-input" spellcheck="false" 
                    class="w-full bg-transparent border-none focus:ring-0 p-0 resize-none text-surface-900 leading-tight placeholder-surface-300" 
                    style="font-family: '${fontId}'; font-size: 48px; min-height: 180px;"
                    placeholder="Type something to preview the font...">The quick brown fox jumps over the lazy dog.</textarea>
                </div>
              </div>

              <!-- U10: Character Map Header -->
              <div class="flex items-center justify-between mb-3 px-1">
                <h3 class="font-semibold text-surface-800">Character Map</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${font.numGlyphs} Glyphs</span>
              </div>
              
              <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                ${glyphs.join('')}
                ${font.numGlyphs > maxGlyphs ? `
                  <div class="col-span-full py-8 text-center bg-surface-50 rounded-xl border border-dashed border-surface-200 mt-4">
                    <p class="text-sm text-surface-500 font-medium">Showing first ${maxGlyphs} glyphs</p>
                    <p class="text-xs text-surface-400 mt-1">This limit ensures smooth browser performance</p>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Right Column: Metadata & Implementation -->
            <div class="lg:col-span-4 space-y-6">
              <!-- Metadata Card -->
              <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50">
                  <h3 class="font-semibold text-surface-800">Font Information</h3>
                </div>
                <div class="p-5 space-y-4">
                  ${meta.map(m => `
                    <div>
                      <div class="text-[10px] uppercase tracking-wider font-bold text-surface-400 mb-1">${escapeHtml(m.label)}</div>
                      <div class="text-sm text-surface-700 break-words leading-relaxed">${escapeHtml(m.value)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Implementation Card -->
              <div class="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
                <div class="px-5 py-4 border-b border-surface-100 bg-surface-50/50 flex items-center justify-between">
                  <h3 class="font-semibold text-surface-800">Web Usage</h3>
                  <button id="copy-btn-inner" class="text-[10px] font-bold bg-brand-50 text-brand-600 px-2 py-1 rounded hover:bg-brand-100 transition-colors">COPY CSS</button>
                </div>
                <div class="p-5">
                  <!-- U8: Code Block -->
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">${escapeHtml(cssSnippet)}</pre>
                  </div>
                  <p class="mt-4 text-xs text-surface-500 leading-relaxed">
                    Add this declaration to your stylesheet to reference this WOFF file in your project.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      helpers.render(html);

      const root = helpers.getRenderEl();
      const slider = root.querySelector('#size-slider');
      const label = root.querySelector('#size-label');
      const input = root.querySelector('#tester-input');
      const copyBtn = root.querySelector('#copy-btn-inner');

      if (slider && label && input) {
        slider.addEventListener('input', function() {
          const val = this.value;
          label.textContent = val + 'px';
          input.style.fontSize = val + 'px';
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          helpers.copyToClipboard(cssSnippet, this);
        });
      }

      // Auto-resize for textarea
      if (input) {
        const resize = () => {
          input.style.height = 'auto';
          input.style.height = Math.max(180, input.scrollHeight) + 'px';
        };
        input.addEventListener('input', resize);
        setTimeout(resize, 100);
      }
    }
  };
})();
