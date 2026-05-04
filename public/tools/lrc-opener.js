(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentView = 'parsed';
    let lastFile = null;
    let lastContent = '';
    let searchTerm = '';

    const escapeHTML = (str) => {
      if (!str) return '';
      return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      })[m]);
    };

    const highlight = (text, term) => {
      if (!term || !text) return escapeHTML(text);
      try {
        const regex = new RegExp(`(${term.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        return parts.map(part => 
          part.toLowerCase() === term.toLowerCase() 
            ? `<mark class="bg-brand-200 text-brand-900 rounded-sm px-0.5">${escapeHTML(part)}</mark>` 
            : escapeHTML(part)
        ).join('');
      } catch (e) {
        return escapeHTML(text);
      }
    };

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function parseLRC(content) {
      const lines = content.split(/\r?\n/);
      const metadata = {};
      const lyrics = [];
      const metaRegex = /^\[([a-z]+):(.*)\]$/i;
      const timestampRegex = /\[(\d{2,}:\d{2}(?:\.\d{2,3})?)\]/g;

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        const metaMatch = trimmed.match(metaRegex);
        if (metaMatch) {
          metadata[metaMatch[1]] = metaMatch[2].trim();
          return;
        }

        let match;
        const lineTimestamps = [];
        let lastIndex = 0;
        while ((match = timestampRegex.exec(trimmed)) !== null) {
          lineTimestamps.push(match[1]);
          lastIndex = timestampRegex.lastIndex;
        }

        if (lineTimestamps.length > 0) {
          const text = trimmed.substring(lastIndex).trim();
          lineTimestamps.forEach(time => {
            lyrics.push({ time, text });
          });
        }
      });

      lyrics.sort((a, b) => {
        const timeToSec = (t) => {
          const parts = t.split(':');
          const min = parseInt(parts[0], 10) || 0;
          const sec = parseFloat(parts[1]) || 0;
          return min * 60 + sec;
        };
        return timeToSec(a.time) - timeToSec(b.time);
      });

      return { metadata, lyrics };
    }

    function renderView(helpers) {
      if (!lastFile) return;

      const { metadata, lyrics } = parseLRC(lastContent);
      const filteredLyrics = lyrics.filter(l => 
        l.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
        l.time.includes(searchTerm)
      );

      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
          <span class="font-semibold text-surface-800">${escapeHTML(lastFile.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(lastFile.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.lrc lyrics</span>
        </div>
      `;

      const metaHtml = Object.keys(metadata).length > 0 ? `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          ${Object.entries(metadata).map(([key, val]) => `
            <div class="p-3 rounded-xl border border-surface-100 bg-white shadow-sm transition-all hover:border-brand-200">
              <div class="text-[10px] uppercase tracking-wider font-bold text-surface-400 mb-1">${escapeHTML(key)}</div>
              <div class="text-sm text-surface-800 font-medium truncate" title="${escapeHTML(val)}">${escapeHTML(val)}</div>
            </div>
          `).join('')}
        </div>
      ` : '';

      const searchHtml = lyrics.length > 0 ? `
        <div class="relative mb-4 group">
          <input type="text" id="lrc-search-input" placeholder="Search lyrics or timestamps..." value="${escapeHTML(searchTerm)}"
            class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all text-sm bg-white shadow-sm">
          <div class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-brand-500 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        </div>
      ` : '';

      let mainContent = '';
      if (currentView === 'raw') {
        mainContent = `
          <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[600px]"><code>${escapeHTML(lastContent)}</code></pre>
          </div>
        `;
      } else {
        if (lyrics.length === 0) {
          mainContent = `
            <div class="text-center py-16 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <div class="text-4xl mb-2">🎵</div>
              <p class="text-surface-600 font-semibold text-lg">No Timed Lyrics</p>
              <p class="text-sm text-surface-500 mt-1">This file doesn't contain standard [mm:ss.xx] timestamps.</p>
            </div>
          `;
        } else {
          mainContent = `
            <div class="flex items-center justify-between mb-3 px-1">
              <h3 class="font-bold text-surface-800 flex items-center gap-2">
                <span>Lyrics</span>
                <span class="text-xs font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${lyrics.length} lines</span>
              </h3>
              ${searchTerm ? `<span class="text-xs text-surface-500 font-medium">${filteredLyrics.length} found</span>` : ''}
            </div>
            <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
              <div class="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table class="min-w-full text-sm border-separate border-spacing-0">
                  <thead class="bg-surface-50">
                    <tr>
                      <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10">Time</th>
                      <th class="sticky top-0 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10">Text</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-100">
                    ${filteredLyrics.map(line => `
                      <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                        <td class="px-4 py-3 font-mono text-xs text-brand-600 whitespace-nowrap align-top">${highlight(line.time, searchTerm)}</td>
                        <td class="px-4 py-3 text-surface-700 leading-relaxed">${highlight(line.text, searchTerm) || '<span class="text-surface-300 italic">music</span>'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }
      }

      helpers.render(`
        <div class="omni-lrc-wrapper max-w-5xl mx-auto p-1 animate-in fade-in duration-300">
          ${infoBar}
          ${currentView === 'parsed' ? metaHtml + searchHtml : ''}
          ${mainContent}
        </div>
      `);

      const input = document.getElementById('lrc-search-input');
      if (input) {
        input.addEventListener('input', (e) => {
          searchTerm = e.target.value;
          renderView(helpers);
          const ni = document.getElementById('lrc-search-input');
          if (ni) {
            ni.focus();
            ni.setSelectionRange(searchTerm.length, searchTerm.length);
          }
        });
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.lrc',
      dropLabel: 'Drop an LRC lyrics file',
      binary: false,
      
      onInit: function (helpers) {
        // Ready to handle LRC files
      },

      onDestroy: function() {
        lastFile = null;
        lastContent = '';
      },

      actions: [
        {
          label: 'View Raw',
          id: 'toggle',
          onClick: function(helpers, btn) {
            currentView = currentView === 'parsed' ? 'raw' : 'parsed';
            btn.innerHTML = currentView === 'parsed' ? 'View Raw' : 'View Parsed';
            renderView(helpers);
          }
        },
        {
          label: '📋 Copy',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(lastContent, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            helpers.download(lastFile ? lastFile.name : 'lyrics.lrc', lastContent);
          }
        }
      ],

      onFile: function _onFileFn(file, content, helpers) {
        helpers.showLoading('Parsing lyrics file...');
        
        setTimeout(() => {
          try {
            lastFile = file;
            lastContent = content;
            searchTerm = '';
            
            if (!content || !content.trim()) {
              helpers.showError('Empty File', 'The uploaded file appears to be empty.');
              return;
            }

            renderView(helpers);
          } catch (err) {
            console.error('[LRC Parser Error]', err);
            helpers.showError('Parsing Error', 'An unexpected error occurred while parsing the lyrics. The file format may be invalid.');
          }
        }, 50);
      }
    });
  };
})();