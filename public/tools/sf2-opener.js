(function () {
  'use strict';

  /**
   * OmniOpener SF2 (SoundFont 2) Tool
   * A high-performance, beautiful viewer for SoundFont metadata.
   */

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  window.initTool = function (toolConfig, mountEl) {
    let activeTab = 'presets';
    let searchQuery = '';
    let sortConfig = { key: null, direction: 'asc' };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.sf2',
      binary: true,
      dropLabel: 'Drop a SoundFont (.sf2) file here',
      infoHtml: '<strong>SoundFont Viewer:</strong> Inspect presets, instruments, and sample metadata of SF2 files. 100% private, client-side processing.',

      actions: [
        {
          label: '📋 Copy Presets',
          id: 'copy-presets',
          onClick: function (h, btn) {
            const data = h.getState().parsedData;
            if (!data || !data.presets) return;
            const text = data.presets.map(p => `Bank ${p.bank}, Preset ${p.preset}: ${p.name}`).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📊 Export JSON',
          id: 'export-json',
          onClick: function (h) {
            const data = h.getState().parsedData;
            if (!data) return;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            h.download(h.getFile().name.replace('.sf2', '.json'), blob);
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'audio/x-soundfont');
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        h.showLoading('Parsing SoundFont structure...');
        
        // Use setTimeout to avoid blocking UI thread for large files
        setTimeout(function() {
          try {
            if (!(content instanceof ArrayBuffer)) {
              throw new Error('Expected ArrayBuffer for SF2 file.');
            }

            const data = parseSF2(content);
            h.setState('parsedData', data);
            
            // Reset local UI state on new file
            activeTab = 'presets';
            searchQuery = '';
            sortConfig = { key: null, direction: 'asc' };
            
            renderUI(h);
          } catch (err) {
            console.error('[SF2] Parse Error:', err);
            h.showError('Could not open sf2 file', 'The file may be corrupted or in an unsupported variant. ' + (err.message || ''));
          }
        }, 50);
      },

      onDestroy: function(h) {
        // Clean up global references if any were added
        if (window._sf2_handlers) {
          delete window._sf2_handlers;
        }
      }
    });

    function renderUI(h) {
      const data = h.getState().parsedData;
      if (!data) return;

      const file = h.getFile();
      const filteredPresets = data.presets.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const filteredInstruments = data.instruments.filter(inst => inst.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const filteredSamples = data.samples.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

      // Apply sorting for samples if active
      if (activeTab === 'samples' && sortConfig.key) {
        filteredSamples.sort((a, b) => {
          let valA = a[sortConfig.key];
          let valB = b[sortConfig.key];
          if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
          }
          if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      let html = `
        <div class="max-w-6xl mx-auto p-4 md:p-6">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.sf2 file</span>
            ${data.info.INAM ? `
              <span class="text-surface-300">|</span>
              <span class="text-brand-600 font-medium">${escapeHtml(data.info.INAM)}</span>
            ` : ''}
          </div>

          <!-- Navigation & Search -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div class="inline-flex p-1 bg-surface-100 rounded-xl">
              ${['presets', 'instruments', 'samples', 'info'].map(tab => `
                <button 
                  class="px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === tab ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
                  onclick="window._sf2_handlers.setTab('${tab}')"
                >
                  ${tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              `).join('')}
            </div>

            ${activeTab !== 'info' ? `
              <div class="relative flex-1 max-w-sm">
                <input 
                  type="text" 
                  id="sf2-search"
                  placeholder="Search ${activeTab}..." 
                  class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm"
                  value="${escapeHtml(searchQuery)}"
                >
                <span class="absolute left-3.5 top-3 text-surface-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </span>
              </div>
            ` : ''}
          </div>

          <!-- Content Card -->
          <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden min-h-[450px]">
            ${activeTab === 'presets' ? renderPresets(filteredPresets) :
              activeTab === 'instruments' ? renderInstruments(filteredInstruments) :
              activeTab === 'samples' ? renderSamples(filteredSamples) :
              renderInfo(data.info)}
          </div>
        </div>
      `;

      h.render(html);

      // Register internal handlers on window (namespaced to avoid pollution)
      window._sf2_handlers = {
        setTab: (tab) => {
          activeTab = tab;
          renderUI(h);
        },
        setSort: (key) => {
          if (sortConfig.key === key) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
          } else {
            sortConfig.key = key;
            sortConfig.direction = 'asc';
          }
          renderUI(h);
        }
      };

      const searchInput = document.getElementById('sf2-search');
      if (searchInput) {
        searchInput.focus();
        // Set cursor to end
        const len = searchInput.value.length;
        searchInput.setSelectionRange(len, len);
        
        searchInput.oninput = (e) => {
          searchQuery = e.target.value;
          renderUI(h);
        };
      }
    }

    function renderPresets(presets) {
      if (presets.length === 0) return renderEmpty('No presets found matching your search.');

      return `
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 text-lg">Presets</h3>
            <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200">${presets.length} items</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${presets.map(p => `
              <div class="group p-4 rounded-xl border border-surface-200 bg-surface-50/30 hover:bg-white hover:border-brand-300 hover:shadow-md transition-all">
                <div class="flex justify-between items-start mb-2">
                  <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-brand-50 text-brand-600 border border-brand-100">Bank ${p.bank}</span>
                  <span class="text-xs font-mono text-surface-400">#${p.preset}</span>
                </div>
                <h4 class="font-bold text-surface-900 group-hover:text-brand-600 transition-colors truncate" title="${escapeHtml(p.name)}">
                  ${escapeHtml(p.name)}
                </h4>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderInstruments(instruments) {
      if (instruments.length === 0) return renderEmpty('No instruments found.');

      return `
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 text-lg">Instruments</h3>
            <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200">${instruments.length} items</span>
          </div>
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th class="px-6 py-4 text-left font-bold text-surface-700 uppercase tracking-wider text-[11px] w-24">Index</th>
                  <th class="px-6 py-4 text-left font-bold text-surface-700 uppercase tracking-wider text-[11px]">Instrument Name</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${instruments.map((inst, i) => `
                  <tr class="hover:bg-brand-50/50 transition-colors group">
                    <td class="px-6 py-4 font-mono text-surface-400">${i}</td>
                    <td class="px-6 py-4 font-semibold text-surface-800 group-hover:text-brand-600 transition-colors">${escapeHtml(inst.name)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderSamples(samples) {
      if (samples.length === 0) return renderEmpty('No samples found.');

      const sortIcon = (key) => {
        if (sortConfig.key !== key) return '↕️';
        return sortConfig.direction === 'asc' ? '▲' : '▼';
      };

      return `
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 text-lg">Audio Samples</h3>
            <span class="text-xs font-bold bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200">${samples.length} items</span>
          </div>
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="bg-surface-50 border-b border-surface-200">
                <tr class="text-[11px] uppercase tracking-wider text-surface-500 font-bold">
                  <th class="px-6 py-4 text-left cursor-pointer hover:bg-surface-100 transition-colors" onclick="window._sf2_handlers.setSort('name')">Name ${sortIcon('name')}</th>
                  <th class="px-6 py-4 text-left cursor-pointer hover:bg-surface-100 transition-colors" onclick="window._sf2_handlers.setSort('sampleRate')">Sample Rate ${sortIcon('sampleRate')}</th>
                  <th class="px-6 py-4 text-left cursor-pointer hover:bg-surface-100 transition-colors" onclick="window._sf2_handlers.setSort('originalPitch')">Pitch ${sortIcon('originalPitch')}</th>
                  <th class="px-6 py-4 text-left">Type</th>
                  <th class="px-6 py-4 text-left">Range (Bytes)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${samples.slice(0, 1000).map(s => {
                  const typeLabel = s.type === 1 ? 'Mono' : s.type === 2 ? 'Right' : s.type === 4 ? 'Left' : 'Linked';
                  const typeClass = s.type === 1 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100';
                  return `
                    <tr class="hover:bg-brand-50/50 transition-colors group">
                      <td class="px-6 py-4 font-bold text-surface-800 group-hover:text-brand-600 transition-colors">${escapeHtml(s.name)}</td>
                      <td class="px-6 py-4 font-mono text-surface-500">${s.sampleRate.toLocaleString()} Hz</td>
                      <td class="px-6 py-4 font-mono text-surface-500">${s.originalPitch}</td>
                      <td class="px-6 py-4">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${typeClass}">${typeLabel}</span>
                      </td>
                      <td class="px-6 py-4 text-xs text-surface-400 font-mono">${s.start.toLocaleString()} - ${s.end.toLocaleString()}</td>
                    </tr>
                  `;
                }).join('')}
                ${samples.length > 1000 ? `
                  <tr>
                    <td colspan="5" class="px-6 py-4 text-center text-surface-400 italic bg-surface-50">
                      Showing first 1,000 samples of ${samples.length.toLocaleString()} total.
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderInfo(info) {
      const labels = {
        INAM: 'SoundFont Name',
        ISNG: 'Sound Engine',
        IROM: 'ROM Name',
        IVER: 'File Version',
        IPRD: 'Product',
        ICOP: 'Copyright',
        ICMT: 'Comment',
        ISFT: 'Software',
        IENG: 'Engineer',
        ICRD: 'Creation Date'
      };

      return `
        <div class="p-6">
          <h3 class="font-bold text-surface-800 text-lg mb-6">Metadata & Global Info</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${Object.entries(info).map(([key, val]) => `
              <div class="flex flex-col p-4 bg-surface-50 rounded-xl border border-surface-100 group hover:border-brand-200 transition-all">
                <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1 group-hover:text-brand-500 transition-colors">${labels[key] || key}</span>
                <span class="text-surface-800 font-semibold">${escapeHtml(val)}</span>
              </div>
            `).join('')}
            ${Object.keys(info).length === 0 ? `
              <div class="col-span-2 flex flex-col items-center justify-center py-12 text-surface-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No metadata found in this SoundFont file.</p>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    function renderEmpty(msg) {
      return `
        <div class="flex flex-col items-center justify-center py-24 px-6 text-center">
          <div class="w-20 h-20 bg-surface-100 rounded-full flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h4 class="text-lg font-bold text-surface-800 mb-2">No results</h4>
          <p class="text-surface-500 max-w-xs mx-auto">${msg}</p>
        </div>
      `;
    }
  };

  // --- Robust SF2 Parser Implementation ---

  function parseSF2(buffer) {
    const dv = new DataView(buffer);
    const data = { info: {}, presets: [], instruments: [], samples: [] };

    if (dv.byteLength < 12) throw new Error('File is too small to be a valid SoundFont.');
    
    // Check RIFF Magic
    if (dv.getUint32(0, false) !== 0x52494646) throw new Error('Not a valid RIFF file.');
    // Check sfbk Magic
    if (dv.getUint32(8, false) !== 0x7366626B) throw new Error('Not a SoundFont 2.0 file (sfbk chunk missing).');

    let pos = 12;
    while (pos < buffer.byteLength) {
      if (pos + 8 > buffer.byteLength) break;
      const id = getString(dv, pos, 4);
      const size = dv.getUint32(pos + 4, true);
      pos += 8;

      if (id === 'LIST') {
        const type = getString(dv, pos, 4);
        if (type === 'INFO') {
          parseInfoChunk(dv, pos + 4, size - 4, data.info);
        } else if (type === 'pdta') {
          parsePdtaChunk(dv, pos + 4, size - 4, data);
        }
        pos += size;
      } else {
        // Skip unknown chunks (like 'sdta' which contains raw audio data we don't need for metadata viewing)
        pos += size;
      }
      
      // Pad byte for RIFF chunks
      if (size % 2 !== 0) pos++;
    }

    return data;
  }

  function parseInfoChunk(dv, pos, size, info) {
    const end = pos + size;
    while (pos < end) {
      if (pos + 8 > end) break;
      const id = getString(dv, pos, 4);
      const s = dv.getUint32(pos + 4, true);
      pos += 8;
      if (pos + s > end) break;
      
      const val = getString(dv, pos, s).replace(/\0/g, '').trim();
      if (val) info[id] = val;
      
      pos += s;
      if (s % 2 !== 0) pos++;
    }
  }

  function parsePdtaChunk(dv, pos, size, data) {
    const end = pos + size;
    while (pos < end) {
      if (pos + 8 > end) break;
      const id = getString(dv, pos, 4);
      const s = dv.getUint32(pos + 4, true);
      pos += 8;

      if (id === 'phdr') {
        // Preset Header: 38 bytes per entry. Last entry is terminal 'EOP'.
        const count = Math.max(0, Math.floor(s / 38) - 1);
        for (let i = 0; i < count; i++) {
          const off = pos + (i * 38);
          data.presets.push({
            name: getString(dv, off, 20).replace(/\0/g, '').trim(),
            preset: dv.getUint16(off + 20, true),
            bank: dv.getUint16(off + 22, true)
          });
        }
      } else if (id === 'inst') {
        // Instrument: 22 bytes per entry. Last is terminal.
        const count = Math.max(0, Math.floor(s / 22) - 1);
        for (let i = 0; i < count; i++) {
          const off = pos + (i * 22);
          data.instruments.push({
            name: getString(dv, off, 20).replace(/\0/g, '').trim()
          });
        }
      } else if (id === 'shdr') {
        // Sample Header: 46 bytes per entry. Last is terminal.
        const count = Math.max(0, Math.floor(s / 46) - 1);
        for (let i = 0; i < count; i++) {
          const off = pos + (i * 46);
          data.samples.push({
            name: getString(dv, off, 20).replace(/\0/g, '').trim(),
            start: dv.getUint32(off + 20, true),
            end: dv.getUint32(off + 24, true),
            sampleRate: dv.getUint32(off + 32, true),
            originalPitch: dv.getUint8(off + 36),
            type: dv.getUint16(off + 44, true)
          });
        }
      }
      pos += s;
      if (s % 2 !== 0) pos++;
    }
  }

  function getString(dv, pos, len) {
    let s = '';
    const end = Math.min(pos + len, dv.byteLength);
    for (let i = pos; i < end; i++) {
      const b = dv.getUint8(i);
      if (b === 0) break;
      // Basic ASCII/ISO-8859-1 conversion
      s += String.fromCharCode(b);
    }
    return s;
  }

})();
