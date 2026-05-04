/**
 * OmniOpener — GZIP Toolkit
 * Uses OmniTool SDK and pako.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gz',
      binary: true,
      infoHtml: '<strong>GZIP Toolkit:</strong> Professional decompression tool with real-time size analysis and data extraction. All processing happens in your browser.',
      
      actions: [
        {
          label: '📥 Download Unpacked',
          id: 'download',
          onClick: function (h) {
            const data = h.getState().decompressed;
            const originalName = h.getState().originalName;
            if (data && originalName) {
              h.download(originalName, data, 'application/octet-stream');
            }
          }
        },
        {
          label: '📋 Copy as Text',
          id: 'copy',
          onClick: function (h, btn) {
            const data = h.getState().decompressed;
            if (data) {
              try {
                const text = new TextDecoder().decode(data);
                h.copyToClipboard(text, btn);
              } catch (e) {
                const orig = btn.textContent;
                btn.textContent = '❌ Not Text';
                setTimeout(() => { btn.textContent = orig; }, 1500);
              }
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing...');
        
        // Ensure pako is loaded
        if (typeof pako === 'undefined') {
          setTimeout(() => this.onFile(file, content, h), 200);
          return;
        }

        try {
          const uint8 = new Uint8Array(content);
          const decompressed = pako.ungzip(uint8);
          const originalName = file.name.replace(/\.gz$/i, '') || 'unpacked_file';

          h.setState({
            decompressed: decompressed,
            originalName: originalName
          });

          h.render(`
            <div class="flex flex-col border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 px-6 py-4 flex justify-between items-center">
                 <div>
                    <h3 class="text-lg font-bold text-surface-900">${escapeHtml(file.name)}</h3>
                    <span class="text-[10px] font-bold uppercase text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">GZIP Archive</span>
                 </div>
              </div>
              <div class="flex-1 p-12 bg-surface-50/30 flex flex-col items-center justify-center space-y-6">
                 <div class="w-20 h-20 rounded-full bg-white border border-surface-200 shadow-sm flex items-center justify-center text-3xl">📦</div>
                 <div class="text-center">
                    <div class="text-sm font-bold text-surface-900 mb-1">Archive Contents</div>
                    <div class="text-xs text-surface-500">${escapeHtml(originalName)}</div>
                 </div>
                 <div class="grid grid-cols-2 gap-8 text-center bg-white p-6 rounded-2xl border border-surface-100 shadow-sm w-full max-w-sm">
                    <div>
                       <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Compressed</div>
                       <div class="text-sm font-mono font-bold text-surface-700">${(file.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <div>
                       <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Unpacked</div>
                       <div class="text-sm font-mono font-bold text-brand-600">${(decompressed.length / 1024).toFixed(1)} KB</div>
                    </div>
                 </div>
              </div>
            </div>
          `);

        } catch (err) {
           h.showError('Decompression Failed', 'The file might be corrupted or is not a valid GZIP archive.');
        }
      }
    });
  };
})();
