(function() {
  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xml',
      dropLabel: 'Drop an .xml file here to view it',
      binary: false,
      infoHtml: '<strong class="text-brand-700">XML Viewer:</strong> Displays and formats XML files.',
      actions: [
        {
          label: '📋 Copy Raw XML',
          id: 'copy-raw',
          onClick: function(helpers, btn) {
            const rawXml = helpers.getRenderEl().querySelector('pre.raw-xml-content code');
            if (rawXml) {
              helpers.copyToClipboard(rawXml.textContent, btn);
            } else {
              helpers.showError('Copy Error', 'No raw XML content found to copy.');
            }
          }
        },
        {
          label: '📥 Download XML',
          id: 'download-xml',
          onClick: function(helpers, btn) {
            const rawXml = helpers.getRenderEl().querySelector('pre.raw-xml-content code');
            if (rawXml && helpers._currentFile) { // _currentFile is a private helper, but needed for filename
              const filename = helpers._currentFile.name.replace(/\.[^/.]+$/, "") + '.xml';
              helpers.download(filename, rawXml.textContent, 'application/xml');
            } else {
              helpers.showError('Download Error', 'No XML content found to download.');
            }
          }
        }
      ],
      onInit: function(helpers) {
        // Load vkBeautify for XML formatting
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/vkBeautify/0.99.3/vkbeautify.min.js', function() {
          console.log('vkbeautify loaded.');
          // Ensure vkbeautify is available globally or within scope if needed elsewhere.
          // For this usage, it will be available in onFile directly.
        });
        // Load highlight.js for syntax highlighting
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', function() {
          console.log('highlight.js loaded.');
        });
      },
      onFile: function(file, content, helpers) {
        try {
          helpers.showLoading('Parsing and formatting XML...');

          // Check if vkbeautify is loaded
          if (typeof vkbeautify === 'undefined') {
            helpers.showError('Library Not Loaded', 'XML beautifier (vkbeautify) not yet loaded. Please try again in a moment or reload.');
            return;
          }
          if (typeof hljs === 'undefined') {
            helpers.showError('Library Not Loaded', 'Syntax highlighter (highlight.js) not yet loaded. Please try again in a moment or reload.');
            return;
          }

          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(content, "application/xml");

          // Check for parsing errors
          const errorNode = xmlDoc.querySelector('parsererror');
          if (errorNode) {
            helpers.showError('XML Parsing Error', errorNode.textContent);
            return;
          }

          // Beautify XML
          const beautifiedXml = vkbeautify.xml(new XMLSerializer().serializeToString(xmlDoc), 2); // Indent by 2 spaces

          const htmlOutput = `
            <div class="p-4 bg-surface-100 rounded-lg shadow-inner overflow-auto h-full flex flex-col">
              <h3 class="text-lg font-semibold text-brand-800 mb-2">Formatted XML:</h3>
              <pre class="raw-xml-content flex-grow bg-surface-200 p-3 rounded-md text-sm text-surface-900 overflow-auto"><code class="language-xml">${hljs.highlight(beautifiedXml, {language: 'xml'}).value}</code></pre>
            </div>
          `;
          helpers.render(htmlOutput);
          // highlight.js needs to be run after the content is in the DOM,
          // but OmniTool's render function handles DOM insertion before returning,
          // so this might not be strictly necessary if highlight.js has observers.
          // However, for explicit highlighting, if needed, one might use a callback
          // after render, or if render returns the DOM element, call it directly.
          // For now, let's assume hljs automatically picks it up or its value is enough.
        } catch (e) {
          helpers.showError('Processing Error', e.message);
        }
      }
    });
  };
})();
