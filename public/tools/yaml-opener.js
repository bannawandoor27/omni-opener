/**
 * OmniOpener — YAML Toolkit
 * Uses OmniTool SDK and js-yaml.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.yaml,.yml',
      dropLabel: 'Drop a .yaml or .yml file',
      binary: false,
      infoHtml: '<strong>YAML Toolkit:</strong> Professional YAML utility with Tree View, JSON conversion, and formatting.',
      
      actions: [
        {
          label: '✨ Format YAML',
          id: 'format-yaml',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data && typeof jsyaml !== 'undefined') {
              try {
                const formatted = jsyaml.dump(data, { indent: 2, lineWidth: -1 });
                // Trigger re-process with formatted content
                helpers.getMountEl()._onFileUpdate(helpers.getFile(), formatted);
              } catch (e) {
                helpers.showError('Format Error', e.message);
              }
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data) {
              helpers.download(helpers.getFile().name.replace(/\.ya?ml$/i, '.json'), JSON.stringify(data, null, 2), 'application/json');
            }
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js');
      },

      onFile: function _onFile(file, content, helpers) {
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        if (typeof jsyaml === 'undefined') {
          helpers.showLoading('Loading YAML engine...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        try {
          const parsed = jsyaml.load(content);
          helpers.setState('parsedData', parsed);

          const renderHtml = `
            <div class="flex flex-col h-[80vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <!-- Header -->
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                <div class="flex px-2">
                  <button id="tab-source" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600">YAML Source</button>
                  <button id="tab-tree" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Tree View</button>
                  <button id="tab-json" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">JSON View</button>
                </div>
                <div class="px-4 text-[10px] font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</div>
              </div>

              <!-- Content Area -->
              <div id="yaml-viewport" class="flex-1 overflow-auto p-4 bg-white font-mono text-[12px] leading-relaxed">
                <pre id="view-source" class="text-surface-800 whitespace-pre">${escapeHtml(content)}</pre>
                <div id="view-tree" class="hidden space-y-1"></div>
                <pre id="view-json" class="hidden text-surface-600 whitespace-pre">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const treeContainer = document.getElementById('view-tree');
          const sourceView = document.getElementById('view-source');
          const jsonView = document.getElementById('view-json');

          function renderTree(data, container, label = '') {
            const wrapper = document.createElement('div');
            wrapper.className = 'pl-4 border-l border-surface-100 py-0.5';
            if (data !== null && typeof data === 'object') {
              const entries = Object.entries(data);
              const header = document.createElement('div');
              header.className = 'flex items-center gap-2 cursor-pointer group';
              header.innerHTML = `<span class="text-[8px] text-surface-300 group-hover:text-brand-500">▼</span><span class="text-brand-700 font-bold">${escapeHtml(label || 'root')}</span>`;
              const body = document.createElement('div');
              body.className = 'ml-1';
              header.onclick = () => {
                const isCollapsed = body.classList.toggle('hidden');
                header.querySelector('span').style.transform = isCollapsed ? 'rotate(-90deg)' : '';
              };
              wrapper.appendChild(header);
              wrapper.appendChild(body);
              entries.forEach(([k, v]) => renderTree(v, body, k));
            } else {
              wrapper.innerHTML = `<div class="flex gap-2"><span class="text-brand-700 font-bold">${escapeHtml(label)}:</span><span class="text-surface-600">${escapeHtml(String(data))}</span></div>`;
            }
            container.appendChild(wrapper);
          }
          renderTree(parsed, treeContainer);

          const tabs = { source: document.getElementById('tab-source'), tree: document.getElementById('tab-tree'), json: document.getElementById('tab-json') };
          const views = { source: sourceView, tree: treeContainer, json: jsonView };

          Object.keys(tabs).forEach(k => {
            tabs[k].onclick = () => {
              Object.values(tabs).forEach(t => t.classList.replace('border-brand-500', 'border-transparent'));
              Object.values(tabs).forEach(t => t.classList.replace('text-brand-600', 'text-surface-400'));
              tabs[k].classList.replace('border-transparent', 'border-brand-500');
              tabs[k].classList.replace('text-surface-400', 'text-brand-600');
              Object.values(views).forEach(v => v.classList.add('hidden'));
              views[k].classList.remove('hidden');
            };
          });

        } catch (e) {
          helpers.showError('YAML Parse Error', e.message);
        }
      }
    });
  };
})();
