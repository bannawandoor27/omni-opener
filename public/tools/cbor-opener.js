(function() {
  'use strict';

  /**
   * OmniOpener: CBOR Viewer
   * A production-perfect tool for decoding and inspecting CBOR binary data.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  window.initTool = function(toolConfig, mountEl) {
    let currentFilter = '';
    let lastJsonLines = [];

    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbor',
      binary: true,
      dropLabel: 'Drop .cbor file to decode',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css');
        helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/cbor-js@0.1.0/cbor.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js'
        ]);
      },

      onFile: function _onFileFn(file, content, helpers) {
        // B1 & B8: Check if libraries are loaded before proceeding, using named function for retry
        if (typeof CBOR === 'undefined' || typeof Prism === 'undefined') {
          helpers.showLoading('Initializing decoder...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 200);
          return;
        }

        helpers.showLoading('Decoding CBOR data...');

        // B2: content is ArrayBuffer because binary:true is set.
        try {
          const decoded = CBOR.decode(content);
          
          // Convert to JSON with binary data handling
          const jsonString = JSON.stringify(decoded, (key, value) => {
            if (value instanceof Uint8Array || (value && value.type === 'Buffer')) {
              const len = value.length || value.byteLength || 0;
              return `[Binary Data: ${len} bytes]`;
            }
            if (value instanceof ArrayBuffer) {
              return `[Binary Data: ${value.byteLength} bytes]`;
            }
            return value;
          }, 2);

          if (!jsonString || jsonString === 'undefined') {
             helpers.showError('Empty Content', 'The CBOR file was decoded but resulted in no data.');
             return;
          }

          lastJsonLines = jsonString.split('\n');
          helpers.setState({ 
            json: jsonString,
            lines: lastJsonLines
          });

          this.renderView(file, helpers);

        } catch (err) {
          console.error('CBOR Decode Error:', err);
          helpers.showError(
            'Could not open CBOR file', 
            'The file may be corrupted, using an unsupported CBOR extension, or is not a valid CBOR object. Details: ' + err.message
          );
        }
      },

      renderView: function(file, helpers) {
        const lines = helpers.getState().lines || [];
        const filter = (currentFilter || '').toLowerCase();
        
        // U1: File info bar
        let html = `
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.cbor file</span>
          </div>
        `;

        // Part 4: Live search/filter box
        html += `
          <div class="mb-4">
            <div class="relative">
              <input type="text" id="cbor-search" 
                placeholder="Filter lines..." 
                value="${escapeHtml(currentFilter)}"
                class="w-full px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
              <div class="absolute right-3 top-2.5 text-surface-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>
          </div>
        `;

        // U10: Section header with counts
        const filteredLines = filter 
          ? lines.filter(line => line.toLowerCase().includes(filter))
          : lines;

        // B7: Large file handling - truncate if too many lines
        const MAX_DISPLAY_LINES = 5000;
        const displayLines = filteredLines.slice(0, MAX_DISPLAY_LINES);
        const isTruncated = filteredLines.length > MAX_DISPLAY_LINES;

        html += `
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Decoded Structure</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              ${filteredLines.length.toLocaleString()} lines ${filter ? 'matched' : ''}
            </span>
          </div>
        `;

        // U8: Code block
        html += `
          <div class="rounded-xl overflow-hidden border border-surface-200 relative">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[70vh]"><code class="language-json">${escapeHtml(displayLines.join('\n'))}</code></pre>
            ${isTruncated ? `
              <div class="bg-amber-900/20 border-t border-amber-900/30 p-2 text-center text-xs text-amber-200 font-medium">
                Showing first ${MAX_DISPLAY_LINES.toLocaleString()} lines. Use search to find specific data.
              </div>
            ` : ''}
          </div>
        `;

        if (lines.length === 0) {
          // U5: Empty state
          html = `
            <div class="flex flex-col items-center justify-center py-12 text-surface-500">
              <div class="bg-surface-100 p-4 rounded-full mb-4">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
              </div>
              <p>The decoded CBOR file is empty.</p>
            </div>
          `;
        }

        helpers.render(`<div class="p-1">${html}</div>`);

        // Highlight and bind events
        const container = helpers.getRenderEl();
        const codeEl = container.querySelector('code');
        if (codeEl && displayLines.length < 2000) { // Only highlight if not too massive for performance
          Prism.highlightElement(codeEl);
        }

        const searchInput = container.querySelector('#cbor-search');
        if (searchInput) {
          searchInput.focus();
          // Position cursor at end
          searchInput.setSelectionRange(currentFilter.length, currentFilter.length);
          
          searchInput.addEventListener('input', (e) => {
            currentFilter = e.target.value;
            this.renderView(file, helpers);
          });
        }
      },

      onDestroy: function() {
        // B5: Cleanup
        currentFilter = '';
        lastJsonLines = [];
      },

      actions: [
        { 
          label: '📋 Copy JSON', 
          id: 'copy', 
          onClick: function(helpers, btn) { 
            const json = helpers.getState().json;
            if (json) helpers.copyToClipboard(json, btn);
          } 
        },
        { 
          label: '📥 Download JSON', 
          id: 'dl-json', 
          onClick: function(helpers) { 
            const json = helpers.getState().json;
            const file = helpers.getFile();
            if (!json || !file) return;
            const filename = file.name.replace(/\.[^/.]+$/, "") + ".json";
            helpers.download(filename, json, 'application/json');
          } 
        },
        {
          label: '📥 Download Original',
          id: 'dl-raw',
          onClick: function(helpers) {
            const file = helpers.getFile();
            const content = helpers.getContent();
            if (file && content) {
              helpers.download(file.name, content, 'application/cbor');
            }
          }
        }
      ],

      infoHtml: `
        <div class="flex items-start gap-2 text-xs text-surface-500">
          <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <p><strong>CBOR (Concise Binary Object Representation)</strong> is a binary data serialization format that aims to be small and fast. This tool decodes it locally into a human-readable format for inspection.</p>
        </div>
      `
    });
  };
})();
