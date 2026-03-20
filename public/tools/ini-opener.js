/**
 * OmniOpener — INI Toolkit
 * Uses OmniTool SDK. Visual explorer with section navigation, editing, and .env export.
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
      infoHtml: '<strong>INI Toolkit:</strong> Professional INI explorer with live editing, section navigation, and .env conversion.',
      
      actions: [
        {
          label: '📋 Copy as .env',
          id: 'copy-env',
          onClick: function (h, btn) {
            const data = h.getState().parsedData;
            if (data) {
               let env = "";
               Object.entries(data).forEach(([sec, keys]) => {
                  env += `# Section: ${sec}\n`;
                  Object.entries(keys).forEach(([k, v]) => { env += `${k.toUpperCase().replace(/\s+/g, '_')}=${v}\n`; });
                  env += "\n";
               });
               h.copyToClipboard(env.trim(), btn);
            }
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        try {
          const parsed = parseIni(content);
          helpers.setState('parsedData', parsed);
          const sections = Object.keys(parsed).filter(s => Object.keys(parsed[s]).length > 0);

          helpers.render(`
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                 <div class="flex px-2 bg-white border border-surface-200 rounded-lg">
                    <button id="tab-view" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Explorer</button>
                    <button id="tab-edit" class="px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Editor</button>
                 </div>
                 <div class="flex items-center gap-4">
                    <input type="text" id="ini-search" placeholder="Search keys..." class="px-2 py-1 text-[10px] border border-surface-200 rounded outline-none focus:ring-1 focus:ring-brand-500 w-32">
                    <span class="text-[10px] font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</span>
                 </div>
              </div>

              <div class="flex-1 overflow-hidden flex">
                 <!-- Explorer View -->
                 <div id="view-explorer" class="flex-1 flex overflow-hidden">
                    <div class="w-40 shrink-0 bg-surface-50 border-r border-surface-100 overflow-auto p-2 space-y-1">
                       ${sections.map(s => `<button data-section="${escapeHtml(s)}" class="sec-nav w-full text-left px-2 py-1.5 text-[10px] font-bold text-surface-500 hover:text-brand-600 truncate rounded">${escapeHtml(s)}</button>`).join('')}
                    </div>
                    <div id="ini-content" class="flex-1 overflow-auto p-6 space-y-8 bg-white shadow-inner">
                       ${sections.map(s => `
                         <section id="sec-${escapeHtml(s)}" class="ini-section bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                           <h3 class="bg-surface-50 px-4 py-2 border-b border-surface-100 text-[10px] font-bold text-surface-700 uppercase tracking-widest">${escapeHtml(s)}</h3>
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

                 <!-- Editor View -->
                 <div id="view-edit" class="hidden flex-1 flex flex-col bg-[#282c34]">
                    <div class="shrink-0 p-2 bg-[#21252b] border-b border-[#181a1f] flex gap-2">
                       <button id="btn-save-ini" class="px-3 py-1 bg-brand-600 text-white text-[10px] font-bold rounded hover:bg-brand-700">Apply Changes</button>
                    </div>
                    <textarea id="ini-editor" class="flex-1 w-full p-6 text-surface-100 bg-transparent outline-none resize-none font-mono text-[13px]" spellcheck="false">${escapeHtml(content)}</textarea>
                 </div>
              </div>
            </div>
          `);

          const tabView = document.getElementById('tab-view');
          const tabEdit = document.getElementById('tab-edit');
          const viewExplorer = document.getElementById('view-explorer');
          const viewEdit = document.getElementById('view-edit');

          tabView.onclick = () => {
             tabView.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             tabEdit.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
             viewExplorer.classList.remove('hidden');
             viewEdit.classList.add('hidden');
          };

          tabEdit.onclick = () => {
             tabEdit.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600";
             tabView.className = "px-3 py-1 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600";
             viewEdit.classList.remove('hidden');
             viewExplorer.classList.add('hidden');
          };

          document.getElementById('btn-save-ini').onclick = () => {
             _onFile(file, document.getElementById('ini-editor').value, helpers);
          };

          document.getElementById('ini-search').oninput = (e) => {
             const term = e.target.value.toLowerCase();
             document.querySelectorAll('.ini-row').forEach(row => { row.style.display = row.textContent.toLowerCase().includes(term) ? 'table-row' : 'none'; });
             document.querySelectorAll('.ini-section').forEach(sec => {
                sec.style.display = Array.from(sec.querySelectorAll('.ini-row')).some(r => r.style.display !== 'none') ? 'block' : 'none';
             });
          };

          document.querySelectorAll('.sec-nav').forEach(btn => {
             btn.onclick = () => {
                const el = document.getElementById(`sec-${btn.getAttribute('data-section')}`);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
             };
          });

        } catch (e) { helpers.showError('INI Error', 'Invalid format'); }
      }
    });
  };
})();

