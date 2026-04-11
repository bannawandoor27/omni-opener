(function () {
  'use strict';

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
            if (content) h.copyToClipboard(content, btn);
          }
        },
        {
          label: '📥 Download HTML',
          id: 'download-html',
          onClick: function (h) {
            var renderEl = h.getRenderEl();
            var filename = h.getFile().name.replace('.ipynb', '.html');
            var htmlContent = renderEl.innerHTML;
            
            var template = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>' + h.getFile().name + '</title>\n' +
'    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">\n' +
'    <style>\n' +
'        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #24292e; max-width: 900px; margin: 0 auto; padding: 40px; background: #fff; }\n' +
'        .nb-notebook { }\n' +
'        .nb-cell { margin-bottom: 24px; }\n' +
'        .nb-markdown-cell { margin-bottom: 16px; }\n' +
'        .nb-code-cell { border: 1px solid #e1e4e8; border-radius: 6px; overflow: hidden; background: #f6f8fa; }\n' +
'        .nb-input { padding: 12px; border-bottom: 1px solid #e1e4e8; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 14px; }\n' +
'        .nb-output { padding: 12px; background: #fff; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: 14px; overflow-x: auto; }\n' +
'        pre { margin: 0 !important; border: none !important; background: transparent !important; }\n' +
'        img { max-width: 100%; height: auto; }\n' +
'        code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; background: rgba(27,31,35,0.05); padding: 0.2em 0.4em; border-radius: 3px; }\n' +
'        h1, h2, h3 { border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="nb-notebook">' + htmlContent + '</div>\n' +
'</body>\n' +
'</html>';
            h.download(filename, template, 'text/html');
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css');
        
        var style = document.createElement('style');
        style.textContent = 
          '.nb-notebook { padding: 2rem; background: #fff; }\n' +
          '.nb-cell { margin-bottom: 2rem; }\n' +
          '.nb-markdown-cell { color: #24292e; line-height: 1.6; }\n' +
          '.nb-markdown-cell img { max-width: 100%; border-radius: 4px; }\n' +
          '.nb-code-cell { border: 1px solid #e1e4e8; border-radius: 8px; overflow: hidden; background: #f6f8fa; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }\n' +
          '.nb-input { padding: 1rem; position: relative; }\n' +
          '.nb-input::before { content: "In [" + attr(data-execution-count) + "]:"; position: absolute; left: -60px; top: 1rem; font-size: 12px; color: #6a737d; width: 50px; text-align: right; }\n' +
          '.nb-output { padding: 1rem; background: #fff; border-top: 1px solid #e1e4e8; min-height: 1.5rem; }\n' +
          '.nb-stdout, .nb-stderr { font-family: monospace; white-space: pre-wrap; font-size: 13px; }\n' +
          '.nb-stderr { color: #d73a49; background: #ffeef0; padding: 0.5rem; border-radius: 4px; }\n' +
          '.nb-notebook pre[class*="language-"] { margin: 0 !important; padding: 0 !important; background: transparent !important; }\n' +
          '@media (max-width: 800px) { .nb-input::before { display: none; } }';
        document.head.appendChild(style);

        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js',
          'https://cdn.jsdelivr.net/npm/notebookjs@0.6.7/notebook.min.js'
        ]);
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing notebook…');
        
        // Ensure dependencies are ready
        if (typeof nb === 'undefined' || typeof marked === 'undefined' || typeof Prism === 'undefined') {
          setTimeout(function() { h.onFile(file, content, h); }, 200);
          return;
        }

        try {
          var ipynb = JSON.parse(content);
          var notebook = nb.parse(ipynb);
          var rendered = notebook.render();
          
          h.render('');
          var container = document.createElement('div');
          container.className = 'nb-notebook';
          container.appendChild(rendered);
          h.getRenderEl().appendChild(container);
          
          // Apply syntax highlighting
          Prism.highlightAllUnder(container);
          
          // Fix image paths if any (usually they are base64 in ipynb)
          container.querySelectorAll('img').forEach(function(img) {
            img.classList.add('max-w-full', 'h-auto');
          });
          
        } catch (err) {
          h.showError('Could not parse IPYNB', 'Ensure the file is a valid Jupyter Notebook JSON. Error: ' + err.message);
        }
      }
    });
  };
})();
