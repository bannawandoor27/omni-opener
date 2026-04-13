(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.bib',
      dropLabel: 'Drop a BibTeX (.bib) file here',
      binary: false,
      infoHtml: '<strong>Privacy:</strong> This tool parses your .bib references entirely in your browser. No data is ever sent to any server.',

      onInit: function (h) {
        if (typeof bibtexParse === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/bibtex-parse-js@0.0.24/bibtex-parse.min.js');
        }
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing BibTeX entries...');
        
        // Small delay to ensure script is ready if it was just loaded
        setTimeout(function() {
          try {
            if (typeof bibtexParse === 'undefined') {
              // Try loading again if it missed it
              h.loadScript('https://cdn.jsdelivr.net/npm/bibtex-parse-js@0.0.24/bibtex-parse.min.js', function() {
                try {
                  parseAndRender(file, content, h);
                } catch (e) {
                  h.showError('Could not parse BibTeX', e.message);
                }
              });
              return;
            }
            parseAndRender(file, content, h);
          } catch (err) {
            h.showError('Could not parse BibTeX file', err.message);
          }
        }, 100);
      },

      actions: [
        {
          label: '📋 Copy JSON',
          id: 'copy-json',
          onClick: function (h, btn) {
            var entries = h.getState().entries;
            if (entries) h.copyToClipboard(JSON.stringify(entries, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            var entries = h.getState().entries;
            if (entries) h.download(h.getFile().name.replace('.bib', '.json'), JSON.stringify(entries, null, 2), 'application/json');
          }
        },
        {
          label: '📋 Copy BibTeX',
          id: 'copy-bib',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        }
      ]
    });
  };

  function parseAndRender(file, content, h) {
    var entries = bibtexParse.toJSON(content);
    if (!entries || entries.length === 0) {
      h.showError('No entries found', 'This file doesn\'t seem to contain valid BibTeX entries.');
      return;
    }
    renderBib(file, entries, h);
  }

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function renderBib(file, entries, h) {
    h.setState('entries', entries);
    
    var html = '<div class="p-6">';
    
    // U1. File info bar
    html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
      '<span class="font-semibold text-surface-800 truncate max-w-xs">' + file.name + '</span>' +
      '<span class="text-surface-300">|</span>' +
      '<span>' + formatSize(file.size) + '</span>' +
      '<span class="text-surface-300">|</span>' +
      '<span class="text-surface-500">.bib BibTeX references</span>' +
    '</div>';

    // U10. Section header with count + Search
    html += '<div class="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">' +
      '<div class="flex items-center gap-2">' +
        '<h3 class="text-lg font-bold text-surface-800">References</h3>' +
        '<span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">' + entries.length + ' entries</span>' +
      '</div>' +
      '<div class="relative w-full sm:w-64">' +
        '<input type="text" id="bib-search" placeholder="Filter entries..." class="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all">' +
        '<svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>' +
      '</div>' +
    '</div>';

    // Entries container
    html += '<div id="bib-entries" class="grid grid-cols-1 gap-4">';
    html += renderEntriesList(entries);
    html += '</div>';

    html += '</div>';

    h.render(html);

    // Live search
    var searchInp = document.getElementById('bib-search');
    if (searchInp) {
      searchInp.addEventListener('input', function (e) {
        var q = e.target.value.toLowerCase().trim();
        var filtered = entries.filter(function (entry) {
          var txt = (entry.citationKey + ' ' + entry.entryType + ' ' + JSON.stringify(entry.entryTags)).toLowerCase();
          return txt.indexOf(q) !== -1;
        });
        var listEl = document.getElementById('bib-entries');
        if (listEl) listEl.innerHTML = renderEntriesList(filtered);
      });
    }
  }

  function renderEntriesList(entries) {
    if (entries.length === 0) {
      return '<div class="text-center py-12 text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">No matching entries found.</div>';
    }

    // Limit display for performance
    var max = 500;
    var displayed = entries.slice(0, max);
    var notice = entries.length > max ? '<p class="text-xs text-center text-surface-400 py-4 italic">Showing first ' + max + ' of ' + entries.length + ' entries...</p>' : '';

    return displayed.map(function (entry) {
      var tags = entry.entryTags || {};
      var title = (tags.title || 'Untitled').replace(/{/g, '').replace(/}/g, '');
      var author = (tags.author || 'Unknown Author').replace(/{/g, '').replace(/}/g, '');
      var year = tags.year || tags.date || '';
      var type = entry.entryType || 'article';

      // U9. Content cards
      return '<div class="rounded-xl border border-surface-200 p-5 hover:border-brand-300 hover:shadow-sm transition-all bg-white shadow-sm">' +
        '<div class="flex items-start justify-between gap-4 mb-2">' +
          '<div class="min-w-0"><h4 class="font-bold text-surface-900 leading-snug">' + esc(title) + '</h4>' +
          '<p class="text-sm text-surface-600 mt-1">' + esc(author) + (year ? ' (' + esc(year) + ')' : '') + '</p></div>' +
          '<span class="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md bg-surface-100 text-surface-500 border border-surface-200">' + esc(type) + '</span>' +
        '</div>' +
        '<div class="text-xs font-mono text-surface-400 mb-3 truncate select-all">@' + esc(entry.citationKey) + '</div>' +
        '<div class="flex flex-wrap gap-2">' +
          Object.keys(tags).filter(function(k) { return k !== 'title' && k !== 'author' && k !== 'year' && k !== 'date' && typeof tags[k] === 'string'; }).map(function(k) {
            var val = tags[k].replace(/{/g, '').replace(/}/g, '');
            if (val.length > 150) val = val.substring(0, 147) + '...';
            return '<span class="text-[11px] px-2 py-0.5 rounded bg-surface-50 text-surface-500 border border-surface-100"><strong class="text-surface-600 uppercase font-semibold">' + esc(k) + ':</strong> ' + esc(val) + '</span>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('') + notice;
  }

  function esc(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

})();
