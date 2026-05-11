(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    const LIB_URL = 'https://cdn.jsdelivr.net/npm/bibtex-parse-js@0.0.24/bibtex-parse.min.js';
    let _entries = [];
    let _query = '';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.bib',
      dropLabel: 'Drop a BibTeX (.bib) file here',
      binary: false,
      infoHtml: '<strong>Privacy:</strong> Your BibTeX references are parsed entirely in your browser. No data is ever uploaded to any server.',

      onInit: function (h) {
        if (typeof bibtexParse === 'undefined') {
          h.loadScript(LIB_URL);
        }
      },

      onFile: function _onFileFn(file, content, h) {
        // B1. Race condition check
        if (typeof bibtexParse === 'undefined') {
          h.showLoading('Loading parser...');
          setTimeout(function() { _onFileFn(file, content, h); }, 100);
          return;
        }

        // U6. Show loading before heavy parsing
        h.showLoading('Parsing BibTeX database...');

        // Allow UI to update before blocking thread with parse
        setTimeout(function() {
          try {
            // bibtex-parse-js toJSON returns array of objects
            const entries = bibtexParse.toJSON(content);
            
            if (!entries || entries.length === 0) {
              // U5. Empty state handled in render, but if it's literally empty/invalid:
              h.showError('No entries found', 'This file doesn\'t seem to contain valid BibTeX entries or is empty. Please check the file content.');
              return;
            }

            _entries = entries;
            _query = '';
            render(file, h);
          } catch (err) {
            // U3. Friendly error messages
            h.showError('Parsing failed', 'The BibTeX file may have syntax errors or use unsupported characters. Error: ' + err.message);
          }
        }, 50);
      },

      onDestroy: function (h) {
        _entries = [];
        _query = '';
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            if (_entries.length) h.copyToClipboard(JSON.stringify(_entries, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            if (_entries.length) {
              const filename = (h.getFile().name || 'references.bib').replace(/\.bib$/i, '') + '.json';
              h.download(filename, JSON.stringify(_entries, null, 2), 'application/json');
            }
          }
        },
        {
          label: '📄 Export BibTeX',
          id: 'export-bib',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        }
      ]
    });

    function render(file, h) {
      const q = _query.trim().toLowerCase();
      const filtered = q === '' ? _entries : _entries.filter(e => {
        const tags = e.entryTags || {};
        const searchable = [
          e.citationKey,
          e.entryType,
          tags.title,
          tags.author,
          tags.journal,
          tags.booktitle,
          tags.year,
          tags.publisher
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.indexOf(q) !== -1;
      });

      let html = '<div class="p-4 md:p-6 max-w-5xl mx-auto">';

      // U1. File info bar
      html += `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${h.escape(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.bib file</span>
        </div>`;

      // Search and stats
      html += `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 class="font-semibold text-surface-800 text-lg">BibTeX Entries</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
              ${filtered.length} ${filtered.length === 1 ? 'item' : 'items'} 
              ${q ? 'matching search' : 'total'}
            </span>
          </div>
          <div class="relative min-w-[300px]">
            <input type="text" id="bib-search" value="${h.escape(_query)}" 
              placeholder="Filter by title, author, year, or key..." 
              class="w-full pl-10 pr-4 py-2 border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm">
            <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>`;

      // U5. Empty state
      if (filtered.length === 0) {
        html += `
          <div class="flex flex-col items-center justify-center py-20 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
            <p class="text-surface-500">${q ? 'No results match your search.' : 'This file contains no valid references.'}</p>
          </div>`;
      } else {
        // B7. Large file handling (truncate DOM)
        const limit = 500;
        const display = filtered.slice(0, limit);

        html += '<div class="space-y-4">';
        display.forEach(entry => {
          const tags = entry.entryTags || {};
          const title = cleanText(tags.title || 'Untitled Reference');
          const authors = cleanText(tags.author || 'No authors listed');
          const year = tags.year || tags.date || '';
          const type = entry.entryType || 'article';

          // U9. Content cards
          html += `
            <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white group">
              <div class="flex items-start justify-between gap-4 mb-2">
                <div class="flex-1">
                  <h4 class="font-bold text-surface-900 leading-snug group-hover:text-brand-600 transition-colors">${h.escape(title)}</h4>
                  <p class="text-sm text-surface-600 mt-1">${h.escape(authors)} ${year ? `<span class="text-surface-400">(${h.escape(year)})</span>` : ''}</p>
                </div>
                <span class="shrink-0 px-2 py-0.5 rounded bg-surface-100 text-[10px] font-bold text-surface-500 uppercase tracking-wider border border-surface-200">${h.escape(type)}</span>
              </div>
              
              <div class="flex items-center gap-2 mb-3">
                <span class="text-[10px] font-mono bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded border border-brand-100 select-all">@${h.escape(entry.citationKey)}</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                ${Object.entries(tags)
                  .filter(([k, v]) => !['title', 'author', 'year', 'date'].includes(k.toLowerCase()) && v)
                  .map(([k, v]) => `
                    <div class="flex text-xs">
                      <span class="w-20 shrink-0 font-medium text-surface-400 uppercase tracking-tighter">${h.escape(k)}</span>
                      <span class="text-surface-700 truncate" title="${h.escape(cleanText(v))}">${h.escape(cleanText(v))}</span>
                    </div>
                  `).join('')}
              </div>
            </div>`;
        });

        if (filtered.length > limit) {
          html += `
            <div class="p-6 text-center text-surface-500 text-sm italic">
              Showing first ${limit} of ${filtered.length} entries. Use search to find specific items.
            </div>`;
        }
        html += '</div>';
      }

      html += '</div>';
      h.render(html);

      // Re-bind events
      const searchInput = document.getElementById('bib-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          _query = e.target.value;
          render(file, h);
          // Maintain focus
          document.getElementById('bib-search').focus();
        });
        
        // Restore focus and cursor position if it was active
        if (_query) {
          searchInput.focus();
          searchInput.setSelectionRange(_query.length, _query.length);
        }
      }
    }

    function cleanText(str) {
      if (typeof str !== 'string') return '';
      // Remove BibTeX curly braces around text/formulas
      return str.replace(/\{+/g, '').replace(/\}+/g, '').trim();
    }

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
  };
})();
