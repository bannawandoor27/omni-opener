/**
 * OmniOpener — XML/Feed Toolkit
 * Uses OmniTool SDK, highlight.js, and native DOMParser.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function prettifyXml(xml) {
    let formatted = '';
    let reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach(function(node) {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) indent = 0;
      else if (node.match(/^<\/\w/)) { if (pad != 0) pad -= 1; }
      else if (node.match(/^<\w[^>]*[^\/]>.*$/)) indent = 1;
      else indent = 0;
      let padding = '';
      for (let i = 0; i < pad; i++) padding += '  ';
      formatted += padding + node + '\r\n';
      pad += indent;
    });
    return formatted.trim();
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
      infoHtml: '<strong>XML Toolkit:</strong> Professional XML viewer with XPath search, auto-formatting, and Tree View.',
      
      onInit: function(helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '✨ Prettify',
          onClick: function (helpers) {
            const formatted = prettifyXml(helpers.getContent());
            helpers.getMountEl()._onFileUpdate(helpers.getFile(), formatted);
          }
        },
        {
          label: '📥 Export JSON',
          onClick: function (helpers) {
            const data = helpers.getState().parsedData;
            if (data) {
              helpers.download(helpers.getFile().name.replace(/\.[^.]+$/, '.json'), JSON.stringify(data, null, 2), 'application/json');
            }
          }
        }
      ],

      onFile: function _onFile(file, content, helpers) {
        helpers.getMountEl()._onFileUpdate = (f, c) => _onFile(f, c, helpers);

        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading engines...');
          setTimeout(() => _onFile(file, content, helpers), 500);
          return;
        }

        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, "text/xml");
          const parsed = xmlToJson(xmlDoc);
          helpers.setState({ parsedData: parsed, xmlDoc: xmlDoc, fileName: file.name, fileSize: (content.length/1024).toFixed(1) });

          const isFeed = content.includes('<rss') || content.includes('<feed');
          
          const renderHtml = `
            <div class="flex flex-col h-[85vh] border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm font-sans">
              <div class="shrink-0 bg-surface-50 border-b border-surface-200">
                <div class="flex items-center justify-between px-4 py-3">
                  <div class="flex items-center gap-3">
                    <span class="text-xl">📄</span>
                    <div class="space-y-0.5">
                      <h3 class="text-sm font-bold text-surface-900 truncate max-w-md">${escapeHtml(file.name)}</h3>
                      <p class="text-[10px] text-surface-400 font-bold uppercase tracking-wider">${helpers.getState().fileSize} KB • XML Document</p>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button id="btn-expand-all" class="px-2 py-1 text-[10px] font-bold bg-white border border-surface-200 rounded hover:bg-surface-50 uppercase">Expand All</button>
                    <button id="btn-collapse-all" class="px-2 py-1 text-[10px] font-bold bg-white border border-surface-200 rounded hover:bg-surface-50 uppercase">Collapse All</button>
                  </div>
                </div>

                <div class="px-4 pb-3 pt-1 flex gap-2 border-t border-surface-100">
                   <div class="relative flex-1">
                      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-brand-500 font-mono">/</span>
                      <input type="text" id="xpath-query" placeholder="XPath Query (e.g. //item/title)" class="w-full pl-7 pr-4 py-1.5 text-xs font-mono border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 bg-white outline-none">
                   </div>
                   <button id="btn-run-xpath" class="px-4 py-1.5 bg-brand-600 text-white text-xs font-bold rounded-lg hover:bg-brand-700 shadow-sm">Run</button>
                </div>

                <div class="flex px-4 border-t border-surface-100 bg-white gap-4">
                  <button id="tab-tree" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-brand-500 text-brand-600">Tree View</button>
                  ${isFeed ? `<button id="tab-preview" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400">Feed Preview</button>` : ''}
                  <button id="tab-source" class="px-2 py-2 text-[10px] font-bold uppercase tracking-wider border-b-2 border-transparent text-surface-400">Source</button>
                </div>
              </div>

              <div id="xml-viewport" class="flex-1 overflow-auto p-6 bg-white font-mono text-[13px]">
                <div id="view-xpath" class="hidden mb-6 p-4 bg-brand-50 rounded-xl border border-brand-100">
                   <h3 class="text-[10px] font-bold uppercase text-brand-600 mb-2">Query Results</h3>
                   <div id="xpath-results" class="space-y-2 max-h-48 overflow-auto"></div>
                </div>
                <div id="view-tree" class="space-y-1"></div>
                <div id="view-preview" class="hidden prose prose-sm max-w-none"></div>
                <pre id="view-source" class="hidden hljs language-xml p-4 rounded-xl border border-surface-100 overflow-auto"></pre>
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
              header.innerHTML = `<span class="text-[10px] text-surface-300 group-hover:text-brand-500 transition-transform">▼</span><span class="text-brand-700 font-bold">${escapeHtml(label || 'root')}</span>`;
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

          document.getElementById('btn-expand-all').onclick = () => {
            treeContainer.querySelectorAll('.hidden').forEach(el => el.classList.remove('hidden'));
            treeContainer.querySelectorAll('.transition-transform').forEach(el => el.style.transform = '');
          };

          document.getElementById('btn-collapse-all').onclick = () => {
            treeContainer.querySelectorAll('.ml-1').forEach(el => el.classList.add('hidden'));
            treeContainer.querySelectorAll('.transition-transform').forEach(el => el.style.transform = 'rotate(-90deg)');
          };

          document.getElementById('btn-run-xpath').onclick = () => {
             const query = document.getElementById('xpath-query').value.trim();
             if (!query) return;
             const resultsContainer = document.getElementById('view-xpath');
             const resultsList = document.getElementById('xpath-results');
             resultsContainer.classList.remove('hidden');
             resultsList.innerHTML = '';
             try {
                const nodes = xmlDoc.evaluate(query, xmlDoc, null, XPathResult.ANY_TYPE, null);
                let node = nodes.iterateNext();
                let count = 0;
                while (node) {
                   const item = document.createElement('div');
                   item.className = 'p-2 bg-white border border-brand-100 rounded text-[11px] truncate';
                   item.textContent = node.textContent || node.outerHTML || String(node);
                   resultsList.appendChild(item);
                   node = nodes.iterateNext();
                   count++;
                }
                if (count === 0) resultsList.innerHTML = '<p class="text-[10px] text-surface-400 italic">No results found.</p>';
             } catch (e) {
                helpers.showError('XPath Error', e.message);
             }
          };

          const tabBtns = [document.getElementById('tab-tree'), document.getElementById('tab-preview'), document.getElementById('tab-source')].filter(Boolean);
          const views = [treeContainer, previewContainer, sourceContainer].filter(Boolean);

          tabBtns.forEach((btn, idx) => {
            btn.onclick = () => {
              tabBtns.forEach(b => b.classList.replace('border-brand-500', 'border-transparent'));
              tabBtns.forEach(b => b.classList.replace('text-brand-600', 'text-surface-400'));
              btn.classList.replace('border-transparent', 'border-brand-500');
              btn.classList.replace('text-surface-400', 'text-brand-600');
              views.forEach(v => v.classList.add('hidden'));
              views[idx].classList.remove('hidden');
            };
          });
        } catch (e) {
          helpers.showError('XML Parse Error', e.message);
        }
      }
    });
  };
})();
