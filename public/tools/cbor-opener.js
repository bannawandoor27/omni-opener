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
    if (typeof str !== 'string') return String(str);
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
    let lastDecodedData = null;
    let lastJsonLines = [];
    let viewMode = 'json'; // 'json' or 'table'

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
        // B1 & B8: Check if libraries are loaded before proceeding
        if (typeof CBOR === 'undefined' || typeof Prism === 'undefined') {
          helpers.showLoading('Initializing CBOR decoder...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 200);
          return;
        }

        helpers.showLoading('Decoding CBOR data...');

        // B2: binary:true means content is ArrayBuffer
        try {
          const decoded = CBOR.decode(content);
          lastDecodedData = decoded;
          
          // Convert to JSON string with binary data handling
          const jsonString = JSON.stringify(decoded, (key, value) => {
            if (value instanceof Uint8Array || (value && value.constructor && value.constructor.name === 'Uint8Array')) {
              return `[Binary Data: ${value.length} bytes]`;
            }
            if (value instanceof ArrayBuffer) {
              return `[Binary Data: ${value.byteLength} bytes]`;
            }
            return value;
          }, 2);

          if (jsonString === undefined) {
             helpers.showError('Empty Content', 'The CBOR file was decoded but resulted in no data.');
             return;
          }

          lastJsonLines = jsonString.split('\n');
          
          // Detect if it should be shown as a table (array of objects)
          const isTableable = Array.isArray(decoded) && decoded.length > 0 && typeof decoded[0] === 'object' && decoded[0] !== null && !Array.isArray(decoded[0]);
          viewMode = isTableable ? 'table' : 'json';

          helpers.setState({ 
            json: jsonString,
            lines: lastJsonLines,
            isTableable: isTableable
          });

          this.renderView(file, helpers);

        } catch (err) {
          console.error('CBOR Decode Error:', err);
          helpers.showError(
            'Could not open CBOR file', 
            'The file may be corrupted or use an unsupported CBOR extension. ' + (err.message || '')
          );
        }
      },

      renderView: function(file, helpers) {
        const state = helpers.getState();
        const lines = state.lines || [];
        const filter = (currentFilter || '').toLowerCase();
        const isTableable = state.isTableable;
        
        // U1: File info bar
        let html = `
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.cbor file</span>
            ${isTableable ? `
              <span class="text-surface-300">|</span>
              <div class="flex items-center gap-1 bg-white border border-surface-200 rounded-md p-0.5 ml-auto">
                <button id="view-json" class="px-2 py-1 rounded text-xs ${viewMode === 'json' ? 'bg-brand-500 text-white' : 'text-surface-600 hover:bg-surface-100'} transition-colors">JSON</button>
                <button id="view-table" class="px-2 py-1 rounded text-xs ${viewMode === 'table' ? 'bg-brand-500 text-white' : 'text-surface-600 hover:bg-surface-100'} transition-colors">Table</button>
              </div>
            ` : ''}
          </div>
        `;

        // Live Search Box
        html += `
          <div class="mb-4">
            <div class="relative">
              <input type="text" id="cbor-search" 
                placeholder="Search data..." 
                value="${escapeHtml(currentFilter)}"
                class="w-full px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all shadow-sm"
              />
              <div class="absolute right-3 top-3 text-surface-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
            </div>
          </div>
        `;

        if (viewMode === 'table' && isTableable) {
          html += this.renderTableView(lastDecodedData, filter);
        } else {
          html += this.renderJsonView(lines, filter);
        }

        helpers.render(`<div class="p-1">${html}</div>`);

        this.bindEvents(file, helpers);
      },

      renderJsonView: function(lines, filter) {
        const filteredLines = filter 
          ? lines.filter(line => line.toLowerCase().includes(filter))
          : lines;

        // B7: Large file handling
        const MAX_DISPLAY_LINES = 2000;
        const displayLines = filteredLines.slice(0, MAX_DISPLAY_LINES);
        const isTruncated = filteredLines.length > MAX_DISPLAY_LINES;

        let html = `
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Structure</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              ${filteredLines.length.toLocaleString()} lines ${filter ? 'matched' : ''}
            </span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 relative">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[70vh]"><code class="language-json">${escapeHtml(displayLines.join('\n'))}</code></pre>
            ${isTruncated ? `
              <div class="bg-gray-900 border-t border-white/10 p-2 text-center text-xs text-gray-400">
                Showing first ${MAX_DISPLAY_LINES.toLocaleString()} matching lines. Narrow your search to see more.
              </div>
            ` : ''}
          </div>
        `;

        if (lines.length === 0) {
          html = `
            <div class="flex flex-col items-center justify-center py-20 text-surface-400 bg-surface-50 rounded-xl border-2 border-dashed border-surface-200">
              <svg class="w-12 h-12 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
              <p class="text-sm font-medium">Empty CBOR Object</p>
            </div>
          `;
        }
        return html;
      },

      renderTableView: function(data, filter) {
        if (!data || data.length === 0) return '';
        
        const keys = Object.keys(data[0]);
        const filteredData = filter 
          ? data.filter(row => JSON.stringify(row).toLowerCase().includes(filter))
          : data;

        const MAX_ROWS = 500;
        const displayData = filteredData.slice(0, MAX_ROWS);
        const isTruncated = filteredData.length > MAX_ROWS;

        let html = `
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Items</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              ${filteredData.length.toLocaleString()} rows
            </span>
          </div>
          <div class="overflow-x-auto rounded-xl border border-surface-200">
            <table class="min-w-full text-sm">
              <thead>
                <tr>
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">#</th>
                  ${keys.map(k => `<th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">${escapeHtml(k)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${displayData.map((row, i) => `
                  <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-2 text-surface-400 border-b border-surface-100 font-mono text-xs">${i + 1}</td>
                    ${keys.map(k => {
                      let val = row[k];
                      if (val instanceof Uint8Array) val = `[Binary: ${val.length}B]`;
                      if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                      return `<td class="px-4 py-2 text-surface-700 border-b border-surface-100 max-w-xs truncate" title="${escapeHtml(String(val))}">${escapeHtml(String(val))}</td>`;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${isTruncated ? `
            <div class="mt-2 text-center text-xs text-surface-500">
              Showing first ${MAX_ROWS} rows. Use filter to find specific records.
            </div>
          ` : ''}
        `;
        return html;
      },

      bindEvents: function(file, helpers) {
        const container = helpers.getRenderEl();
        
        // Highlight JSON
        const codeEl = container.querySelector('code');
        if (codeEl && viewMode === 'json') {
          Prism.highlightElement(codeEl);
        }

        // Search Focus & Cursor
        const searchInput = container.querySelector('#cbor-search');
        if (searchInput) {
          searchInput.addEventListener('input', (e) => {
            currentFilter = e.target.value;
            // Debounce or just render if small enough
            this.renderView(file, helpers);
            // Re-focus and set cursor
            const updatedInput = container.querySelector('#cbor-search');
            if (updatedInput) {
              updatedInput.focus();
              updatedInput.setSelectionRange(currentFilter.length, currentFilter.length);
            }
          });
        }

        // View Toggles
        const btnJson = container.querySelector('#view-json');
        const btnTable = container.querySelector('#view-table');
        if (btnJson) btnJson.onclick = () => { viewMode = 'json'; this.renderView(file, helpers); };
        if (btnTable) btnTable.onclick = () => { viewMode = 'table'; this.renderView(file, helpers); };
      },

      onDestroy: function() {
        currentFilter = '';
        lastDecodedData = null;
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
        }
      ],

      infoHtml: `
        <div class="space-y-2 text-xs text-surface-500">
          <p><strong>CBOR (Concise Binary Object Representation)</strong> is a data format whose design goals include the possibility of extremely small code size, fairly small message size, and extensibility without the need for version negotiation.</p>
          <p>This tool allows you to inspect CBOR payloads directly in your browser. Large arrays of objects are automatically displayed in a searchable table view.</p>
        </div>
      `
    });
  };
})();
