(function () {
  'use strict';

  const GGUF_MAGIC = 0x46554747; // 'GGUF'
  const GGUF_VERSION = [2, 3];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gguf',
      binary: true,
      infoHtml: '<strong>GGUF Viewer:</strong> Inspect AI model metadata, architecture, and tensor configurations directly in your browser. Supports GGUF v2 and v3 format used by llama.cpp and other LLM runtimes.',
      
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
          activeTab: 'metadata'
        });
      },

      onFile: function _onFile(file, content, h) {
        h.showLoading('Analyzing model architecture...');
        
        // Offset heavy parsing to next tick to keep UI responsive
        setTimeout(function() {
          try {
            if (!(content instanceof ArrayBuffer)) {
              throw new Error('Expected binary content (ArrayBuffer).');
            }

            const result = parseGGUF(content);
            h.setState({ 
              version: result.version,
              tensorCount: result.tensorCount,
              kvCount: result.kvCount,
              metadata: result.metadata, 
              tensors: result.tensors,
              filter: ''
            });
            renderGGUF(h);
          } catch (err) {
            console.error('[GGUF] Parse Error:', err);
            h.showError('Could not open GGUF file', 'The file may be corrupted or in an unsupported variant. ' + err.message);
          }
        }, 50);
      }
    });
  };

  function parseGGUF(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    if (view.byteLength < 24) throw new Error('File too small to be a valid GGUF.');
    
    const magic = view.getUint32(offset, true);
    if (magic !== GGUF_MAGIC) throw new Error('Magic mismatch: not a valid GGUF file.');
    offset += 4;

    const version = view.getUint32(offset, true);
    if (!GGUF_VERSION.includes(version)) throw new Error(`Unsupported GGUF version: ${version}. Only v2 and v3 are supported.`);
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
    if (offset + 8 > view.byteLength) throw new Error('Unexpected EOF reading string length');
    const len = Number(view.getBigUint64(offset, true));
    offset += 8;
    if (offset + len > view.byteLength) throw new Error('Unexpected EOF reading string content');
    const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, len);
    const str = new TextDecoder().decode(bytes);
    return { str, nextOffset: offset + len };
  }

  function readValue(view, offset, type) {
    switch (type) {
      case 0: return { value: view.getUint8(offset), nextOffset: offset + 1 };
      case 1: return { value: view.getInt8(offset), nextOffset: offset + 1 };
      case 2: return { value: view.getUint16(offset, true), nextOffset: offset + 2 };
      case 3: return { value: view.getInt16(offset, true), nextOffset: offset + 2 };
      case 4: return { value: view.getUint32(offset, true), nextOffset: offset + 4 };
      case 5: return { value: view.getInt32(offset, true), nextOffset: offset + 4 };
      case 6: return { value: view.getFloat32(offset, true), nextOffset: offset + 4 };
      case 7: return { value: view.getUint8(offset) !== 0, nextOffset: offset + 1 };
      case 8: return readString(view, offset);
      case 9: { // Array
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
      case 10: return { value: view.getBigUint64(offset, true), nextOffset: offset + 8 };
      case 11: return { value: view.getBigInt64(offset, true), nextOffset: offset + 8 };
      case 12: return { value: view.getFloat64(offset, true), nextOffset: offset + 8 };
      default: throw new Error(`Unknown value type: ${type}`);
    }
  }

  function readKV(view, offset) {
    const { str: key, nextOffset: offsetAfterKey } = readString(view, offset);
    if (offsetAfterKey + 4 > view.byteLength) throw new Error('Unexpected EOF reading KV type');
    const type = view.getUint32(offsetAfterKey, true);
    const { value, nextOffset } = readValue(view, offsetAfterKey + 4, type);
    return { key, value, nextOffset };
  }

  function readTensor(view, offset) {
    const { str: name, nextOffset: offsetAfterName } = readString(view, offset);
    let off = offsetAfterName;
    if (off + 4 > view.byteLength) throw new Error('Unexpected EOF reading tensor dims count');
    const n_dims = view.getUint32(off, true);
    off += 4;
    const dims = [];
    for (let i = 0; i < n_dims; i++) {
      if (off + 8 > view.byteLength) throw new Error('Unexpected EOF reading tensor dimension');
      dims.push(Number(view.getBigUint64(off, true)));
      off += 8;
    }
    if (off + 12 > view.byteLength) throw new Error('Unexpected EOF reading tensor info');
    const type = view.getUint32(off, true);
    off += 4;
    const tensorOffset = view.getBigUint64(off, true);
    off += 8;
    return {
      tensor: { name, dims, type, tensorOffset },
      nextOffset: off
    };
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function renderGGUF(h) {
    const state = h.getState();
    const file = h.getFile();
    const filter = (state.filter || '').toLowerCase();

    const filteredMetadata = Object.entries(state.metadata).filter(([k, v]) => 
      k.toLowerCase().includes(filter) || String(v).toLowerCase().includes(filter)
    );

    const filteredTensors = state.tensors.filter(t => 
      t.name.toLowerCase().includes(filter)
    );

    const architecture = state.metadata['general.architecture'] || 'unknown';

    let html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6 animate-in fade-in duration-300">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.gguf (v${state.version})</span>
          <span class="ml-auto px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-bold uppercase tracking-wider">${esc(architecture)}</span>
        </div>

        <!-- U10. Summary Section -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Architecture</p>
            <p class="text-xl font-bold text-brand-600 truncate">${esc(architecture)}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Tensors</p>
            <p class="text-xl font-bold text-surface-800">${state.tensorCount.toLocaleString()}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Metadata Keys</p>
            <p class="text-xl font-bold text-surface-800">${state.kvCount.toLocaleString()}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Format Version</p>
            <p class="text-xl font-bold text-surface-800">GGUF v${state.version}</p>
          </div>
        </div>

        <!-- Search box -->
        <div class="mb-6">
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400 group-focus-within:text-brand-500 transition-colors">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input type="text" id="gguf-search" placeholder="Search keys, values, or tensor names..." value="${esc(state.filter || '')}"
              class="block w-full pl-10 pr-3 py-3 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm">
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex items-center gap-2 mb-6 border-b border-surface-200">
          <button id="tab-metadata" class="px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${state.activeTab === 'metadata' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}">
            Metadata <span class="ml-1 text-[10px] px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded-full">${filteredMetadata.length}</span>
          </button>
          <button id="tab-tensors" class="px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${state.activeTab === 'tensors' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}">
            Tensors <span class="ml-1 text-[10px] px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded-full">${filteredTensors.length}</span>
          </button>
        </div>

        <div id="tab-content">
          ${state.activeTab === 'metadata' ? renderMetadata(filteredMetadata) : renderTensors(filteredTensors)}
        </div>
      </div>
    `;

    h.render(html);

    const renderEl = h.getRenderEl();
    
    // Search input binding
    const searchInput = renderEl.querySelector('#gguf-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        h.setState({ filter: e.target.value });
        renderGGUF(h);
      });
      if (state.filter) {
        searchInput.focus();
        searchInput.setSelectionRange(state.filter.length, state.filter.length);
      }
    }

    // Tab bindings
    renderEl.querySelector('#tab-metadata').addEventListener('click', () => {
      h.setState({ activeTab: 'metadata' });
      renderGGUF(h);
    });
    renderEl.querySelector('#tab-tensors').addEventListener('click', () => {
      h.setState({ activeTab: 'tensors' });
      renderGGUF(h);
    });
  }

  function renderMetadata(entries) {
    if (entries.length === 0) {
      return `
        <div class="py-20 text-center bg-surface-50 rounded-2xl border border-dashed border-surface-200">
          <div class="text-surface-300 mb-2">
            <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <p class="text-surface-500 font-medium">No metadata keys match your search.</p>
        </div>
      `;
    }

    return `
      <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="sticky top-0 bg-surface-50 px-6 py-4 text-left font-semibold text-surface-700">Key</th>
                <th class="sticky top-0 bg-surface-50 px-6 py-4 text-left font-semibold text-surface-700">Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${entries.map(([key, val]) => {
                let displayVal = '';
                if (Array.isArray(val)) {
                  displayVal = `
                    <div class="flex items-center gap-2 mb-1">
                      <span class="px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded text-[10px] font-bold font-mono">ARRAY[${val.length}]</span>
                    </div>
                    <div class="font-mono text-[11px] bg-surface-50 p-2 rounded border border-surface-100 text-surface-600 break-all line-clamp-3">
                      ${esc(JSON.stringify(val.slice(0, 20)))}${val.length > 20 ? '...' : ''}
                    </div>
                  `;
                } else if (typeof val === 'bigint') {
                  displayVal = `<span class="font-mono text-brand-600 font-bold">${val.toString()}</span>`;
                } else if (typeof val === 'string' && val.length > 200) {
                  displayVal = `
                    <div class="max-h-40 overflow-y-auto pr-2 scrollbar-thin text-surface-600 font-mono text-[11px] leading-relaxed">
                      ${esc(val)}
                    </div>
                  `;
                } else {
                  displayVal = `<span class="text-surface-700 font-medium">${esc(String(val))}</span>`;
                }
                return `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/20 transition-colors">
                    <td class="px-6 py-4 font-mono text-xs text-brand-700 font-medium align-top whitespace-nowrap">${esc(key)}</td>
                    <td class="px-6 py-4 align-top">${displayVal}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTensors(tensors) {
    if (tensors.length === 0) {
      return `
        <div class="py-20 text-center bg-surface-50 rounded-2xl border border-dashed border-surface-200">
          <div class="text-surface-300 mb-2">
            <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
          <p class="text-surface-500 font-medium">No tensors match your search.</p>
        </div>
      `;
    }

    const limit = 400;
    const items = tensors.slice(0, limit);

    return `
      <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="sticky top-0 bg-surface-50 px-6 py-4 text-left font-semibold text-surface-700">Tensor Name</th>
                <th class="sticky top-0 bg-surface-50 px-6 py-4 text-left font-semibold text-surface-700">Shape</th>
                <th class="sticky top-0 bg-surface-50 px-6 py-4 text-right font-semibold text-surface-700">Type</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${items.map(t => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50/20 transition-colors">
                  <td class="px-6 py-3 font-mono text-xs text-surface-800 break-all font-medium">${esc(t.name)}</td>
                  <td class="px-6 py-3 text-surface-500 font-mono text-xs whitespace-nowrap">
                    <span class="text-surface-300">[</span>${t.dims.join(' <span class="text-surface-400">×</span> ')}<span class="text-surface-300">]</span>
                  </td>
                  <td class="px-6 py-3 text-right">
                    <span class="inline-flex px-2 py-0.5 bg-surface-100 text-surface-600 rounded border border-surface-200 text-[10px] font-bold font-mono shadow-sm">
                      ${esc(getTensorTypeName(t.type))}
                    </span>
                  </td>
                </tr>
              `).join('')}
              ${tensors.length > limit ? `
                <tr class="bg-surface-50">
                  <td colspan="3" class="px-6 py-6 text-center text-surface-400 italic">
                    Showing first ${limit} of ${tensors.length} matching tensors.
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
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

  function esc(str) {
    if (str === null || str === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

})();
