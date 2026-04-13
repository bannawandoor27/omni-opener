(function() {
  'use strict';

  /**
   * OmniOpener MessagePack Tool
   * A production-grade binary MessagePack viewer.
   */

  const MSG_PACK_CDN = 'https://cdn.jsdelivr.net/npm/@msgpack/msgpack@2.8.0/dist/index.min.js';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  function uint8ArrayToHex(arr, limit = 16) {
    const hex = [];
    for (let i = 0; i < Math.min(arr.length, limit); i++) {
      hex.push(arr[i].toString(16).padStart(2, '0'));
    }
    return hex.join(' ') + (arr.length > limit ? '...' : '');
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.msgpack,.mpac,.msgp',
      dropLabel: 'Drop a MessagePack file here',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScript(MSG_PACK_CDN);
      },

      onFile: async function(file, content, helpers) {
        helpers.showLoading('Initialising decoder...');

        // B1, B4: Ensure CDN global exists
        const waitForLib = () => new Promise((resolve, reject) => {
          let attempts = 0;
          const check = () => {
            if (typeof MessagePack !== 'undefined') resolve();
            else if (attempts++ > 50) reject(new Error('Library timeout'));
            else setTimeout(check, 100);
          };
          check();
        });

        try {
          await waitForLib();
        } catch (e) {
          helpers.showError('Dependency Error', 'The MessagePack library failed to load. Please check your internet connection.');
          return;
        }

        helpers.showLoading('Decoding binary MessagePack data...');

        try {
          // B2: Handle binary content as Uint8Array
          const uint8 = new Uint8Array(content);
          const decoded = MessagePack.decode(uint8);

          if (decoded === undefined || decoded === null) {
            helpers.showError('Empty Content', 'The MessagePack file was decoded but resulted in no data.');
            return;
          }

          helpers.setState({
            data: decoded,
            fileName: file.name,
            fileSize: file.size,
            filter: '',
            view: 'tree'
          });

          renderApp(helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Parsing Failed', 'Could not decode MessagePack data. The file might be corrupted or using an unsupported extension.');
        }
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function(helpers, btn) {
            const { data } = helpers.getState();
            const json = JSON.stringify(data, (key, value) => {
              if (value instanceof Uint8Array) return `[Binary: ${uint8ArrayToHex(value, 32)}]`;
              return value;
            }, 2);
            helpers.copyToClipboard(json, btn);
          }
        },
        {
          label: '📥 Save as JSON',
          id: 'dl-json',
          onClick: function(helpers) {
            const { data, fileName } = helpers.getState();
            const json = JSON.stringify(data, (key, value) => {
              if (value instanceof Uint8Array) return `[Binary: ${uint8ArrayToHex(value, 64)}]`;
              return value;
            }, 2);
            helpers.download(fileName.replace(/\.[^/.]+$/, "") + ".json", json, 'application/json');
          }
        }
      ]
    });
  };

  function renderApp(helpers) {
    const { data, fileName, fileSize, filter } = helpers.getState();

    // U1: File info bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(fileName)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(fileSize)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.msgpack file</span>
      </div>
    `;

    // U11: Filter Box
    const filterBox = `
      <div class="relative mb-4">
        <input type="text" id="tool-search" placeholder="Filter keys and values..." value="${escapeHtml(filter)}" 
          class="w-full px-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
        <div class="absolute right-3 top-2.5 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>
    `;

    const containerHtml = `
      <div class="max-w-full">
        ${infoBar}
        ${filterBox}
        <div id="render-target"></div>
      </div>
    `;

    helpers.render(containerHtml);

    const searchInput = document.getElementById('tool-search');
    searchInput.oninput = (e) => {
      helpers.setState({ filter: e.target.value });
      renderData(helpers);
    };

    renderData(helpers);
  }

  function renderData(helpers) {
    const { data, filter } = helpers.getState();
    const target = document.getElementById('render-target');
    
    // Check if tabular (array of objects with same keys)
    const isTabular = Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !(data[0] instanceof Uint8Array);
    
    if (isTabular && data.length > 0) {
      renderTable(data, filter, target);
    } else {
      renderJSON(data, filter, target);
    }
  }

  function renderTable(data, filter, target) {
    const keys = Object.keys(data[0]);
    const filtered = data.filter(row => {
      if (!filter) return true;
      const f = filter.toLowerCase();
      return keys.some(k => String(row[k]).toLowerCase().includes(f));
    });

    if (filtered.length === 0) {
      target.innerHTML = `<div class="p-8 text-center text-surface-400">No entries match your filter.</div>`;
      return;
    }

    // U10: Section header with count
    const header = `
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-surface-800">Records</h3>
        <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filtered.length} items</span>
      </div>
    `;

    // U7: Table UI
    let tableHtml = `
      ${header}
      <div class="overflow-x-auto rounded-xl border border-surface-200">
        <table class="min-w-full text-sm">
          <thead>
            <tr>
              ${keys.map(k => `<th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">${escapeHtml(k)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${filtered.slice(0, 1000).map(row => `
              <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                ${keys.map(k => {
                  let val = row[k];
                  let display = '';
                  if (val instanceof Uint8Array) display = `<span class="text-orange-600 font-mono text-[10px]">BIN[${val.length}]</span>`;
                  else display = escapeHtml(String(val));
                  return `<td class="px-4 py-2 text-surface-700 border-b border-surface-100">${display}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${filtered.length > 1000 ? `<div class="mt-2 text-xs text-center text-surface-400 italic">Showing first 1,000 of ${filtered.length} rows</div>` : ''}
    `;

    target.innerHTML = tableHtml;
  }

  function renderJSON(data, filter, target) {
    // U8: Code block
    const json = JSON.stringify(data, (key, value) => {
      if (value instanceof Uint8Array) return `[Binary: ${uint8ArrayToHex(value, 16)}]`;
      return value;
    }, 2);

    let finalHtml = '';
    
    if (filter) {
      const lines = json.split('\n');
      const filteredLines = lines.filter(line => line.toLowerCase().includes(filter.toLowerCase()));
      if (filteredLines.length === 0) {
        finalHtml = `<div class="p-8 text-center text-surface-400">No lines match your filter.</div>`;
      } else {
        finalHtml = `
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Filtered View</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredLines.length} matching lines</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">${filteredLines.map(l => escapeHtml(l)).join('\n')}</pre>
          </div>
        `;
      }
    } else {
      // U7/U8: Standard large code block
      // B7: Large file handling - truncate if massive for display
      const maxLines = 5000;
      const lines = json.split('\n');
      const truncated = lines.length > maxLines;
      const displayJson = truncated ? lines.slice(0, maxLines).join('\n') : json;

      finalHtml = `
        <div class="rounded-xl overflow-hidden border border-surface-200">
          <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">${escapeHtml(displayJson)}</pre>
        </div>
        ${truncated ? `<div class="mt-2 text-xs text-center text-surface-500 italic font-medium">Displaying first ${maxLines} lines of ${lines.length}. Use "Copy JSON" to get full content.</div>` : ''}
      `;
    }

    target.innerHTML = finalHtml;
  }

})();
