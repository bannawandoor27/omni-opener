(function () {
  'use strict';

  /**
   * OmniOpener — TOML Production-Grade Viewer
   * Features: Tree Navigation, Syntax Highlighting, Live Filtering, JSON Export.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
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
        helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-toml.min.js',
          'https://cdn.jsdelivr.net/npm/toml-j0.4@1.1.1/dist/toml-j0.4.min.js'
        ]);
      },
      onFile: function (file, content, helpers) {
        if (!content || content.trim() === '') {
          helpers.render(`
            <div class="flex flex-col items-center justify-center p-12 border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50 text-center">
              <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center text-2xl mb-4">📄</div>
              <h3 class="text-lg font-semibold text-surface-800">Empty TOML File</h3>
              <p class="text-surface-500 text-sm max-w-xs">This file is valid but contains no configuration data or comments.</p>
            </div>
          `);
          return;
        }

        helpers.showLoading('Parsing TOML configuration...');

        // B1. Wait for CDN globals
        const waitForLib = (retryCount = 0) => {
          if (window.toml && window.Prism) {
            startRender();
          } else if (retryCount < 50) {
            setTimeout(() => waitForLib(retryCount + 1), 100);
          } else {
            helpers.showError('Library Load Failed', 'The TOML parser could not be loaded from the CDN. Please check your connection and try again.');
          }
        };

        const startRender = () => {
          let parsed;
          try {
            parsed = window.toml.parse(content);
            helpers.setState('parsed', parsed);
            helpers.setState('content', content);
          } catch (e) {
            helpers.showError('Could not open toml file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading. Error: ' + e.message);
            return;
          }

          const topLevelKeys = Object.keys(parsed).length;
          const isLarge = content.length > 500000; // 0.5MB threshold for "large" warning

          // U1. File Info Bar
          const infoBarHtml = `
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
              <span class="text-surface-300">|</span>
              <span>${formatBytes(file.size)}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.toml file</span>
              <div class="ml-auto flex items-center gap-2">
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${topLevelKeys} sections</span>
              </div>
            </div>
          `;

          // Main UI Shell
          helpers.render(`
            <div class="space-y-4">
              ${infoBarHtml}
              
              <div class="flex flex-wrap items-center justify-between gap-4 mb-2">
                <div class="relative flex-1 min-w-[280px]">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
                  <input type="text" id="toml-search" 
                    placeholder="Search keys, values, or sections..." 
                    class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                  >
                </div>
                <div class="flex bg-surface-100 p-1 rounded-xl shadow-inner">
                  <button id="tab-tree" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all bg-white shadow-sm text-brand-700">Visual Tree</button>
                  <button id="tab-source" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all text-surface-500 hover:text-surface-700">Raw Source</button>
                  <button id="tab-json" class="px-4 py-1.5 text-xs font-bold rounded-lg transition-all text-surface-500 hover:text-surface-700">JSON Export</button>
                </div>
              </div>

              <div id="content-viewport" class="min-h-[400px]">
                <div id="view-tree" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
                <div id="view-source" class="hidden">
                  ${isLarge ? '<p class="text-xs text-amber-600 mb-2 italic">Showing first 500KB of source...</p>' : ''}
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed"><code class="language-toml">${escapeHtml(isLarge ? content.substring(0, 500000) : content)}</code></pre>
                  </div>
                </div>
                <div id="view-json" class="hidden">
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed"><code class="language-json">${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>
                  </div>
                </div>
              </div>
            </div>
          `);

          const treeContainer = document.getElementById('view-tree');
          const searchInput = document.getElementById('toml-search');

          // Action Logic
          const tabs = {
            'tab-tree': 'view-tree',
            'tab-source': 'view-source',
            'tab-json': 'view-json'
          };

          Object.keys(tabs).forEach(id => {
            document.getElementById(id).onclick = () => {
              Object.keys(tabs).forEach(tid => {
                document.getElementById(tid).className = 'px-4 py-1.5 text-xs font-bold rounded-lg transition-all text-surface-500 hover:text-surface-700';
                document.getElementById(tabs[tid]).classList.add('hidden');
              });
              document.getElementById(id).className = 'px-4 py-1.5 text-xs font-bold rounded-lg transition-all bg-white shadow-sm text-brand-700';
              document.getElementById(tabs[id]).classList.remove('hidden');
              
              if (id === 'tab-source') Prism.highlightElement(document.querySelector('#view-source code'));
              if (id === 'tab-json') Prism.highlightElement(document.querySelector('#view-json code'));
            };
          });

          // Tree Rendering & Filtering
          function renderItem(key, value, container, filter = '') {
            const isObj = value !== null && typeof value === 'object' && !Array.isArray(value);
            const isArr = Array.isArray(value);
            const term = filter.toLowerCase();

            // Filter logic
            if (term) {
              const matchesSelf = key.toLowerCase().includes(term) || (!isObj && !isArr && String(value).toLowerCase().includes(term));
              if (!matchesSelf) {
                if (isObj || isArr) {
                  const hasMatchingChild = JSON.stringify(value).toLowerCase().includes(term);
                  if (!hasMatchingChild) return;
                } else {
                  return;
                }
              }
            }

            if (isObj || isArr) {
              // U9. Content Cards for Sections
              const card = document.createElement('div');
              card.className = `rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white flex flex-col`;
              
              const count = isArr ? value.length : Object.keys(value).length;
              
              // U10. Section Headers
              card.innerHTML = `
                <div class="flex items-center justify-between mb-3 border-b border-surface-100 pb-2">
                  <h3 class="font-bold text-surface-800 truncate flex items-center gap-2">
                    <span class="text-brand-500 text-xs">${isArr ? '[]' : '{}'}</span>
                    ${escapeHtml(key)}
                  </h3>
                  <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold uppercase">${count} items</span>
                </div>
                <div class="space-y-1.5 flex-1 overflow-auto max-h-[300px] pr-1 custom-scrollbar"></div>
              `;

              const body = card.querySelector('.space-y-1\\.5');
              const items = isArr ? value : Object.entries(value);

              if (isArr) {
                value.forEach((v, i) => {
                  const row = document.createElement('div');
                  row.className = 'text-xs py-1 border-b border-surface-50 last:border-0 flex gap-2';
                  row.innerHTML = `<span class="text-surface-400 font-mono w-6">[${i}]</span><span class="text-surface-700 break-all">${typeof v === 'object' ? 'Complex Object' : escapeHtml(v)}</span>`;
                  body.appendChild(row);
                });
              } else {
                Object.entries(value).forEach(([k, v]) => {
                  const row = document.createElement('div');
                  row.className = 'text-xs py-1 border-b border-surface-50 last:border-0 flex justify-between gap-4';
                  row.innerHTML = `<span class="font-semibold text-surface-600 truncate">${escapeHtml(k)}</span><span class="text-brand-700 font-mono text-right break-all">${typeof v === 'object' ? '...' : escapeHtml(v)}</span>`;
                  body.appendChild(row);
                });
              }

              container.appendChild(card);
            } else {
              // Flat key-value at root
              const div = document.createElement('div');
              div.className = 'rounded-xl border border-surface-200 p-4 bg-surface-50/50 flex flex-col gap-1';
              div.innerHTML = `
                <span class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Setting</span>
                <div class="flex justify-between items-center gap-4">
                  <span class="font-bold text-surface-800">${escapeHtml(key)}</span>
                  <span class="text-sm font-mono text-brand-600 bg-white px-2 py-1 rounded border border-surface-100 shadow-sm">${escapeHtml(value)}</span>
                </div>
              `;
              container.appendChild(div);
            }
          }

          const updateView = () => {
            const term = searchInput.value;
            treeContainer.innerHTML = '';
            
            Object.entries(parsed).forEach(([key, val]) => {
              renderItem(key, val, treeContainer, term);
            });

            if (treeContainer.children.length === 0) {
              treeContainer.innerHTML = `
                <div class="col-span-full py-20 text-center bg-surface-50 rounded-2xl border border-dashed border-surface-200">
                  <p class="text-surface-400 text-lg">No matching keys or values found</p>
                  <button onclick="document.getElementById('toml-search').value=''; document.getElementById('toml-search').dispatchEvent(new Event('input'));" class="mt-4 text-brand-600 hover:text-brand-700 font-semibold text-sm">Clear search</button>
                </div>
              `;
            }
          };

          searchInput.oninput = updateView;
          updateView();
        };

        waitForLib();
      },
      actions: [
        {
          label: '📋 Copy TOML',
          id: 'copy-toml',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getState('content'), btn);
          }
        },
        {
          label: '📄 Copy as JSON',
          id: 'copy-json',
          onClick: function (helpers, btn) {
            const json = JSON.stringify(helpers.getState('parsed'), null, 2);
            helpers.copyToClipboard(json, btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'download-json',
          onClick: function (helpers) {
            const json = JSON.stringify(helpers.getState('parsed'), null, 2);
            helpers.download(helpers.getFile().name.replace('.toml', '.json'), json, 'application/json');
          }
        }
      ]
    });
  };
})();
