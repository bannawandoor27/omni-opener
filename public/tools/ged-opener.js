(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.ged',
      dropLabel: 'Drop a GEDCOM file here',
      infoHtml: '<strong>Privacy:</strong> Your genealogy data stays on your computer. All parsing and rendering happens locally in your browser. No data leaves your device.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const data = h.getState().parsedData;
            if (data) h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const data = h.getState().parsedData;
            if (data) h.download(h.getFile().name.replace(/\.ged$/i, '') + '.json', JSON.stringify(data, null, 2), 'application/json');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/read-gedcom@1.1.2/dist/read-gedcom.min.js');
      },

      onFile: async function (file, buffer, h) {
        h.showLoading('Analyzing genealogical data...');

        try {
          // Wait for library if not yet loaded
          let attempts = 0;
          while (typeof Gedcom === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }

          if (typeof Gedcom === 'undefined') {
            throw new Error('The GEDCOM parser failed to initialize. Please check your connection.');
          }

          const gedcom = Gedcom.readGedcom(buffer);
          const individuals = gedcom.getIndividualRecord();
          const families = gedcom.getFamilyRecord();
          const sources = gedcom.getSourceRecord();

          const processed = [];
          individuals.forEach(indi => {
            processed.push({
              id: indi.getPointer(),
              name: indi.getName().getDisplayValue() || 'Unknown',
              sex: indi.getSex().getDisplayValue() || '?',
              birth: indi.getEventBirth().getDate().getDisplayValue() || indi.getBirth().getDate().getDisplayValue() || '',
              death: indi.getEventDeath().getDate().getDisplayValue() || indi.getDeath().getDate().getDisplayValue() || ''
            });
          });

          h.setState({
            fileInfo: {
              name: file.name,
              size: formatSize(file.size)
            },
            parsedData: processed,
            stats: {
              individuals: individuals.length,
              families: families.length,
              sources: sources.length
            },
            filter: ''
          });

          render(h);
        } catch (err) {
          console.error('[GED Parser]', err);
          h.showError('Could not open GEDCOM file', 'The file may be corrupted or in an unsupported format. Error: ' + err.message);
        }
      }
    });
  };

  function render(h) {
    const state = h.getState();
    const { fileInfo, stats, parsedData, filter } = state;

    if (!parsedData) return;

    const filtered = parsedData.filter(p => 
      p.name.toLowerCase().includes(filter.toLowerCase()) || 
      p.id.toLowerCase().includes(filter.toLowerCase())
    );

    const html = `
      <div class="p-6 max-w-6xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${esc(fileInfo.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${fileInfo.size}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.ged file</span>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm transition-all hover:shadow-md">
            <div class="text-xs font-bold text-brand-600 uppercase tracking-wider mb-1">Individuals</div>
            <div class="text-3xl font-black text-surface-900">${stats.individuals.toLocaleString()}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm transition-all hover:shadow-md">
            <div class="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">Families</div>
            <div class="text-3xl font-black text-surface-900">${stats.families.toLocaleString()}</div>
          </div>
          <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm transition-all hover:shadow-md">
            <div class="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Sources</div>
            <div class="text-3xl font-black text-surface-900">${stats.sources.toLocaleString()}</div>
          </div>
        </div>

        <!-- U10: Section Header with counts -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-3">
            <h3 class="font-bold text-xl text-surface-800">Individual Records</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
              ${filtered.length.toLocaleString()} of ${parsedData.length.toLocaleString()}
            </span>
          </div>
          
          <!-- Live Search -->
          <div class="relative w-full md:w-72">
            <input type="text" id="ged-filter" value="${esc(filter)}" placeholder="Search names or IDs..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>

        <!-- U7: Table Implementation -->
        ${filtered.length === 0 ? `
          <div class="py-20 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
            <div class="text-surface-400 mb-2">
              <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
            </div>
            <p class="text-surface-600 font-medium">No records match your search</p>
            <button onclick="document.getElementById('ged-filter').value=''; document.getElementById('ged-filter').dispatchEvent(new Event('input'))" class="mt-3 text-brand-600 text-sm font-semibold hover:underline">Clear filter</button>
          </div>
        ` : `
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm">
              <thead>
                <tr>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-20">Sex</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Birth</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Death</th>
                  <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-24 text-right">ID</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${renderRows(filtered)}
              </tbody>
            </table>
          </div>
          ${filtered.length > 500 ? `
            <div class="mt-4 p-3 bg-brand-50 text-brand-700 rounded-lg text-xs text-center font-medium border border-brand-100">
              Showing first 500 records. Use the search box above to narrow down results.
            </div>
          ` : ''}
        `}
      </div>
    `;

    h.render(html);

    const input = document.getElementById('ged-filter');
    if (input) {
      input.addEventListener('input', (e) => {
        h.setState({ filter: e.target.value });
        render(h);
      });
      // Maintain focus after re-render
      if (filter) {
        input.focus();
        input.setSelectionRange(filter.length, filter.length);
      }
    }
  }

  function renderRows(items) {
    // Large file handling: truncate at 500 for DOM performance
    const limit = 500;
    return items.slice(0, limit).map(item => `
      <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors group">
        <td class="px-4 py-3 text-surface-800 font-medium">${esc(item.name)}</td>
        <td class="px-4 py-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            item.sex === 'M' ? 'bg-blue-100 text-blue-700' : 
            item.sex === 'F' ? 'bg-pink-100 text-pink-700' : 
            'bg-gray-100 text-gray-600'
          }">${esc(item.sex)}</span>
        </td>
        <td class="px-4 py-3 text-surface-600 font-mono text-xs">${esc(item.birth)}</td>
        <td class="px-4 py-3 text-surface-600 font-mono text-xs">${esc(item.death)}</td>
        <td class="px-4 py-3 text-surface-400 text-right font-mono text-[10px] group-hover:text-brand-600 transition-colors">${esc(item.id)}</td>
      </tr>
    `).join('');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
