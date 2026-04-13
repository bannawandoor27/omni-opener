(function () {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.sf2',
      binary: true,
      dropLabel: 'Drop a SoundFont (.sf2) file here',
      infoHtml: '<strong>SoundFont Viewer:</strong> Inspect presets, instruments, and sample metadata of SF2 files. 100% private, client-side processing.',

      actions: [
        {
          label: '📋 Copy Preset List',
          id: 'copy-presets',
          onClick: function (h, btn) {
            const data = h.getState().parsedData;
            if (!data || !data.presets) return;
            const text = data.presets.map(p => `Bank ${p.bank}, Preset ${p.preset}: ${p.name}`).join('\n');
            h.copyToClipboard(text, btn);
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

      onFile: function (file, content, h) {
        h.showLoading('Parsing SoundFont structure...');
        setTimeout(() => {
          try {
            const data = parseSF2(content);
            h.setState('parsedData', data);
            h.setState('activeTab', 'presets');
            renderUI(h);
          } catch (err) {
            console.error('[SF2] Parse Error:', err);
            h.showError('Could not parse SoundFont', err.message || 'The file may be corrupted or in an unsupported format.');
          }
        }, 50);
      }
    });
  };

  function renderUI(h) {
    const data = h.getState().parsedData;
    const activeTab = h.getState().activeTab || 'presets';
    const file = h.getFile();

    let html = `
      <div class="flex flex-col h-[85vh] font-sans">
        <!-- Header -->
        <div class="flex flex-wrap items-center gap-3 px-6 py-4 bg-surface-50 border border-surface-200 rounded-t-2xl">
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-bold text-surface-900 truncate">${escapeHtml(file.name)}</h3>
            <div class="flex items-center gap-3 text-xs text-surface-500 mt-0.5">
              <span class="font-medium">${data.info.INAM || 'Untitled SoundFont'}</span>
              <span>•</span>
              <span>${formatSize(file.size)}</span>
              ${data.info.ISNG ? `<span>•</span> <span>Engine: ${data.info.ISNG}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 flex flex-col bg-white border-x border-b border-surface-200 rounded-b-2xl overflow-hidden shadow-sm">
          <!-- Tabs -->
          <div class="flex border-b border-surface-200 bg-surface-50/50">
            ${['presets', 'instruments', 'samples'].map(tab => `
              <button class="tab-btn px-6 py-3 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${activeTab === tab ? 'text-brand-600 border-brand-600 bg-white' : 'text-surface-400 border-transparent hover:text-surface-600'}" data-tab="${tab}">
                ${tab} <span class="ml-1 opacity-50 text-[10px] font-mono">${data[tab].length}</span>
              </button>
            `).join('')}
          </div>

          <!-- List Area -->
          <div class="flex-1 overflow-auto p-6">
            ${activeTab === 'presets' ? renderPresets(data.presets) :
              activeTab === 'instruments' ? renderInstruments(data.instruments) :
              renderSamples(data.samples)}
          </div>
        </div>
      </div>
    `;

    h.render(html);

    h.getRenderEl().querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        h.setState('activeTab', btn.dataset.tab);
        renderUI(h);
      };
    });
  }

  function renderPresets(presets) {
    if (presets.length === 0) return `<p class="text-center py-12 text-surface-400 italic">No presets found</p>`;
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${presets.map(p => `
          <div class="group p-4 bg-surface-50 rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-md transition-all">
            <div class="flex justify-between items-start mb-2">
              <span class="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-100 uppercase">Bank ${p.bank}</span>
              <span class="text-[10px] font-mono text-surface-400">#${p.preset}</span>
            </div>
            <h4 class="font-bold text-surface-900 group-hover:text-brand-700 transition-colors">${escapeHtml(p.name)}</h4>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderInstruments(insts) {
    if (insts.length === 0) return `<p class="text-center py-12 text-surface-400 italic">No instruments found</p>`;
    return `
      <div class="overflow-hidden rounded-xl border border-surface-200">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-50 text-surface-500 font-bold text-[10px] uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Index</th>
              <th class="px-4 py-3">Instrument Name</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100">
            ${insts.map((inst, i) => `
              <tr class="hover:bg-surface-50/80 transition-colors">
                <td class="px-4 py-3 font-mono text-surface-400 w-24">${i}</td>
                <td class="px-4 py-3 font-bold text-surface-800">${escapeHtml(inst.name)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSamples(samples) {
    if (samples.length === 0) return `<p class="text-center py-12 text-surface-400 italic">No samples found</p>`;
    return `
      <div class="overflow-hidden rounded-xl border border-surface-200">
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-50 text-surface-500 font-bold text-[10px] uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Sample Name</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Rate</th>
              <th class="px-4 py-3">Pitch</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-100">
            ${samples.map(s => `
              <tr class="hover:bg-surface-50/80 transition-colors">
                <td class="px-4 py-3 font-bold text-surface-800">${escapeHtml(s.name)}</td>
                <td class="px-4 py-3">
                   <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${s.type === 1 ? 'bg-blue-100 text-blue-700' : 'bg-surface-100 text-surface-600'}">
                     ${s.type === 1 ? 'MONO' : s.type === 2 ? 'RIGHT' : s.type === 4 ? 'LEFT' : 'UNKNOWN'}
                   </span>
                </td>
                <td class="px-4 py-3 font-mono text-surface-500">${s.sampleRate} Hz</td>
                <td class="px-4 py-3 font-mono text-surface-500">${s.originalPitch}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function parseSF2(buffer) {
    const dv = new DataView(buffer);
    const data = { info: {}, presets: [], instruments: [], samples: [] };

    // 1. RIFF Check
    if (dv.getUint32(0, false) !== 0x52494646) throw new Error('Not a valid RIFF file.');
    if (dv.getUint32(8, false) !== 0x7366626B) throw new Error('Not a SoundFont 2.0 file (magic: sfbk).');

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
      const id = getString(dv, pos, 4);
      const s = dv.getUint32(pos + 4, true);
      pos += 8;
      info[id] = getString(dv, pos, s).replace(/\0/g, '').trim();
      pos += s;
    }
  }

  function parsePdta(dv, pos, size, data) {
    const end = pos + size;
    while (pos < end) {
      const id = getString(dv, pos, 4);
      const s = dv.getUint32(pos + 4, true);
      pos += 8;

      if (id === 'phdr') {
        for (let i = 0; i < s / 38 - 1; i++) {
          const off = pos + (i * 38);
          data.presets.push({
            name: getString(dv, off, 20).replace(/\0/g, '').trim(),
            preset: dv.getUint16(off + 20, true),
            bank: dv.getUint16(off + 22, true)
          });
        }
      } else if (id === 'inst') {
        for (let i = 0; i < s / 22 - 1; i++) {
          const off = pos + (i * 22);
          data.instruments.push({
            name: getString(dv, off, 20).replace(/\0/g, '').trim()
          });
        }
      } else if (id === 'shdr') {
        for (let i = 0; i < s / 46 - 1; i++) {
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
    for (let i = 0; i < len; i++) {
      const b = dv.getUint8(pos + i);
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

})();
