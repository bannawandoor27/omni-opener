(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _hpcc = null;
    let _lastFile = null;
    let _lastContent = null;
    let _currentSvg = null;
    let _viewMode = 'graph'; // 'graph' or 'source'
    let _searchTerm = '';

    // Local escape helper
    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // Capture the onFile function for internal re-renders
    let _onFileInternal = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dot,.gv',
      dropLabel: 'Drop a DOT or GV file here',
      binary: false,
      infoHtml: '<strong>Graphviz Viewer:</strong> Renders DOT language diagrams using WebAssembly. Your data never leaves your browser.',

      actions: [
        {
          label: '📊 Toggle View',
          id: 'toggle-view',
          onClick: function (h) {
            _viewMode = _viewMode === 'graph' ? 'source' : 'graph';
            if (_onFileInternal && _lastFile && _lastContent) {
              _onFileInternal(_lastFile, _lastContent, h);
            }
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
          label: '🖼️ Download SVG',
          id: 'download-svg',
          onClick: function (h) {
            if (_currentSvg) {
              const blob = new Blob([_currentSvg], { type: 'image/svg+xml' });
              h.download((_lastFile?.name || 'graph') + '.svg', blob, 'image/svg+xml');
            }
          }
        },
        {
          label: '📷 Download PNG',
          id: 'download-png',
          onClick: function (h) {
            const svgEl = h.getRenderEl().querySelector('svg');
            if (!svgEl) return;

            h.showLoading('Generating PNG...');
            const bbox = svgEl.getBBox();
            const width = svgEl.width.baseVal.value || bbox.width;
            const height = svgEl.height.baseVal.value || bbox.height;
            
            const canvas = document.createElement('canvas');
            const scale = 2; 
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const img = new Image();
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = function () {
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob(function (blob) {
                h.download((_lastFile?.name || 'graph') + '.png', blob, 'image/png');
                URL.revokeObjectURL(url);
                h.showLoading(false);
              }, 'image/png');
            };
            img.onerror = function() {
              URL.revokeObjectURL(url);
              h.showError('Export Failed', 'Could not convert SVG to PNG.');
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
        _hpcc = null;
        _lastFile = null;
        _lastContent = null;
        _currentSvg = null;
        _onFileInternal = null;
      },

      onFile: function _onFileFn(file, content, h) {
        if (!_onFileInternal) _onFileInternal = _onFileFn;
        
        if (!content || (typeof content === 'string' && !content.trim())) {
          h.render('<div class="p-12 text-center text-surface-500 italic">This file is empty.</div>');
          return;
        }

        _lastFile = file;
        _lastContent = content;

        const hpccLib = window['@hpcc-js/wasm'];
        if (!hpccLib) {
          h.showLoading('Loading Graphviz engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 100);
          return;
        }

        h.showLoading('Rendering Graph...');

        async function process() {
          try {
            if (!_hpcc) {
              _hpcc = await hpccLib.Graphviz.load();
            }

            _currentSvg = _hpcc.dot(content);
            
            const sizeStr = file.size < 1024 * 1024 
              ? (file.size / 1024).toFixed(1) + ' KB'
              : (file.size / (1024 * 1024)).toFixed(2) + ' MB';

            const infoBar = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${sizeStr}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.dot file</span>
              </div>
            `;

            let mainContent = '';
            if (_viewMode === 'graph') {
              mainContent = `
                <div class="flex flex-col gap-4">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Diagram Preview</h3>
                    <div class="relative">
                      <input type="text" id="node-search" placeholder="Highlight nodes..." 
                        class="px-3 py-1 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-48"
                        value="${escapeHtml(_searchTerm)}">
                    </div>
                  </div>
                  <div class="bg-white border border-surface-200 rounded-xl p-4 overflow-auto flex justify-center min-h-[400px]">
                    <div id="svg-container" class="w-full h-full flex justify-center">
                      ${_currentSvg}
                    </div>
                  </div>
                </div>
              `;
            } else {
              const lines = content.split('\n');
              const filteredLines = lines.map((line, i) => {
                const isMatch = _searchTerm && line.toLowerCase().includes(_searchTerm.toLowerCase());
                const escaped = escapeHtml(line);
                const highlighted = isMatch ? `<mark class="bg-yellow-200 text-black">${escaped}</mark>` : escaped;
                return `<div class="table-row hover:bg-white/10 ${isMatch ? 'bg-white/20' : ''}">
                  <span class="table-cell pr-4 text-gray-500 text-right select-none w-12 border-r border-gray-800">${i + 1}</span>
                  <span class="table-cell pl-4 whitespace-pre">${highlighted || ' '}</span>
                </div>`;
              }).join('');

              mainContent = `
                <div class="flex flex-col gap-4">
                  <div class="flex items-center justify-between">
                    <h3 class="font-semibold text-surface-800">Source Code</h3>
                    <div class="flex items-center gap-3">
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${lines.length} lines</span>
                      <input type="text" id="node-search" placeholder="Filter code..." 
                        class="px-3 py-1 text-xs border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none w-48"
                        value="${escapeHtml(_searchTerm)}">
                    </div>
                  </div>
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[600px]"><div class="table w-full border-collapse">${filteredLines}</div></pre>
                  </div>
                </div>
              `;
            }

            h.render(infoBar + mainContent);

            const svgContainer = h.getRenderEl().querySelector('#svg-container');
            if (svgContainer) {
              const svgEl = svgContainer.querySelector('svg');
              if (svgEl) {
                svgEl.style.width = '100%';
                svgEl.style.height = 'auto';
                svgEl.classList.add('max-w-full');
                
                if (_searchTerm && _viewMode === 'graph') {
                  const nodes = svgEl.querySelectorAll('.node');
                  nodes.forEach(node => {
                    const text = node.textContent.toLowerCase();
                    if (text.includes(_searchTerm.toLowerCase())) {
                      const shape = node.querySelector('ellipse, polygon, path, circle');
                      if (shape) {
                        shape.style.fill = '#fef08a';
                        shape.style.stroke = '#eab308';
                        shape.style.strokeWidth = '3px';
                      }
                    }
                  });
                }
              }
            }

            const searchInput = h.getRenderEl().querySelector('#node-search');
            if (searchInput) {
              searchInput.addEventListener('input', function(e) {
                _searchTerm = e.target.value;
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                  _onFileInternal(_lastFile, _lastContent, h);
                }, 250);
              });
              
              if (_searchTerm) {
                searchInput.focus();
                searchInput.setSelectionRange(_searchTerm.length, _searchTerm.length);
              }
            }

          } catch (err) {
            h.showError('Rendering Error', 'The DOT file could not be parsed. The syntax might be invalid.');
            console.error(err);
          } finally {
            h.showLoading(false);
          }
        }

        process();
      }
    });
  };
})();
