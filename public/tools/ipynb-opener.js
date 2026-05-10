(function () {
  'use strict';

  const NB_STYLES = `
    .ipynb-root { --nb-bg: #fff; --nb-border: #e2e8f0; --nb-text: #1e293b; --nb-muted: #64748b; }
    .nb-notebook { display: flex; flex-direction: column; gap: 2rem; }
    .nb-cell { display: flex; flex-direction: column; width: 100%; position: relative; }
    
    .nb-markdown-cell { color: var(--nb-text); line-height: 1.7; font-size: 1rem; }
    .nb-markdown-cell h1 { font-size: 1.875rem; font-weight: 800; margin: 2rem 0 1rem; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; }
    .nb-markdown-cell h2 { font-size: 1.5rem; font-weight: 700; margin: 1.75rem 0 0.75rem; color: #1e293b; }
    .nb-markdown-cell h3 { font-size: 1.25rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #1e293b; }
    .nb-markdown-cell p { margin-bottom: 1.25rem; }
    .nb-markdown-cell ul, .nb-markdown-cell ol { margin-left: 1.5rem; margin-bottom: 1.25rem; list-style-position: outside; }
    .nb-markdown-cell li { margin-bottom: 0.5rem; }
    .nb-markdown-cell blockquote { border-left: 4px solid #e2e8f0; padding-left: 1rem; color: #64748b; font-style: italic; margin: 1.5rem 0; }
    .nb-markdown-cell code { background: #f1f5f9; padding: 0.2rem 0.4rem; border-radius: 6px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #e11d48; }
    .nb-markdown-cell pre { background: #1e293b !important; padding: 1.25rem !important; border-radius: 0.75rem !important; margin: 1.5rem 0 !important; overflow-x: auto; }
    .nb-markdown-cell pre code { background: transparent !important; padding: 0 !important; color: #f8fafc !important; border-radius: 0 !important; }
    .nb-markdown-cell img { max-width: 100%; height: auto; border-radius: 0.75rem; margin: 1.5rem 0; border: 1px solid #e2e8f0; }
    
    .nb-code-cell { border: 1px solid var(--nb-border); border-radius: 1rem; overflow: hidden; background: var(--nb-bg); box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); }
    .nb-input { padding: 1.25rem; background: #f8fafc; position: relative; border-bottom: 1px solid #f1f5f9; }
    .nb-input::before { content: "In [" attr(data-execution-count) "]:"; position: absolute; left: -6rem; top: 1.5rem; font-size: 11px; font-weight: 600; color: #94a3b8; width: 5.5rem; text-align: right; font-family: ui-monospace, monospace; }
    .nb-output { padding: 1.25rem; background: #fff; min-height: 0.5rem; overflow-x: auto; font-size: 0.875rem; }
    .nb-output-container { display: flex; flex-direction: column; gap: 1rem; }
    
    .nb-stdout, .nb-stderr { font-family: ui-monospace, SFMono-Regular, monospace; white-space: pre-wrap; font-size: 13px; padding: 1rem; border-radius: 0.75rem; margin: 0.5rem 0; line-height: 1.6; }
    .nb-stderr { color: #991b1b; background: #fef2f2; border: 1px solid #fee2e2; }
    .nb-stdout { color: #1e293b; background: #f8fafc; border: 1px solid #f1f5f9; }
    
    .nb-cell pre { margin: 0 !important; padding: 0 !important; background: transparent !important; }
    .nb-cell code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
    
    .nb-output table { border-collapse: separate; border-spacing: 0; margin: 1rem 0; width: 100%; font-size: 13px; border: 1px solid #e2e8f0; border-radius: 0.75rem; overflow: hidden; }
    .nb-output th { background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; font-weight: 600; color: #475569; }
    .nb-output td { border-bottom: 1px solid #f1f5f9; border-right: 1px solid #e2e8f0; padding: 8px 14px; color: #334155; }
    .nb-output tr:last-child td { border-bottom: none; }
    .nb-output th:last-child, .nb-output td:last-child { border-right: none; }
    .nb-output tr:nth-child(even) { background: #fcfdfe; }
    .nb-output tr:hover { background: #f1f5f9; }
    
    .nb-cell.hidden { display: none !important; }
    .outputs-hidden .nb-output { display: none !important; }
    
    .toc-item { cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 0.375rem; transition: all 0.2s; }
    .toc-item:hover { background: #f1f5f9; color: #2563eb; }
    .toc-h1 { font-weight: 600; margin-top: 0.5rem; }
    .toc-h2 { padding-left: 1.25rem; font-size: 0.875em; opacity: 0.8; }
    .toc-h3 { padding-left: 2rem; font-size: 0.8em; opacity: 0.6; }

    @media (max-width: 1024px) { 
      .nb-input::before { display: none; }
      .nb-notebook { gap: 1rem; }
    }
  `;

  window.initTool = function (toolConfig, mountEl) {
    let _depsPromise = null;
    let _lastFile = null;
    let _lastContent = null;
    let _outputsHidden = false;

    const h = OmniTool.create(mountEl, toolConfig, {
      accept: '.ipynb',
      dropLabel: 'Drop a Jupyter Notebook (.ipynb)',
      infoHtml: 'Professional notebook viewer with syntax highlighting, search, and table of contents.',
      binary: false,

      actions: [
        {
          label: '👁️ Toggle Outputs',
          id: 'toggle-outputs',
          onClick: function (h) {
            _outputsHidden = !_outputsHidden;
            const container = h.getRenderEl().querySelector('.nb-notebook');
            if (container) container.classList.toggle('outputs-hidden', _outputsHidden);
          }
        },
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
          label: '📄 Export HTML',
          id: 'export-html',
          onClick: function (h) {
            const file = h.getFile();
            const renderArea = h.getRenderEl().querySelector('.ipynb-render-area');
            if (!renderArea) return;
            
            const filename = (file ? file.name : 'notebook').replace(/\.ipynb$/i, '') + '.html';
            const title = file ? h.helpers.escapeHtml(file.name) : 'Jupyter Notebook';
            
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>${NB_STYLES} body { background: #f8fafc; padding: 2rem 1rem; } .export-wrap { max-width: 1000px; margin: 0 auto; background: white; padding: 3rem; border-radius: 1.5rem; border: 1px solid #e2e8f0; }</style>
            </head><body><div class="export-wrap">${renderArea.innerHTML}</div></body></html>`;
            
            h.download(filename, new Blob([html], { type: 'text/html' }));
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css');
        const styleId = 'omni-ipynb-styles';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = NB_STYLES;
          document.head.appendChild(style);
        }

        _depsPromise = new Promise((resolve) => {
          h.loadScripts([
            'https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js',
            'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
            'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js',
            'https://cdn.jsdelivr.net/npm/ansi_up@5.2.1/ansi_up.min.js',
            'https://cdn.jsdelivr.net/npm/dompurify@3.0.3/dist/purify.min.js',
            'https://cdn.jsdelivr.net/npm/notebookjs@0.6.7/notebook.min.js'
          ], function() {
            // Fix notebookjs compatibility with marked v4+
            if (window.marked && typeof window.marked === 'object' && window.marked.parse) {
              const originalMarked = window.marked;
              window.marked = (text) => originalMarked.parse(text);
              Object.assign(window.marked, originalMarked);
            }
            resolve();
          });
        });
      },

      onFile: function _onFile(file, content, h) {
        _lastFile = file;
        _lastContent = content;
        
        if (!_depsPromise) return;
        
        h.showLoading('Preparing notebook...');
        _depsPromise.then(() => {
          _render(file, content, h);
        });
      },

      onDestroy: function() {
        _lastFile = null;
        _lastContent = null;
      }
    });

    async function _render(file, content, h) {
      try {
        const data = JSON.parse(content);
        if (!data.cells || !Array.isArray(data.cells)) throw new Error('Invalid Notebook format');

        if (data.cells.length === 0) {
          h.render('<div class="p-12 text-center text-surface-400 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">Empty Notebook</div>');
          return;
        }

        const stats = { code: 0, markdown: 0 };
        data.cells.forEach(c => { if (stats[c.cell_type] !== undefined) stats[c.cell_type]++; });
        
        const metadata = data.metadata || {};
        const kernel = (metadata.kernelspec && metadata.kernelspec.display_name) || 'Unknown Kernel';
        const lang = (metadata.language_info && metadata.language_info.name) || 'python';

        h.render(`
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
            <span class="font-semibold text-surface-800">${h.helpers.escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${h.helpers.formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-white border border-surface-200 rounded text-xs font-mono">${h.helpers.escapeHtml(kernel)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${stats.code} cells · ${stats.markdown} md</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div class="lg:col-span-1 space-y-6">
              <div class="sticky top-6">
                <div class="mb-4 relative">
                  <input type="text" id="nb-search" placeholder="Search notebook..." 
                    class="w-full pl-9 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                  <svg class="absolute left-3 top-2.5 h-4 w-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider mb-3">Contents</h3>
                  <div id="nb-toc" class="space-y-1 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar text-sm text-surface-600"></div>
                </div>
              </div>
            </div>
            <div class="lg:col-span-3 ipynb-render-area">
              <div class="nb-notebook ${_outputsHidden ? 'outputs-hidden' : ''}"></div>
            </div>
          </div>
        `);

        const root = h.getRenderEl();
        const container = root.querySelector('.nb-notebook');
        const toc = root.querySelector('#nb-toc');
        const search = root.querySelector('#nb-search');

        h.showLoading(`Rendering ${data.cells.length} cells...`);
        
        // Use notebookjs to render
        const notebook = nb.parse(data);
        const rendered = notebook.render();
        
        // B6: Sanitize HTML if DOMPurify is available
        if (window.DOMPurify) {
          const rawHtml = rendered.innerHTML;
          const cleanHtml = DOMPurify.sanitize(rawHtml, {
            ADD_TAGS: ['iframe', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
            ADD_ATTR: ['target', 'data-execution-count']
          });
          container.innerHTML = cleanHtml;
        } else {
          container.appendChild(rendered);
        }

        // Post-process cells
        const cells = container.querySelectorAll('.nb-cell');
        let tocHtml = '';
        
        cells.forEach((cell, idx) => {
          cell.id = `cell-${idx}`;
          
          // Generate TOC from markdown headers
          if (cell.classList.contains('nb-markdown-cell')) {
            const headers = cell.querySelectorAll('h1, h2, h3');
            headers.forEach(headerEl => {
              const level = headerEl.tagName.toLowerCase();
              const text = headerEl.textContent.trim();
              tocHtml += `<div class="toc-item toc-${level}" data-target="cell-${idx}">${h.helpers.escapeHtml(text)}</div>`;
            });
          }
          
          // Highlight code
          cell.querySelectorAll('pre code').forEach(code => {
            if (!code.className.includes('language-')) {
              code.classList.add(`language-${lang}`);
            }
          });
        });

        if (window.Prism) Prism.highlightAllUnder(container);
        
        toc.innerHTML = tocHtml || '<div class="text-xs text-surface-400 italic">No headers found</div>';

        // Events
        toc.addEventListener('click', (e) => {
          const item = e.target.closest('.toc-item');
          if (item) {
            const target = container.querySelector(`#${item.dataset.target}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });

        search.addEventListener('input', (e) => {
          const term = e.target.value.toLowerCase().trim();
          cells.forEach(cell => {
            const matches = !term || cell.textContent.toLowerCase().includes(term);
            cell.classList.toggle('hidden', !matches);
          });
        });

      } catch (err) {
        console.error(err);
        h.showError('Could not parse Notebook', err.message);
      }
    }
  };
})();
