(function () {
  'use strict';

  var styles = 
    '.nb-notebook { padding: 2rem; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }\n' +
    '.nb-cell { margin-bottom: 2rem; }\n' +
    '.nb-markdown-cell { color: #24292e; line-height: 1.6; }\n' +
    '.nb-markdown-cell img { max-width: 100%; border-radius: 4px; }\n' +
    '.nb-code-cell { border: 1px solid #e1e4e8; border-radius: 8px; overflow: hidden; background: #f6f8fa; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }\n' +
    '.nb-input { padding: 1rem; position: relative; }\n' +
    '.nb-input::before { content: "In [" attr(data-execution-count) "]:"; position: absolute; left: -65px; top: 1rem; font-size: 11px; color: #6a737d; width: 60px; text-align: right; font-family: monospace; }\n' +
    '.nb-output { padding: 1rem; background: #fff; border-top: 1px solid #e1e4e8; min-height: 1.5rem; }\n' +
    '.nb-stdout, .nb-stderr { font-family: monospace; white-space: pre-wrap; font-size: 13px; }\n' +
    '.nb-stderr { color: #d73a49; background: #ffeef0; padding: 0.5rem; border-radius: 4px; }\n' +
    '.nb-notebook pre { margin: 0 !important; padding: 0 !important; background: transparent !important; }\n' +
    '@media (max-width: 800px) { .nb-input::before { display: none; } }';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ipynb',
      dropLabel: 'Drop a Jupyter Notebook (.ipynb) here',
      infoHtml: '<strong>Privacy:</strong> Your notebook is processed entirely in your browser. No data is sent to any server.',

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            var content = h.getContent();
            if (content) {
              try {
                var json = JSON.parse(content);
                h.copyToClipboard(JSON.stringify(json, null, 2), btn);
              } catch (e) {
                h.copyToClipboard(content, btn);
              }
            }
          }
        },
        {
          label: '📥 Download HTML',
          id: 'download-html',
          onClick: function (h) {
            var renderEl = h.getRenderEl();
            var file = h.getFile();
            var filename = file ? file.name.replace(/\.ipynb$/i, '.html') : 'notebook.html';
            var htmlContent = renderEl.innerHTML;
            
            var template = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>' + (file ? file.name : 'Notebook') + '</title>\n' +
'    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">\n' +
'    <style>\n' + styles + '\n</style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="nb-notebook">' + htmlContent + '</div>\n' +
'</body>\n' +
'</html>';
            h.download(filename, template, 'text/html');
          }
        },
        {
          label: '📥 Download .ipynb',
          id: 'download-ipynb',
          onClick: function (h) {
            var content = h.getContent();
            var file = h.getFile();
            var filename = file ? file.name : 'notebook.ipynb';
            h.download(filename, content, 'application/x-ipynb+json');
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css');
        
        if (!document.getElementById('nb-tool-styles')) {
          var s = document.createElement('style');
          s.id = 'nb-tool-styles';
          s.textContent = styles;
          document.head.appendChild(s);
        }

        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js',
          'https://cdn.jsdelivr.net/npm/ansi_up@5.2.1/ansi_up.min.js',
          'https://cdn.jsdelivr.net/npm/notebookjs@0.6.7/notebook.min.js'
        ], function() {
          // Shim marked for notebookjs if needed
          if (typeof marked === 'object' && marked.parse && typeof marked !== 'function') {
            var m = window.marked;
            window.marked = function(text) { return m.parse(text); };
            for (var k in m) { window.marked[k] = m[k]; }
          }
          h.setState('depsLoaded', true);
          var pending = h.getState().pendingFile;
          if (pending) {
            h.setState('pendingFile', null);
            processNotebook(pending.file, pending.content, h);
          }
        });
      },

      onFile: function (file, content, h) {
        if (!h.getState().depsLoaded) {
          h.showLoading('Loading dependencies…');
          h.setState('pendingFile', { file: file, content: content });
          return;
        }
        processNotebook(file, content, h);
      }
    });
  };

  function processNotebook(file, content, h) {
    h.showLoading('Parsing notebook…');
    try {
      var ipynb = JSON.parse(content);
      var notebook = nb.parse(ipynb);
      var rendered = notebook.render();
      
      h.render('<div class="nb-notebook-container"></div>');
      var container = h.getRenderEl().querySelector('.nb-notebook-container');
      container.appendChild(rendered);
      
      var lang = 'python';
      if (ipynb.metadata && ipynb.metadata.language_info && ipynb.metadata.language_info.name) {
        lang = ipynb.metadata.language_info.name;
      }
      container.querySelectorAll('pre code').forEach(function(code) {
        if (!code.className.match(/language-/)) {
          code.classList.add('language-' + lang);
        }
      });

      if (window.Prism) {
        Prism.highlightAllUnder(container);
      }
      
      container.querySelectorAll('img').forEach(function(img) {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
      });
    } catch (err) {
      h.showError('Parse Failed', 'The file is not a valid Jupyter Notebook. Error: ' + err.message);
    }
  }
})();
