/**
 * OmniOpener — INI Toolkit
 * Uses OmniTool SDK. Visual explorer with section navigation and filtering.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function parseIni(data) {
    const sections = {};
    let currentSection = 'General';
    sections[currentSection] = {};
    const lines = data.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('[') && trimmed.includes(']')) {
        currentSection = trimmed.substring(1, trimmed.indexOf(']')).trim();
        sections[currentSection] = sections[currentSection] || {};
      } else if (trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        sections[currentSection][key] = val;
      }
    }
    return sections;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ini',
      dropLabel: 'Drop an .ini file here',
      binary: false,
      infoHtml: '<strong>INI Toolkit:</strong> Professional INI explorer with section navigation, search, and JSON export.',
      
      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const data = h.getState().parsedData;
            if (data) h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        }
      ],

      onFile: function (file, content, helpers) {
        try {
          const parsed = parseIni(content);
          helpers.setState('parsedData', parsed);
          const sections = Object.keys(parsed).filter(s => Object.keys(parsed[s]).length > 0);

          if (sections.length === 0) {
             helpers.render('<div class="p-12 text-center text-surface-400 font-medium">This file does not contain any valid INI sections or key-value pairs.</div>');
             return;
          }

          helpers.render(`
            <div class="flex h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <!-- Sidebar -->
              <div class="w-48 shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
                <div class="p-3 border-b border-surface-200 bg-white">
                   <input type="text" id="ini-search" placeholder="Filter..." class="w-full px-2 py-1 text-[10px] border border-surface-200 rounded outline-none focus:ring-1 focus:ring-brand-500">
                </div>
                <div class="flex-1 overflow-auto p-2 space-y-1">
                   ${sections.map(s => `<button data-section="${escapeHtml(s)}" class="sec-nav w-full text-left px-2 py-1.5 text-[10px] font-bold text-surface-500 hover:text-brand-600 hover:bg-white rounded transition-colors truncate">${escapeHtml(s)}</button>`).join('')}
                </div>
              </div>

              <!-- Content Area -->
              <div id="ini-content" class="flex-1 overflow-auto p-6 space-y-8 bg-surface-50/30">
                ${sections.map(s => `
                  <section id="sec-${escapeHtml(s)}" class="ini-section bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                    <div class="bg-surface-50 px-4 py-2 border-b border-surface-100 flex items-center justify-between">
                      <h3 class="text-[10px] font-bold text-surface-700 uppercase tracking-widest">${escapeHtml(s)}</h3>
                    </div>
                    <table class="w-full text-xs text-left">
                      <tbody class="divide-y divide-surface-50">
                        ${Object.entries(parsed[s]).map(([k, v]) => `
                          <tr class="ini-row hover:bg-surface-50/50 transition-colors">
                            <td class="px-4 py-2 font-medium text-surface-500 w-1/3 border-r border-surface-50 truncate">${escapeHtml(k)}</td>
                            <td class="px-4 py-2 font-mono text-brand-600 break-all select-all">${escapeHtml(v)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </section>
                `).join('')}
              </div>
            </div>
          `);

          const searchInput = document.getElementById('ini-search');
          searchInput.oninput = () => {
             const term = searchInput.value.toLowerCase();
             document.querySelectorAll('.ini-row').forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? 'table-row' : 'none';
             });
             document.querySelectorAll('.ini-section').forEach(sec => {
                const hasVisible = Array.from(sec.querySelectorAll('.ini-row')).some(r => r.style.display !== 'none');
                sec.style.display = hasVisible ? 'block' : 'none';
             });
          };

          document.querySelectorAll('.sec-nav').forEach(btn => {
             btn.onclick = () => {
                const id = `sec-${btn.getAttribute('data-section')}`;
                const el = document.getElementById(id);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
             };
          });

        } catch (e) {
          helpers.render(`<div class="p-12 text-center text-surface-400">Unable to parse this INI file.</div>`);
        }
      }
    });
  };
})();
