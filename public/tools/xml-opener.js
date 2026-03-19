(function () {
  'use strict';

  function formatXml(xml) {
    let formatted = '';
    let reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach(function(node) {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) pad -= 1;
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }

      let padding = '';
      for (let i = 0; i < pad; i++) padding += '  ';
      formatted += padding + node + '\r\n';
      pad += indent;
    });
    return formatted.trim();
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xml,.rss,.atom,.svg,.kml,.gpx,.wsdl,.xsd',
      binary: false,
      actions: [
        {
          label: '📋 Copy XML',
          id: 'copy-xml',
          onClick: function (helpers, btn) {
            const content = helpers.getContent();
            if (content) {
              helpers.copyToClipboard(content, btn);
            }
          }
        },
        {
          label: '📥 Export JSON',
          id: 'export-json',
          onClick: function (helpers) {
            const content = helpers.getContent();
            if (content && typeof XMLParser !== 'undefined') {
              try {
                const parser = new XMLParser({
                  ignoreAttributes: false,
                  attributeNamePrefix: "@_"
                });
                const jsonObj = parser.parse(content);
                const json = JSON.stringify(jsonObj, null, 2);
                helpers.download(helpers.getFile().name.replace(/\.[^.]+$/, '.json'), json, 'application/json');
              } catch (e) {
                helpers.showError('Conversion failed', e.message);
              }
            } else if (typeof XMLParser === 'undefined') {
              helpers.showError('XML engine not loaded');
            }
          }
        }
      ],
      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
        helpers.loadScript('https://cdn.jsdelivr.net/npm/fast-xml-parser@4.3.4/lib/fxp.min.js');
      },
      onFile: function _onFile(file, content, helpers) {
        if (typeof hljs === 'undefined') {
          helpers.showLoading('Loading highlight.js...');
          helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', () => _onFile(file, content, helpers));
          return;
        }
        try {
          const beautified = formatXml(content);
          const highlighted = hljs.highlight(beautified, { language: 'xml' }).value;
          helpers.render(`<div class="p-4"><pre class="hljs language-xml rounded-lg p-4 overflow-auto max-h-[70vh]">${highlighted}</pre></div>`);
        } catch (e) {
          helpers.showError('XML Error', e.message);
        }
      }
    });
  };
})();
