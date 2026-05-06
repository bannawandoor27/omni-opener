(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    var _bibtexParseUrl = 'https://cdn.jsdelivr.net/npm/bibtex-parse-js@0.0.24/bibtex-parse.min.js';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.bib',
      dropLabel: 'Drop a BibTeX (.bib) file here',
      binary: false,
      infoHtml: '<strong>Privacy:</strong> This tool parses your .bib references entirely in your browser. No data is ever sent to any server.',

      onInit: function (h) {
        if (typeof bibtexParse === 'undefined') {
          h.loadScript(_bibtexParseUrl);
        }
      },

      onFile: function _onFileFn(file, content, h) {
        h.showLoading('Parsing BibTeX entries...');

        var tryParse = function () {
          if (typeof bibtexParse === 'undefined') {
            // Script not ready yet, wait and try again
            setTimeout(function() { _onFileFn(file, content, h); }, 200);
            return;
          }

          try {
            var entries = bibtexParse.toJSON(content);
            
            if (!entries || entries.length === 0) {
              h.showError('No entries found', 'This file doesn\'t seem to contain valid BibTeX entries or is empty.');
              return;
            }

            h.setState('entries', entries);
            h.setState('query', '');
            render(file, entries, h);
          } catch (err) {
            h.showError('Could not parse BibTeX file', 'The file format might be invalid or use unsupported extensions. ' + err.message);
          }
        };

        tryParse();
      },

      onDestroy: function (h) {
        // Cleanup if necessary
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
            if (entries) {
              var filename = (h.getFile().name || 'references.bib').replace(/\.bib$/i, '') + '.json';
              h.download(filename, JSON.stringify(entries, null, 2), 'application/json');
            }
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

    function render(file, entries, h) {
      var query = h.getState().query || '';
      var filtered = entries;
      
      if (query) {
        var q = query.toLowerCase();
        filtered = entries.filter(function (e) {
          var tags = e.entryTags || {};
          var haystack = (
            (e.citationKey || '') + ' ' + 
            (e.entryType || '') + ' ' + 
            (tags.title || '') + ' ' + 
            (tags.author || '') + ' ' + 
            (tags.journal || '') + ' ' + 
            (tags.year || '')
          ).toLowerCase();
          return haystack.indexOf(q) !== -1;
        });
      }

      var html = '<div class="p-4 md:p-6 max-w-5xl mx-auto">';
      
      // U1. File info bar
      html += '<div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">' +
        '<span class="font-semibold text-surface-800 truncate max-w-[200px]" title="' + h.escape(file.name) + '">' + h.escape(file.name) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span>' + formatSize(file.size) + '</span>' +
        '<span class="text-surface-300">|</span>' +
        '<span class="text-surface-500">.bib file</span>' +
      '</div>';

      // U10. Section header with counts + Search
      html += '<div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">' +
        '<div>' +
          '<h3 class="font-bold text-xl text-surface-900">BibTeX References</h3>' +
          '<p class="text-sm text-surface-500 mt-1">' + (filtered.length === entries.length ? entries.length + ' entries total' : 'Showing ' + filtered.length + ' of ' + entries.length + ' entries') + '</p>' +
        '</div>' +
        '<div class="relative min-w-[280px]">' +
          '<input type="text" id="bib-search" value="' + h.escape(query) + '" placeholder="Search title, author, key..." ' +
          'class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all shadow-sm">' +
          '<div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">' +
            '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>' +
          '</div>' +
        '</div>' +
      '</div>';

      // U5. Empty state
      if (filtered.length === 0) {
        html += '<div class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">' +
          '<div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4 text-surface-400">' +
            '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>' +
          '</div>' +
          '<h4 class="text-lg font-semibold text-surface-800">No entries found</h4>' +
          '<p class="text-surface-500 max-w-xs mx-auto mt-2">Try adjusting your search terms or upload a different .bib file.</p>' +
        '</div>';
      } else {
        // Entries list
        html += '<div class="space-y-4">';
        
        // Truncation for performance (U7/B7)
        var limit = 200;
        var displayItems = filtered.slice(0, limit);
        
        displayItems.forEach(function (entry) {
          var tags = entry.entryTags || {};
          var title = stripBraces(tags.title || 'Untitled');
          var author = stripBraces(tags.author || 'Unknown');
          var year = tags.year || tags.date || '';
          var type = (entry.entryType || 'article').toLowerCase();
          
          // U9. Content cards
          html += '<div class="group bg-white rounded-xl border border-surface-200 p-5 hover:border-brand-400 hover:shadow-md transition-all duration-200">';
          
          html += '<div class="flex flex-wrap items-start justify-between gap-3 mb-3">';
          html += '<div class="flex-1 min-w-0">';
          html += '<h4 class="font-bold text-surface-900 leading-tight mb-1 group-hover:text-brand-600 transition-colors">' + h.escape(title) + '</h4>';
          html += '<p class="text-sm text-surface-600 font-medium">' + h.escape(author) + (year ? ' <span class="text-surface-400">(' + h.escape(year) + ')</span>' : '') + '</p>';
          html += '</div>';
          html += '<span class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-surface-100 text-surface-500 border border-surface-200">' + h.escape(type) + '</span>';
          html += '</div>';
          
          html += '<div class="text-xs font-mono text-brand-600 bg-brand-50/50 px-2 py-1 rounded inline-block mb-4 select-all">@' + h.escape(entry.citationKey) + '</div>';
          
          // Tags / Fields
          html += '<div class="flex flex-wrap gap-2">';
          var skip = ['title', 'author', 'year', 'date'];
          Object.keys(tags).forEach(function (key) {
            if (skip.indexOf(key.toLowerCase()) === -1 && tags[key]) {
              var val = stripBraces(tags[key]);
              if (val.length > 200) val = val.substring(0, 197) + '...';
              html += '<div class="flex items-center text-[11px] bg-surface-50 text-surface-600 rounded-md border border-surface-100 overflow-hidden">';
              html += '<span class="bg-surface-100 px-2 py-1 font-bold border-r border-surface-200 text-surface-500">' + h.escape(key.toUpperCase()) + '</span>';
              html += '<span class="px-2 py-1">' + h.escape(val) + '</span>';
              html += '</div>';
            }
          });
          html += '</div>';
          
          html += '</div>';
        });

        if (filtered.length > limit) {
          html += '<div class="py-8 text-center text-surface-500 text-sm border-t border-surface-100 mt-4">' +
            'Showing first ' + limit + ' of ' + filtered.length + ' entries. Use search to find specific records.' +
          '</div>';
        }
        
        html += '</div>';
      }

      html += '</div>';

      h.render(html);

      // Search event
      var searchInput = document.getElementById('bib-search');
      if (searchInput) {
        searchInput.focus();
        // Place cursor at end
        var val = searchInput.value;
        searchInput.value = '';
        searchInput.value = val;
        
        searchInput.addEventListener('input', function (e) {
          h.setState('query', e.target.value);
          render(file, entries, h);
        });
      }
    }

    function stripBraces(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/\{/g, '').replace(/\}/g, '');
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      var k = 1024;
      var sizes = ['B', 'KB', 'MB', 'GB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
  };
})();
