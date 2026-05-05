(function () {
  'use strict';

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B'; }

  window.initTool = function (toolConfig, mountEl) {
    let currentDoc = null;
    let currentPage = 1;
    let currentTab = 'preview';

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.djvu,.djv',
      dropLabel: 'Drop a DjVu file here',
      infoHtml: '<strong>Privacy:</strong> All DjVu processing happens 100% in your browser. No data is uploaded.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/gh/RussCoder/djvujs@0.5.4/dist/djvu.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing DjVu...');

        // Structural Analysis (Native)
        const bytes = new Uint8Array(content);
        const view = new DataView(content);
        const isDjVu = bytes.length >= 8 &&
                       bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x26 && bytes[3] === 0x54 && 
                       bytes[4] === 0x46 && bytes[5] === 0x4F && bytes[6] === 0x52 && bytes[7] === 0x4D;

        const chunks = [];
        if (isDjVu) {
          let offset = 16;
          while (offset + 8 <= bytes.length && chunks.length < 100) {
            const id = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
            const size = view.getUint32(offset + 4, false);
            chunks.push({ id, size, offset });
            offset += 8 + size + (size % 2);
          }
        }

        // Library Parsing
        try {
          if (typeof DjVu === 'undefined') {
            await new Promise((resolve) => {
              const check = () => {
                if (typeof DjVu !== 'undefined') resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          }
          currentDoc = new DjVu.Document(content);
          currentPage = 1;
        } catch (e) {
          console.error('DjVu.js Error:', e);
          // Fallback to structural only if library fails
        }

        renderMain(h, chunks, isDjVu, bytes);
      },

      actions: [
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        },
        {
          label: '🖼️ Save Page as PNG',
          id: 'save-png',
          onClick: function (h) {
            const canvas = document.getElementById('djvu-canvas');
            if (canvas) {
              const url = canvas.toDataURL('image/png');
              h.download(`page-${currentPage}.png`, url, 'image/png');
            }
          }
        }
      ]
    });

    function renderMain(h, chunks, isDjVu, bytes) {
      const file = h.getFile();
      const pagesCount = currentDoc ? currentDoc.pagesCount : 0;

      const html = `
        <div class="bg-white min-h-full font-sans">
          <!-- Header -->
          <div class="p-6 border-b border-surface-100 flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-2xl shadow-sm border border-brand-100">📖</div>
              <div>
                <h2 class="text-lg font-bold text-surface-900 leading-tight">${esc(file.name)}</h2>
                <p class="text-xs text-surface-400 font-medium">${fmtBytes(file.size)} • DjVu Document • ${pagesCount} Page${pagesCount === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div class="flex bg-surface-100 p-1 rounded-lg">
              <button id="tab-preview" class="px-4 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'preview' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">PREVIEW</button>
              <button id="tab-structure" class="px-4 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'structure' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">STRUCTURE</button>
              <button id="tab-hex" class="px-4 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'hex' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">HEX</button>
            </div>
          </div>

          <div id="tool-content" class="p-6">
            ${renderTabContent(chunks, isDjVu, bytes)}
          </div>
        </div>
      `;

      h.render(html);
      bindEvents(h, chunks, isDjVu, bytes);
      if (currentTab === 'preview') updatePreview();
    }

    function renderTabContent(chunks, isDjVu, bytes) {
      if (currentTab === 'preview') {
        if (!currentDoc) return '<div class="p-12 text-center text-surface-400 italic">Visual preview not available for this file.</div>';
        return `
          <div class="flex flex-col items-center gap-6">
            <div class="flex items-center gap-4 bg-surface-50 px-4 py-2 rounded-full border border-surface-100">
              <button id="prev-page" class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-surface-200 hover:bg-surface-100 transition-colors disabled:opacity-30">←</button>
              <span class="text-sm font-bold text-surface-700 min-w-[80px] text-center">Page ${currentPage} / ${currentDoc.pagesCount}</span>
              <button id="next-page" class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-surface-200 hover:bg-surface-100 transition-colors disabled:opacity-30">→</button>
            </div>
            <div class="w-full flex justify-center bg-surface-50 rounded-2xl p-8 border border-surface-100">
              <canvas id="djvu-canvas" class="max-w-full shadow-2xl bg-white border border-surface-200"></canvas>
            </div>
          </div>
        `;
      }

      if (currentTab === 'structure') {
        return `
          <div class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Signature</p>
                <p class="text-sm font-bold ${isDjVu ? 'text-green-600' : 'text-red-600'}">${isDjVu ? 'Valid DjVu IFF' : 'Invalid Signature'}</p>
              </div>
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Chunks Found</p>
                <p class="text-sm font-bold text-surface-700">${chunks.length}</p>
              </div>
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Root Form</p>
                <p class="text-sm font-bold text-surface-700">${chunks.length > 0 ? 'AT&T FORM' : 'N/A'}</p>
              </div>
            </div>
            <div class="bg-white border border-surface-100 rounded-xl overflow-hidden shadow-sm">
              <table class="w-full text-left border-collapse">
                <thead class="bg-surface-50 border-b border-surface-100">
                  <tr>
                    <th class="px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase">Chunk ID</th>
                    <th class="px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase text-right">Size (Bytes)</th>
                    <th class="px-4 py-2.5 text-[10px] font-bold text-surface-400 uppercase text-right">Offset</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-50">
                  ${chunks.map(c => `
                    <tr class="hover:bg-brand-50/30 transition-colors">
                      <td class="px-4 py-2 font-mono text-sm font-bold text-brand-600">${esc(c.id)}</td>
                      <td class="px-4 py-2 text-sm text-surface-600 text-right font-mono">${c.size.toLocaleString()}</td>
                      <td class="px-4 py-2 text-[10px] text-surface-400 text-right font-mono">0x${c.offset.toString(16).toUpperCase()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      if (currentTab === 'hex') {
        return `
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-[10px] font-bold uppercase tracking-widest text-surface-400">Hexadecimal Inspection (First 1KB)</h3>
              <button id="copy-hex" class="text-[10px] font-extrabold text-brand-600 hover:text-brand-700 transition-colors bg-brand-50 px-2 py-1 rounded">📋 COPY DUMP</button>
            </div>
            <div class="bg-surface-900 rounded-2xl p-6 shadow-inner overflow-x-auto border-4 border-surface-800">
              <pre class="text-[11px] leading-relaxed font-mono text-brand-200/80 whitespace-pre">${esc(generateHexDump(bytes, 1024))}</pre>
            </div>
          </div>
        `;
      }
    }

    function bindEvents(h, chunks, isDjVu, bytes) {
      document.getElementById('tab-preview').onclick = () => { currentTab = 'preview'; renderMain(h, chunks, isDjVu, bytes); };
      document.getElementById('tab-structure').onclick = () => { currentTab = 'structure'; renderMain(h, chunks, isDjVu, bytes); };
      document.getElementById('tab-hex').onclick = () => { currentTab = 'hex'; renderMain(h, chunks, isDjVu, bytes); };

      if (currentTab === 'preview' && currentDoc) {
        document.getElementById('prev-page').onclick = () => { if (currentPage > 1) { currentPage--; updatePreview(); } };
        document.getElementById('next-page').onclick = () => { if (currentPage < currentDoc.pagesCount) { currentPage++; updatePreview(); } };
        document.getElementById('prev-page').disabled = currentPage <= 1;
        document.getElementById('next-page').disabled = currentPage >= currentDoc.pagesCount;
      }

      if (currentTab === 'hex') {
        document.getElementById('copy-hex').onclick = (e) => h.copyToClipboard(generateHexDump(bytes, 1024), e.target);
      }
    }

    async function updatePreview() {
      const canvas = document.getElementById('djvu-canvas');
      if (!canvas || !currentDoc) return;

      try {
        const page = currentDoc.getPage(currentPage);
        const imageData = await page.render();
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
      } catch (e) {
        console.error('Render error:', e);
      }
    }
  };

  function generateHexDump(bytes, maxBytes) {
    const limit = Math.min(bytes.length, maxBytes);
    const lines = [];
    for (let i = 0; i < limit; i += 16) {
      const offset = i.toString(16).padStart(8, '0').toUpperCase();
      const chunk = bytes.slice(i, Math.min(i + 16, limit));
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const ascii = Array.from(chunk).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
      const hexPadded = hex.padEnd(16 * 3 - 1, ' ');
      lines.push(`${offset}  ${hexPadded}  |${ascii}|`);
    }
    return lines.join('\n');
  }
})();
