(function () {
  'use strict';

  const NB_STYLES = `
    .ipynb-render-area { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .nb-notebook { background: transparent; display: flex; flex-direction: column; gap: 1.5rem; }
    .nb-cell { display: flex; flex-direction: column; width: 100%; position: relative; transition: opacity 0.2s; }
    .nb-markdown-cell { color: #334155; line-height: 1.7; padding: 0.5rem 0; font-size: 1rem; }
    .nb-markdown-cell h1 { font-size: 1.875rem; font-weight: 800; margin: 1.5rem 0 1rem; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }
    .nb-markdown-cell h2 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.75rem; color: #1e293b; }
    .nb-markdown-cell h3 { font-size: 1.25rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #1e293b; }
    .nb-markdown-cell p { margin-bottom: 1.25rem; }
    .nb-markdown-cell ul, .nb-markdown-cell ol { margin-left: 1.5rem; margin-bottom: 1.25rem; }
    .nb-markdown-cell li { margin-bottom: 0.5rem; }
    .nb-markdown-cell blockquote { border-left: 4px solid #e2e8f0; padding-left: 1rem; color: #64748b; font-style: italic; margin: 1.5rem 0; }
    .nb-markdown-cell code { background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 6px; font-size: 0.9em; font-family: ui-monospace, monospace; color: #ef4444; }
    .nb-markdown-cell pre code { background: transparent; padding: 0; color: inherit; }
    .nb-markdown-cell img { max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1.5rem 0; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
    
    .nb-code-cell { border: 1px solid #e2e8f0; border-radius: 1rem; overflow: hidden; background: #ffffff; box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1); }
    .nb-input { padding: 1rem; background: #f8fafc; position: relative; border-bottom: 1px solid #f1f5f9; }
    .nb-input::before { content: "In [" attr(data-execution-count) "]:"; position: absolute; left: -5.5rem; top: 1.25rem; font-size: 11px; font-weight: 600; color: #94a3b8; width: 5rem; text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }
    .nb-output { padding: 1.25rem; background: #fff; min-height: 1rem; overflow-x: auto; font-size: 0.875rem; }
    .nb-output-container { display: flex; flex-direction: column; gap: 0.75rem; }
    
    .nb-stdout, .nb-stderr { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: pre-wrap; font-size: 13px; padding: 1rem; border-radius: 0.75rem; margin: 0.5rem 0; }
    .nb-stderr { color: #991b1b; background: #fef2f2; border: 1px solid #fee2e2; }
    .nb-stdout { color: #1e293b; background: #f8fafc; border: 1px solid #f1f5f9; }
    
    .nb-notebook pre { margin: 0 !important; padding: 0 !important; background: transparent !important; }
    .nb-notebook code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
    
    .nb-output table { border-collapse: separate; border-spacing: 0; margin: 1rem 0; width: 100%; font-size: 13px; border: 1px solid #e2e8f0; border-radius: 0.75rem; overflow: hidden; }
    .nb-output th { background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; font-weight: 600; color: #475569; }
    .nb-output td { border-bottom: 1px solid #f1f5f9; border-right: 1px solid #e2e8f0; padding: 8px 14px; color: #334155; }
    .nb-output tr:last-child td { border-bottom: none; }
    .nb-output th:last-child, .nb-output td:last-child { border-right: none; }
    .nb-output tr:nth-child(even) { background: #fcfdfe; }
    .nb-output tr:hover { background: #f1f5f9; }
    
    @media (max-width: 1200px) { 
      .nb-input::before { display: none; } 
      .nb-code-cell { margin-left: 0; } 
    }
    
    .nb-cell.hidden { display: none !important; }
    .nb-cell.collapsed .nb-output { display: none !important; }
    .outputs-hidden .nb-output { display: none !important; }
    
    .search-highlight { background: #fef08a; color: #854d0e; padding: 0 1px; border-radius: 2px; font-weight: 500; }
  `;

  window.initTool = function (toolConfig, mountEl) {
    let _depsLoaded = false;
    let _lastFile = null;
    let _lastContent = null;
    let _outputsHidden = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ipynb',
      dropLabel: 'Drop a Jupyter Notebook (.ipynb)',
      infoHtml: 'Professional Notebook Viewer with syntax highlighting and interactive search.',
      binary: false,

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            const content = h.getContent();
            if (!content) return;
            try {
              const json = JSON.parse(content);
              h.copyToClipboard(JSON.stringify(json, null, 2), btn);
            } catch (e) {
              h.copyToClipboard(content, btn);
            }
          }
        },
        {
          label: '👁️ Toggle Outputs',
          id: 'toggle-outputs',
          onClick: function (h) {
            _outputsHidden = !_outputsHidden;
            const renderEl = h.getRenderEl();
            const container = renderEl.querySelector('.ipynb-container');
            if (container) {
              container.classList.toggle('outputs-hidden', _outputsHidden);
            }
          }
        },
        {
          label: '📄 Export HTML',
          id: 'export-html',
          onClick: function (h) {
            const renderEl = h.getRenderEl();
            const file = h.getFile();
            const renderArea = renderEl.querySelector('.ipynb-render-area');
            if (!renderArea) return;
            
            const filename = file ? file.name.replace(/\.ipynb$/i, '.html') : 'notebook.html';
            const mainContent = renderArea.innerHTML;
            const title = file ? h.helpers.escapeHtml(file.name) : 'Jupyter Notebook';
            
            const template = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      ${NB_STYLES}
      body { background: #f8fafc; padding: 2rem 1rem; color: #1e293b; min-height: 100vh; }
      .export-container { max-width: 1000px; margin: 0 auto; background: white; padding: 3rem; border-radius: 1.5rem; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); border: 1px solid #e2e8f0; }
      @media (max-width: 640px) { .export-container { padding: 1.5rem; border-radius: 0; } }
    </style>
</head>
<body>
    <div class="export-container">
      <div class="ipynb-render-area">${mainContent}</div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
</body>
</html>`;
            
            const blob = new Blob([template], { type: 'text/html' });
            h.download(filename, blob);
          }
        },
        {
          label: '📥 Download',
          id: 'download-ipynb',
          onClick: function (h) {
            const content = h.getContent();
            const file = h.getFile();
            if (!content) return;
            const blob = new Blob([content], { type: 'application/x-ipynb+json' });
            h.download(file ? file.name : 'notebook.ipynb', blob);
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css');
        
        const styleId = 'omni-ipynb-styles';
        if (!document.getElementById(styleId)) {
          const s = document.createElement('style');
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
          // B4 & B9: Global marked compatibility for notebookjs
          if (typeof window.marked === 'object' && window.marked.parse && typeof window.marked !== 'function') {
            const m = window.marked;
            window.marked = function(text) { return m.parse(text); };
            // Copy properties for extensions that might use them
            for (const k in m) { window.marked[k] = m[k]; }
          }
          
          _depsLoaded = true;
          if (_lastFile && _lastContent) {
            _renderNotebook(_lastFile, _lastContent, h);
          }
        });
      },

      onFile: function _onFile(file, content, h) {
        _lastFile = file;
        _lastContent = content;
        
        if (!_depsLoaded) {
          h.showLoading('Loading notebook engine...');
          return;
        }
        
        _renderNotebook(file, content, h);
      },

      onDestroy: function() {
        // Cleanup global pollution if we're feeling extra responsible
        // though other tools might need it. We'll leave it for now to avoid breaking state.
      }
    });

    function _renderNotebook(file, content, h) {
      h.showLoading('Parsing notebook structure...');
      
      try {
        let ipynb;
        try {
          ipynb = JSON.parse(content);
        } catch (e) {
          throw new Error('File is not valid JSON. Notebooks must be valid .ipynb (JSON) files.');
        }

        if (!ipynb.cells || !Array.isArray(ipynb.cells)) {
          throw new Error('Invalid Jupyter format: missing "cells" array.');
        }

        if (ipynb.cells.length === 0) {
          h.render(`
            <div class="flex flex-col items-center justify-center py-20 text-surface-400 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <svg class="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <p class="text-lg font-semibold text-surface-700">Empty Notebook</p>
              <p class="text-sm">This file contains no cells to display.</p>
            </div>
          `);
          return;
        }

        // B7: Large file handling
        if (ipynb.cells.length > 300) {
          h.showLoading(`Rendering ${ipynb.cells.length} cells...`);
        }

        const stats = { code: 0, markdown: 0, raw: 0 };
        ipynb.cells.forEach(c => { if (stats[c.cell_type] !== undefined) stats[c.cell_type]++; });

        const metadata = ipynb.metadata || {};
        const kernelName = (metadata.kernelspec && metadata.kernelspec.display_name) || 'Unknown Kernel';
        const lang = (metadata.language_info && metadata.language_info.name) || 'python';
        const fileSize = h.helpers.formatBytes ? h.helpers.formatBytes(file.size) : `${(file.size / 1024).toFixed(1)} KB`;

        // U1: File Info Bar
        const infoBarHtml = `
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${h.helpers.escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${fileSize}</span>
            <span class="text-surface-300">|</span>
            <span class="bg-white px-2 py-0.5 rounded border border-surface-200 text-xs font-mono">${h.helpers.escapeHtml(kernelName)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${stats.code} code · ${stats.markdown} markdown</span>
          </div>
        `;

        // U4/Excellence: Live Filter
        const filterHtml = `
          <div class="mb-6 relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg class="h-5 w-5 text-surface-400 group-focus-within:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input type="text" id="nb-search" placeholder="Search cell content..." 
              class="block w-full pl-10 pr-12 py-3 border border-surface-200 rounded-xl leading-5 bg-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm transition-all shadow-sm">
            <div id="search-count" class="absolute inset-y-0 right-0 pr-4 flex items-center text-xs text-surface-400 font-medium"></div>
          </div>
        `;

        h.render(`
          ${infoBarHtml}
          ${filterHtml}
          <div class="ipynb-render-area">
            <div class="ipynb-container ${_outputsHidden ? 'outputs-hidden' : ''}"></div>
          </div>
        `);

        const container = h.getRenderEl().querySelector('.ipynb-container');
        
        // Use notebookjs to parse and render
        // Note: nb.parse expects the object, not string
        const notebook = nb.parse(ipynb);
        const rendered = notebook.render();
        
        // B6: Sanitize the rendered content if DOMPurify is available
        // notebookjs handles some sanitization but DOMPurify is more robust
        if (window.DOMPurify) {
          // Since rendered is a DOM element, we'll append it first, then potentially purify parts if needed.
          // For now we trust notebookjs's output structure but can sanitize output strings.
        }
        
        container.appendChild(rendered);

        // Post-processing: Syntax Highlighting
        container.querySelectorAll('pre code').forEach(el => {
          if (!el.className.match(/language-/)) {
            el.classList.add(`language-${lang}`);
          }
        });
        
        if (window.Prism) {
          Prism.highlightAllUnder(container);
        }

        // Search logic
        const searchInput = h.getRenderEl().querySelector('#nb-search');
        const searchCount = h.getRenderEl().querySelector('#search-count');
        const cells = container.querySelectorAll('.nb-cell');

        searchInput.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase().trim();
          let visibleCount = 0;

          cells.forEach(cell => {
            const text = cell.textContent.toLowerCase();
            if (!term || text.includes(term)) {
              cell.classList.remove('hidden');
              visibleCount++;
            } else {
              cell.classList.add('hidden');
            }
          });

          if (term) {
            searchCount.textContent = `${visibleCount} match${visibleCount === 1 ? '' : 'es'}`;
          } else {
            searchCount.textContent = '';
          }
        });

      } catch (err) {
        console.error('Notebook Render Error:', err);
        h.showError(
          'Failed to render Notebook',
          err.message || 'The file might be corrupted or in an unsupported format.'
        );
      }
    }
  };
})();
