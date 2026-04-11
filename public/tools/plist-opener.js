/**
 * OmniOpener — Plist Viewer & Converter
 * Uses OmniTool SDK and plist.js to handle Apple Property List files.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.plist',
      binary: true,
      dropLabel: 'Drop a .plist file here',
      infoHtml: '<strong>Apple Plist Tool:</strong> View, search, and convert .plist files to JSON. Supports XML plists. 100% private and client-side.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const data = h.getState().parsed;
            if (data) h.copyToClipboard(JSON.stringify(data, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const data = h.getState().parsed;
            if (data) h.download(h.getFile().name + '.json', JSON.stringify(data, null, 2), 'application/json');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/plist@3.1.0/dist/plist.min.js');
      },

      onFile: function (file, buffer, h) {
        h.showLoading('Parsing Plist...');

        const header = new Uint8Array(buffer.slice(0, 8));
        const headerStr = String.fromCharCode.apply(null, header);

        if (headerStr.startsWith('bplist')) {
          h.showError('Binary Plist Detected', 'This tool currently supports XML plists. Please provide an XML version.');
          return;
        }

        try {
          const content = new TextDecoder().decode(buffer);
          // plist.js expects an XML string
          const parsed = plist.parse(content);
          h.setState('parsed', parsed);
          
          h.render(`
            <div class="flex flex-col h-[70vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="bg-surface-50 border-b border-surface-200 px-4 py-2 flex justify-between items-center text-xs text-surface-500 font-medium">
                <div class="flex items-center gap-2">
                  <span class="text-lg">📜</span>
                  <span class="truncate max-w-[200px]">${escapeHtml(file.name)}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="bg-surface-200 px-2 py-0.5 rounded text-[10px]">XML</span>
                </div>
              </div>
              <div id="plist-content" class="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed"></div>
            </div>
          `);

          const container = document.getElementById('plist-content');
          const renderTree = (data, target, label = '') => {
            renderNode(data, target, label, renderTree);
          };

          renderTree(parsed, container);

        } catch (err) {
          h.showError('Invalid Plist', 'Could not parse XML Plist. Error: ' + err.message);
        }
      }
    });
  };

  function renderNode(data, container, label, recurse) {
    const isObject = data !== null && typeof data === 'object' && !(data instanceof Date) && !(data instanceof Uint8Array);
    const isArray = Array.isArray(data);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'pl-4 border-l border-surface-100 mb-0.5';

    if (isObject) {
      const header = document.createElement('div');
      header.className = 'flex items-center gap-2 cursor-pointer group py-0.5';
      header.innerHTML = `
        <span class="text-[10px] text-surface-400 group-hover:text-brand-500 transition-transform">▼</span>
        <span class="text-brand-700 font-bold">${label ? escapeHtml(label) + ':' : ''}</span>
        <span class="text-surface-400 text-[11px]">${isArray ? '[' + data.length + ' items]' : '{' + Object.keys(data).length + ' keys}'}</span>
      `;
      
      const body = document.createElement('div');
      body.className = 'ml-2';
      header.onclick = () => {
        const collapsed = body.classList.toggle('hidden');
        header.querySelector('span').style.transform = collapsed ? 'rotate(-90deg)' : '';
      };

      if (isArray) {
        data.forEach((v, i) => recurse(v, body, String(i)));
      } else {
        const entries = Object.entries(data);
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        entries.forEach(([k, v]) => recurse(v, body, k));
      }
      wrapper.appendChild(header);
      wrapper.appendChild(body);
    } else {
      let valDisplay = String(data);
      let valClass = 'text-surface-600';
      
      if (typeof data === 'string') {
        valClass = 'text-green-600';
        valDisplay = '"' + data + '"';
      } else if (typeof data === 'number') {
        valClass = 'text-blue-600';
      } else if (typeof data === 'boolean') {
        valClass = 'text-purple-600';
      } else if (data instanceof Date) {
        valClass = 'text-amber-600';
        valDisplay = '📅 ' + data.toLocaleString();
      } else if (data instanceof Uint8Array || (data && data.type === 'Buffer')) {
        valClass = 'text-surface-400 italic';
        const len = data.length || (data.data ? data.data.length : 0);
        valDisplay = '<Data: ' + len + ' bytes>';
      } else if (data === null) {
        valClass = 'text-surface-300';
        valDisplay = 'null';
      }

      wrapper.innerHTML = `
        <div class="py-0.5">
          <span class="text-brand-700 font-bold">${label ? escapeHtml(label) + ':' : ''}</span>
          <span class="${valClass}">${escapeHtml(valDisplay)}</span>
        </div>
      `;
    }
    container.appendChild(wrapper);
  }

})();
