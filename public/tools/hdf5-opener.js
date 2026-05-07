(function () {
  'use strict';

  /**
   * PRODUCTION PERFECT HDF5 OPENER
   * Browser-based HDF5 visualization using OmniTool SDK
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
      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
          'https://cdn.jsdelivr.net/npm/js-five@0.3.8/dist/hdf5.js'
        ]);
      },
      onDestroy: function (h) {
        const state = h.getState();
        if (state.hdf5File) {
          // js-five doesn't have an explicit close, but we clear state
          h.setState({ hdf5File: null });
        }
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
          label: '📋 Copy Hash',
          id: 'copy-hash',
          onClick: function (h, btn) {
            const hash = h.getState().sha256;
            if (hash) h.copyToClipboard(hash, btn);
          }
        }
      ],
      onFile: async function _onFile(file, content, h) {
        if (!(content instanceof ArrayBuffer)) {
          h.showError('Invalid Content', 'The file content is not a valid ArrayBuffer.');
          return;
        }

        h.showLoading('Initializing HDF5 Engine...');

        // 1. Dependency check
        if (typeof hdf5 === 'undefined') {
          try {
            await h.loadScripts([
              'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
              'https://cdn.jsdelivr.net/npm/js-five@0.3.8/dist/hdf5.js'
            ]);
          } catch (e) {
            h.showError('Loading Error', 'Failed to load HDF5 processing libraries.');
            return;
          }
        }

        h.showLoading('Analyzing HDF5 Structure...');

        try {
          // Compute hash for metadata
          const hashBuffer = await crypto.subtle.digest('SHA-256', content);
          const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          const f = new hdf5.File(content, file.name);
          h.setState({ hdf5File: f, sha256: hashHex });

          renderViewer(f, h, hashHex);
        } catch (err) {
          console.error('[HDF5 Error]', err);
          h.showError('Could not open HDF5 file', 'The file may be corrupted, encrypted, or in an unsupported HDF5 variant. (Error: ' + err.message + ')');
        }
      }
    });
  };

  function renderViewer(f, h, hashHex) {
    const file = h.getFile();
    h.render(`
      <div class="flex flex-col h-full min-h-[600px] animate-in fade-in duration-300">
        <!-- U1. File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">HDF5 Container</span>
          <span class="text-surface-300">|</span>
          <span class="font-mono text-[10px] bg-surface-200 px-2 py-0.5 rounded" title="${hashHex}">SHA256: ${hashHex.substring(0, 8)}...</span>
        </div>

        <div class="flex flex-1 overflow-hidden gap-4">
          <!-- Sidebar: Navigation -->
          <div class="w-1/3 min-w-[280px] max-w-[400px] flex flex-col bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
            <div class="p-3 border-b bg-surface-50">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-xs font-bold uppercase tracking-wider text-surface-500">Hierarchy</h3>
                <span id="obj-count" class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">... items</span>
              </div>
              <div class="relative">
                <input type="text" id="tree-search" placeholder="Search objects..." 
                       class="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
                <span class="absolute left-2.5 top-2 text-surface-400">🔍</span>
              </div>
            </div>
            <div id="hdf5-tree" class="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-0.5"></div>
          </div>

          <!-- Content: Inspector -->
          <div class="flex-1 flex flex-col bg-white rounded-xl border border-surface-200 overflow-hidden shadow-sm">
            <div id="hdf5-inspector" class="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div class="flex flex-col items-center justify-center h-full text-surface-400 space-y-4 opacity-60">
                <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center text-3xl">📊</div>
                <div class="text-center">
                  <p class="font-semibold text-surface-800">Select an object to inspect</p>
                  <p class="text-sm">Click any group or dataset in the hierarchy to view metadata and data.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        
        .tree-item { transition: all 0.15s ease; border-radius: 6px; }
        .tree-item:hover { background-color: #f1f5f9; }
        .tree-item.active { background-color: #eef2ff; color: #4338ca; font-weight: 500; }
        .tree-item.active .icon { color: #4338ca; }
        
        .group-children { border-left: 1px dashed #e2e8f0; margin-left: 12px; transition: all 0.2s ease; }
        .hidden-node { display: none !important; }
        
        @keyframes fade-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: fade-in 0.3s ease-out forwards; }
      </style>
    `);

    const treeContainer = document.getElementById('hdf5-tree');
    const searchInput = document.getElementById('tree-search');
    let totalObjects = 0;

    function buildTree(item, path, container, depth = 0) {
      totalObjects++;
      const name = item.name || (depth === 0 ? '/' : 'unnamed');
      const isGroup = item instanceof hdf5.Group;
      
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'tree-node flex flex-col';
      itemWrapper.dataset.path = path.toLowerCase();
      itemWrapper.dataset.name = name.toLowerCase();

      const row = document.createElement('div');
      row.className = 'tree-item flex items-center gap-2 py-1.5 px-2 cursor-pointer text-sm text-surface-600 select-none';
      row.style.paddingLeft = (depth * 14 + 8) + 'px';
      
      const icon = isGroup ? '📁' : '📊';
      row.innerHTML = `
        <span class="icon text-xs shrink-0 opacity-70">${icon}</span>
        <span class="truncate" title="${esc(name)}">${esc(name)}</span>
      `;
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'group-children hidden';

      row.onclick = (e) => {
        e.stopPropagation();
        if (isGroup) {
          childrenContainer.classList.toggle('hidden');
        }
        
        treeContainer.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'));
        row.classList.add('active');
        
        inspectObject(item, path, h);
      };

      itemWrapper.appendChild(row);
      
      if (isGroup && item.children) {
        itemWrapper.appendChild(childrenContainer);
        const keys = Object.keys(item.children).sort((a, b) => {
          const itemA = item.get(a);
          const itemB = item.get(b);
          if (itemA instanceof hdf5.Group && !(itemB instanceof hdf5.Group)) return -1;
          if (!(itemA instanceof hdf5.Group) && itemB instanceof hdf5.Group) return 1;
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
    document.getElementById('obj-count').textContent = `${totalObjects} objects`;

    // Search functionality
    searchInput.oninput = (e) => {
      const q = e.target.value.toLowerCase();
      const nodes = treeContainer.querySelectorAll('.tree-node');
      nodes.forEach(node => {
        if (!q || node.dataset.path.includes(q) || node.dataset.name.includes(q)) {
          node.classList.remove('hidden-node');
          // If searching, expand all parents
          if (q) {
            let parent = node.parentElement;
            while (parent && parent !== treeContainer) {
              if (parent.classList.contains('group-children')) parent.classList.remove('hidden');
              parent = parent.parentElement;
            }
          }
        } else {
          node.classList.add('hidden-node');
        }
      });
    };
  }

  function inspectObject(item, path, h) {
    const container = document.getElementById('hdf5-inspector');
    const isGroup = item instanceof hdf5.Group;
    const isDataset = item instanceof hdf5.Dataset;

    let html = `
      <div class="space-y-6 animate-in">
        <div class="border-b border-surface-100 pb-5">
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl ${isGroup ? 'bg-amber-100 text-amber-600' : 'bg-brand-100 text-brand-600'} flex items-center justify-center text-2xl shadow-sm border border-black/5">
                ${isGroup ? '📁' : '📊'}
              </div>
              <div>
                <h2 class="text-xl font-bold text-surface-900 truncate max-w-md" title="${esc(item.name || '/')}">${esc(item.name || '/')}</h2>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-[10px] font-mono bg-surface-100 text-surface-500 px-2 py-0.5 rounded border border-surface-200">${esc(path)}</span>
                  <span class="text-[10px] font-bold uppercase tracking-tight text-surface-400">${isGroup ? 'Group' : 'Dataset'}</span>
                </div>
              </div>
            </div>
            ${isDataset ? `
              <div class="flex gap-2">
                <button id="btn-copy-json" class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-surface-200 rounded-lg text-xs font-semibold text-surface-700 hover:bg-surface-50 transition-all shadow-sm">
                  <span>📋</span> Copy JSON
                </button>
                <button id="btn-dl-csv" class="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700 transition-all shadow-sm">
                  <span>📥</span> CSV
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/30">
            <p class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-1">Status</p>
            <p class="text-sm font-semibold text-surface-700">Loaded & Analyzed</p>
          </div>
          ${isDataset ? `
            <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/30 md:col-span-2">
              <p class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-1">Shape / Dimensions</p>
              <p class="font-mono text-brand-600 font-bold text-base truncate">${JSON.stringify(item.shape)}</p>
            </div>
          ` : `
            <div class="p-4 rounded-xl border border-surface-200 bg-surface-50/30 md:col-span-2">
              <p class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mb-1">Sub-Objects</p>
              <p class="text-sm font-semibold text-surface-700">${Object.keys(item.children || {}).length} direct children</p>
            </div>
          `}
        </div>
    `;

    // Attributes Table (U7)
    const attrs = item.attrs || {};
    const attrKeys = Object.keys(attrs);
    if (attrKeys.length > 0) {
      html += `
        <div>
          <div class="flex items-center justify-between mb-3">
             <h3 class="text-xs font-bold text-surface-800 uppercase tracking-widest">Metadata Attributes</h3>
             <span class="text-[10px] bg-surface-100 text-surface-500 px-2 py-0.5 rounded-full font-bold">${attrKeys.length} items</span>
          </div>
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
            <table class="min-w-full text-sm">
              <thead class="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700">Key</th>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700">Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${attrKeys.map(key => `
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                    <td class="px-4 py-2.5 font-mono text-xs text-brand-700 font-medium">${esc(key)}</td>
                    <td class="px-4 py-2.5 text-surface-600 text-xs">${esc(String(attrs[key]))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Data Preview (U8)
    if (isDataset) {
      html += `
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-bold text-surface-800 uppercase tracking-widest">Data Preview</h3>
            <span class="text-[10px] text-surface-400">Showing partial view of raw values</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-lg">
            <pre class="p-5 text-[11px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[400px] custom-scrollbar">${renderDataPreview(item)}</pre>
          </div>
          <p class="text-[10px] text-surface-400 italic text-center">Note: Large scientific datasets are truncated for browser performance.</p>
        </div>
      `;
    } else {
      html += `
        <div class="p-10 border-2 border-dashed border-surface-100 rounded-2xl flex flex-col items-center justify-center text-center">
          <p class="text-sm text-surface-500 max-w-xs">This group acts as a container. Expand the hierarchy to view nested datasets and subgroups.</p>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;

    // Attach events
    if (isDataset) {
      const copyBtn = document.getElementById('btn-copy-json');
      const dlBtn = document.getElementById('btn-dl-csv');
      
      copyBtn.onclick = (e) => {
        try {
          h.copyToClipboard(JSON.stringify(item.value), copyBtn);
        } catch (err) {
          h.showError('Copy failed', 'The dataset might be too large for the clipboard.');
        }
      };
      
      dlBtn.onclick = () => {
        h.showLoading('Preparing CSV...');
        setTimeout(() => {
          const val = item.value;
          let csv = '';
          if (Array.isArray(val) || ArrayBuffer.isView(val)) {
            csv = Array.from(val).join('\n');
          } else {
            csv = String(val);
          }
          h.download(`${item.name || 'dataset'}.csv`, csv, 'text/csv');
          h.showLoading(false);
        }, 10);
      };
    }
  }

  function renderDataPreview(dataset) {
    const val = dataset.value;
    if (val === undefined || val === null) return 'Empty Dataset';
    
    // Scalar check
    if (dataset.shape.length === 0) return esc(String(val));
    
    // Preview limit (B7)
    const MAX_ELEMENTS = 500;
    
    if (ArrayBuffer.isView(val) || Array.isArray(val)) {
      const total = val.length;
      const arr = Array.from(val.slice(0, MAX_ELEMENTS));
      let out = JSON.stringify(arr, null, 2);
      if (total > MAX_ELEMENTS) {
        out += `\n\n... (TRUNCATED: Showing 500 of ${total.toLocaleString()} elements)`;
      }
      return esc(out);
    }
    
    return esc(JSON.stringify(val, null, 2));
  }
})();
