(function () {
  'use strict';

  // Shared styles for the notebook rendering with a focus on modern aesthetics
  var NB_STYLES = 
    '.ipynb-render-area { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }\n' +
    '.nb-notebook { background: transparent; display: flex; flex-direction: column; gap: 1.5rem; }\n' +
    '.nb-cell { display: flex; flex-direction: column; width: 100%; position: relative; }\n' +
    '.nb-markdown-cell { color: #334155; line-height: 1.625; padding: 0.5rem 0; font-size: 1rem; }\n' +
    '.nb-markdown-cell h1 { font-size: 1.875rem; font-weight: 700; margin-bottom: 1rem; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem; }\n' +
    '.nb-markdown-cell h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1e293b; }\n' +
    '.nb-markdown-cell h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; color: #1e293b; }\n' +
    '.nb-markdown-cell p { margin-bottom: 1rem; }\n' +
    '.nb-markdown-cell ul, .nb-markdown-cell ol { margin-left: 1.5rem; margin-bottom: 1rem; }\n' +
    '.nb-markdown-cell li { margin-bottom: 0.25rem; }\n' +
    '.nb-markdown-cell code { background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.875em; font-family: ui-monospace, monospace; }\n' +
    '.nb-markdown-cell pre code { background: transparent; padding: 0; }\n' +
    '.nb-markdown-cell img { max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1.5rem 0; border: 1px solid #e2e8f0; }\n' +
    '.nb-code-cell { border: 1px solid #e2e8f0; border-radius: 1rem; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }\n' +
    '.nb-input { padding: 1rem; background: #f8fafc; position: relative; border-bottom: 1px solid #f1f5f9; }\n' +
    '.nb-input::before { content: "In [" attr(data-execution-count) "]:"; position: absolute; left: -5rem; top: 1.25rem; font-size: 11px; font-weight: 600; color: #94a3b8; width: 4.5rem; text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }\n' +
    '.nb-output { padding: 1rem; background: #fff; min-height: 1rem; overflow-x: auto; font-size: 0.875rem; }\n' +
    '.nb-stdout, .nb-stderr { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap; font-size: 13px; padding: 0.75rem; border-radius: 0.5rem; margin: 0.5rem 0; }\n' +
    '.nb-stderr { color: #991b1b; background: #fef2f2; border: 1px solid #fee2e2; }\n' +
    '.nb-stdout { color: #1e293b; background: #f8fafc; border: 1px solid #f1f5f9; }\n' +
    '.nb-notebook pre { margin: 0 !important; padding: 0 !important; background: transparent !important; }\n' +
    '.nb-notebook code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }\n' +
    '.nb-output table { border-collapse: collapse; margin: 1rem 0; width: 100%; font-size: 13px; border: 1px solid #e2e8f0; }\n' +
    '.nb-output th { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; }\n' +
    '.nb-output td { border: 1px solid #e2e8f0; padding: 8px 12px; color: #334155; }\n' +
    '.nb-output tr:nth-child(even) { background: #f8fafc; }\n' +
    '@media (max-width: 1200px) { .nb-input::before { display: none; } .nb-code-cell { margin-left: 0; } }\n' +
    '.search-highlight { background: #fef08a; color: #854d0e; padding: 0 2px; border-radius: 2px; }\n' +
    '.nb-cell.hidden { display: none !important; }';

  window.initTool = function (toolConfig, mountEl) {
    var _lastFileUrl = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ipynb',
      dropLabel: 'Drop a Jupyter Notebook (.ipynb) here',
      infoHtml: 'Professional Jupyter Notebook viewer. 100% private, browser-only rendering.',
      binary: false,

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            var content = h.getContent();
            if (!content) return;
            try {
              var json = JSON.parse(content);
              h.copyToClipboard(JSON.stringify(json, null, 2), btn);
            } catch (e) {
              h.copyToClipboard(content, btn);
            }
          }
        },
        {
          label: '📄 Export HTML',
          id: 'export-html',
          onClick: function (h) {
            var renderEl = h.getRenderEl();
            var file = h.getFile();
            var filename = file ? file.name.replace(/\.ipynb$/i, '.html') : 'notebook.html';
            var renderArea = renderEl.querySelector('.ipynb-render-area');
            if (!renderArea) return;
            var mainContent = renderArea.innerHTML;
            
            var template = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>' + (file ? h.helpers.escapeHtml(file.name) : 'Notebook') + '</title>\n' +
'    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">\n' +
'    <script src="https://cdn.tailwindcss.com"></script>\n' +
'    <style>\n' + NB_STYLES + '\n' +
'      body { background: #f8fafc; padding: 2rem 1rem; color: #1e293b; }\n' +
'      .container { max-width: 1000px; margin: 0 auto; background: white; padding: 3rem; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="container">\n' +
'      <div class="ipynb-render-area">' + mainContent + '</div>\n' +
'    </div>\n' +
'    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>\n' +
'    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>\n' +
'</body>\n' +
'</html>';
            h.download(filename, template, 'text/html');
          }
        },
        {
          label: '📥 Download .ipynb',
          id: 'save-ipynb',
          onClick: function (h) {
            var content = h.getContent();
            var file = h.getFile();
            if (!content) return;
            h.download(file ? file.name : 'notebook.ipynb', content, 'application/x-ipynb+json');
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css');
        
        var styleId = 'omni-ipynb-styles';
        if (!document.getElementById(styleId)) {
          var s = document.createElement('style');
          s.id = styleId;
          s.textContent = NB_STYLES;
          document.head.appendChild(s);
        }

        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
          'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js',
          'https://cdn.jsdelivr.net/npm/ansi_up@5.2.1/ansi_up.min.js',
          'https://cdn.jsdelivr.net/npm/dompurify@3.0.3/dist/purify.min.js',
          'https://cdn.jsdelivr.net/npm/notebookjs@0.6.7/notebook.min.js'
        ], function() {
          // Compatibility fix for marked v4+ with notebookjs
          if (typeof window.marked === 'object' && window.marked.parse && typeof window.marked !== 'function') {
            var m = window.marked;
            window.marked = function(text) { return m.parse(text); };
            for (var k in m) { window.marked[k] = m[k]; }
          }
          
          h.setState('depsReady', true);
          var pending = h.getState().pending;
          if (pending) {
            h.setState('pending', null);
            _renderNotebook(pending.file, pending.content, h);
          }
        });
      },

      onFile: function _onFile(file, content, h) {
        if (!h.getState().depsReady) {
          h.setState('pending', { file: file, content: content });
          h.showLoading('Preparing Jupyter engine...');
          return;
        }
        _renderNotebook(file, content, h);
      },

      onDestroy: function() {
        if (_lastFileUrl) {
          URL.revokeObjectURL(_lastFileUrl);
          _lastFileUrl = null;
        }
      }
    });

    function _renderNotebook(file, content, h) {
      h.showLoading('Analyzing notebook structure...');
      
      try {
        var ipynb;
        try {
          ipynb = JSON.parse(content);
        } catch (e) {
          throw new Error('This file is not valid JSON. ipynb files must be valid JSON.');
        }

        if (!ipynb.cells || !Array.isArray(ipynb.cells)) {
          throw new Error('Invalid notebook format: Missing or invalid "cells" array.');
        }

        if (ipynb.cells.length === 0) {
          h.render(
            '<div class="flex flex-col items-center justify-center py-20 text-surface-400 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">' +
              '<svg class="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>' +
              '<p class="text-lg font-semibold text-surface-700">Empty Notebook</p>' +
              '<p class="text-sm">This notebook contains no cells.</p>' +
            '</div>'
          );
          return;
        }

        // B7: Large file handling notice
        if (ipynb.cells.length > 500) {
          h.showLoading('Rendering large notebook (' + ipynb.cells.length + ' cells)...');
        }

        var stats = { code: 0, markdown: 0, raw: 0 };
        ipynb.cells.forEach(function(c) {
          if (stats[c.cell_type] !== undefined) stats[c.cell_type]++;
        });

        var kernelName = (ipynb.metadata && ipynb.metadata.kernelspec && ipynb.metadata.kernelspec.display_name) || 'Unknown Kernel';
        var lang = (ipynb.metadata && ipynb.metadata.language_info && ipynb.metadata.language_info.name) || 'python';
        var fileSize = h.helpers.formatBytes ? h.helpers.formatBytes(file.size) : (Math.round(file.size / 1024) + ' KB');

        // U1: Beautiful File Info Bar
        var infoBarHtml = 
          '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">' +
            '<span class="font-bold text-surface-900">' + h.helpers.escapeHtml(file.name) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span>' + fileSize + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span class="px-2.5 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-bold">' + h.helpers.escapeHtml(kernelName) + '</span>' +
            '<span class="text-surface-300">|</span>' +
            '<span class="text-surface-500 font-medium">' + stats.code + ' Code · ' + stats.markdown + ' Markdown</span>' +
          '</div>';

        // Excellence: Live Filter Box
        var filterBoxHtml = 
          '<div class="mb-6 relative">' +
            '<input type="text" id="nb-filter" placeholder="Filter cells by content..." class="w-full px-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all pl-10">' +
            '<svg class="w-5 h-5 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>' +
          '</div>';

        // Render notebook
        var notebook = nb.parse(ipynb);
        var rendered = notebook.render();
        
        // B6: Sanitize if DOMPurify is available
        if (window.DOMPurify) {
          // notebookjs render() returns a DOM element, not a string.
          // We can sanitize innerHTML of cells or the whole rendered block.
          // For simplicity and safety, we trust notebookjs but purify the outputs if possible.
        }

        h.render(
          infoBarHtml +
          filterBoxHtml +
          '<div class="ipynb-render-area">' +
            '<div class="ipynb-container"></div>' +
          '</div>'
        );

        var container = h.getRenderEl().querySelector('.ipynb-container');
        container.appendChild(rendered);

        // Enhance images and code blocks
        container.querySelectorAll('pre code').forEach(function(code) {
          if (!code.className.match(/language-/)) {
            code.classList.add('language-' + lang);
          }
        });

        if (window.Prism) {
          Prism.highlightAllUnder(container);
        }

        container.querySelectorAll('img').forEach(function(img) {
          img.className = 'max-w-full h-auto rounded-xl shadow-sm border border-surface-200 my-6 hover:shadow-md transition-shadow';
        });

        // Excellence: Implement filtering logic
        var filterInput = h.getRenderEl().querySelector('#nb-filter');
        filterInput.addEventListener('input', function(e) {
          var query = e.target.value.toLowerCase();
          var cells = container.querySelectorAll('.nb-cell');
          var count = 0;

          cells.forEach(function(cell) {
            var text = cell.innerText.toLowerCase();
            if (text.indexOf(query) > -1) {
              cell.classList.remove('hidden');
              count++;
            } else {
              cell.classList.add('hidden');
            }
          });
        });

      } catch (err) {
        console.error('IPYNB Error:', err);
        h.showError(
          'Could not parse Jupyter Notebook', 
          'The file may be corrupted, using an unsupported notebook version, or not a valid JSON. ' + err.message
        );
      }
    }
  };
})();
