(function() {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.cbor',
      dropLabel: 'Drop a .cbor file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css');
        helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/cbor-js@0.1.0/cbor.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js'
        ]);
      },
      onFile: function(file, content, helpers) {
        if (typeof CBOR === 'undefined' || typeof Prism === 'undefined') {
          helpers.showLoading('Loading engines...');
          setTimeout(() => {
            if (helpers.getFile() === file) this.onFile(file, content, helpers);
          }, 500);
          return;
        }

        helpers.showLoading('Parsing CBOR...');
        
        try {
          const data = CBOR.decode(content);
          const jsonString = JSON.stringify(data, (key, value) => {
            if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
              return `[Binary Data: ${value.byteLength} bytes]`;
            }
            return value;
          }, 2);
          
          helpers.setState({ 
            decodedData: data,
            prettyJson: jsonString
          });

          const html = `
            <div class="p-4">
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
                <span class="font-medium">${escapeHtml(file.name)}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-400">·</span>
                <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">CBOR</span>
              </div>
              
              <div class="relative group">
                <pre class="line-numbers language-json rounded-xl !bg-surface-900 !m-0 overflow-auto max-h-[70vh] text-sm"><code class="language-json">${escapeHtml(jsonString)}</code></pre>
              </div>
            </div>
          `;
          
          helpers.render(html);
          
          const codeEl = helpers.getRenderEl().querySelector('code');
          if (codeEl) {
            Prism.highlightElement(codeEl);
          }
        } catch(e) {
          helpers.showError('Could not parse CBOR file', e.message || 'The file might not be a valid CBOR encoded object.');
        }
      },
      actions: [
        { 
          label: '📋 Copy JSON', 
          id: 'copy', 
          onClick: function(helpers, btn) { 
            const json = helpers.getState().prettyJson;
            if (json) helpers.copyToClipboard(json, btn);
          } 
        },
        { 
          label: '📥 Download JSON', 
          id: 'dl-json', 
          onClick: function(helpers) { 
            const json = helpers.getState().prettyJson;
            const filename = helpers.getFile().name.replace(/\.[^/.]+$/, "") + ".json";
            if (json) helpers.download(filename, json, 'application/json');
          } 
        },
        {
          label: '📥 Download Original',
          id: 'dl-raw',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/cbor');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your CBOR files are decoded locally and never leave your device.'
    });
  };
})();
