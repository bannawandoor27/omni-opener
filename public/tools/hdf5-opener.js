(function () {
  'use strict';

  /**
   * Escapes strings for safe HTML insertion
   */
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Human-readable byte formatting
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.h5,.hdf5,.hdf,.he5,.he4',
      dropLabel: 'Drop HDF5 file here',
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
          'https://cdn.jsdelivr.net/npm/js-five@0.3.8/dist/hdf5.js'
        ]);
      },
      actions: [
        {
          label: '📥 Download File',
          id: 'dl',
          onClick: function (h) {
            const content = h.getContent();
            const file = h.getFile();
            if (content && file) h.download(file.name, content);
          }
        },
        {
          label: '📋 Copy SHA-256',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().sha256;
            if (hash) h.copyToClipboard(hash, btn);
          }
        }
      ],
      onFile: async function (file, content, h) {
        h.showLoading('Analyzing HDF5 Structure...');

        // 1. Compute Integrity Hash
        const hashBuffer = await crypto.subtle.digest('SHA-256', content);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        h.setState({ sha256: hashHex });

        // 2. Load dependencies if missing
        if (typeof hdf5 === 'undefined') {
          await h.loadScripts([
            'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
            'https://cdn.jsdelivr.net/npm/js-five@0.3.8/dist/hdf5.js'
          ]);
        }

        // 3. Parse HDF5
        try {
          const f = new hdf5.File(content, file.name);
          renderHdf5Viewer(f, h, hashHex);
        } catch (err) {
          console.error('[HDF5 Error]', err);
          h.showError('HDF5 Parse Error', 'This file might be an unsupported HDF5 version or corrupted. Detail: ' + err.message);
        }
      }
    });
  };

  function renderHdf5Viewer(f, h, hashHex) {
    const file = h.getFile();
    h.render(`
      <div class="flex flex-col h-full min-h-[650px] animate-in fade-in duration-500">
        <!-- File Info Header -->
        <div class="p-4 border-b bg-surface-50 flex flex-wrap items-center gap-4 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-bold text-surface-900">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-600">${formatSize(file.size)}</span>
          </div>
          <div class="flex items-center gap-2 font-mono text-brand-600 bg-brand-50 px-2 py-1 rounded border border-brand-100">
            <span class="text-[10px] uppercase font-bold text-brand-400">SHA256:</span>
            ${hashHex.substring(0, 12)}...${hashHex.substring(hashHex.length - 8)}
          </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <!-- Sidebar: Tree Navigation -->
          <div class="w-1/3 md:w-1/4 border-r flex flex-col bg-white">
            <div class="p-2 border-b bg-surface-50 text-[10px] font-bold uppercase tracking-wider text-surface-500 flex items-center justify-between">
              <span>Hierarchy</span>
              <span class="text-surface-300">Click to expand</span>
            </div>
            <div id="hdf5-tree" class="flex-1 overflow-auto p-2 text-sm custom-scrollbar"></div>
          </div>

          <!-- Content: Item Inspector -->
          <div class="flex-1 flex flex-col bg-white overflow-hidden">
            <div class="p-2 border-b bg-surface-50 text-[10px] font-bold uppercase tracking-wider text-surface-500">
              Object Inspector
            </div>
            <div id="hdf5-inspector" class="flex-1 overflow-auto p-6 custom-scrollbar bg-white">
              <div class="flex flex-col items-center justify-center h-full text-surface-400 space-y-4 opacity-50">
                <span class="text-5xl">📊</span>
                <p class="text-sm font-medium">Select a Group or Dataset to inspect</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        @keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fade-in 0.3s ease-out forwards; }
        .tree-row { transition: all 0.2s ease; border-radius: 6px; }
        .tree-row:hover { background-color: #f8fafc; color: #4f46e5; }
        .tree-row-active { background-color: #eef2ff !important; color: #4f46e5 !important; font-weight: 600; box-shadow: inset 0 0 0 1px #e0e7ff; }
        .group-children { border-left: 1px solid #f1f5f9; margin-left: 14px; }
      </style>
    `);

    const treeContainer = document.getElementById('hdf5-tree');
    
    function buildTree(item, path, container, depth = 0) {
      const name = item.name || (depth === 0 ? '/' : 'unnamed');
      const isGroup = item instanceof hdf5.Group;
      
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'flex flex-col mb-0.5';
      
      const row = document.createElement('div');
      row.className = 'tree-row flex items-center gap-2 py-1.5 px-2 cursor-pointer text-surface-600 select-none';
      row.style.paddingLeft = (depth * 12 + 8) + 'px';
      
      const icon = isGroup ? '📁' : '📊';
      row.innerHTML = `
        <span class="text-xs shrink-0">${icon}</span>
        <span class="truncate" title="${esc(name)}">${esc(name)}</span>
      `;
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'group-children hidden';

      row.onclick = () => {
        if (isGroup) {
          childrenContainer.classList.toggle('hidden');
        }
        
        // Active states
        treeContainer.querySelectorAll('.tree-row-active').forEach(el => el.classList.remove('tree-row-active'));
        row.classList.add('tree-row-active');
        
        inspectHdf5Object(item, path, h);
      };

      itemWrapper.appendChild(row);
      
      if (isGroup && item.children) {
        itemWrapper.appendChild(childrenContainer);
        // Sort keys: Groups then Datasets
        const keys = Object.keys(item.children).sort((a, b) => {
          const itemA = item.get(a);
          const itemB = item.get(b);
          const isGA = itemA instanceof hdf5.Group;
          const isGB = itemB instanceof hdf5.Group;
          if (isGA && !isGB) return -1;
          if (!isGA && isGB) return 1;
          return a.localeCompare(b);
        });

        keys.forEach(childName => {
          const childPath = path === '/' ? '/' + childName : path + '/' + childName;
          buildTree(item.get(childName), childPath, childrenContainer, depth + 1);
        });
      }
      
      container.appendChild(itemWrapper);
    }

    const root = f.get('/');
    buildTree(root, '/', treeContainer);
  }

  function inspectHdf5Object(item, path, h) {
    const container = document.getElementById('hdf5-inspector');
    const isGroup = item instanceof hdf5.Group;
    const isDataset = item instanceof hdf5.Dataset;

    let html = `
      <div class="max-w-5xl space-y-8 animate-in">
        <div class="border-b pb-6">
          <div class="flex items-center gap-4 mb-2">
            <span class="text-3xl">${isGroup ? '📁' : '📊'}</span>
            <div>
              <h2 class="text-2xl font-black text-surface-900 leading-none">${esc(item.name || '/')}</h2>
              <p class="text-[10px] font-mono text-surface-400 mt-2 bg-surface-50 px-2 py-0.5 rounded-full inline-block border">${esc(path)}</p>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-surface-100 bg-surface-50/50">
            <span class="text-[9px] font-black uppercase tracking-widest text-surface-400 block mb-1">Type</span>
            <span class="font-bold text-surface-700">${isGroup ? 'HDF5 Group' : 'HDF5 Dataset'}</span>
          </div>
          ${isDataset ? `
            <div class="p-4 rounded-xl border border-surface-100 bg-surface-50/50 md:col-span-2">
              <span class="text-[9px] font-black uppercase tracking-widest text-surface-400 block mb-1">Shape / Dimensions</span>
              <span class="font-mono text-brand-600 font-bold text-lg">${JSON.stringify(item.shape)}</span>
            </div>
          ` : ''}
        </div>
    `;

    // Attributes (Metadata)
    const attrs = item.attrs || {};
    const attrKeys = Object.keys(attrs);
    if (attrKeys.length > 0) {
      html += `
        <div class="space-y-3">
          <h3 class="text-xs font-black text-surface-400 uppercase tracking-widest flex items-center gap-2">
            Attributes
            <span class="bg-brand-100 text-brand-600 px-1.5 py-0.5 rounded-full text-[9px]">${attrKeys.length}</span>
          </h3>
          <div class="border rounded-xl overflow-hidden shadow-sm bg-white">
            <table class="min-w-full text-xs">
              <thead class="bg-surface-50 border-b border-surface-100">
                <tr>
                  <th class="px-4 py-3 text-left font-bold text-surface-500 uppercase tracking-tighter">Key</th>
                  <th class="px-4 py-3 text-left font-bold text-surface-500 uppercase tracking-tighter">Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${attrKeys.map(key => `
                  <tr class="hover:bg-brand-50/20 transition-colors">
                    <td class="px-4 py-3 font-mono text-brand-700 font-medium">${esc(key)}</td>
                    <td class="px-4 py-3 text-surface-600">${esc(String(attrs[key]))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Dataset Content & Conversion
    if (isDataset) {
      html += `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-black text-surface-400 uppercase tracking-widest">Data Preview</h3>
            <div class="flex gap-2">
               <button id="copy-json" class="text-[10px] font-bold uppercase bg-white border px-3 py-1.5 rounded-lg hover:bg-surface-50 transition-all shadow-sm">Copy JSON</button>
               <button id="dl-csv" class="text-[10px] font-bold uppercase bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 transition-all shadow-sm">Download CSV</button>
            </div>
          </div>
          <div class="p-5 bg-surface-900 rounded-xl shadow-2xl overflow-auto max-h-[450px] border border-surface-800">
            <pre class="text-[11px] font-mono text-brand-300 leading-relaxed">${renderHdf5Data(item)}</pre>
          </div>
          <p class="text-[10px] text-surface-400 italic">Showing a partial preview for large scientific datasets.</p>
        </div>
      `;
    } else if (isGroup) {
      const childrenCount = Object.keys(item.children || {}).length;
      html += `
        <div class="p-8 border-2 border-dashed border-surface-100 rounded-2xl text-center">
          <p class="text-sm text-surface-500">Group contains <span class="font-bold text-surface-800">${childrenCount}</span> direct child objects.</p>
          <p class="text-xs text-surface-400 mt-1">Expand the tree on the left to explore the hierarchy.</p>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    if (isDataset) {
      document.getElementById('copy-json').onclick = (e) => {
        h.copyToClipboard(JSON.stringify(item.value), e.target);
      };
      document.getElementById('dl-csv').onclick = () => {
        const val = item.value;
        let csv = '';
        if (Array.isArray(val) || ArrayBuffer.isView(val)) {
          csv = Array.from(val).join('\n');
        } else {
          csv = String(val);
        }
        h.download(`${item.name || 'dataset'}.csv`, csv, 'text/csv');
      };
    }
  }

  function renderHdf5Data(dataset) {
    const val = dataset.value;
    if (val === undefined || val === null) return 'Empty Dataset';
    if (dataset.shape.length === 0) return esc(String(val));
    
    // Preview limit
    const MAX_ELEMENTS = 250;
    
    if (ArrayBuffer.isView(val) || Array.isArray(val)) {
      const arr = Array.from(val.slice(0, MAX_ELEMENTS));
      let out = JSON.stringify(arr, null, 2);
      if (val.length > MAX_ELEMENTS) out += '\n\n... (Data truncated for preview)';
      return esc(out);
    }
    
    return esc(JSON.stringify(val, null, 2));
  }
})();
