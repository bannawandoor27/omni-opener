(function() {
  'use strict';

  /**
   * OmniOpener — WOFF2 Font Viewer
   * A production-grade tool for inspecting and testing WOFF2 web fonts.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.woff2',
      dropLabel: 'Drop a .woff2 font file here',
      binary: true,
      onFile: async function(file, content, helpers) {
        if (!content || content.byteLength === 0) {
          helpers.showError('Empty File', 'The uploaded WOFF2 file contains no data.');
          return;
        }

        helpers.showLoading('Parsing font and generating previews...');
        
        try {
          // Cleanup old resources if they exist from a previous drop
          const oldState = helpers.getState();
          if (oldState && oldState.url) {
            URL.revokeObjectURL(oldState.url);
            const oldStyle = document.getElementById(oldState.styleId);
            if (oldStyle) oldStyle.remove();
          }

          await renderWoff2(file, content, helpers);
        } catch (e) {
          console.error(e);
          helpers.showError('Could not open WOFF2 file', 'The file may be corrupted or in an unsupported variant. Try another font file.');
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
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download-file',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'font/woff2');
          }
        }
      ],
      infoHtml: '<strong>Secure:</strong> Fonts are processed entirely in your browser using the FontFace API.'
    });
  };

  async function renderWoff2(file, buffer, helpers) {
    // 1. Setup FontFace
    const fontId = 'omni-font-' + Math.random().toString(36).substring(2, 9);
    const blob = new Blob([buffer], { type: 'font/woff2' });
    const url = URL.createObjectURL(blob);
    
    const fontFace = new FontFace(fontId, buffer);
    try {
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch (e) {
      console.warn('FontFace load failed, falling back to @font-face injection:', e);
    }

    // Inject @font-face for reliable rendering
    const styleId = 'omni-woff2-style-' + fontId;
    let styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      @font-face {
        font-family: "${fontId}";
        src: url("${url}") format("woff2");
        font-display: swap;
      }
    `;
    document.head.appendChild(styleEl);

    // 2. Prepare Metadata
    const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const cssSnippet = `@font-face {\n  font-family: '${fontName}';\n  src: url('${file.name}') format('woff2');\n  font-display: swap;\n}`;
    helpers.setState({ fontId, cssSnippet, url, styleId });

    // 3. Components
    
    // File Info Bar (U1)
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">WOFF2 Web Font</span>
      </div>
    `;

    // Hex Inspector (U7/U8/U10)
    const bytes = new Uint8Array(buffer);
    const hexLimit = 512;
    let hexRows = '';
    for (let i = 0; i < Math.min(bytes.length, hexLimit); i += 16) {
      let rowHex = '';
      let rowAscii = '';
      for (let j = 0; j < 16; j++) {
        const idx = i + j;
        if (idx < bytes.length) {
          const b = bytes[idx];
          rowHex += b.toString(16).toUpperCase().padStart(2, '0') + ' ';
          rowAscii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
        } else {
          rowHex += '   ';
        }
      }
      hexRows += `
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors font-mono text-[11px]">
          <td class="px-3 py-1 text-surface-400 border-b border-surface-100 select-none">${i.toString(16).toUpperCase().padStart(6, '0')}</td>
          <td class="px-3 py-1 text-brand-600 border-b border-surface-100">${escapeHtml(rowHex)}</td>
          <td class="px-3 py-1 text-surface-500 border-b border-surface-100 border-l border-surface-100">${escapeHtml(rowAscii)}</td>
        </tr>
      `;
    }

    const hexView = `
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Binary Inspector</h3>
          <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">First ${Math.min(bytes.length, hexLimit)} bytes</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm border-collapse">
            <thead>
              <tr class="bg-surface-50">
                <th class="px-3 py-2 text-left font-semibold text-surface-700 border-b border-surface-200 text-[10px] uppercase tracking-wider">Offset</th>
                <th class="px-3 py-2 text-left font-semibold text-surface-700 border-b border-surface-200 text-[10px] uppercase tracking-wider">Hex</th>
                <th class="px-3 py-2 text-left font-semibold text-surface-700 border-b border-surface-200 text-[10px] uppercase tracking-wider border-l border-surface-200">ASCII</th>
              </tr>
            </thead>
            <tbody>${hexRows}</tbody>
          </table>
        </div>
      </div>
    `;

    // Character Map (U9/U10)
    const charRanges = [
      { name: 'Uppercase', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
      { name: 'Lowercase', chars: 'abcdefghijklmnopqrstuvwxyz' },
      { name: 'Numbers', chars: '0123456789' },
      { name: 'Symbols', chars: '!@#$%^&*()_+-=[]{}\\|;:\'",.<>/?`~' }
    ];
    
    let charsHtml = '';
    charRanges.forEach(range => {
      charsHtml += `
        <div class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">${range.name}</h4>
            <span class="text-[10px] text-surface-300 font-mono">${range.chars.length} glyphs</span>
          </div>
          <div class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
            ${Array.from(range.chars).map(c => `
              <div class="rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-sm transition-all bg-white flex flex-col items-center justify-center group cursor-default" title="Character: ${c}">
                <div style="font-family: '${fontId}';" class="text-2xl text-surface-900 group-hover:scale-125 transition-transform duration-200">${escapeHtml(c)}</div>
                <div class="text-[9px] text-surface-400 mt-2 font-mono">U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    // Waterfall Preview
    const waterfallSizes = [12, 16, 24, 32, 48, 64];
    const waterfallHtml = waterfallSizes.map(sz => `
      <div class="py-3 border-b border-surface-100 last:border-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] font-bold text-surface-400">${sz}px</span>
        </div>
        <div style="font-family: '${fontId}'; font-size: ${sz}px;" class="text-surface-800 leading-tight truncate">
          The quick brown fox jumps over the lazy dog.
        </div>
      </div>
    `).join('');

    // Main Layout
    const html = `
      <div class="p-6 max-w-7xl mx-auto bg-white min-h-screen">
        ${infoBar}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Left Column: Type Tester & Waterfall -->
          <div class="lg:col-span-2 space-y-8">
            
            <!-- Interactive Type Tester -->
            <div class="rounded-2xl border border-surface-200 overflow-hidden shadow-sm bg-white">
              <div class="px-4 py-3 border-b border-surface-100 bg-surface-50 flex items-center justify-between">
                <h3 class="font-semibold text-surface-800 text-sm">Interactive Type Tester</h3>
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-surface-500 uppercase">Size</span>
                    <input type="range" id="size-slider" min="16" max="120" value="48" class="w-24 accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                    <span id="size-val" class="text-xs font-mono text-surface-600 min-w-[32px]">48px</span>
                  </div>
                </div>
              </div>
              <div id="preview-bg" class="p-8 transition-colors duration-300">
                <div class="flex flex-wrap gap-2 mb-4">
                  <button class="pangram-btn px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600 transition-colors" data-text="The quick brown fox jumps over the lazy dog.">Pangram 1</button>
                  <button class="pangram-btn px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600 transition-colors" data-text="Pack my box with five dozen liquor jugs.">Pangram 2</button>
                  <button class="pangram-btn px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600 transition-colors" data-text="How razorback-jumping frogs can level six piqued gymnasts.">Pangram 3</button>
                </div>
                <textarea id="main-tester" class="w-full border-none focus:ring-0 resize-none p-0 bg-transparent leading-tight text-surface-900 outline-none" 
                  style="font-family: '${fontId}'; font-size: 48px; min-height: 120px;"
                  spellcheck="false">The quick brown fox jumps over the lazy dog.</textarea>
              </div>
              <div class="px-4 py-2 border-t border-surface-100 bg-surface-50 flex justify-end gap-2">
                <button id="theme-light" class="p-1.5 rounded-lg bg-white shadow-sm border border-surface-200 text-surface-600"><svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"/></svg></button>
                <button id="theme-dark" class="p-1.5 rounded-lg bg-surface-800 border border-surface-700 text-surface-300 hover:text-white transition-colors"><svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg></button>
              </div>
            </div>

            <!-- Glyph Map -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-surface-800">Glyph Map</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">Primary Ranges</span>
              </div>
              ${charsHtml}
            </div>
          </div>

          <!-- Right Column: Info & Implementation -->
          <div class="space-y-8">
            
            <!-- Waterfall -->
            <div class="rounded-2xl border border-surface-200 p-5 shadow-sm bg-white">
              <h3 class="font-semibold text-surface-800 mb-4 text-sm">Size Waterfall</h3>
              <div class="space-y-1">
                ${waterfallHtml}
              </div>
            </div>

            <!-- CSS Snippet (U8) -->
            <div class="rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
              <div class="px-4 py-3 border-b border-surface-100 bg-surface-50 flex items-center justify-between">
                <h3 class="font-semibold text-surface-800 text-sm">CSS Implementation</h3>
                <button id="copy-css-mini" class="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded hover:bg-brand-100 transition-colors">COPY</button>
              </div>
              <div class="p-0">
                <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">${escapeHtml(cssSnippet)}</pre>
              </div>
            </div>

            ${hexView}

            <!-- Format Info Card -->
            <div class="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 border border-brand-100">
              <h4 class="text-brand-900 font-bold text-sm mb-2 flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                About WOFF2
              </h4>
              <p class="text-xs text-brand-800 leading-relaxed">
                Web Open Font Format 2 (WOFF2) uses the Brotli compression algorithm to provide significantly better compression (up to 30% smaller) than the original WOFF. It is the gold standard for web font delivery.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // 4. Interactivity
    const el = helpers.getRenderEl();
    const slider = el.querySelector('#size-slider');
    const sizeVal = el.querySelector('#size-val');
    const tester = el.querySelector('#main-tester');
    const previewBg = el.querySelector('#preview-bg');
    
    const themeLight = el.querySelector('#theme-light');
    const themeDark = el.querySelector('#theme-dark');
    const copyMini = el.querySelector('#copy-css-mini');

    const adjustHeight = () => {
      if (!tester) return;
      tester.style.height = 'auto';
      tester.style.height = tester.scrollHeight + 'px';
    };

    if (slider && tester && sizeVal) {
      slider.oninput = function() {
        const val = this.value + 'px';
        tester.style.fontSize = val;
        sizeVal.textContent = val;
        adjustHeight();
      };
    }

    if (tester) {
      tester.oninput = adjustHeight;
      setTimeout(adjustHeight, 100);
    }

    el.querySelectorAll('.pangram-btn').forEach(btn => {
      btn.onclick = () => {
        tester.value = btn.dataset.text;
        adjustHeight();
      };
    });

    if (themeLight && themeDark && previewBg && tester) {
      themeLight.onclick = () => {
        previewBg.classList.remove('bg-surface-900');
        previewBg.classList.add('bg-white');
        tester.classList.remove('text-white');
        tester.classList.add('text-surface-900');
        themeLight.classList.add('bg-white', 'shadow-sm', 'border-surface-200');
        themeDark.classList.remove('bg-surface-700', 'text-white');
      };
      themeDark.onclick = () => {
        previewBg.classList.remove('bg-white');
        previewBg.classList.add('bg-surface-900');
        tester.classList.remove('text-surface-900');
        tester.classList.add('text-white');
        themeDark.classList.add('bg-surface-700', 'text-white');
        themeLight.classList.remove('bg-white', 'shadow-sm', 'border-surface-200');
      };
    }

    if (copyMini) {
      copyMini.onclick = (e) => helpers.copyToClipboard(cssSnippet, e.target);
    }
  }
})();
