(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _hpcc = null;
    let _lastFile = null;
    let _lastContent = null;
    let _currentSvg = null;
    let _viewMode = 'graph'; // 'graph' or 'source'
    let _searchTerm = '';
    let _searchTimeout = null;
    let _zoomLevel = 100;
    const _svgUrls = new Set();

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function cleanupUrls() {
      _svgUrls.forEach(url => URL.revokeObjectURL(url));
      _svgUrls.clear();
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dot,.gv',
      dropLabel: 'Drop a DOT or GV file here',
      binary: false,
      infoHtml: '<strong>Graphviz Viewer:</strong> Renders DOT language diagrams using WebAssembly (hpcc-js). Private, fast, and entirely client-side.',

      actions: [
        {
          label: '🔄 Toggle View',
          id: 'toggle-view',
          onClick: function (h) {
            _viewMode = _viewMode === 'graph' ? 'source' : 'graph';
            _onFileFn(_lastFile, _lastContent, h);
          }
        },
        {
          label: '📋 Copy Source',
          id: 'copy-source',
          onClick: function (h, btn) {
            if (_lastContent) {
              h.copyToClipboard(_lastContent, btn);
            }
          }
        },
        {
          label: '🖼️ Save SVG',
          id: 'download-svg',
          onClick: function (h) {
            if (_currentSvg) {
              const blob = new Blob([_currentSvg], { type: 'image/svg+xml' });
              h.download((_lastFile?.name || 'graph') + '.svg', blob, 'image/svg+xml');
            }
          }
        },
        {
          label: '📷 Save PNG',
          id: 'download-png',
          onClick: function (h) {
            const svgEl = h.getRenderEl().querySelector('#svg-wrapper svg');
            if (!svgEl) {
              h.showError('No graph found', 'Please wait for the graph to render before exporting.');
              return;
            }

            h.showLoading('Generating PNG...');
            const bbox = svgEl.getBBox();
            const width = (svgEl.width.baseVal.value || bbox.width) * 2;
            const height = (svgEl.height.baseVal.value || bbox.height) * 2;
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const img = new Image();
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            _svgUrls.add(url);
            
            img.onload = function () {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(function (blob) {
                h.download((_lastFile?.name || 'graph') + '.png', blob, 'image/png');
                URL.revokeObjectURL(url);
                _svgUrls.delete(url);
                h.showLoading(false);
              }, 'image/png');
            };
            img.onerror = function() {
              URL.revokeObjectURL(url);
              _svgUrls.delete(url);
              h.showError('Export Failed', 'The browser could not convert this SVG to an image.');
              h.showLoading(false);
            };
            img.src = url;
          }
        }
      ],

      onInit: function (h) {
        if (typeof window['@hpcc-js/wasm'] === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@2.20.0/dist/graphviz.umd.js');
        }
      },

      onDestroy: function() {
        cleanupUrls();
        _hpcc = null;
        _lastFile = null;
        _lastContent = null;
        _currentSvg = null;
        if (_searchTimeout) clearTimeout(_searchTimeout);
      },

      onFile: function _onFileFn(file, content, h) {
        if (!content || (typeof content === 'string' && !content.trim())) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-20 text-surface-400 border-2 border-dashed border-surface-200 rounded-2xl">
              <span class="text-4xl mb-4">📄</span>
              <p>This .dot file is empty</p>
            </div>
          `);
          return;
        }

        _lastFile = file;
        _lastContent = content;

        const hpccLib = window['@hpcc-js/wasm'];
        if (!hpccLib) {
          h.showLoading('Waking up Graphviz engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 200);
          return;
        }

        h.showLoading('Rendering complex relationships...');

        (async function() {
          try {
            if (!_hpcc) {
              _hpcc = await hpccLib.Graphviz.load();
            }

            // Render DOT to SVG
            try {
              _currentSvg = _hpcc.dot(content);
            } catch (dotErr) {
              h.showError('Syntax Error', 'Graphviz failed to parse your DOT source. Please check for missing semicolons or braces.');
              h.showLoading(false);
              return;
            }

            const infoBar = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">Graphviz DOT</span>
              </div>
            `;

            let mainView = '';

            if (_viewMode === 'graph') {
              mainView = `
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <h3 class="font-semibold text-surface-800">Visual Diagram</h3>
                      <p class="text-xs text-surface-500">Interactive SVG rendering</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="relative group">
                        <span class="absolute inset-y-0 left-3 flex items-center text-surface-400">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        </span>
                        <input type="text" id="dot-search" placeholder="Highlight nodes..." 
                          class="pl-9 pr-4 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-48 transition-all"
                          value="${escapeHtml(_searchTerm)}">
                      </div>
                      <div class="flex items-center bg-surface-100 rounded-lg p-1">
                        <button id="zoom-out" class="p-1 hover:bg-white rounded transition-colors" title="Zoom Out">➖</button>
                        <span class="px-2 text-xs font-mono text-surface-600 min-w-[45px] text-center">${_zoomLevel}%</span>
                        <button id="zoom-in" class="p-1 hover:bg-white rounded transition-colors" title="Zoom In">➕</button>
                      </div>
                    </div>
                  </div>

                  <div class="bg-white border border-surface-200 rounded-2xl p-6 overflow-auto shadow-sm min-h-[500px] flex items-start justify-center transition-all">
                    <div id="svg-wrapper" class="w-full h-full flex justify-center origin-top transition-transform duration-200" style="transform: scale(${_zoomLevel / 100})">
                      ${_currentSvg}
                    </div>
                  </div>
                </div>
              `;
            } else {
              const lines = content.split('\n');
              const lineCount = lines.length;
              
              // Only render first 2000 lines if huge, to avoid DOM crash
              const maxLines = 2000;
              const displayLines = lines.slice(0, maxLines);
              
              const codeRows = displayLines.map((line, i) => {
                const escaped = escapeHtml(line);
                const isMatch = _searchTerm && line.toLowerCase().includes(_searchTerm.toLowerCase());
                const highlighted = isMatch 
                  ? escaped.replace(new RegExp(`(${_searchTerm})`, 'gi'), '<mark class="bg-brand-200 text-brand-900 rounded-sm">$1</mark>')
                  : escaped;
                
                return `
                  <div class="flex hover:bg-white/5 transition-colors ${isMatch ? 'bg-white/10' : ''}">
                    <span class="w-12 flex-shrink-0 text-right pr-4 text-surface-500 select-none font-mono border-r border-surface-800/50">${i + 1}</span>
                    <span class="px-4 whitespace-pre font-mono text-gray-100">${highlighted || ' '}</span>
                  </div>
                `;
              }).join('');

              mainView = `
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <h3 class="font-semibold text-surface-800">Source Definition</h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${lineCount} lines</span>
                    </div>
                    <div class="relative">
                      <span class="absolute inset-y-0 left-3 flex items-center text-surface-400">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                      </span>
                      <input type="text" id="dot-search" placeholder="Search source..." 
                        class="pl-9 pr-4 py-1.5 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-48 transition-all"
                        value="${escapeHtml(_searchTerm)}">
                    </div>
                  </div>

                  <div class="rounded-2xl overflow-hidden border border-surface-200 shadow-sm">
                    <div class="bg-gray-950 p-4 text-sm overflow-x-auto max-h-[70vh] custom-scrollbar">
                      <div class="inline-block min-w-full">
                        ${codeRows}
                        ${lineCount > maxLines ? `<div class="p-4 text-surface-500 italic text-center border-t border-surface-800/30">... only showing first ${maxLines} lines ...</div>` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }

            h.render(infoBar + mainView);

            // Post-render logic
            const renderEl = h.getRenderEl();
            const svgEl = renderEl.querySelector('#svg-wrapper svg');
            
            if (svgEl && _viewMode === 'graph') {
              svgEl.setAttribute('width', '100%');
              svgEl.setAttribute('height', 'auto');
              svgEl.classList.add('max-w-none'); // Allow it to expand for zoom
              
              // Apply highlights
              if (_searchTerm) {
                const nodes = svgEl.querySelectorAll('.node');
                nodes.forEach(node => {
                  const text = node.textContent.toLowerCase();
                  if (text.includes(_searchTerm.toLowerCase())) {
                    const polygon = node.querySelector('ellipse, polygon, path, circle');
                    if (polygon) {
                      polygon.style.fill = '#fde68a'; // yellow-200
                      polygon.style.stroke = '#d97706'; // amber-600
                      polygon.style.strokeWidth = '3px';
                    }
                  }
                });
              }
            }

            // Events
            const searchInput = renderEl.querySelector('#dot-search');
            if (searchInput) {
              searchInput.addEventListener('input', function(e) {
                _searchTerm = e.target.value;
                if (_searchTimeout) clearTimeout(_searchTimeout);
                _searchTimeout = setTimeout(() => {
                  _onFileFn(_lastFile, _lastContent, h);
                }, 300);
              });
              
              if (_searchTerm) {
                searchInput.focus();
                searchInput.setSelectionRange(_searchTerm.length, _searchTerm.length);
              }
            }

            const zoomIn = renderEl.querySelector('#zoom-in');
            const zoomOut = renderEl.querySelector('#zoom-out');
            if (zoomIn && zoomOut) {
              zoomIn.onclick = () => {
                _zoomLevel = Math.min(_zoomLevel + 25, 300);
                _onFileFn(_lastFile, _lastContent, h);
              };
              zoomOut.onclick = () => {
                _zoomLevel = Math.max(_zoomLevel - 25, 25);
                _onFileFn(_lastFile, _lastContent, h);
              };
            }

          } catch (err) {
            console.error('Graphviz failure:', err);
            h.showError('Rendering Failed', 'Graphviz could not render this file. The DOT syntax might be incompatible with the WASM engine.');
          } finally {
            h.showLoading(false);
          }
        })();
      }
    });
  };
})();
