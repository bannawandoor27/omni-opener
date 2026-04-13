/**
 * OmniOpener — JSON Viewer/Toolkit Tool
 * Uses OmniTool SDK, JSONPath-plus, and js-yaml.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
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
          helpers.setState({
            originalJson: parsed,
            currentJson: parsed,
            fileName: file.name,
            fileSize: formatBytes(file.size),
            view: 'tree'
          });
          
          renderApp(helpers);
        } catch (err) {
          helpers.showError('Invalid JSON', err.message);
        }
      }
    });

    function renderApp(helpers) {
      const state = helpers.getState();
      const parsed = state.currentJson;
      
      let itemCount = 0;
      if (Array.isArray(parsed)) itemCount = parsed.length;
      else if (typeof parsed === 'object' && parsed !== null) itemCount = Object.keys(parsed).length;

      const renderHtml = `
        <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
          <!-- Header -->
          <div class="shrink-0 bg-surface-50 border-b border-surface-200">
            <div class="flex items-center justify-between px-4 py-3">
              <div class="flex items-center gap-3">
                <span class="text-xl">📦</span>
                <div class="space-y-0.5">
                  <h3 class="text-sm font-bold text-surface-900 truncate max-w-md">${escapeHtml(state.fileName)}</h3>
                  <p class="text-[10px] text-surface-400 font-bold uppercase tracking-wider">${state.fileSize} • ${itemCount} ${Array.isArray(parsed) ? 'items' : 'keys'}</p>
                </div>
              </div>
              <div class="flex gap-2">
                <button id="btn-expand-all" class="px-2 py-1 text-[10px] font-bold bg-white border border-surface-200 rounded hover:bg-surface-50 transition-colors uppercase">Expand All</button>
                <button id="btn-collapse-all" class="px-2 py-1 text-[10px] font-bold bg-white border border-surface-200 rounded hover:bg-surface-50 transition-colors uppercase">Collapse All</button>
              </div>
            </div>

            <!-- Query Bar -->
            <div class="px-4 pb-3 pt-1 flex gap-2">
              <div class="relative flex-[2]">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-brand-500 font-mono">$</span>
                <input type="text" id="json-query" 
                  placeholder="JSONPath (e.g. $.items[*].name)" 
                  class="w-full pl-7 pr-4 py-2 text-xs font-mono border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 outline-none bg-white shadow-sm"
                >
              </div>
              <div class="relative flex-1">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs">🔍</span>
                <input type="text" id="tree-search" 
                  placeholder="Filter tree..." 
                  class="w-full pl-8 pr-4 py-2 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 outline-none bg-white shadow-sm"
                >
              </div>
              <button id="btn-run-query" class="px-4 py-2 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-sm">Run</button>
            </div>

            <!-- Tabs -->
            <div class="flex px-4 border-t border-surface-100 bg-white gap-4">
              <button id="tab-tree" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'tree' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Tree View</button>
              <button id="tab-raw" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'raw' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Raw Source</button>
              <button id="tab-convert" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 ${state.view === 'convert' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-400'}">Convert</button>
            </div>
          </div>

          <!-- Content -->
          <div id="json-viewport" class="flex-1 overflow-auto bg-white p-6 font-mono text-[13px]">
            <div id="view-tree" class="${state.view === 'tree' ? '' : 'hidden'} space-y-1"></div>
            <pre id="view-raw" class="${state.view === 'raw' ? '' : 'hidden'} text-surface-800 whitespace-pre"></pre>
            
            <div id="view-convert" class="${state.view === 'convert' ? '' : 'hidden'} space-y-6">
               <div class="grid grid-cols-3 gap-4">
                  <button id="conv-csv" class="p-4 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-500 transition-all text-center">
                     <span class="text-xl mb-1 block">📊</span>
                     <span class="font-bold block text-xs uppercase tracking-wider">CSV</span>
                  </button>
                  <button id="conv-yaml" class="p-4 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-500 transition-all text-center">
                     <span class="text-xl mb-1 block">📝</span>
                     <span class="font-bold block text-xs uppercase tracking-wider">YAML</span>
                  </button>
                  <button id="conv-ts" class="p-4 bg-surface-50 border border-surface-200 rounded-xl hover:border-brand-500 transition-all text-center">
                     <span class="text-xl mb-1 block">🔷</span>
                     <span class="font-bold block text-xs uppercase tracking-wider">TS</span>
                  </button>
               </div>
               <textarea id="conv-output" readonly class="w-full h-64 p-4 bg-surface-50 border border-surface-200 rounded-xl text-xs font-mono outline-none shadow-inner" placeholder="Conversion output will appear here..."></textarea>
            </div>
          </div>
        </div>
      `;
      helpers.render(renderHtml);

      // Tree View Logic
      const treeContainer = document.getElementById('view-tree');
      const searchTerm = (document.getElementById('tree-search').value || '').toLowerCase();
      
      function hasMatch(data, term) {
        if (data === null) return "null".includes(term);
        if (typeof data !== 'object') return String(data).toLowerCase().includes(term);
        if (Array.isArray(data)) return data.some(v => hasMatch(v, term));
        return Object.entries(data).some(([k, v]) => k.toLowerCase().includes(term) || hasMatch(v, term));
      }

      function renderTree(data, container, label = '', depth = 0) {
        const isObject = data !== null && typeof data === 'object';
        const isArray = Array.isArray(data);
        
        if (searchTerm && !hasMatch({[label]: data}, searchTerm)) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'pl-4 border-l border-surface-100 hover:border-brand-200 transition-colors';
        
        if (isObject) {
          const header = document.createElement('div');
          header.className = 'flex items-center gap-2 cursor-pointer group py-0.5';
          header.innerHTML = `
            <span class="text-[10px] text-surface-400 group-hover:text-brand-500 transition-transform">▼</span>
            <span class="text-brand-700 font-bold">${label ? escapeHtml(label) + ':' : ''}</span>
            <span class="text-surface-400 text-[11px]">${isArray ? '[' + data.length + ']' : '{' + Object.keys(data).length + '}'}</span>
          `;
          
          const body = document.createElement('div');
          body.className = 'ml-2';
          header.onclick = () => {
            const isCollapsed = body.classList.toggle('hidden');
            header.querySelector('span').style.transform = isCollapsed ? 'rotate(-90deg)' : '';
          };
          
          if (isArray) {
            data.forEach((val, i) => renderTree(val, body, i, depth + 1));
          } else {
            Object.entries(data).forEach(([key, val]) => renderTree(val, body, key, depth + 1));
          }
          wrapper.appendChild(header);
          wrapper.appendChild(body);
        } else {
          let valStr = JSON.stringify(data);
          let valClass = 'text-surface-600';
          if (typeof data === 'string') valClass = 'text-green-600';
          if (typeof data === 'number') valClass = 'text-blue-600';
          if (typeof data === 'boolean') valClass = 'text-purple-600';
          
          const labelHtml = label ? `<span class="text-brand-700 font-bold">${escapeHtml(label)}:</span> ` : '';
          wrapper.innerHTML = `<div class="py-0.5">${labelHtml}<span class="${valClass}">${escapeHtml(valStr)}</span></div>`;
        }
        container.appendChild(wrapper);
      }

      if (state.view === 'tree') renderTree(parsed, treeContainer);
      if (state.view === 'raw') document.getElementById('view-raw').textContent = JSON.stringify(parsed, null, 2);

      // Event Listeners
      document.getElementById('tree-search').oninput = (e) => {
        renderApp(helpers);
        document.getElementById('tree-search').focus();
      };

      document.getElementById('btn-expand-all').onclick = () => {
        treeContainer.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
        treeContainer.querySelectorAll('span.transition-transform').forEach(el => el.style.transform = '');
      };

      document.getElementById('btn-collapse-all').onclick = () => {
        treeContainer.children.forEach(child => {
          const body = child.querySelector('div.ml-2');
          if (body) {
            body.classList.add('hidden');
            child.querySelector('span.transition-transform').style.transform = 'rotate(-90deg)';
          }
        });
      };

      document.getElementById('btn-run-query').onclick = () => {
        const query = document.getElementById('json-query').value.trim();
        if (!query) return;
        try {
          const result = jsonpath.query(state.originalJson, query);
          helpers.setState({ currentJson: result, view: 'tree' });
          renderApp(helpers);
        } catch (e) {
          helpers.showError('Query Error', e.message);
        }
      };

      document.getElementById('tab-tree').onclick = () => { helpers.setState('view', 'tree'); renderApp(helpers); };
      document.getElementById('tab-raw').onclick = () => { helpers.setState('view', 'raw'); renderApp(helpers); };
      document.getElementById('tab-convert').onclick = () => { helpers.setState('view', 'convert'); renderApp(helpers); };

      // Conversion actions
      if (state.view === 'convert') {
        const output = document.getElementById('conv-output');
        document.getElementById('conv-csv').onclick = () => {
          try {
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            output.value = Papa.unparse(arr);
          } catch (e) { output.value = 'Error: JSON must be an array of objects for CSV.'; }
        };
        document.getElementById('conv-yaml').onclick = () => { output.value = jsyaml.dump(parsed); };
        document.getElementById('conv-ts').onclick = () => { output.value = generateTS(parsed); };
      }
    }

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
  };
})();
