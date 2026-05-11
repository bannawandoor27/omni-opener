(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentFile = null;
    let currentContent = '';
    let parsedCues = [];
    let lastSearch = '';
    let lastView = 'cues'; // 'cues' or 'raw'
    let hljsLoaded = false;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.vtt',
      dropLabel: 'Drop WebVTT Subtitles',
      binary: false,
      infoHtml: '<strong>VTT Viewer:</strong> Professional WebVTT subtitle viewer and converter. View, search, and convert to SRT format instantly.',

      onInit: function (h) {
        h.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js', function() {
          hljsLoaded = true;
        });
      },

      actions: [
        {
          label: '📋 Copy as SRT',
          id: 'copy-srt',
          onClick: function (h, btn) {
            try {
              if (!parsedCues || parsedCues.length === 0) {
                h.showError('No content', 'There are no subtitle cues to convert.');
                return;
              }
              const srt = convertToSrt(parsedCues);
              h.copyToClipboard(srt, btn);
            } catch (e) {
              h.showError('Copy failed', 'Could not convert to SRT: ' + e.message);
            }
          }
        },
        {
          label: '📥 Download SRT',
          id: 'download-srt',
          onClick: function (h) {
            try {
              if (!parsedCues || parsedCues.length === 0) {
                h.showError('No content', 'There are no subtitle cues to download.');
                return;
              }
              const srt = convertToSrt(parsedCues);
              const name = (currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : 'subtitles') + ".srt";
              const blob = new Blob([srt], { type: 'text/plain' });
              h.download(name, blob);
            } catch (e) {
              h.showError('Download failed', 'Could not generate SRT file.');
            }
          }
        }
      ],

      onFile: function _onFileFn(file, content, h) {
        currentFile = file;
        currentContent = content;
        lastSearch = '';

        h.showLoading('Parsing WebVTT Subtitles...');

        // Short timeout to allow loader to show and prevent UI freeze
        setTimeout(function () {
          try {
            if (!content || typeof content !== 'string') {
              throw new Error('File content is empty or invalid.');
            }

            const trimmed = content.trim();
            if (!trimmed.startsWith('WEBVTT') && !content.includes('-->')) {
              throw new Error('Not a valid WebVTT file (missing WEBVTT header or cues).');
            }

            parsedCues = parseVTT(content);

            if (parsedCues.length === 0) {
              _renderEmpty(_onFileFn, file, content, h);
            } else {
              _render(_onFileFn, file, content, h);
            }
          } catch (err) {
            h.showError('Could not open VTT file', err.message || 'The file format may be invalid.');
          }
        }, 50);
      },

      onDestroy: function() {
        currentFile = null;
        currentContent = '';
        parsedCues = [];
      }
    });

    function _render(onFileFn, file, content, h) {
      const filteredCues = lastSearch.trim() === ''
        ? parsedCues
        : parsedCues.filter(c => {
            const searchLower = lastSearch.toLowerCase();
            return c.text.some(line => line.toLowerCase().includes(searchLower)) ||
                   c.start.includes(lastSearch) ||
                   c.end.includes(lastSearch) ||
                   (c.identifier && c.identifier.toLowerCase().includes(searchLower));
          });

      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(currentFile.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(currentFile.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">WebVTT Subtitles</span>
        </div>
      `;

      const controls = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div class="flex bg-surface-100 p-1 rounded-xl w-fit">
            <button id="view-cues" class="px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${lastView === 'cues' ? 'bg-white shadow-sm text-brand-700' : 'text-surface-600 hover:text-surface-900'}">Subtitle Cues</button>
            <button id="view-raw" class="px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${lastView === 'raw' ? 'bg-white shadow-sm text-brand-700' : 'text-surface-600 hover:text-surface-900'}">Source View</button>
          </div>

          <div class="relative flex-1 max-w-sm">
            <input id="vtt-search" type="text" placeholder="Search text or timestamps..." value="${esc(lastSearch)}"
              class="w-full pl-10 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
            <div class="absolute left-3.5 top-2.5 text-surface-400">
              <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>
      `;

      let contentHtml = '';

      if (lastView === 'cues') {
        if (filteredCues.length === 0) {
          contentHtml = `
            <div class="p-12 text-center text-surface-500 bg-surface-50 rounded-2xl border border-surface-200">
              No cues matching "<span class="font-medium text-surface-800">${esc(lastSearch)}</span>"
            </div>`;
        } else {
          const limit = 1000;
          const visibleCues = filteredCues.slice(0, limit);
          
          contentHtml = `
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Cues</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                ${filteredCues.length} ${filteredCues.length === parsedCues.length ? 'items' : 'matches'}
              </span>
            </div>
            <div class="space-y-3">
              ${visibleCues.map((cue, i) => `
                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white text-left">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      ${cue.identifier ? `<span class="text-[10px] font-bold uppercase tracking-widest text-surface-400 mr-1">${esc(cue.identifier)}</span>` : ''}
                      <div class="flex items-center gap-1.5 font-mono text-[11px] font-medium text-brand-600 bg-brand-50/80 px-2 py-0.5 rounded-lg border border-brand-100">
                        <span>${esc(cue.start)}</span>
                        <span class="text-brand-300">→</span>
                        <span>${esc(cue.end)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="text-surface-700 leading-relaxed whitespace-pre-wrap text-sm">${highlightMatch(cue.text.join('\n'), lastSearch)}</div>
                </div>
              `).join('')}
              ${filteredCues.length > limit ? `
                <div class="p-8 text-center text-sm text-surface-500 bg-surface-50 rounded-xl border border-dashed border-surface-200">
                  Showing first ${limit.toLocaleString()} entries. Use search to find specific content.
                </div>` : ''}
            </div>`;
        }
      } else {
        // Raw View
        const rawLimit = 500000; // 500KB limit for raw render
        const isTruncated = currentContent.length > rawLimit;
        const displayContent = isTruncated ? currentContent.substring(0, rawLimit) + '\n\n... [File truncated for performance]' : currentContent;

        let highlighted = esc(displayContent);
        if (hljsLoaded && typeof hljs !== 'undefined') {
          try {
            highlighted = hljs.highlight(displayContent, { language: 'accesslog' }).value;
          } catch (e) {
            console.warn('Highlight failed', e);
          }
        }

        contentHtml = `
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Source Code</h3>
            <span class="text-xs text-surface-500">${isTruncated ? 'First 500KB' : 'Full File'}</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed text-left"><code>${highlighted}</code></pre>
          </div>
        `;
      }

      h.render(`
        <div class="max-w-4xl mx-auto p-4">
          ${infoBar}
          ${controls}
          <div id="vtt-content">
            ${contentHtml}
          </div>
        </div>
      `);

      // Event Listeners
      const searchInput = document.getElementById('vtt-search');
      if (searchInput) {
        searchInput.focus();
        // Move cursor to end
        const val = searchInput.value;
        searchInput.value = '';
        searchInput.value = val;
        
        searchInput.addEventListener('input', function(e) {
          lastSearch = e.target.value;
          _render(onFileFn, file, content, h);
        });
      }

      const btnCues = document.getElementById('view-cues');
      if (btnCues) btnCues.addEventListener('click', function() {
        lastView = 'cues';
        _render(onFileFn, file, content, h);
      });

      const btnRaw = document.getElementById('view-raw');
      if (btnRaw) btnRaw.addEventListener('click', function() {
        lastView = 'raw';
        _render(onFileFn, file, content, h);
      });
    }

    function _renderEmpty(onFileFn, file, content, h) {
      h.render(`
        <div class="max-w-4xl mx-auto p-8">
          <div class="p-12 text-center bg-surface-50 rounded-3xl border-2 border-dashed border-surface-200">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-100 text-surface-400 mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            </div>
            <h3 class="text-lg font-semibold text-surface-900 mb-2">No subtitle cues detected</h3>
            <p class="text-surface-500 max-w-sm mx-auto">This WebVTT file appears to be empty or lacks standard timing marks (00:00:00.000 --> 00:00:00.000).</p>
          </div>
        </div>
      `);
    }

    /**
     * WebVTT Parser - Robust implementation
     */
    function parseVTT(text) {
      const cues = [];
      const lines = text.replace(/\r\n/g, '\n').split('\n');
      let currentCue = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.includes('-->')) {
          // Time line
          const parts = line.split('-->');
          if (parts.length >= 2) {
            const startStr = parts[0].trim();
            const endFull = parts[1].trim();
            // Split by space/tab to ignore settings
            const endStr = endFull.split(/[ \t]/)[0];

            // If there was a previous line that wasn't an identifier, and it's not empty, 
            // the parser before it might have picked it up as part of text.
            // But usually, an identifier is on the line immediately preceding the time.
            let identifier = null;
            if (i > 0) {
              const prev = lines[i - 1].trim();
              if (prev !== '' && !prev.includes('-->') && prev !== 'WEBVTT') {
                identifier = prev;
              }
            }

            currentCue = {
              identifier: identifier,
              start: startStr,
              end: endStr,
              text: []
            };
            cues.push(currentCue);
          }
        } else if (currentCue && line !== '') {
          // Check if this line was mistaken for an identifier
          if (currentCue.identifier === line) {
            // Already handled as identifier
          } else {
            currentCue.text.push(line);
          }
        } else if (line === '') {
          currentCue = null;
        }
      }

      // Cleanup: remove identifiers that were accidentally added to previous cue's text
      // In a block like:
      // 1
      // 00:01.000 --> 00:04.000
      // Hello
      //
      // 2
      // 00:05.000 --> 00:09.000
      // World
      //
      // The "2" might be added to the text of "1" if we aren't careful.
      // But the parser above handles this by setting currentCue = null on empty line.
      
      return cues;
    }

    /**
     * Convert to SRT format
     */
    function convertToSrt(cues) {
      if (!cues || cues.length === 0) return '';

      return cues.map((cue, idx) => {
        const formatTime = (t) => {
          // VTT: HH:MM:SS.mmm or MM:SS.mmm
          // SRT: HH:MM:SS,mmm
          let clean = t.replace('.', ',');
          const segments = clean.split(':');
          
          if (segments.length === 2) {
            clean = '00:' + clean;
          }
          
          // Ensure 3-digit ms
          const parts = clean.split(',');
          if (parts.length === 2 && parts[1].length < 3) {
            clean = parts[0] + ',' + parts[1].padEnd(3, '0');
          }
          return clean;
        };

        return (idx + 1) + '\n' +
               formatTime(cue.start) + ' --> ' + formatTime(cue.end) + '\n' +
               cue.text.join('\n') + '\n';
      }).join('\n');
    }

    function highlightMatch(text, search) {
      const safeText = esc(text);
      if (!search || search.trim() === '') return safeText;
      try {
        const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${pattern})`, 'gi');
        return safeText.replace(regex, '<mark class="bg-brand-100 text-brand-900 px-0.5 rounded-sm font-medium">$1</mark>');
      } catch (e) {
        return safeText;
      }
    }

    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  };
})();
