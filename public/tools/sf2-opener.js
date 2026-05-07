(function () {
  'use strict';

  /**
   * OmniOpener SF2 (SoundFont 2) Tool
   * A high-performance, beautiful viewer for SoundFont metadata.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  window.initTool = function (toolConfig, mountEl) {
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
        
        // Use setTimeout to allow UI to show loading state
        setTimeout(function() {
          try {
            const data = parseSF2(content);
            h.setState('parsedData', data);
            h.setState('activeTab', 'presets');
            h.setState('searchQuery', '');
            renderUI(h);
          } catch (err) {
            console.error('[SF2] Parse Error:', err);
            h.showError('Could not open sf2 file', 'The file may be corrupted or in an unsupported variant. ' + (err.message || ''));
          }
        }, 50);
      },

      onDestroy: function(h) {
        // Clean up any potential resources
      }
    });
  };

  function renderUI(h) {
    const data = h.getState().parsedData;
    if (!data) return;

    const activeTab = h.getState().activeTab || 'presets';
    const searchQuery = (h.getState().searchQuery || '').toLowerCase();
    const file = h.getFile();

    // Filter data based on search
    const filteredPresets = data.presets.filter(p => p.name.toLowerCase().includes(searchQuery));
    const filteredInstruments = data.instruments.filter(inst => inst.name.toLowerCase().includes(searchQuery));
    const filteredSamples = data.samples.filter(s => s.name.toLowerCase().includes(searchQuery));

    let html = `
      <div class="max-w-6xl mx-auto p-4 md:p-6">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.sf2 (SoundFont 2)</span>
          ${data.info.INAM ? `<span class="text-surface-300">|</span><span class="italic">"${escapeHtml(data.info.INAM)}"</span>` : ''}
        </div>

        <!-- Toolbar / Search -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <!-- Tabs -->
          <div class="inline-flex p-1 bg-surface-100 rounded-lg">
            ${['presets', 'instruments', 'samples', 'info'].map(tab => `
              <button 
                class="px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === tab ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
                onclick="window.setTab('${tab}')"
              >
                ${tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            `).join('')}
          </div>

          <!-- Search Box -->
          ${activeTab !== 'info' ? `
            <div class="relative flex-1 max-w-sm">
              <input 
                type="text" 
                id="sf2-search"
                placeholder="Search ${activeTab}..." 
                class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                value="${escapeHtml(h.getState().searchQuery || '')}"
              >
              <span class="absolute left-3 top-2.5 text-surface-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </span>
            </div>
          ` : ''}
        </div>

        <!-- Main Content Area -->
        <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden min-h-[400px]">
          ${activeTab === 'presets' ? renderPresetsTab(filteredPresets, h) :
            activeTab === 'instruments' ? renderInstrumentsTab(filteredInstruments, h) :
            activeTab === 'samples' ? renderSamplesTab(filteredSamples, h) :
            renderInfoTab(data.info)}
        </div>
      </div>
    `;

    h.render(html);

    // Bind events
    window.setTab = (tab) => {
      h.setState('activeTab', tab);
      renderUI(h);
    };

    const searchInput = document.getElementById('sf2-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        h.setState('searchQuery', e.target.value);
        // Direct DOM update for performance if lists are long, or just re-render
        // Here we re-render but could debounce
        renderUI(h);
        // Refocus and set cursor to end
        const input = document.getElementById('sf2-search');
        if (input) {
          input.focus();
          const val = input.value;
          input.value = '';
          input.value = val;
        }
      };
    }
  }

  function renderPresetsTab(presets, h) {
    if (presets.length === 0) return renderEmpty('No presets found matching your search.');

    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-surface-800 text-lg">Presets</h3>
          <span class="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-100">${presets.length} items</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${presets.map(p => `
            <div class="p-4 rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-md transition-all group bg-surface-50/30">
              <div class="flex justify-between items-start mb-3">
                <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-brand-100 text-brand-700">Bank ${p.bank}</span>
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

  function renderInstrumentsTab(instruments, h) {
    if (instruments.length === 0) return renderEmpty('No instruments found.');

    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-surface-800 text-lg">Instruments</h3>
          <span class="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-100">${instruments.length} items</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="px-4 py-3 text-left font-semibold text-surface-700 w-20">Index</th>
                <th class="px-4 py-3 text-left font-semibold text-surface-700">Instrument Name</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${instruments.map((inst, i) => `
                <tr class="hover:bg-brand-50/50 transition-colors">
                  <td class="px-4 py-3 font-mono text-surface-400">${i}</td>
                  <td class="px-4 py-3 font-medium text-surface-800">${escapeHtml(inst.name)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderSamplesTab(samples, h) {
    if (samples.length === 0) return renderEmpty('No samples found.');

    return `
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-surface-800 text-lg">Samples</h3>
          <span class="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-100">${samples.length} items</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200 text-[11px] uppercase tracking-wider text-surface-500">
                <th class="px-4 py-3 text-left font-bold">Sample Name</th>
                <th class="px-4 py-3 text-left font-bold">Type</th>
                <th class="px-4 py-3 text-left font-bold">Sample Rate</th>
                <th class="px-4 py-3 text-left font-bold">Key/Pitch</th>
                <th class="px-4 py-3 text-left font-bold">Range</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${samples.slice(0, 1000).map(s => {
                const typeLabel = s.type === 1 ? 'Mono' : s.type === 2 ? 'Right' : s.type === 4 ? 'Left' : 'Linked';
                const typeClass = s.type === 1 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
                return `
                  <tr class="hover:bg-brand-50/50 transition-colors">
                    <td class="px-4 py-3 font-semibold text-surface-800">${escapeHtml(s.name)}</td>
                    <td class="px-4 py-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${typeClass}">${typeLabel}</span>
                    </td>
                    <td class="px-4 py-3 font-mono text-surface-500">${s.sampleRate} Hz</td>
                    <td class="px-4 py-3 font-mono text-surface-500">${s.originalPitch}</td>
                    <td class="px-4 py-3 text-xs text-surface-400 font-mono">${s.start} - ${s.end}</td>
                  </tr>
                `;
              }).join('')}
              ${samples.length > 1000 ? `
                <tr>
                  <td colspan="5" class="px-4 py-4 text-center text-surface-400 italic bg-surface-50">
                    Showing first 1,000 samples of ${samples.length} total.
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderInfoTab(info) {
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
        <h3 class="font-semibold text-surface-800 text-lg mb-4">Metadata & Info</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${Object.entries(info).map(([key, val]) => `
            <div class="flex flex-col p-4 bg-surface-50 rounded-xl border border-surface-100">
              <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">${labels[key] || key}</span>
              <span class="text-surface-800 font-medium">${escapeHtml(val)}</span>
            </div>
          `).join('')}
          ${Object.keys(info).length === 0 ? '<p class="text-surface-400 col-span-2 text-center py-8">No metadata available</p>' : ''}
        </div>
      </div>
    `;
  }

  function renderEmpty(msg) {
    return `
      <div class="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div class="w-16 h-16 bg-surface-50 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p class="text-surface-500 font-medium">${msg}</p>
      </div>
    `;
  }

  // --- SF2 Parser Implementation ---

  function parseSF2(buffer) {
    const dv = new DataView(buffer);
    const data = { info: {}, presets: [], instruments: [], samples: [] };

    // 1. RIFF Check
    if (dv.byteLength < 12) throw new Error('File too small.');
    if (dv.getUint32(0, false) !== 0x52494646) throw new Error('Not a valid RIFF file.');
    if (dv.getUint32(8, false) !== 0x7366626B) throw new Error('Not a SoundFont 2.0 file (sfbk magic missing).');

    let pos = 12;
    while (pos < buffer.byteLength) {
      if (pos + 8 > buffer.byteLength) break;
      const id = getString(dv, pos, 4);
      const size = dv.getUint32(pos + 4, true);
      pos += 8;

      if (id === 'LIST') {
        const type = getString(dv, pos, 4);
        if (type === 'INFO') parseInfo(dv, pos + 4, size - 4, data.info);
        else if (type === 'pdta') parsePdta(dv, pos + 4, size - 4, data);
        pos += size;
      } else {
        pos += size;
      }
    }

    return data;
  }

  function parseInfo(dv, pos, size, info) {
    const end = pos + size;
    while (pos < end) {
      if (pos + 8 > end) break;
      const id = getString(dv, pos, 4);
      const s = dv.getUint32(pos + 4, true);
      pos += 8;
      if (pos + s > end) break;
      info[id] = getString(dv, pos, s).replace(/\0/g, '').trim();
      pos += s;
    }
  }

  function parsePdta(dv, pos, size, data) {
    const end = pos + size;
    while (pos < end) {
      if (pos + 8 > end) break;
      const id = getString(dv, pos, 4);
      const s = dv.getUint32(pos + 4, true);
      pos += 8;

      if (id === 'phdr') {
        // Preset Header: 38 bytes per entry
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
        // Instrument: 22 bytes per entry
        const count = Math.max(0, Math.floor(s / 22) - 1);
        for (let i = 0; i < count; i++) {
          const off = pos + (i * 22);
          data.instruments.push({
            name: getString(dv, off, 20).replace(/\0/g, '').trim()
          });
        }
      } else if (id === 'shdr') {
        // Sample Header: 46 bytes per entry
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
    }
  }

  function getString(dv, pos, len) {
    let s = '';
    const end = Math.min(pos + len, dv.byteLength);
    for (let i = pos; i < end; i++) {
      const b = dv.getUint8(i);
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

})();
