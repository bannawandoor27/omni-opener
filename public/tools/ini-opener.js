/**
 * OmniOpener — INI Viewer Tool
 * Uses OmniTool SDK. Renders .ini files as a structured list.
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
    let currentSection = null;
    const lines = data.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();
      // Ignore empty lines and comment lines
      if (trimmedLine === '' || trimmedLine.startsWith(';') || trimmedLine.startsWith('#')) {
        continue;
      }

      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        currentSection = trimmedLine.substring(1, trimmedLine.length - 1);
        sections[currentSection] = {};
      } else if (currentSection && trimmedLine.includes('=')) {
        const [key, value] = trimmedLine.split('=', 2);
        sections[currentSection][key.trim()] = value.trim();
      }
    }
    return sections;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ini',
      dropLabel: 'Drop an .ini file here',
      binary: false,
      infoHtml: '<strong>INI Viewer:</strong> Displays the content of .ini files.',
      
      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing INI file...');
        
        try {
          const parsed = parseIni(content);
          let html = '<div class="p-4 bg-surface-50 rounded-lg shadow-inner">';

          for (const section in parsed) {
            html += `<h3 class="text-lg font-semibold text-brand-800 mt-4 mb-2">[${escapeHtml(section)}]</h3>`;
            html += '<ul class="list-disc list-inside bg-white p-3 rounded-md">';
            for (const key in parsed[section]) {
              html += `<li class="text-sm"><span class="font-semibold">${escapeHtml(key)}</span> = <span class="font-mono">${escapeHtml(parsed[section][key])}</span></li>`;
            }
            html += '</ul>';
          }

          html += '</div>';
          helpers.render(html);
        } catch (e) {
          helpers.showError('Error parsing .ini file', e.message);
        }
      }
    });
  };
})();
