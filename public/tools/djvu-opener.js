/**
 * OmniOpener — DjVu Viewer Tool
 * Uses OmniTool SDK and DjVu.js to render DjVu documents in the browser.
 */
(function () {
  'use strict';

  // Helper for escaping HTML
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper for formatting bytes
  function fmtBytes(b) {
    if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(0) + ' KB';
    return b + ' B';
  }

  window.initTool = function (toolConfig, mountEl) {
    let currentDoc = null;
    let currentPage = 1;
    let currentTab = 'preview';

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.djvu,.djv',
      dropLabel: 'Drop a DjVu file here',
      infoHtml: '<strong>Privacy:</strong> All DjVu processing happens 100% in your browser using DjVu.js. No data is uploaded to any server.',

      onInit: function (h) {
        // Load DjVu.js library from CDN
        return h.loadScript('https://cdn.jsdelivr.net/gh/RussCoder/djvujs@0.5.4/dist/djvu.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Analyzing DjVu document...');

        // Ensure DjVu library is available
        if (typeof DjVu === 'undefined') {
          await h.loadScript('https://cdn.jsdelivr.net/gh/RussCoder/djvujs@0.5.4/dist/djvu.js');
        }

        try {
          // Initialize DjVu.js document
          currentDoc = new DjVu.Document(content);
          currentPage = 1;
          
          // Structural info for the "Structure" tab
          const bytes = new Uint8Array(content);
          const view = new DataView(content);
          
          // Verify DjVu IFF signature (AT&TFORM)
          const isDjVu = bytes.length >= 8 &&
                         bytes[0] === 0x41 && bytes[1] === 0x54 && bytes[2] === 0x26 && bytes[3] === 0x54 && 
                         bytes[4] === 0x46 && bytes[5] === 0x4F && bytes[6] === 0x52 && bytes[7] === 0x4D;

          const chunks = [];
          if (isDjVu) {
            // Simple IFF chunk parser
            let pos = 12; // Start after AT&TFORM[size]
            // Skip the sub-type (e.g., DJVU or DJVM)
            pos += 4; 
            
            while (pos + 8 <= bytes.length && chunks.length < 200) {
              const id = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
              const size = view.getUint32(pos + 4, false);
              chunks.push({ id, size, offset: pos });
              pos += 8 + size + (size % 2);
            }
          }

          renderMain(h, chunks, isDjVu, bytes);
        } catch (e) {
          console.error('DjVu Parsing Error:', e);
          h.showError('Parsing Failed', 'Could not parse this DjVu file. It might be corrupted or uses an unsupported encoding.');
        }
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
          <!-- Header with Tabs -->
          <div class="p-6 border-b border-surface-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-2xl shadow-sm border border-brand-100">📖</div>
              <div>
                <h2 class="text-lg font-bold text-surface-900 leading-tight">${esc(file.name)}</h2>
                <p class="text-xs text-surface-400 font-medium">${fmtBytes(file.size)} • DjVu Document • ${pagesCount} Page${pagesCount === 1 ? '' : 's'}</p>
              </div>
            </div>
            <div class="flex bg-surface-100 p-1 rounded-lg self-start">
              <button data-tab="preview" class="tab-btn px-4 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'preview' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">PREVIEW</button>
              <button data-tab="structure" class="tab-btn px-4 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'structure' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">STRUCTURE</button>
              <button data-tab="hex" class="tab-btn px-4 py-1.5 text-xs font-bold rounded-md transition-all ${currentTab === 'hex' ? 'bg-white shadow-sm text-brand-600' : 'text-surface-500 hover:text-surface-700'}">HEX</button>
            </div>
          </div>

          <!-- Tab Content Area -->
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
        if (!currentDoc) return '<div class="p-12 text-center text-surface-400 italic">No visual content to display.</div>';
        return `
          <div class="flex flex-col items-center gap-6">
            <div class="flex items-center gap-4 bg-surface-50 px-4 py-2 rounded-full border border-surface-100 shadow-sm">
              <button id="prev-page" class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-surface-200 hover:bg-surface-100 transition-colors disabled:opacity-30" ${currentPage <= 1 ? 'disabled' : ''}>←</button>
              <span class="text-sm font-bold text-surface-700 min-w-[100px] text-center">Page ${currentPage} / ${currentDoc.pagesCount}</span>
              <button id="next-page" class="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-surface-200 hover:bg-surface-100 transition-colors disabled:opacity-30" ${currentPage >= currentDoc.pagesCount ? 'disabled' : ''}>→</button>
            </div>
            <div class="w-full flex justify-center bg-surface-50 rounded-2xl p-4 md:p-8 border border-surface-100 overflow-auto">
              <canvas id="djvu-canvas" class="max-w-full shadow-2xl bg-white border border-surface-200"></canvas>
            </div>
          </div>
        `;
      }

      if (currentTab === 'structure') {
        return `
          <div class="space-y-6">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Signature</p>
                <p class="text-sm font-bold ${isDjVu ? 'text-green-600' : 'text-red-600'}">${isDjVu ? 'Valid AT&T DjVu' : 'Invalid Signature'}</p>
              </div>
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Total Chunks</p>
                <p class="text-sm font-bold text-surface-700">${chunks.length}</p>
              </div>
              <div class="p-4 bg-surface-50 rounded-xl border border-surface-100">
                <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Rendering Engine</p>
                <p class="text-sm font-bold text-surface-700">DjVu.js v0.5.4</p>
              </div>
            </div>
            <div class="bg-white border border-surface-100 rounded-xl overflow-hidden shadow-sm">
              <div class="overflow-x-auto">
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
                    ${chunks.length === 0 ? '<tr><td colspan="3" class="p-8 text-center text-surface-400">No IFF chunks found in file structure.</td></tr>' : ''}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      }

      if (currentTab === 'hex') {
        return `
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-[10px] font-bold uppercase tracking-widest text-surface-400">Header Inspection (First 1KB)</h3>
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
      // Tab switching
      h.getRenderEl().querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
          currentTab = btn.getAttribute('data-tab');
          renderMain(h, chunks, isDjVu, bytes);
        };
      });

      // Pagination
      if (currentTab === 'preview' && currentDoc) {
        const prev = document.getElementById('prev-page');
        const next = document.getElementById('next-page');
        if (prev) prev.onclick = () => { if (currentPage > 1) { currentPage--; renderMain(h, chunks, isDjVu, bytes); } };
        if (next) next.onclick = () => { if (currentPage < currentDoc.pagesCount) { currentPage++; renderMain(h, chunks, isDjVu, bytes); } };
      }

      // Hex Copy
      if (currentTab === 'hex') {
        const copyBtn = document.getElementById('copy-hex');
        if (copyBtn) copyBtn.onclick = (e) => h.copyToClipboard(generateHexDump(bytes, 1024), e.target);
      }
    }

    async function updatePreview() {
      const canvas = document.getElementById('djvu-canvas');
      if (!canvas || !currentDoc) return;

      try {
        const page = currentDoc.getPage(currentPage);
        // DjVu.js page.render() returns a promise resolving to ImageData
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
