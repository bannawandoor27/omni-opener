/**
 * OmniOpener — GZ Opener Tool
 * PRODUCTION PERFECT GZIP VIEWER
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.gz',
      dropLabel: 'Drop a .gz file here',
      infoHtml: '<strong>Privacy:</strong> Decompression happens entirely in your browser. No data is uploaded.',

      actions: [
        {
          label: '📥 Download Decompressed',
          id: 'download',
          onClick: function (h) {
            const { decompressed, fileName } = h.getState();
            if (decompressed) {
              const originalName = h.getFile().name;
              const newName = originalName.replace(/\.gz$/i, '') || fileName || 'decompressed_file';
              h.download(newName, decompressed);
            }
          }
        },
        {
          label: '📋 Copy Text',
          id: 'copy',
          onClick: function (h, btn) {
            const { isText, textValue } = h.getState();
            if (isText && textValue) {
              h.copyToClipboard(textValue, btn);
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Decompressing GZ archive...');

        const runDecompression = () => {
          try {
            const uint8 = new Uint8Array(content);
            const decompressed = pako.ungzip(uint8);
            
            // Detect file name if available in GZIP header (simplified)
            // GZIP header: 10 bytes + extra + filename + comment
            let embeddedFileName = '';
            if (uint8[3] & 0x08) { // FNAME flag
              let i = 10;
              if (uint8[3] & 0x04) { // FEXTRA
                const xlen = uint8[i] | (uint8[i+1] << 8);
                i += 2 + xlen;
              }
              const start = i;
              while (i < uint8.length && uint8[i] !== 0) i++;
              if (i > start) {
                embeddedFileName = new TextDecoder().decode(uint8.slice(start, i));
              }
            }

            h.setState('decompressed', decompressed);
            h.setState('fileName', embeddedFileName);

            renderOutput(file, decompressed, h);
          } catch (err) {
            console.error(err);
            h.showError(
              'Could not open gz file', 
              'The file may be corrupted or in an unsupported variant. Error: ' + err.message
            );
          }
        };

        if (typeof pako === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js', runDecompression);
        } else {
          runDecompression();
        }
      }
    });
  };

  function renderOutput(file, decompressed, h) {
    const size = formatBytes(file.size);
    const outSize = formatBytes(decompressed.length);
    const ratio = ((decompressed.length / file.size) * 100).toFixed(1);

    let isText = true;
    let textValue = '';
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      textValue = decoder.decode(decompressed);
    } catch (e) {
      isText = false;
    }

    h.setState('isText', isText);
    h.setState('textValue', textValue);

    // Update Action Visibility
    const copyBtn = document.getElementById('omni-action-copy');
    if (copyBtn) {
      if (isText && textValue.trim().length > 0) {
        copyBtn.classList.remove('hidden');
      } else {
        copyBtn.classList.add('hidden');
      }
    }

    // U1: File Info Bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>Compressed: ${size}</span>
        <span class="text-surface-300">|</span>
        <span>Decompressed: ${outSize} (${ratio}% ratio)</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.gz file</span>
      </div>
    `;

    if (decompressed.length === 0) {
      h.render(`
        ${infoBar}
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center text-2xl mb-4">📭</div>
          <h3 class="text-lg font-medium text-surface-900">Empty GZ file</h3>
          <p class="text-surface-500 max-w-sm mx-auto mt-2">The archive was decompressed successfully but contains no data.</p>
        </div>
      `);
      return;
    }

    if (isText) {
      const preview = textValue.length > 102400 
        ? textValue.substring(0, 102400) + '\n\n... (Content truncated for performance)' 
        : textValue;

      h.render(`
        ${infoBar}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Text Content</h3>
            <div class="flex items-center gap-4">
               <div class="relative">
                <input type="text" id="gz-search" placeholder="Filter content..." class="pl-8 pr-3 py-1.5 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-48 transition-all">
                <svg class="w-3.5 h-3.5 absolute left-2.5 top-2 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${textValue.length} characters</span>
            </div>
          </div>
          
          <div class="rounded-xl overflow-hidden border border-surface-200">
            <pre id="gz-content" class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[70vh] whitespace-pre-wrap break-all">${escapeHtml(preview)}</pre>
          </div>
        </div>
      `);

      // Add simple live filter for the preview
      const searchInput = document.getElementById('gz-search');
      const contentEl = document.getElementById('gz-content');
      if (searchInput && contentEl) {
        searchInput.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase();
          if (!term) {
            contentEl.innerHTML = escapeHtml(preview);
            return;
          }
          
          const lines = preview.split('\n');
          const filtered = lines.filter(line => line.toLowerCase().includes(term));
          
          if (filtered.length === 0) {
            contentEl.innerHTML = '<div class="text-gray-500 italic py-4">No lines match your search</div>';
          } else {
             // Highlight matches (simple version)
             contentEl.innerHTML = filtered.map(line => {
               const escaped = escapeHtml(line);
               const regex = new RegExp(`(${term})`, 'gi');
               return escaped.replace(regex, '<mark class="bg-yellow-500/40 text-inherit rounded-sm">$1</mark>');
             }).join('\n');
          }
        });
      }

    } else {
      // Binary Preview
      const hex = Array.from(decompressed.slice(0, 256))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      
      h.render(`
        ${infoBar}
        <div class="space-y-4">
           <div class="flex items-center justify-between">
            <h3 class="font-semibold text-surface-800">Binary Data</h3>
            <span class="text-xs bg-surface-100 text-surface-700 px-2 py-0.5 rounded-full">Non-text content</span>
          </div>

          <div class="rounded-xl border border-surface-200 p-8 bg-surface-50 text-center">
            <div class="text-4xl mb-4">⚙️</div>
            <p class="font-medium text-surface-700">Compressed file contains binary data</p>
            <p class="text-sm text-surface-500 mt-2 max-w-sm mx-auto">
              This .gz file could be an executable, a raw data dump, or an image. 
              You can download the decompressed version to use it.
            </p>
            <div class="mt-6 flex justify-center">
              <button onclick="document.getElementById('omni-action-download').click()" class="bg-white border border-surface-200 hover:border-brand-300 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm">
                Save Decompressed File
              </button>
            </div>
          </div>

          <div class="mt-8">
            <h4 class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Hex Preview (First 256 bytes)</h4>
            <div class="rounded-xl overflow-hidden border border-surface-200">
              <pre class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed break-all">${hex}...</pre>
            </div>
          </div>
        </div>
      `);
    }
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();
