/**
 * OmniOpener — HDF5 Viewer Tool
 * Uses OmniTool SDK and jsfive to explore HDF5 files in the browser.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.h5,.hdf5,.he5',
      dropLabel: 'Drop an HDF5 file here',
      infoHtml: '<strong>Privacy:</strong> This tool uses <a href="https://github.com/usnistgov/jsfive" target="_blank" class="text-brand-600 hover:underline">jsfive</a> to parse HDF5 files locally in your browser. No data is uploaded.',

      actions: [
        {
          label: '📥 Download Structure (JSON)',
          id: 'dl-json',
          onClick: function (h) {
            const structure = h.getState().structure;
            if (structure) {
              h.download(h.getFile().name + '.json', JSON.stringify(structure, null, 2), 'application/json');
            }
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const structure = h.getState().structure;
            if (structure) {
              h.copyToClipboard(JSON.stringify(structure.attributes || {}, null, 2), btn);
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
          'https://cdn.jsdelivr.net/npm/jsfive@0.3.10/dist/browser/jsfive.min.js'
        ]);
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing HDF5 file…');

        // Small delay for script load check
        setTimeout(function () {
          if (typeof hdf5 === 'undefined') {
            h.showError('Dependency Error', 'jsfive library failed to load.');
            return;
          }

          try {
            const f = new hdf5.File(content, file.name);
            const structure = parseHdf5Structure(f);
            h.setState('structure', structure);
            renderHdf5(structure, h);
          } catch (err) {
            h.showError('Parse Error', err.message);
          }
        }, 200);
      }
    });
  };

  /**
   * Recursively parse HDF5 file structure into a serializable object
   */
  function parseHdf5Structure(item, name = '/') {
    const info = {
      name: name,
      type: item instanceof hdf5.Group ? 'Group' : 'Dataset',
      attributes: {}
    };

    // Extract attributes
    if (item.attrs) {
      Object.keys(item.attrs).forEach(key => {
        info.attributes[key] = item.attrs[key];
      });
    }

    if (item instanceof hdf5.Group) {
      info.children = {};
      Object.keys(item.keys).forEach(key => {
        try {
          const child = item.get(key);
          info.children[key] = parseHdf5Structure(child, key);
        } catch (e) {
          info.children[key] = { name: key, type: 'Error', error: e.message };
        }
      });
    } else if (item instanceof hdf5.Dataset) {
      info.shape = item.shape;
      info.dtype = item.dtype;
      // We don't extract the whole value here to keep the structure object lightweight
      // but we could preview small datasets.
      if (item.shape.reduce((a, b) => a * b, 1) < 100) {
        try {
          info.valuePreview = Array.from(item.value);
        } catch (e) {}
      }
    }

    return info;
  }

  /**
   * Render the HDF5 structure as an interactive tree
   */
  function renderHdf5(structure, h) {
    let html = `
      <div class="p-6">
        <h2 class="text-xl font-bold text-surface-800 mb-4 flex items-center gap-2">
          <span class="text-2xl">📦</span> ${h.getFile().name}
        </h2>
        
        <div class="space-y-4">
          <section>
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-2">Root Attributes</h3>
            ${renderAttributes(structure.attributes)}
          </section>

          <section>
            <h3 class="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-2">Hierarchy</h3>
            <div class="border border-surface-200 rounded-lg overflow-hidden bg-surface-50">
              ${renderNode(structure, 0)}
            </div>
          </section>
        </div>
      </div>
    `;

    h.render(html);

    // Bind toggle events
    h.getRenderEl().querySelectorAll('.hdf5-toggle').forEach(btn => {
      btn.addEventListener('click', function() {
        const targetId = this.dataset.target;
        const target = document.getElementById(targetId);
        const icon = this.querySelector('.toggle-icon');
        if (target.classList.contains('hidden')) {
          target.classList.remove('hidden');
          icon.textContent = '▼';
        } else {
          target.classList.add('hidden');
          icon.textContent = '▶';
        }
      });
    });
  }

  function renderAttributes(attrs) {
    const keys = Object.keys(attrs);
    if (keys.length === 0) return '<p class="text-sm text-surface-400 italic">No attributes</p>';

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        ${keys.map(k => `
          <div class="flex text-sm border-b border-surface-100 pb-1">
            <span class="font-medium text-surface-600 w-1/3 truncate" title="${k}">${k}</span>
            <span class="text-surface-500 w-2/3 truncate" title="${attrs[k]}">${attrs[k]}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderNode(node, depth) {
    const id = 'hdf5-node-' + Math.random().toString(36).substr(2, 9);
    const indent = depth * 1.5;
    const isGroup = node.type === 'Group';
    const hasChildren = isGroup && Object.keys(node.children || {}).length > 0;

    let html = `
      <div class="border-b border-surface-100 last:border-0">
        <div class="flex items-center py-2 px-3 hover:bg-surface-100 transition-colors group">
          <div style="width: ${indent}rem"></div>
          
          ${hasChildren ? `
            <button class="hdf5-toggle p-1 mr-1 text-surface-400 hover:text-brand-600 transition-colors" data-target="${id}">
              <span class="toggle-icon text-xs w-4 inline-block">▶</span>
            </button>
          ` : '<div class="w-6"></div>'}

          <span class="mr-2 text-lg">${isGroup ? '📁' : '📊'}</span>
          <div class="flex flex-col min-w-0">
            <span class="font-medium text-surface-700 truncate">${node.name}</span>
            ${!isGroup ? `<span class="text-[10px] text-surface-400 uppercase font-bold">${node.dtype} [${node.shape.join(', ')}]</span>` : ''}
          </div>
        </div>

        ${hasChildren ? `
          <div id="${id}" class="hidden bg-white">
            ${Object.values(node.children).map(child => renderNode(child, depth + 1)).join('')}
          </div>
        ` : ''}
      </div>
    `;

    return html;
  }

})();
