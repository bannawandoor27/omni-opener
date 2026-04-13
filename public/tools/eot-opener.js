/**
 * OmniOpener — EOT Font Viewer & Converter
 * Uses OmniTool SDK and fonteditor-core to parse and render Embedded OpenType fonts.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.eot',
      dropLabel: 'Drop an EOT font here',
      infoHtml: '<strong>Privacy:</strong> This tool parses your EOT font file locally in your browser. No font data is uploaded to any server.',

      actions: [
        {
          label: '📥 Download TTF',
          id: 'dl-ttf',
          onClick: function (h) {
            const font = h.getState().fontInstance;
            if (font) {
              try {
                const buffer = font.write({ type: 'ttf' });
                h.download(h.getFile().name.replace(/\.eot$/i, '.ttf'), buffer, 'font/ttf');
              } catch (err) {
                alert('Conversion failed: ' + err.message);
              }
            }
          }
        },
        {
          label: '📥 Download WOFF',
          id: 'dl-woff',
          onClick: function (h) {
            const font = h.getState().fontInstance;
            if (font) {
              try {
                const buffer = font.write({ type: 'woff' });
                h.download(h.getFile().name.replace(/\.eot$/i, '.woff'), buffer, 'font/woff');
              } catch (err) {
                alert('Conversion failed: ' + err.message);
              }
            }
          }
        },
        {
          label: '📥 Download SVG Font',
          id: 'dl-svg',
          onClick: function (h) {
            const font = h.getState().fontInstance;
            if (font) {
              try {
                const buffer = font.write({ type: 'svg' });
                h.download(h.getFile().name.replace(/\.eot$/i, '.svg'), buffer, 'image/svg+xml');
              } catch (err) {
                alert('Conversion failed: ' + err.message);
              }
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
          'https://cdn.jsdelivr.net/npm/fonteditor-core@2.1.11/dist/fonteditor.min.js'
        ]);
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing font file…');
        // Delay to ensure scripts are initialized and UI updates
        setTimeout(function () {
          try {
            renderEot(content, h);
          } catch (err) {
            console.error(err);
            h.showError('Failed to parse EOT font', 'The file might be corrupted, protected, or in an unsupported compression format (e.g., MicroType Express).');
          }
        }, 300);
      }
    });
  };

  /**
   * Render the EOT font preview and metadata
   */
  function renderEot(buffer, h) {
    if (!window.fonteditor) {
      throw new Error('Font editor library not loaded.');
    }

    const Font = window.fonteditor.Font;
    // Create font instance from EOT buffer
    const font = Font.create(buffer, { 
      type: 'eot',
      hinting: true,
      compound2simple: true
    });
    
    h.setState('fontInstance', font);

    const data = font.get();
    const name = data.name || {};
    
    // Convert to WOFF for browser preview
    const woffBuffer = font.write({ type: 'woff' });
    const blob = new Blob([woffBuffer], { type: 'font/woff' });
    const url = URL.createObjectURL(blob);
    
    // Inject @font-face rule
    const fontId = 'font-' + Math.random().toString(36).slice(2, 9);
    const style = document.createElement('style');
    style.id = 'omni-font-preview-style';
    style.textContent = `
      @font-face {
        font-family: "${fontId}";
        src: url("${url}") format("woff");
      }
      .font-preview-${fontId} {
        font-family: "${fontId}", sans-serif !important;
      }
    `;
    
    // Cleanup old styles if any
    const oldStyle = document.getElementById('omni-font-preview-style');
    if (oldStyle) oldStyle.remove();
    document.head.appendChild(style);

    // Build HTML UI
    let html = `
      <div class="p-6 space-y-10">
        <header class="border-b border-surface-100 pb-6">
          <h2 class="text-3xl font-bold text-surface-900">${name.fontFamily || 'Unknown Font'}</h2>
          <div class="flex flex-wrap gap-3 mt-2 text-sm text-surface-500">
            <span class="bg-surface-100 px-2 py-0.5 rounded">${name.fontSubFamily || 'Regular'}</span>
            <span>•</span>
            <span>${data.glyf.length} Glyphs</span>
            <span>•</span>
            <span>Version ${name.version || '1.0'}</span>
          </div>
        </header>

        <section>
          <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-6">Type Specimen</h3>
          <div class="space-y-6 font-preview-${fontId} leading-tight text-surface-800">
            <p class="text-5xl truncate">The quick brown fox jumps over the lazy dog</p>
            <p class="text-3xl truncate">The quick brown fox jumps over the lazy dog</p>
            <p class="text-xl truncate">Pack my box with five dozen liquor jugs</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
              <p class="text-lg break-all">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz</p>
              <p class="text-lg break-all">0123456789<br>!@#$%^&*()_+-=[]{}|;:,.<>?</p>
            </div>
          </div>
        </section>

        <section>
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest">Glyph Map</h3>
            <span class="text-xs text-surface-400 italic">Showing first 200 glyphs</span>
          </div>
          <div class="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-3 font-preview-${fontId}">
            ${data.glyf.slice(0, 200).map(g => {
              if (!g.unicode || g.unicode.length === 0) return '';
              const char = String.fromCharCode(g.unicode[0]);
              // Basic sanitization for rendering
              if (g.unicode[0] < 32) return ''; 
              
              return `
                <div class="aspect-square border border-surface-100 rounded-lg flex flex-col items-center justify-center hover:border-brand-300 hover:bg-brand-50 transition-all group cursor-default" title="U+${g.unicode[0].toString(16).toUpperCase()}">
                  <span class="text-2xl group-hover:scale-125 transition-transform">${char}</span>
                  <span class="text-[9px] text-surface-300 mt-1 font-sans uppercase">${g.unicode[0].toString(16).padStart(4, '0')}</span>
                </div>
              `;
            }).join('')}
            ${data.glyf.length > 200 ? `
              <div class="aspect-square flex items-center justify-center text-xs text-surface-400 bg-surface-50 rounded-lg">
                +${data.glyf.length - 200}
              </div>
            ` : ''}
          </div>
        </section>

        <section class="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-surface-100">
           <div>
             <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Metadata</h3>
             <dl class="text-sm space-y-3">
               <div class="flex flex-col">
                 <dt class="text-xs text-surface-400 font-medium">Full Name</dt>
                 <dd class="text-surface-700 font-semibold">${name.fullName || '-'}</dd>
               </div>
               <div class="flex flex-col">
                 <dt class="text-xs text-surface-400 font-medium">PostScript Name</dt>
                 <dd class="text-surface-700 font-mono text-xs">${name.postScriptName || '-'}</dd>
               </div>
               <div class="flex flex-col">
                 <dt class="text-xs text-surface-400 font-medium">Unique Identifier</dt>
                 <dd class="text-surface-500 text-xs break-all">${name.uniqueSubFamilyId || '-'}</dd>
               </div>
             </dl>
           </div>
           <div>
             <h3 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4">Copyright & Licensing</h3>
             <div class="bg-surface-50 rounded-xl p-4">
               <p class="text-xs text-surface-600 leading-relaxed italic">
                 ${name.copyright || 'No copyright information found in the font header.'}
               </p>
               ${name.manufacturer ? `<p class="text-xs text-surface-400 mt-2 font-medium">Produced by: ${name.manufacturer}</p>` : ''}
             </div>
           </div>
        </section>
      </div>
    `;

    h.render(html);
  }
})();
