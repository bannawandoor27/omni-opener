/**
 * OmniOpener — EOT (Embedded OpenType) Font Viewer
 * A high-performance tool for inspecting and previewing legacy EOT fonts.
 * Uses fonteditor-core to enable rendering in modern browsers.
 */
(function () {
  'use strict';

  // Helper: Escape HTML (B6)
  function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  // Helper: Format Bytes (U1)
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes || isNaN(bytes)) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let fontStyleEl = null;
    let previewUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.eot',
      dropLabel: 'Drop an EOT font file here',
      infoHtml: '<strong>Privacy:</strong> All processing is done locally in your browser. Legacy EOT fonts are converted to TTF on-the-fly for modern browser preview.',

      onInit: function (h) {
        // Pre-load fonteditor-core for instant processing
        if (typeof fonteditor === 'undefined') {
          return h.loadScript('https://cdn.jsdelivr.net/npm/fonteditor-core@2.1.11/dist/fonteditor.min.js');
        }
      },

      onFile: function _onFileHandler(file, content, h) {
        // Ensure dependencies are loaded
        if (typeof fonteditor === 'undefined') {
          h.showLoading('Loading font engine...');
          h.loadScript('https://cdn.jsdelivr.net/npm/fonteditor-core@2.1.11/dist/fonteditor.min.js', function() {
            if (typeof fonteditor !== 'undefined') _onFileHandler(file, content, h);
            else h.showError('Engine Load Failed', 'Could not load the font processing engine.');
          });
          return;
        }

        processFont(file, content, h);
      },

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const info = h.getState().fontInfo;
            if (info) h.copyToClipboard(JSON.stringify(info, null, 2), btn);
          }
        },
        {
          label: '📥 Download TTF',
          id: 'dl-ttf',
          onClick: function (h) {
            const state = h.getState();
            if (state.ttfBuffer) {
              const name = h.getFile().name.replace(/\.eot$/i, '') + '.ttf';
              h.download(name, state.ttfBuffer, 'font/ttf');
            }
          }
        },
        {
          label: '📥 Save EOT',
          id: 'dl-eot',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/vnd.ms-fontobject');
          }
        }
      ],

      onDestroy: function () {
        if (fontStyleEl) fontStyleEl.remove();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      }
    });

    async function processFont(file, content, h) {
      h.showLoading('Analyzing font data...');
      
      // Cleanup previous state
      if (fontStyleEl) { fontStyleEl.remove(); fontStyleEl = null; }
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }

      try {
        const Font = fonteditor.Font;
        let font;
        
        try {
          font = Font.create(content, { type: 'eot' });
        } catch (e) {
          throw new Error('This file might be corrupted or uses an unsupported EOT compression method.');
        }

        const info = font.get().name;
        const ttfBuffer = font.get({ type: 'ttf' });
        
        // Calculate SHA-256 for the original file
        const hashBuf = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        h.setState({ 
          fontInfo: info, 
          hash: hashHex,
          ttfBuffer: ttfBuffer
        });

        // Inject font-face for preview using the converted TTF
        const fontId = 'omni-eot-' + Math.random().toString(36).substring(2, 10);
        const blob = new Blob([ttfBuffer], { type: 'font/ttf' });
        previewUrl = URL.createObjectURL(blob);

        fontStyleEl = document.createElement('style');
        fontStyleEl.textContent = `@font-face { font-family: "${fontId}"; src: url("${previewUrl}") format("truetype"); }`;
        document.head.appendChild(fontStyleEl);

        const sampleText = 'The quick brown fox jumps over the lazy dog.';
        const family = info.fontFamily || 'Unknown Font';
        const subFamily = info.fontSubfamily || 'Regular';

        h.render(`
          <div class="p-6 space-y-8 animate-in fade-in duration-500">
            <div class="flex flex-wrap items-center justify-between gap-4 border-b border-surface-200 pb-6">
              <div>
                <h3 class="text-2xl font-bold text-surface-900">${esc(file.name)}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-sm text-surface-500">${formatSize(file.size)}</span>
                  <span class="text-surface-300">·</span>
                  <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">EOT Font</span>
                </div>
              </div>
              <div class="text-right hidden sm:block">
                <div class="text-[10px] font-mono text-surface-400 uppercase tracking-widest">SHA-256 Hash</div>
                <div class="text-xs font-mono text-surface-600">${hashHex.slice(0, 16)}...</div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div class="space-y-4">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Metadata</h4>
                <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 space-y-3 text-sm">
                  <div class="flex justify-between items-center"><span class="text-surface-500">Family Name</span><span class="font-semibold text-surface-900">${esc(family)}</span></div>
                  <div class="flex justify-between items-center"><span class="text-surface-500">Subfamily</span><span class="text-surface-700 font-medium">${esc(subFamily)}</span></div>
                  <div class="flex justify-between items-center"><span class="text-surface-500">Full Name</span><span class="text-surface-700">${esc(info.fullName || family)}</span></div>
                  <div class="pt-2 border-t border-surface-200 flex justify-between items-center"><span class="text-surface-500">Version</span><span class="text-xs text-surface-500 italic">${esc(info.version || 'N/A')}</span></div>
                </div>
              </div>

              <div class="space-y-4">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Technical Properties</h4>
                <div class="bg-surface-50 rounded-2xl p-5 border border-surface-200 space-y-3 text-sm">
                  <div class="flex justify-between items-center"><span class="text-surface-500">PostScript Name</span><span class="font-mono text-xs text-surface-700">${esc(info.postScriptName || 'N/A')}</span></div>
                  <div class="flex justify-between items-center"><span class="text-surface-500">Designer</span><span class="text-surface-700 truncate max-w-[150px]">${esc(info.designer || 'N/A')}</span></div>
                  <div class="flex justify-between items-center"><span class="text-surface-500">Manufacturer</span><span class="text-surface-700 truncate max-w-[150px]">${esc(info.manufacturer || 'N/A')}</span></div>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Live Preview</h4>
                <div class="flex items-center gap-2">
                   <span class="text-[10px] text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded font-bold uppercase tracking-tighter">Auto-Converted to TTF</span>
                </div>
              </div>
              <div class="border border-surface-200 rounded-3xl bg-white p-8 md:p-12 space-y-10 overflow-hidden shadow-sm" style="font-family: '${fontId}', sans-serif;">
                <div class="text-6xl md:text-7xl leading-tight border-b border-surface-100 pb-8 text-surface-900">${esc(sampleText)}</div>
                <div class="text-4xl text-surface-800">${esc(sampleText)}</div>
                <div class="text-2xl text-surface-600">${esc(sampleText)}</div>
                <div class="text-base text-surface-500">${esc(sampleText)}</div>
                <div class="pt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-mono text-surface-400 bg-surface-50/50 p-6 rounded-2xl">
                  <div>ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
                  <div>abcdefghijklmnopqrstuvwxyz</div>
                  <div>0123456789 !@#$%^&*()_+</div>
                </div>
              </div>
            </div>

            <div class="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex gap-4">
              <div class="text-amber-500 text-xl">💡</div>
              <div class="text-xs text-amber-700 leading-relaxed">
                <strong>Legacy Compatibility:</strong> EOT (Embedded OpenType) was introduced by Microsoft in 1999 for Internet Explorer. Modern browsers no longer support it directly. This tool uses a client-side converter to transform the EOT data into a standard TrueType (TTF) font for display.
              </div>
            </div>
          </div>
        `);
      } catch (err) {
        console.error('[EOT Opener] Error:', err);
        h.showError('Parsing Failed', err.message);
      }
    }
  };
})();
