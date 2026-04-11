/**
 * OmniOpener — JSON Viewer/Toolkit Tool
 * Uses OmniTool SDK, JSONPath-plus, and js-yaml.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.json',
      dropLabel: 'Drop a .json file here',
      binary: false,
      infoHtml: '<strong>JSON Toolkit:</strong> Professional-grade JSON viewer with Tree View, JSONPath querying, and multi-format conversion.',
      
      actions: [
        {
          label: '📋 Copy JSON', 
          id: 'copy-json', 
          onClick: function (helpers, btn) {
            const content = helpers.getState().currentJson;
            if (content) {
              helpers.copyToClipboard(JSON.stringify(content, null, 2), btn);
            }
          } 
        },
        {
          label: '📥 Download', 
          id: 'dl-json', 
          onClick: function (helpers) {
            const content = helpers.getState().currentJson;
            if (content) {
              helpers.download(helpers.getFile().name, JSON.stringify(content, null, 2), 'application/json');
            }
          }
        }
      ],

      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jsonpath@1.1.1/jsonpath.min.js');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js');
      },

      onFile: function (file, content, helpers) {
        helpers.showLoading('Parsing JSON...');
        
        try {
          const parsed = JSON.parse(content);
          helpers.setState('originalJson', parsed);
          helpers.setState('currentJson', parsed);
          
          const fileSize = formatBytes(file.size);
          
          let itemCount = 0;
          if (Array.isArray(parsed)) itemCount = parsed.length;
          else if (typeof parsed === 'object' && parsed !== null) itemCount = Object.keys(parsed).length;

          const renderHtml = `
            <div class="flex flex-col h-[80vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <!-- Header -->
              <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                <div class="flex items-center justify-between px-4 py-2 text-xs text-surface-500 font-medium">
                  <div class="flex items-center gap-2 truncate mr-4">
                    <span class="text-lg">📦</span>
                    <span class="truncate">${escapeHtml(file.name)}</span>
                  </div>
                  <div class="shrink-0 flex items-center gap-3">
                    <span>${fileSize}</span>
                    <span class="w-1 h-1 bg-surface-300 rounded-full"></span>
                    <span>${itemCount} ${Array.isArray(parsed) ? 'items' : 'keys'}</span>
                  </div>
                </div>

                <!-- Query Bar -->
                <div class="px-3 pb-3 pt-1 flex gap-2">
                  <div class="relative flex-1 group">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-brand-500 font-mono">$</span>
                    <input type="text" id="json-query" 
                      placeholder="JSONPath query (e.g. $.items[*].name)" 
                      class="w-full pl-7 pr-4 py-2 text-xs font-mono border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                    >
                  </div>
                  <div class="relative flex-1">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                    <input type="text" id="tree-search" 
                      placeholder="Search in tree..." 
                      class="w-full pl-8 pr-4 py-2 text-xs border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all bg-white"
                    >
                  </div>
                  <button id="btn-run-query" class="px-3 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors">Run</button>
                  <button id="btn-reset-query" class="px-3 py-2 bg-surface-100 text-surface-600 text-xs font-bold rounded-lg hover:bg-surface-200 transition-colors">Reset</button>
                </div>

                <!-- Tabs -->
                <div class="flex px-2 border-t border-surface-100 bg-white">
                  <button id="tab-tree" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600 transition-colors">Tree View</button>
                  <button id="tab-raw" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Raw Source</button>
                  <button id="tab-convert" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Convert</button>
                  <button id="tab-schema" class="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors">Schema</button>
                </div>
              </div>

              <!-- Content Area -->
              <div id="json-viewport" class="flex-1 overflow-auto bg-white p-4 font-mono text-[13px] leading-relaxed">
                <div id="view-tree" class="space-y-1"></div>
                <pre id="view-raw" class="hidden text-surface-800 whitespace-pre"></pre>
                
                <!-- Convert View -->
                <div id="view-convert" class="hidden space-y-6 p-4">
                   <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <button id="conv-csv" class="p-4 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-500 transition-all text-left">
                         <span class="text-xl mb-2 block">📊</span>
                         <span class="font-bold block text-sm">Convert to CSV</span>
                         <span class="text-[10px] text-surface-400">Best for flat arrays of objects</span>
                      </button>
                      <button id="conv-yaml" class="p-4 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-500 transition-all text-left">
                         <span class="text-xl mb-2 block">📝</span>
                         <span class="font-bold block text-sm">Convert to YAML</span>
                         <span class="text-[10px] text-surface-400">Clean, human-readable format</span>
                      </button>
                      <button id="conv-ts" class="p-4 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-500 transition-all text-left">
                         <span class="text-xl mb-2 block">🔷</span>
                         <span class="font-bold block text-sm">TS Interface</span>
                         <span class="text-[10px] text-surface-400">Generate TypeScript types</span>
                      </button>
                   </div>
                   <div class="mt-4">
                      <textarea id="conv-output" readonly class="w-full h-48 p-4 bg-surface-50 border border-surface-200 rounded-xl text-xs font-mono outline-none" placeholder="Conversion output will appear here..."></textarea>
                   </div>
                </div>

                <!-- Schema View -->
                <div id="view-schema" class="hidden p-4">
                   <h3 class="text-[10px] font-bold uppercase text-surface-400 mb-4">Visual Schema Mapping</h3>
                   <div id="schema-content" class="space-y-2"></div>
                </div>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const views = {
            'tab-tree': 'view-tree',
            'tab-raw': 'view-raw',
            'tab-convert': 'view-convert',
            'tab-schema': 'view-schema'
          };

          Object.keys(views).forEach(tabId => {
            document.getElementById(tabId).onclick = () => {
              Object.keys(views).forEach(id => {
                document.getElementById(id).className = 'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400 hover:text-surface-600 transition-colors';
                document.getElementById(views[id]).classList.add('hidden');
              });
              document.getElementById(tabId).className = 'px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600 transition-colors';
              document.getElementById(views[tabId]).classList.remove('hidden');
              if (tabId === 'tab-schema') updateSchema();
            };
          });

          function hasMatch(data, term) {
             if (data === null) return "null".includes(term);
             if (typeof data !== 'object') return String(data).toLowerCase().includes(term);
             if (Array.isArray(data)) return data.some(v => hasMatch(v, term));
             return Object.entries(data).some(([k, v]) => String(k).toLowerCase().includes(term) || hasMatch(v, term));
          }

          function renderTree(data, container, label = '', isLast = true, searchTerm = '') {
            const isObject = data !== null && typeof data === 'object';
            const isArray = Array.isArray(data);
            
            if (searchTerm) {
               const matches = (String(label).toLowerCase().includes(searchTerm) || 
                               (!isObject && String(data).toLowerCase().includes(searchTerm)));
               if (!matches && isObject) {
                  const childMatches = isArray ? 
                     data.some(v => hasMatch(v, searchTerm)) : 
                     Object.entries(data).some(([k, v]) => String(k).toLowerCase().includes(searchTerm) || hasMatch(v, searchTerm));
                  if (!childMatches) return;
               }
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'pl-4 border-l border-surface-100 hover:border-brand-200 transition-colors';
            
            if (isObject) {
              const header = document.createElement('div');
              header.className = 'flex items-center gap-2 cursor-pointer group py-0.5';
              header.innerHTML = `
                <span class="text-[10px] text-surface-400 group-hover:text-brand-500 transition-transform">▼</span>
                <span class="text-brand-700 font-bold">${label ? label + ':' : ''}</span>
                <span class="text-surface-400 text-[11px]">${isArray ? '[' + data.length + ' items]' : '{' + Object.keys(data).length + ' keys}'}</span>
              `;
              
              const body = document.createElement('div');
              body.className = 'ml-2';
              header.onclick = () => {
                const isCollapsed = body.classList.toggle('hidden');
                header.querySelector('span').style.transform = isCollapsed ? 'rotate(-90deg)' : '';
              };
              
              if (isArray) {
                data.forEach((val, i) => renderTree(val, body, i, i === data.length - 1, searchTerm));
              } else {
                const entries = Object.entries(data);
                entries.forEach(([key, val], i) => renderTree(val, body, key, i === entries.length - 1, searchTerm));
              }
              wrapper.appendChild(header);
              wrapper.appendChild(body);
            } else {
              let valStr = JSON.stringify(data);
              let valClass = 'text-surface-600';
              if (typeof data === 'string') valClass = 'text-green-600';
              if (typeof data === 'number') valClass = 'text-blue-600';
              if (typeof data === 'boolean') valClass = 'text-purple-600';
              if (data === null) valClass = 'text-surface-400';

              wrapper.innerHTML = `<div class="py-0.5"><span class="text-brand-700 font-bold">${label ? label + ':' : ''}</span> <span class="${valClass}">${escapeHtml(valStr)}</span></div>`;
            }
            container.appendChild(wrapper);
          }

          function updateViews() {
            const current = helpers.getState().currentJson;
            const treeContainer = document.getElementById('view-tree');
            const rawContainer = document.getElementById('view-raw');
            if (treeContainer) {
              treeContainer.innerHTML = '';
              const searchTerm = document.getElementById('tree-search')?.value.toLowerCase() || '';
              renderTree(current, treeContainer, '', true, searchTerm);
            }
            if (rawContainer) rawContainer.textContent = JSON.stringify(current, null, 2);
          }

          document.getElementById('tree-search').oninput = updateViews;

          document.getElementById('btn-run-query').onclick = () => {
            const query = document.getElementById('json-query').value.trim();
            if (!query) return;
            try {
              const result = jsonpath.query(helpers.getState().originalJson, query);
              helpers.setState('currentJson', result);
              updateViews();
            } catch (e) {
              helpers.showError('Query Error', e.message);
            }
          };

          document.getElementById('btn-reset-query').onclick = () => {
            document.getElementById('json-query').value = '';
            helpers.setState('currentJson', helpers.getState().originalJson);
            updateViews();
          };

          // Conversion Logic
          document.getElementById('conv-csv').onclick = () => {
             const data = helpers.getState().currentJson;
             const arr = Array.isArray(data) ? data : [data];
             try {
                const csv = Papa.unparse(arr);
                document.getElementById('conv-output').value = csv;
             } catch (e) {
                helpers.showError('CSV Error', 'JSON must be an array of objects for CSV conversion.');
             }
          };

          document.getElementById('conv-yaml').onclick = () => {
             const data = helpers.getState().currentJson;
             document.getElementById('conv-output').value = jsyaml.dump(data);
          };

          document.getElementById('conv-ts').onclick = () => {
             const data = helpers.getState().currentJson;
             document.getElementById('conv-output').value = generateTS(data);
          };

          function generateTS(obj, name = 'Root') {
             if (Array.isArray(obj)) return `type ${name} = ${generateTS(obj[0], name + 'Item')}[];`;
             if (obj === null || typeof obj !== 'object') return typeof obj;
             let res = `interface ${name} {\n`;
             for (const [key, val] of Object.entries(obj)) {
                res += `  ${key}: ${typeof val === 'object' && val !== null ? 'any' : typeof val};\n`;
             }
             res += `}`;
             return res;
          }

          function updateSchema() {
             const data = helpers.getState().originalJson;
             const schema = {};
             function walk(obj, path = '$') {
                if (obj === null || typeof obj !== 'object') {
                   schema[path] = typeof obj;
                   return;
                }
                if (Array.isArray(obj)) {
                   schema[path] = 'Array<' + (typeof obj[0] === 'object' ? 'Object' : typeof obj[0]) + '>';
                   if (obj[0] && typeof obj[0] === 'object') walk(obj[0], path + '[*]');
                } else {
                   schema[path] = 'Object';
                   for (const [key, val] of Object.entries(obj)) walk(val, path + '.' + key);
                }
             }
             walk(data);
             document.getElementById('schema-content').innerHTML = Object.entries(schema).map(([path, type]) => `
                <div class="flex items-center gap-4 py-1 border-b border-surface-50 text-[11px]">
                   <span class="font-mono text-brand-600 w-1/2 truncate" title="${path}">${path}</span>
                   <span class="px-2 py-0.5 bg-surface-100 text-surface-600 rounded-md font-bold">${type}</span>
                </div>
             `).join('');
          }

          updateViews();

        } catch (err) {
          helpers.showError('Invalid JSON', 'The file could not be parsed as JSON. ' + err.message);
        }
      }
    });
  };

})();

