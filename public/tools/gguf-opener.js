(function () {
  'use strict';

  const GGUF_MAGIC = 0x46554747; // 'GGUF'
  const GGUF_VERSIONS = [2, 3];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gguf',
      binary: true,
      infoHtml: '<strong>GGUF Viewer:</strong> Inspect AI model metadata, architecture, and tensor configurations. Supports GGUF v2 and v3 format used by llama.cpp and other LLM runtimes.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-json',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.metadata) {
              const json = JSON.stringify(state.metadata, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
              h.copyToClipboard(json, btn);
            } else {
              h.showError('No data', 'Please load a GGUF file first.');
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const state = h.getState();
            if (state && state.metadata) {
              const fileName = h.getFile().name.replace(/\.gguf$/i, '') + '.json';
              const json = JSON.stringify(state.metadata, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2);
              h.download(fileName, json, 'application/json');
            } else {
              h.showError('No data', 'Please load a GGUF file first.');
            }
          }
        }
      ],

      onInit: function (h) {
        h.setState({
          metadata: null,
          tensors: null,
          version: null,
          tensorCount: 0,
          kvCount: 0,
          filter: '',
          activeTab: 'metadata',
          sortKey: 'key',
          sortOrder: 'asc'
        });
      },

      onFile: function _onFileFn(file, content, h) {
        h.showLoading('Analyzing model architecture and tensors...');
        
        // Use setTimeout to allow UI to show loading state
        setTimeout(function() {
          try {
            if (!(content instanceof ArrayBuffer)) {
              throw new Error('Invalid file content received. Expected binary data.');
            }

            const result = parseGGUF(content);
            h.setState({ 
              version: result.version,
              tensorCount: result.tensorCount,
              kvCount: result.kvCount,
              metadata: result.metadata, 
              tensors: result.tensors,
              filter: '',
              activeTab: 'metadata'
            });
            renderGGUF(h);
          } catch (err) {
            console.error('[GGUF] Parse Error:', err);
            h.showError('Could not open GGUF file', 'The file may be corrupted or in an unsupported format version. ' + err.message);
          }
        }, 100);
      },

      onDestroy: function(h) {
        // No persistent resources to clean up in this tool
      }
    });
  };

  /**
   * Parsing Logic
   */
  function parseGGUF(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    if (view.byteLength < 24) throw new Error('File too small to be a valid GGUF.');
    
    const magic = view.getUint32(offset, true);
    if (magic !== GGUF_MAGIC) throw new Error('Magic mismatch: not a GGUF file.');
    offset += 4;

    const version = view.getUint32(offset, true);
    if (!GGUF_VERSIONS.includes(version)) throw new Error(`Unsupported GGUF version: ${version}.`);
    offset += 4;

    const tensorCount = Number(view.getBigUint64(offset, true));
    offset += 8;
    const kvCount = Number(view.getBigUint64(offset, true));
    offset += 8;

    const metadata = {};
    for (let i = 0; i < kvCount; i++) {
      const { key, value, nextOffset } = readKV(view, offset);
      metadata[key] = value;
      offset = nextOffset;
    }

    const tensors = [];
    for (let i = 0; i < tensorCount; i++) {
      const { tensor, nextOffset } = readTensor(view, offset);
      tensors.push(tensor);
      offset = nextOffset;
    }

    return { version, tensorCount, kvCount, metadata, tensors };
  }

  function readString(view, offset) {
    if (offset + 8 > view.byteLength) throw new Error('Truncated file: EOF while reading string length');
    const len = Number(view.getBigUint64(offset, true));
    offset += 8;
    if (offset + len > view.byteLength) throw new Error('Truncated file: EOF while reading string content');
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, len);
    const str = new TextDecoder().decode(bytes);
    return { str, nextOffset: offset + len };
  }

  function readValue(view, offset, type) {
    switch (type) {
      case 0: return { value: view.getUint8(offset), nextOffset: offset + 1 }; // UINT8
      case 1: return { value: view.getInt8(offset), nextOffset: offset + 1 }; // INT8
      case 2: return { value: view.getUint16(offset, true), nextOffset: offset + 2 }; // UINT16
      case 3: return { value: view.getInt16(offset, true), nextOffset: offset + 2 }; // INT16
      case 4: return { value: view.getUint32(offset, true), nextOffset: offset + 4 }; // UINT32
      case 5: return { value: view.getInt32(offset, true), nextOffset: offset + 4 }; // INT32
      case 6: return { value: view.getFloat32(offset, true), nextOffset: offset + 4 }; // FLOAT32
      case 7: return { value: view.getUint8(offset) !== 0, nextOffset: offset + 1 }; // BOOL
      case 8: return readString(view, offset); // STRING
      case 9: { // ARRAY
        const itemType = view.getUint32(offset, true);
        offset += 4;
        const len = Number(view.getBigUint64(offset, true));
        offset += 8;
        const arr = [];
        for (let i = 0; i < len; i++) {
          const { value, nextOffset } = readValue(view, offset, itemType);
          arr.push(value);
          offset = nextOffset;
        }
        return { value: arr, nextOffset: offset };
      }
      case 10: return { value: view.getBigUint64(offset, true), nextOffset: offset + 8 }; // UINT64
      case 11: return { value: view.getBigInt64(offset, true), nextOffset: offset + 8 }; // INT64
      case 12: return { value: view.getFloat64(offset, true), nextOffset: offset + 8 }; // FLOAT64
      default: throw new Error(`Unknown GGUF type: ${type}`);
    }
  }

  function readKV(view, offset) {
    const { str: key, nextOffset: offsetAfterKey } = readString(view, offset);
    if (offsetAfterKey + 4 > view.byteLength) throw new Error('Truncated file: EOF while reading KV type');
    const type = view.getUint32(offsetAfterKey, true);
    const { value, nextOffset } = readValue(view, offsetAfterKey + 4, type);
    return { key, value, nextOffset };
  }

  function readTensor(view, offset) {
    const { str: name, nextOffset: offsetAfterName } = readString(view, offset);
    let off = offsetAfterName;
    if (off + 4 > view.byteLength) throw new Error('Truncated file: EOF while reading tensor dims');
    const n_dims = view.getUint32(off, true);
    off += 4;
    const dims = [];
    for (let i = 0; i < n_dims; i++) {
      if (off + 8 > view.byteLength) throw new Error('Truncated file: EOF while reading dimension');
      dims.push(Number(view.getBigUint64(off, true)));
      off += 8;
    }
    if (off + 12 > view.byteLength) throw new Error('Truncated file: EOF while reading tensor meta');
    const type = view.getUint32(off, true);
    off += 4;
    const tensorOffset = view.getBigUint64(off, true);
    off += 8;
    return {
      tensor: { name, dims, type, tensorOffset },
      nextOffset: off
    };
  }

  /**
   * Rendering UI
   */
  function renderGGUF(h) {
    const state = h.getState();
    const file = h.getFile();
    if (!state.metadata) return;

    const filter = (state.filter || '').toLowerCase();

    const filteredMetadata = Object.entries(state.metadata).filter(([k, v]) => 
      k.toLowerCase().includes(filter) || String(v).toLowerCase().includes(filter)
    ).sort((a, b) => {
      const valA = state.sortKey === 'key' ? a[0] : String(a[1]);
      const valB = state.sortKey === 'key' ? b[0] : String(b[1]);
      return state.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    const filteredTensors = state.tensors.filter(t => 
      t.name.toLowerCase().includes(filter)
    );

    const architecture = state.metadata['general.architecture'] || 'unknown';

    const html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.gguf file</span>
        </div>

        <!-- U10. Section Header / Summary -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          ${renderSummaryCard('Architecture', architecture, 'text-brand-600')}
          ${renderSummaryCard('Version', `GGUF v${state.version}`, 'text-surface-600')}
          ${renderSummaryCard('KV Pairs', state.kvCount.toLocaleString(), 'text-surface-600')}
          ${renderSummaryCard('Tensors', state.tensorCount.toLocaleString(), 'text-surface-600')}
        </div>

        <!-- Search Box -->
        <div class="relative mb-6">
          <input type="text" id="gguf-search" placeholder="Search metadata keys, values or tensors..." 
            value="${esc(state.filter)}"
            class="w-full pl-10 pr-4 py-3 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
          <div class="absolute left-3 top-3.5 text-surface-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex items-center gap-6 mb-6 border-b border-surface-100">
          <button id="tab-metadata" class="pb-3 text-sm font-semibold transition-all border-b-2 ${state.activeTab === 'metadata' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400 hover:text-surface-600'}">
            Metadata <span class="ml-1 text-xs px-2 py-0.5 bg-surface-100 rounded-full">${filteredMetadata.length}</span>
          </button>
          <button id="tab-tensors" class="pb-3 text-sm font-semibold transition-all border-b-2 ${state.activeTab === 'tensors' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400 hover:text-surface-600'}">
            Tensors <span class="ml-1 text-xs px-2 py-0.5 bg-surface-100 rounded-full">${filteredTensors.length}</span>
          </button>
        </div>

        <div id="tab-content">
          ${state.activeTab === 'metadata' ? renderMetadataTable(filteredMetadata, state) : renderTensorsTable(filteredTensors)}
        </div>
      </div>
    `;

    h.render(html);

    // Bind Events
    const el = h.getRenderEl();
    const search = el.querySelector('#gguf-search');
    if (search) {
      search.addEventListener('input', (e) => {
        h.setState({ filter: e.target.value });
        renderGGUF(h);
      });
      if (state.filter) {
        search.focus();
        search.setSelectionRange(state.filter.length, state.filter.length);
      }
    }

    el.querySelector('#tab-metadata').addEventListener('click', () => {
      h.setState({ activeTab: 'metadata' });
      renderGGUF(h);
    });

    el.querySelector('#tab-tensors').addEventListener('click', () => {
      h.setState({ activeTab: 'tensors' });
      renderGGUF(h);
    });

    const sortKey = el.querySelector('#sort-key');
    if (sortKey) {
      sortKey.addEventListener('click', () => {
        const order = (state.sortKey === 'key' && state.sortOrder === 'asc') ? 'desc' : 'asc';
        h.setState({ sortKey: 'key', sortOrder: order });
        renderGGUF(h);
      });
    }
  }

  function renderSummaryCard(label, value, valueClass) {
    return `
      <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
        <p class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">${label}</p>
        <p class="text-lg font-bold ${valueClass} truncate">${esc(value)}</p>
      </div>
    `;
  }

  function renderMetadataTable(entries, state) {
    if (entries.length === 0) {
      return `
        <div class="p-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-200">
          <p class="text-surface-500">No metadata keys match your search.</p>
        </div>
      `;
    }

    const sortIndicator = state.sortKey === 'key' ? (state.sortOrder === 'asc' ? ' ▲' : ' ▼') : '';

    return `
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="bg-surface-50 border-b border-surface-200">
              <th id="sort-key" class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 cursor-pointer hover:text-brand-600 transition-colors">
                Key${sortIndicator}
              </th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700">Value</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(([key, val]) => `
              <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                <td class="px-4 py-3 font-mono text-xs text-brand-700 border-b border-surface-100 align-top break-all w-1/3">${esc(key)}</td>
                <td class="px-4 py-3 text-surface-700 border-b border-surface-100 align-top">
                  ${renderValue(val)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderValue(val) {
    if (Array.isArray(val)) {
      if (val.length === 0) return '<span class="text-surface-400 italic">Empty Array</span>';
      const isStringArr = val.every(v => typeof v === 'string');
      if (isStringArr && val.length < 20) {
        return `<div class="flex flex-wrap gap-1">
          ${val.map(v => `<span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-[11px] border border-brand-100">${esc(v)}</span>`).join('')}
        </div>`;
      }
      return `
        <div class="text-[11px] font-mono bg-surface-900 text-surface-100 p-2 rounded-lg max-h-40 overflow-y-auto">
          ${esc(JSON.stringify(val, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2))}
        </div>
      `;
    }
    if (typeof val === 'bigint') {
      return `<span class="font-mono text-brand-600 font-bold">${val.toString()}</span>`;
    }
    if (typeof val === 'string' && val.length > 300) {
      return `
        <div class="text-xs leading-relaxed max-h-40 overflow-y-auto pr-2 text-surface-600 font-mono">
          ${esc(val)}
        </div>
      `;
    }
    return `<span class="font-medium">${esc(String(val))}</span>`;
  }

  function renderTensorsTable(tensors) {
    if (tensors.length === 0) {
      return `
        <div class="p-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-200">
          <p class="text-surface-500">No tensors match your search.</p>
        </div>
      `;
    }

    const maxDisplay = 500;
    const items = tensors.slice(0, maxDisplay);

    return `
      <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="bg-surface-50 border-b border-surface-200">
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700">Tensor Name</th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700">Shape</th>
              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700">Type</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(t => `
              <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                <td class="px-4 py-2 font-mono text-xs text-surface-800 border-b border-surface-100">${esc(t.name)}</td>
                <td class="px-4 py-2 text-surface-500 font-mono text-xs border-b border-surface-100">
                  <span class="text-surface-300">[</span>${t.dims.join(' <span class="text-surface-300">×</span> ')}<span class="text-surface-300">]</span>
                </td>
                <td class="px-4 py-2 text-right border-b border-surface-100">
                  <span class="inline-flex px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded text-[10px] font-bold border border-surface-200">
                    ${esc(getTensorTypeName(t.type))}
                  </span>
                </td>
              </tr>
            `).join('')}
            ${tensors.length > maxDisplay ? `
              <tr>
                <td colspan="3" class="px-4 py-6 text-center text-surface-400 italic bg-surface-50">
                  Showing first ${maxDisplay} of ${tensors.length} tensors. Use search to filter specific weights.
                </td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    `;
  }

  function getTensorTypeName(type) {
    const types = [
      'F32', 'F16', 'Q4_0', 'Q4_1', 'Q4_2', 'Q4_3', 'Q5_0', 'Q5_1', 'Q8_0', 'Q8_1', 
      'Q2_K', 'Q3_K', 'Q4_K', 'Q5_K', 'Q6_K', 'Q8_K', 'I8', 'I16', 'I32', 'F64',
      'IQ2_XXS', 'IQ2_XS', 'IQ3_XXS', 'IQ1_S', 'IQ4_NL', 'IQ3_S', 'IQ2_S', 'IQ4_XS', 'I64'
    ];
    return types[type] || `TYPE_${type}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m])
      .replace(/javascript:/gi, 'no-js:')
      .replace(/<script/gi, '&lt;script');
  }

})();
