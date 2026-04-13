(function () {
  'use strict';

  const GGUF_MAGIC = 0x46554747; // 'GGUF' in little-endian (0x47 0x47 0x55 0x46)
  const GGUF_VERSION = [2, 3];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gguf',
      binary: true,
      infoHtml: '<strong>GGUF Viewer:</strong> Inspect AI model metadata, architecture, and tensor configurations directly in your browser. Supports GGUF v2 and v3 format used by llama.cpp and other LLM runtimes.',
      
      actions: [
        {
          label: '📋 Copy Metadata (JSON)',
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
          label: '📥 Download Metadata',
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
        },
        {
          label: '📄 Copy Tensor List',
          id: 'copy-tensors',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.tensors) {
              const list = state.tensors.map(t => `${t.name}\t[${t.dims.join(', ')}]\t${getTensorTypeName(t.type)}`).join('\n');
              h.copyToClipboard(list, btn);
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
          filter: ''
        });
      },

      onFile: function (file, content, h) {
        h.showLoading('Analyzing model architecture...');
        
        // Offset heavy parsing to next tick to keep UI responsive
        setTimeout(() => {
          try {
            if (!(content instanceof ArrayBuffer)) {
              throw new Error('Expected binary content but received ' + typeof content);
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
            h.showError('Could not open GGUF file', 'The file might be corrupted or uses an unsupported version. Details: ' + err.message);
          }
        }, 50);
      }
    });
  };

  function parseGGUF(buffer) {
    const view = new DataView(buffer);
    let offset = 0;

    // 1. Magic
    if (view.byteLength < 4) throw new Error('File too small');
    const magic = view.getUint32(offset, true);
    if (magic !== GGUF_MAGIC) throw new Error('Magic mismatch: not a valid GGUF file.');
    offset += 4;

    // 2. Version
    const version = view.getUint32(offset, true);
    if (!GGUF_VERSION.includes(version)) throw new Error(`Unsupported GGUF version: ${version}.`);
    offset += 4;

    // 3. Counts
    const tensorCount = Number(view.getBigUint64(offset, true));
    offset += 8;
    const kvCount = Number(view.getBigUint64(offset, true));
    offset += 8;

    // 4. KV Pairs
    const metadata = {};
    for (let i = 0; i < kvCount; i++) {
      const { key, value, nextOffset } = readKV(view, offset);
      metadata[key] = value;
      offset = nextOffset;
    }

    // 5. Tensor Infos
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
    const type = view.getUint32(offsetAfterKey, true);
    const { value, nextOffset } = readValue(view, offsetAfterKey + 4, type);
    return { key, value, nextOffset };
  }

  function readTensor(view, offset) {
    const { str: name, nextOffset: offsetAfterName } = readString(view, offset);
    let off = offsetAfterName;
    const n_dims = view.getUint32(off, true);
    off += 4;
    const dims = [];
    for (let i = 0; i < n_dims; i++) {
      dims.push(Number(view.getBigUint64(off, true)));
      off += 8;
    }
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

    let html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6">
        <!-- File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500 font-medium">GGUF v${state.version}</span>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Format</p>
            <p class="text-3xl font-bold text-brand-600">v${state.version}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Tensors</p>
            <p class="text-3xl font-bold text-surface-800">${state.tensorCount.toLocaleString()}</p>
          </div>
          <div class="rounded-xl border border-surface-200 p-5 bg-white shadow-sm">
            <p class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Metadata Keys</p>
            <p class="text-3xl font-bold text-surface-800">${state.kvCount.toLocaleString()}</p>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="mb-8">
          <div class="relative">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-surface-400">
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <input type="text" id="gguf-search" placeholder="Filter metadata or tensors..." value="${esc(state.filter || '')}"
              class="block w-full pl-10 pr-3 py-3 border border-surface-300 rounded-xl leading-5 bg-white placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm">
          </div>
        </div>

        <!-- Metadata Section -->
        <section class="mb-10">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-lg text-surface-800">Metadata</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full font-medium">${filteredMetadata.length} entries</span>
          </div>

          ${filteredMetadata.length === 0 ? `
            <div class="py-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-300 text-surface-500 text-sm">No matches found.</div>
          ` : `
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50 border-b border-surface-200 text-left">
                    <th class="px-6 py-4 font-semibold text-surface-700 w-1/3">Key</th>
                    <th class="px-6 py-4 font-semibold text-surface-700">Value</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredMetadata.map(([key, val]) => {
                    let displayVal = '';
                    if (Array.isArray(val)) {
                      displayVal = `<div class="text-surface-400 mb-1">[Array: ${val.length} items]</div><div class="font-mono text-xs bg-surface-50 p-2 rounded truncate">${esc(JSON.stringify(val.slice(0, 10)))}${val.length > 10 ? '...' : ''}</div>`;
                    } else if (typeof val === 'bigint') {
                      displayVal = `<span class="font-mono text-brand-600">${val.toString()}</span>`;
                    } else if (typeof val === 'string' && val.length > 120) {
                      displayVal = `<div class="max-h-32 overflow-y-auto pr-2 scrollbar-thin text-surface-600">${esc(val)}</div>`;
                    } else {
                      displayVal = `<span class="text-surface-600">${esc(String(val))}</span>`;
                    }
                    return `
                      <tr class="hover:bg-brand-50/20 transition-colors">
                        <td class="px-6 py-3 font-mono text-brand-700 font-medium align-top break-all">${esc(key)}</td>
                        <td class="px-6 py-3 align-top break-all">${displayVal}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>

        <!-- Tensors Section -->
        <section class="mb-10">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-lg text-surface-800">Tensors</h3>
            <span class="text-xs bg-surface-100 text-surface-600 px-3 py-1 rounded-full font-medium">${filteredTensors.length} total</span>
          </div>

          ${filteredTensors.length === 0 ? `
            <div class="py-12 text-center bg-surface-50 rounded-xl border border-dashed border-surface-300 text-surface-500 text-sm">No matches found.</div>
          ` : `
            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50 border-b border-surface-200 text-left">
                    <th class="px-6 py-4 font-semibold text-surface-700">Name</th>
                    <th class="px-6 py-4 font-semibold text-surface-700">Shape</th>
                    <th class="px-6 py-4 font-semibold text-surface-700 text-right">Type</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredTensors.slice(0, 150).map(t => `
                    <tr class="hover:bg-brand-50/20 transition-colors">
                      <td class="px-6 py-3 font-mono text-surface-800 break-all">${esc(t.name)}</td>
                      <td class="px-6 py-3 text-surface-500 font-mono">[${t.dims.join(' × ')}]</td>
                      <td class="px-6 py-3 text-right">
                        <span class="px-2 py-1 bg-surface-100 text-surface-600 rounded text-xs font-mono border border-surface-200">${esc(getTensorTypeName(t.type))}</span>
                      </td>
                    </tr>
                  `).join('')}
                  ${filteredTensors.length > 150 ? `
                    <tr class="bg-surface-50">
                      <td colspan="3" class="px-6 py-4 text-center text-surface-400 italic">... showing first 150 of ${filteredTensors.length} matching tensors.</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          `}
        </section>
      </div>
    `;

    h.render(html);

    // Bind Search Event
    const searchInput = h.getRenderEl().querySelector('#gguf-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        h.setState({ filter: e.target.value });
        renderGGUF(h);
      });
      // Maintain focus after re-render
      if (state.filter) {
        searchInput.focus();
        searchInput.setSelectionRange(state.filter.length, state.filter.length);
      }
    }
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
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

})();
