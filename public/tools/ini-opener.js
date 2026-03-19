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
      const trimmedLine = line.trim();
      if (trimmedLine === '' || trimmedLine.startsWith(';') || trimmedLine.startsWith('#')) {
        continue;
      }

      if (trimmedLine.startsWith('[') && trimmedLine.includes(']')) {
        currentSection = trimmedLine.substring(1, trimmedLine.indexOf(']')).trim();
        sections[currentSection] = sections[currentSection] || {};
      } else if (trimmedLine.includes('=')) {
        const index = trimmedLine.indexOf('=');
        const key = trimmedLine.substring(0, index).trim();
        const value = trimmedLine.substring(index + 1).trim();
        sections[currentSection][key] = value;
      }
    }
    return sections;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ini',
      dropLabel: 'Drop an .ini file here',
      binary: false,
      infoHtml: '<strong>INI Viewer:</strong> Visual INI explorer with easy copy and export.',
      
      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (helpers, btn) {
            const data = helpers.getState().parsedData;
            if (data) {
              helpers.copyToClipboard(JSON.stringify(data, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data) {
              helpers.download(helpers.getFile().name.replace(/\.ini$/i, '.json'), JSON.stringify(data, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: function (file, content, helpers) {
        try {
          const parsed = parseIni(content);
          helpers.setState('parsedData', parsed);
          let html = '<div class="p-4 space-y-6">';
          let hasContent = false;

          for (const section in parsed) {
            const keys = Object.keys(parsed[section]);
            if (keys.length === 0) continue;
            hasContent = true;

            html += `
              <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">
                <div class="bg-surface-50 px-4 py-2 border-b border-surface-100 flex items-center justify-between">
                  <h3 class="text-sm font-bold text-surface-700 uppercase tracking-wider">${escapeHtml(section)}</h3>
                  <span class="text-[10px] font-mono text-surface-400">${keys.length} keys</span>
                </div>
                <div class="p-0">
                  <table class="w-full text-sm text-left">
                    <tbody class="divide-y divide-surface-100">
            `;

            for (const key of keys) {
              html += `
                <tr class="hover:bg-surface-50/50 transition-colors">
                  <td class="px-4 py-2.5 font-medium text-surface-500 w-1/3 border-r border-surface-50">
                    <div class="flex items-center gap-2">
                      <span class="w-1.5 h-1.5 rounded-full bg-brand-400"></span>
                      ${escapeHtml(key)}
                    </div>
                  </td>
                  <td class="px-4 py-2.5 font-mono text-brand-600 break-all select-all">${escapeHtml(parsed[section][key])}</td>
                </tr>
              `;
            }

            html += `
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }

          html += '</div>';

          if (!hasContent) {
            helpers.render('<div class="p-12 text-center text-surface-400 font-medium">No valid INI content found.</div>');
          } else {
            helpers.render(html);
          }
        } catch (e) {
          helpers.showError('Parsing Error', e.message);
        }
      }
    });
  };
})();
