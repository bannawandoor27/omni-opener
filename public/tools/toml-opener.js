(function () {
  'use strict';

  /**
   * OmniOpener — TOML Production-Grade Viewer
   * Features: Live Filtering, Syntax Highlighting, Tree & Raw Views, JSON Export.
   */

  function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str.replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.toml',
      dropLabel: 'Drop a .toml file here',
      binary: false,
      onInit: function (helpers) {
        helpers.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css');
        // Load libraries in sequence to handle dependencies
        helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js'
        ]).then(() => {
          helpers.loadScripts([
            'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-toml.min.js',
            'https://cdn.jsdelivr.net/npm/toml-j0.4@1.1.1/dist/toml-j0.4.min.js'
          ]);
        });
      },
      onFile: function (file, content, helpers) {
        if (!content || content.trim() === '') {
          helpers.render(`
            <div class="flex flex-col items-center justify-center p-12 border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50 text-center">
              <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center text-2xl mb-4">📄</div>
              <h3 class="text-lg font-semibold text-surface-800">Empty TOML File</h3>
              <p class="text-surface-500 text-sm max-w-xs">This file is valid but contains no content.</p>
            </div>
          `);
          return;
        }

        helpers.showLoading('Parsing TOML content...');

        // B1. Race condition check
        const checkLibs = () => {
          if (window.toml && window.Prism && window.Prism.languages.toml) {
            processFile();
          } else {
            setTimeout(checkLibs, 100);
          }
        };

        const processFile = () => {
          let parsed;
          try {
            parsed = window.toml.parse(content);
          } catch (e) {
            helpers.showError('Could not open toml file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading. Error: ' + e.message);
            return;
          }

          helpers.setState('parsed', parsed);
          helpers.setState('raw', content);

          const keys = Object.keys(parsed);
          const sectionsCount = keys.filter(k => typeof parsed[k] === 'object' && !Array.isArray(parsed[k])).length;
          const rootKeysCount = keys.length - sectionsCount;

          // U1. File info bar
          const infoBar = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatBytes(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.toml file</span>
            </div>
          `;

          helpers.render(`
            <div class="space-y-6">
              ${infoBar}

              <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div class="relative flex-1 max-w-md">
                  <input type="text" id="toml-search" placeholder="Filter keys or values..." 
                    class="w-full pl-4 pr-10 py-2 border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-sm">
                  <span class="absolute right-3 top-2.5 text-surface-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  </span>
                </div>
                <div class="flex items-center gap-2 p-1 bg-surface-100 rounded-xl self-start">
                  <button id="btn-view-tree" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-white shadow-sm text-surface-800 transition-all">Tree View</button>
                  <button id="btn-view-raw" class="px-3 py-1.5 text-xs font-medium rounded-lg text-surface-500 hover:text-surface-700 transition-all">Raw Source</button>
                  <button id="btn-view-json" class="px-3 py-1.5 text-xs font-medium rounded-lg text-surface-500 hover:text-surface-700 transition-all">JSON View</button>
                </div>
              </div>

              <div id="toml-content">
                <div id="tree-view" class="space-y-8"></div>
                <div id="raw-view" class="hidden">
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed"><code class="language-toml">${escapeHtml(content.length > 100000 ? content.slice(0, 100000) + '\n\n... (file truncated for performance)' : content)}</code></pre>
                  </div>
                </div>
                <div id="json-view" class="hidden">
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed"><code class="language-json">${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          `);

          const treeContainer = document.getElementById('tree-view');
          const searchInput = document.getElementById('toml-search');
          const viewBtns = {
            tree: document.getElementById('btn-view-tree'),
            raw: document.getElementById('btn-view-raw'),
            json: document.getElementById('btn-view-json')
          };
          const views = {
            tree: document.getElementById('tree-view'),
            raw: document.getElementById('raw-view'),
            json: document.getElementById('json-view')
          };

          const switchView = (active) => {
            Object.keys(views).forEach(v => {
              views[v].classList.toggle('hidden', v !== active);
              viewBtns[v].classList.toggle('bg-white', v === active);
              viewBtns[v].classList.toggle('shadow-sm', v === active);
              viewBtns[v].classList.toggle('text-surface-800', v === active);
              viewBtns[v].classList.toggle('text-surface-500', v !== active);
            });
            if (active === 'raw') window.Prism.highlightElement(views.raw.querySelector('code'));
            if (active === 'json') window.Prism.highlightElement(views.json.querySelector('code'));
          };

          viewBtns.tree.onclick = () => switchView('tree');
          viewBtns.raw.onclick = () => switchView('raw');
          viewBtns.json.onclick = () => switchView('json');

          const renderTree = (filter = '') => {
            treeContainer.innerHTML = '';
            const normalizedFilter = filter.toLowerCase().trim();

            const renderSection = (title, data, isRoot = false) => {
              const entries = Object.entries(data);
              const filteredEntries = entries.filter(([k, v]) => {
                if (!normalizedFilter) return true;
                const keyMatch = k.toLowerCase().includes(normalizedFilter);
                if (keyMatch) return true;
                if (typeof v === 'object') {
                   try { return JSON.stringify(v).toLowerCase().includes(normalizedFilter); } catch(e) { return false; }
                }
                return String(v).toLowerCase().includes(normalizedFilter);
              });

              if (filteredEntries.length === 0 && normalizedFilter) return null;

              const section = document.createElement('div');
              section.className = 'animate-in fade-in slide-in-from-bottom-2 duration-300';
              
              const header = document.createElement('div');
              header.className = 'flex items-center justify-between mb-3';
              header.innerHTML = `
                <h3 class="font-semibold text-surface-800">${escapeHtml(isRoot ? 'Global Settings' : title)}</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredEntries.length} items</span>
              `;
              section.appendChild(header);

              const tableWrapper = document.createElement('div');
              tableWrapper.className = 'overflow-x-auto rounded-xl border border-surface-200';
              
              const table = document.createElement('table');
              table.className = 'min-w-full text-sm';
              table.innerHTML = `
                <thead>
                  <tr>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Key</th>
                    <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Value</th>
                  </tr>
                </thead>
                <tbody></tbody>
              `;

              const tbody = table.querySelector('tbody');
              filteredEntries.forEach(([k, v]) => {
                const tr = document.createElement('tr');
                tr.className = 'even:bg-surface-50 hover:bg-brand-50 transition-colors';
                
                let valueHtml = '';
                if (Array.isArray(v)) {
                  valueHtml = `<span class="text-xs bg-surface-100 text-surface-600 px-2 py-1 rounded">Array(${v.length})</span>`;
                } else if (typeof v === 'object' && v !== null) {
                  valueHtml = `<span class="text-xs bg-surface-100 text-surface-600 px-2 py-1 rounded">Table</span>`;
                } else {
                  const valStr = String(v);
                  const isBoolean = typeof v === 'boolean';
                  const isNumber = typeof v === 'number';
                  const colorClass = isBoolean ? 'text-blue-600' : (isNumber ? 'text-amber-600' : 'text-surface-700');
                  valueHtml = `<code class="${colorClass} font-mono break-all">${escapeHtml(valStr)}</code>`;
                }

                tr.innerHTML = `
                  <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-medium">${escapeHtml(k)}</td>
                  <td class="px-4 py-2 text-surface-700 border-b border-surface-100">${valueHtml}</td>
                `;
                tbody.appendChild(tr);
              });

              tableWrapper.appendChild(table);
              section.appendChild(tableWrapper);
              return section;
            };

            // 1. Render root values first
            const rootData = {};
            keys.forEach(k => {
              if (typeof parsed[k] !== 'object' || Array.isArray(parsed[k]) || parsed[k] === null) {
                rootData[k] = parsed[k];
              }
            });
            if (Object.keys(rootData).length > 0) {
              const rootSection = renderSection('', rootData, true);
              if (rootSection) treeContainer.appendChild(rootSection);
            }

            // 2. Render sub-tables
            keys.forEach(k => {
              if (typeof parsed[k] === 'object' && !Array.isArray(parsed[k]) && parsed[k] !== null) {
                const section = renderSection(k, parsed[k]);
                if (section) treeContainer.appendChild(section);
              }
            });

            // Empty search state
            if (treeContainer.children.length === 0) {
              treeContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center p-12 bg-surface-50 rounded-2xl border border-dashed border-surface-200 text-center">
                  <p class="text-surface-500 mb-2">No results matching "${escapeHtml(filter)}"</p>
                  <button id="btn-clear-search" class="text-sm font-semibold text-brand-600 hover:text-brand-700">Clear Search</button>
                </div>
              `;
              const clearBtn = document.getElementById('btn-clear-search');
              if (clearBtn) {
                clearBtn.onclick = () => {
                  searchInput.value = '';
                  renderTree('');
                };
              }
            }
          };

          searchInput.oninput = (e) => renderTree(e.target.value);
          renderTree();
        };

        checkLibs();
      },
      actions: [
        {
          label: 'Copy as JSON',
          id: 'copy-json',
          onClick: function (helpers, btn) {
            const parsed = helpers.getState('parsed');
            if (parsed) {
              helpers.copyToClipboard(JSON.stringify(parsed, null, 2), btn);
            }
          }
        },
        {
          label: 'Download JSON',
          id: 'download-json',
          onClick: function (helpers) {
            const parsed = helpers.getState('parsed');
            const file = helpers.getFile();
            if (parsed && file) {
              const name = file.name.replace(/\.toml$/i, '') + '.json';
              helpers.download(name, JSON.stringify(parsed, null, 2), 'application/json');
            }
          }
        }
      ]
    });
  };
})();
