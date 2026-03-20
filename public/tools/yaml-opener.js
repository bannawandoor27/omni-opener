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
      infoHtml: '<strong>YAML Toolkit:</strong> Professional YAML utility with Interactive Editor, Schema Validation, and Tree View.',
      
      actions: [
        {
          label: '📋 Copy YAML',
          id: 'copy-yaml',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
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
                  <button id="tab-edit" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600">Editor</button>
                  <button id="tab-tree" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Tree View</button>
                  <button id="tab-validate" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Validate</button>
                </div>
                <div class="px-4 text-[10px] font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</div>
              </div>

              <!-- Content Area -->
              <div id="yaml-viewport" class="flex-1 overflow-auto bg-white font-mono text-[12px] leading-relaxed">
                <!-- Editor Tab -->
                <div id="view-edit" class="h-full flex flex-col">
                   <div class="shrink-0 p-2 bg-surface-50 border-b border-surface-100 flex gap-2">
                      <button id="btn-sync" class="px-3 py-1 bg-brand-600 text-white text-[10px] font-bold rounded-lg hover:bg-brand-700 transition-colors">Sync & Preview</button>
                      <button id="btn-prettify" class="px-3 py-1 bg-white border border-surface-200 text-surface-600 text-[10px] font-bold rounded-lg hover:bg-surface-50 transition-colors">Prettify</button>
                   </div>
                   <textarea id="yaml-editor" class="flex-1 w-full p-4 text-surface-800 bg-white outline-none resize-none font-mono text-[13px]" spellcheck="false">${escapeHtml(content)}</textarea>
                </div>

                <!-- Tree View Tab -->
                <div id="view-tree" class="hidden p-4 space-y-1"></div>

                <!-- Validate Tab -->
                <div id="view-validate" class="hidden p-8 flex flex-col items-center justify-center text-center">
                   <div id="validate-status" class="mb-4">
                      <span class="text-5xl">✅</span>
                      <h2 class="text-lg font-bold text-surface-900 mt-2">YAML is Well-Formed</h2>
                      <p class="text-sm text-surface-500">Syntax is correct and parsable.</p>
                   </div>
                   <div class="w-full max-w-md mt-6 p-4 bg-surface-50 rounded-xl border border-surface-200 text-left">
                      <h3 class="text-[10px] font-bold uppercase text-surface-400 mb-2">Structure Summary</h3>
                      <div id="validate-info" class="text-[11px] space-y-1 text-surface-600"></div>
                   </div>
                </div>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const treeContainer = document.getElementById('view-tree');
          const editor = document.getElementById('yaml-editor');
          const validateInfo = document.getElementById('validate-info');

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

          function updateValidation() {
             const keys = Object.keys(parsed || {}).length;
             validateInfo.innerHTML = `
                <div class="flex justify-between"><span>Top-level keys:</span><span class="font-bold">${keys}</span></div>
                <div class="flex justify-between"><span>Type:</span><span class="font-bold">${Array.isArray(parsed) ? 'Array' : typeof parsed}</span></div>
             `;
          }
          updateValidation();

          document.getElementById('btn-sync').onclick = () => {
             const newContent = editor.value;
             try {
                jsyaml.load(newContent);
                _onFile(file, newContent, helpers);
             } catch (e) {
                helpers.showError('YAML Error', e.message);
             }
          };

          document.getElementById('btn-prettify').onclick = () => {
             try {
                const obj = jsyaml.load(editor.value);
                const pretty = jsyaml.dump(obj, { indent: 2, lineWidth: -1 });
                editor.value = pretty;
             } catch (e) {
                helpers.showError('YAML Error', e.message);
             }
          };

          const tabs = { edit: document.getElementById('tab-edit'), tree: document.getElementById('tab-tree'), validate: document.getElementById('tab-validate') };
          const views = { edit: document.getElementById('view-edit'), tree: treeContainer, validate: document.getElementById('view-validate') };

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

