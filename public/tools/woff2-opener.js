(function() {
  'use strict';

  /**
   * OmniOpener — WOFF2 Font Viewer
   * A production-grade tool for inspecting and testing WOFF2 web fonts.
   */

  let currentUrl = null;
  let currentStyleId = null;
  let currentFontId = null;

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

  function cleanup() {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
    if (currentStyleId) {
      const el = document.getElementById(currentStyleId);
      if (el) el.remove();
      currentStyleId = null;
    }
    if (currentFontId) {
      // Browsers don't have a direct "remove font by family name" from document.fonts easily
      // but removing the @font-face style tag usually suffices for GC.
      currentFontId = null;
    }
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.woff2',
      dropLabel: 'Drop a .woff2 font file here',
      binary: true,
      onFile: function _onFile(file, content, helpers) {
        if (!content || content.byteLength === 0) {
          helpers.showError('Empty Font File', 'The uploaded WOFF2 file contains no data.');
          return;
        }

        helpers.showLoading('Preparing font preview...');
        
        // Use a small timeout to ensure loading state is visible
        setTimeout(function() {
          renderWoff2(file, content, helpers).catch(err => {
            console.error(err);
            helpers.showError('Rendering Failed', 'Could not process the WOFF2 font file. It may be corrupted or use an unsupported feature.');
          });
        }, 50);
      },
      onDestroy: cleanup,
      actions: [
        {
          label: '📋 Copy CSS',
          id: 'copy-css',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (state && state.cssSnippet) {
              helpers.copyToClipboard(state.cssSnippet, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'download-woff2',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'font/woff2');
          }
        }
      ]
    });
  };

  async function renderWoff2(file, buffer, helpers) {
    cleanup();

    const fontId = 'omni-font-' + Math.random().toString(36).substring(2, 9);
    const blob = new Blob([buffer], { type: 'font/woff2' });
    const url = URL.createObjectURL(blob);
    currentUrl = url;
    currentFontId = fontId;

    // Load font via FontFace API
    const fontFace = new FontFace(fontId, buffer);
    try {
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch (e) {
      console.warn('FontFace API failed, falling back to CSS injection:', e);
    }

    // Inject @font-face for CSS usage
    const styleId = 'omni-woff2-style-' + fontId;
    currentStyleId = styleId;
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      @font-face {
        font-family: "${fontId}";
        src: url("${url}") format("woff2");
        font-display: swap;
      }
    `;
    document.head.appendChild(styleEl);

    const fontName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const cssSnippet = `@font-face {\n  font-family: '${fontName}';\n  src: url('${file.name}') format('woff2');\n  font-display: swap;\n}`;
    
    helpers.setState({ fontId, cssSnippet });

    // U1 File Info Bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">WOFF2 Web Font</span>
      </div>
    `;

    // Hex Inspector (U7/U10)
    const bytes = new Uint8Array(buffer);
    const hexLimit = 256; // Limit for performance
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
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors font-mono text-[10px]">
          <td class="px-4 py-1 text-surface-400 border-b border-surface-100 select-none">${i.toString(16).toUpperCase().padStart(6, '0')}</td>
          <td class="px-4 py-1 text-brand-600 border-b border-surface-100">${escapeHtml(rowHex)}</td>
          <td class="px-4 py-1 text-surface-500 border-b border-surface-100 border-l border-surface-100">${escapeHtml(rowAscii)}</td>
        </tr>
      `;
    }

    const hexView = `
      <div class="mb-8">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Binary Header</h3>
          <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">First ${Math.min(bytes.length, hexLimit)} bytes</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="px-4 py-2 text-left font-semibold text-surface-700 border-b border-surface-200">Offset</th>
                <th class="px-4 py-2 text-left font-semibold text-surface-700 border-b border-surface-200">Hex</th>
                <th class="px-4 py-2 text-left font-semibold text-surface-700 border-b border-surface-200 border-l border-surface-200">ASCII</th>
              </tr>
            </thead>
            <tbody>${hexRows}</tbody>
          </table>
        </div>
      </div>
    `;

    // Character Map (U9/U10)
    const charGroups = [
      { name: 'Uppercase', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
      { name: 'Lowercase', chars: 'abcdefghijklmnopqrstuvwxyz' },
      { name: 'Numbers', chars: '0123456789' },
      { name: 'Symbols', chars: '!@#$%^&*()_+-=[]{}\\|;:\'",.<>/?`~' }
    ];
    
    let glyphsHtml = '';
    charGroups.forEach(group => {
      glyphsHtml += `
        <div class="glyph-group mb-6">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">${group.name}</h4>
          </div>
          <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
            ${Array.from(group.chars).map(c => `
              <div class="glyph-card rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-md transition-all bg-white flex flex-col items-center justify-center group cursor-default" data-char="${escapeHtml(c)}">
                <div style="font-family: '${fontId}';" class="text-2xl text-surface-900 group-hover:scale-125 transition-transform duration-200">${escapeHtml(c)}</div>
                <div class="text-[9px] text-surface-400 mt-2 font-mono">U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    // Waterfall
    const waterfallSizes = [12, 14, 16, 20, 24, 32, 48, 64];
    const waterfallHtml = waterfallSizes.map(sz => `
      <div class="py-3 border-b border-surface-100 last:border-0">
        <div class="text-[10px] font-bold text-surface-400 mb-1">${sz}px</div>
        <div style="font-family: '${fontId}'; font-size: ${sz}px;" class="text-surface-800 leading-tight truncate">
          The quick brown fox jumps over the lazy dog.
        </div>
      </div>
    `).join('');

    const html = `
      <div class="p-6 max-w-7xl mx-auto">
        ${infoBar}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-8">
            
            <!-- Type Tester -->
            <div class="rounded-2xl border border-surface-200 overflow-hidden shadow-sm bg-white">
              <div class="px-4 py-3 border-b border-surface-100 bg-surface-50 flex items-center justify-between flex-wrap gap-3">
                <h3 class="font-semibold text-surface-800 text-sm">Interactive Preview</h3>
                <div class="flex items-center gap-4">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold text-surface-500 uppercase">Size</span>
                    <input type="range" id="preview-size" min="12" max="144" value="48" class="w-24 accent-brand-500 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer">
                    <span id="preview-size-val" class="text-xs font-mono text-surface-600 min-w-[35px]">48px</span>
                  </div>
                </div>
              </div>
              <div id="preview-container" class="p-8 min-h-[200px] transition-colors duration-300">
                <div class="flex flex-wrap gap-2 mb-6">
                  <button class="pangram-btn px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600 transition-colors" data-text="The quick brown fox jumps over the lazy dog.">Pangram 1</button>
                  <button class="pangram-btn px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600 transition-colors" data-text="Pack my box with five dozen liquor jugs.">Pangram 2</button>
                  <button class="pangram-btn px-2 py-1 text-[10px] rounded-md bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-600 transition-colors" data-text="Jackdaws love my big sphinx of quartz.">Pangram 3</button>
                </div>
                <textarea id="tester-input" class="w-full border-none focus:ring-0 resize-none p-0 bg-transparent leading-tight text-surface-900 outline-none" 
                  style="font-family: '${fontId}'; font-size: 48px;"
                  spellcheck="false">The quick brown fox jumps over the lazy dog.</textarea>
              </div>
              <div class="px-4 py-2 border-t border-surface-100 bg-surface-50 flex justify-end gap-2">
                <button id="bg-light" title="Light Theme" class="p-1.5 rounded-lg bg-white shadow-sm border border-surface-200 text-surface-600 transition-all hover:scale-105 active:scale-95"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"/></svg></button>
                <button id="bg-dark" title="Dark Theme" class="p-1.5 rounded-lg bg-surface-800 border border-surface-700 text-surface-400 hover:text-white transition-all hover:scale-105 active:scale-95"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg></button>
              </div>
            </div>

            <!-- Glyph Map -->
            <div>
              <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 class="font-semibold text-surface-800">Glyph Map</h3>
                <div class="relative">
                  <input type="text" id="glyph-search" placeholder="Filter glyphs..." class="text-xs px-3 py-1.5 rounded-lg border border-surface-200 focus:border-brand-300 focus:ring-1 focus:ring-brand-300 outline-none w-48 transition-all">
                  <svg class="w-3 h-3 absolute right-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
              <div id="glyphs-container">
                ${glyphsHtml}
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="space-y-8">
            <!-- Waterfall -->
            <div class="rounded-2xl border border-surface-200 p-5 shadow-sm bg-white">
              <h3 class="font-semibold text-surface-800 mb-4 text-sm">Waterfall</h3>
              <div class="space-y-1">
                ${waterfallHtml}
              </div>
            </div>

            <!-- CSS Implementation -->
            <div class="rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
              <div class="px-4 py-3 border-b border-surface-100 bg-surface-50 flex items-center justify-between">
                <h3 class="font-semibold text-surface-800 text-sm">Implementation</h3>
                <button id="copy-css-badge" class="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded hover:bg-brand-100 transition-colors">COPY</button>
              </div>
              <pre class="p-4 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed border-t border-gray-800">${escapeHtml(cssSnippet)}</pre>
            </div>

            ${hexView}

            <!-- About WOFF2 -->
            <div class="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 border border-brand-100">
              <h4 class="text-brand-900 font-bold text-sm mb-2 flex items-center gap-2">
                <svg class="w-4 h-4 text-brand-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                Format Info
              </h4>
              <p class="text-[11px] text-brand-800 leading-relaxed">
                WOFF2 is the successor to WOFF, offering ~30% better compression via Brotli. It is supported by all modern browsers and is the preferred format for web performance.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Setup Interactivity
    const el = helpers.getRenderEl();
    const tester = el.querySelector('#tester-input');
    const sizeSlider = el.querySelector('#preview-size');
    const sizeVal = el.querySelector('#preview-size-val');
    const previewContainer = el.querySelector('#preview-container');
    const glyphSearch = el.querySelector('#glyph-search');
    
    // Auto-resize textarea
    const resizeTester = () => {
      if (!tester) return;
      tester.style.height = 'auto';
      tester.style.height = tester.scrollHeight + 'px';
    };

    if (tester) {
      tester.oninput = resizeTester;
      setTimeout(resizeTester, 100);
    }

    if (sizeSlider && tester && sizeVal) {
      sizeSlider.oninput = function() {
        const px = this.value + 'px';
        tester.style.fontSize = px;
        sizeVal.textContent = px;
        resizeTester();
      };
    }

    el.querySelectorAll('.pangram-btn').forEach(btn => {
      btn.onclick = () => {
        tester.value = btn.dataset.text;
        resizeTester();
      };
    });

    const btnLight = el.querySelector('#bg-light');
    const btnDark = el.querySelector('#bg-dark');
    if (btnLight && btnDark && previewContainer) {
      btnLight.onclick = () => {
        previewContainer.classList.remove('bg-surface-900');
        previewContainer.classList.add('bg-white');
        tester.classList.remove('text-white');
        tester.classList.add('text-surface-900');
        btnLight.classList.add('bg-white', 'shadow-sm', 'border-surface-200', 'text-surface-600');
        btnDark.classList.remove('bg-surface-700', 'text-white');
        btnDark.classList.add('bg-surface-800', 'text-surface-400');
      };
      btnDark.onclick = () => {
        previewContainer.classList.remove('bg-white');
        previewContainer.classList.add('bg-surface-900');
        tester.classList.remove('text-surface-900');
        tester.classList.add('text-white');
        btnDark.classList.add('bg-surface-700', 'text-white');
        btnDark.classList.remove('bg-surface-800', 'text-surface-400');
        btnLight.classList.remove('bg-white', 'shadow-sm', 'border-surface-200', 'text-surface-600');
      };
    }

    if (glyphSearch) {
      glyphSearch.oninput = function() {
        const query = this.value.toLowerCase();
        el.querySelectorAll('.glyph-card').forEach(card => {
          const char = card.dataset.char.toLowerCase();
          const visible = char.includes(query);
          card.style.display = visible ? '' : 'none';
        });
        
        // Hide groups with no visible children
        el.querySelectorAll('.glyph-group').forEach(group => {
          const hasVisible = Array.from(group.querySelectorAll('.glyph-card')).some(c => c.style.display !== 'none');
          group.style.display = hasVisible ? '' : 'none';
        });
      };
    }

    const copyBadge = el.querySelector('#copy-css-badge');
    if (copyBadge) {
      copyBadge.onclick = (e) => helpers.copyToClipboard(cssSnippet, e.target);
    }
  }
})();
