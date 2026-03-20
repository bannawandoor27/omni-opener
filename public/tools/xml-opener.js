/**
 * OmniOpener — XML/Feed Toolkit
 * Uses OmniTool SDK and highlight.js. Native DOMParser for Tree View.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function xmlToJson(xml) {
    let obj = {};
    if (xml.nodeType === 1) {
      if (xml.attributes.length > 0) {
        obj["@attributes"] = {};
        for (let j = 0; j < xml.attributes.length; j++) {
          const attribute = xml.attributes.item(j);
          obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
        }
      }
    } else if (xml.nodeType === 3) {
      obj = xml.nodeValue;
    }
    if (xml.hasChildNodes()) {
      for (let i = 0; i < xml.childNodes.length; i++) {
        const item = xml.childNodes.item(i);
        const nodeName = item.nodeName;
        if (typeof (obj[nodeName]) === "undefined") {
          obj[nodeName] = xmlToJson(item);
        } else {
          if (typeof (obj[nodeName].push) === "undefined") {
            const old = obj[nodeName];
            obj[nodeName] = [];
            obj[nodeName].push(old);
          }
          obj[nodeName].push(xmlToJson(item));
        }
      }
    }
    return obj;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xml,.rss,.atom,.svg,.kml,.gpx,.wsdl,.xsd',
      dropLabel: 'Drop an XML or Feed file here',
      binary: false,
      infoHtml: '<strong>XML Toolkit:</strong> Professional XML viewer with Tree View and Feed previews. No external dependencies for parsing.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy Source',
          id: 'copy-xml',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data) {
              helpers.download(helpers.getFile().name.replace(/\.[^.]+$/, '.json'), JSON.stringify(data, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, "text/xml");
          const parsed = xmlToJson(xmlDoc);
          helpers.setState('parsedData', parsed);

          const isFeed = content.includes('<rss') || content.includes('<feed');
          
          const renderHtml = `
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200 p-2 flex items-center justify-between">
                <div class="flex px-2">
                  <button id="tab-tree" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-brand-500 text-brand-600">Tree View</button>
                  ${isFeed ? `<button id="tab-preview" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Feed Preview</button>` : ''}
                  <button id="tab-source" class="px-4 py-1.5 text-[10px] font-bold uppercase border-b-2 border-transparent text-surface-400 hover:text-surface-600">Source</button>
                </div>
                <div class="px-4 text-[10px] font-mono text-surface-400">${(content.length/1024).toFixed(1)} KB</div>
              </div>
              <div id="xml-viewport" class="flex-1 overflow-auto p-4 bg-white font-mono text-[12px]">
                <div id="view-tree" class="space-y-1"></div>
                <div id="view-preview" class="hidden prose prose-sm max-w-none"></div>
                <pre id="view-source" class="hidden hljs language-xml p-4 rounded-lg overflow-auto"></pre>
              </div>
            </div>
          `;
          helpers.render(renderHtml);

          const treeContainer = document.getElementById('view-tree');
          const sourceContainer = document.getElementById('view-source');
          const previewContainer = document.getElementById('view-preview');

          function renderTree(data, container, label = '') {
            if (!data || (typeof data === 'string' && !data.trim())) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'pl-4 border-l border-surface-100 py-0.5';
            if (data !== null && typeof data === 'object') {
              const entries = Object.entries(data).filter(([k]) => k !== '#text' || (typeof data[k] === 'string' && data[k].trim()));
              if (entries.length === 0) return;
              const header = document.createElement('div');
              header.className = 'flex items-center gap-2 cursor-pointer group';
              header.innerHTML = `<span class="text-[8px] text-surface-300 group-hover:text-brand-500">▼</span><span class="text-brand-700 font-bold">${escapeHtml(label || 'root')}</span>`;
              const body = document.createElement('div');
              body.className = 'ml-1';
              header.onclick = () => {
                const isCollapsed = body.classList.toggle('hidden');
                header.querySelector('span').style.transform = isCollapsed ? 'rotate(-90deg)' : '';
              };
              wrapper.appendChild(header);
              wrapper.appendChild(body);
              entries.forEach(([k, v]) => renderTree(v, body, k));
            } else {
              wrapper.innerHTML = `<div class="flex gap-2"><span class="text-brand-700 font-bold">${escapeHtml(label)}:</span><span class="text-surface-600">${escapeHtml(String(data))}</span></div>`;
            }
            container.appendChild(wrapper);
          }
          renderTree(parsed, treeContainer);

          sourceContainer.innerHTML = hljs.highlight(content.slice(0, 50000), { language: 'xml' }).value;

          const tabs = { tree: document.getElementById('tab-tree'), preview: document.getElementById('tab-preview'), source: document.getElementById('tab-source') };
          const views = { tree: treeContainer, preview: previewContainer, source: sourceContainer };
          Object.keys(tabs).forEach(k => {
            if (!tabs[k]) return;
            tabs[k].onclick = () => {
              Object.values(tabs).forEach(t => t && t.classList.replace('border-brand-500', 'border-transparent'));
              Object.values(tabs).forEach(t => t && t.classList.replace('text-brand-600', 'text-surface-400'));
              tabs[k].classList.replace('border-transparent', 'border-brand-500');
              tabs[k].classList.replace('text-surface-400', 'text-brand-600');
              Object.values(views).forEach(v => v && v.classList.add('hidden'));
              views[k].classList.remove('hidden');
            };
          });
        } catch (e) {
          helpers.showError('XML Parse Error', e.message);
        }
      }
    });
  };
})();
