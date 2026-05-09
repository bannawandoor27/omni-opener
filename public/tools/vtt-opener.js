(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentFile = null;
    let currentContent = '';
    let parsedCues = [];
    let lastSearch = '';
    let lastView = 'cues'; // 'cues' or 'raw'

    OmniTool.create(mountEl, toolConfig, {
      accept: '.vtt',
      dropLabel: 'Drop WebVTT Subtitles',
      binary: false,
      infoHtml: '<strong>VTT Viewer:</strong> Professional WebVTT subtitle viewer and converter. View, search, and convert to SRT format instantly.',
      
      onInit: function (h) {
        h.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy as SRT',
          id: 'copy-srt',
          onClick: function (h, btn) {
            try {
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
              const srt = convertToSrt(parsedCues);
              const name = currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") + ".srt" : 'subtitles.srt';
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

        // Short timeout to allow loader to show
        setTimeout(function () {
          try {
            if (!content.trim().startsWith('WEBVTT')) {
              // Be lenient but warn if standard header is missing
              if (!content.includes('-->')) {
                throw new Error('Not a valid WebVTT file (missing WEBVTT header or cues).');
              }
            }
            
            parsedCues = parseVTT(content);
            
            if (parsedCues.length === 0) {
              _renderEmpty(h);
            } else {
              _render(h);
            }
          } catch (err) {
            h.showError('Could not open VTT file', err.message);
          }
        }, 100);
      },

      onDestroy: function() {
        // Clean up closure references
        currentFile = null;
        currentContent = '';
        parsedCues = [];
      }
    });

    function _render(h) {
      const filteredCues = lastSearch.trim() === '' 
        ? parsedCues 
        : parsedCues.filter(c => {
            const searchLower = lastSearch.toLowerCase();
            return c.text.some(line => line.toLowerCase().includes(searchLower)) ||
                   c.start.includes(lastSearch) ||
                   c.end.includes(lastSearch);
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

          ${lastView === 'cues' ? `
          <div class="relative flex-1 max-w-sm">
            <input id="vtt-search" type="text" placeholder="Search text or timestamps..." value="${esc(lastSearch)}" 
              class="w-full pl-10 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
            <div class="absolute left-3.5 top-2.5 text-surface-400">
              <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
          ` : ''}
        </div>
      `;

      let contentHtml = '';

      if (lastView === 'cues') {
        if (filteredCues.length === 0) {
          contentHtml = `
            <div class="p-12 text-center text-surface-500 bg-surface-50 rounded-2xl border border-surface-200">
              No results matching "<span class="font-medium text-surface-800">${esc(lastSearch)}</span>"
            </div>`;
        } else {
          contentHtml = `
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-surface-800">Cues</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">
                ${filteredCues.length} ${filteredCues.length === parsedCues.length ? 'items' : 'matches'}
              </span>
            </div>
            <div class="space-y-3">
              ${filteredCues.slice(0, 1500).map((cue, i) => `
                <div class="group rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white text-left">
                  <div class="flex items-center justify-between mb-2.5">
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-bold uppercase tracking-widest text-surface-400">#${cue.index || i + 1}</span>
                      <div class="flex items-center gap-2 font-mono text-[11px] font-medium text-brand-600 bg-brand-50/50 px-2 py-1 rounded-lg border border-brand-100">
                        <span>${esc(cue.start)}</span>
                        <span class="text-brand-300">→</span>
                        <span>${esc(cue.end)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="text-surface-700 leading-relaxed whitespace-pre-wrap text-sm">${highlightMatch(cue.text.join('\n'), lastSearch)}</div>
                </div>
              `).join('')}
              ${filteredCues.length > 1500 ? `<div class="p-6 text-center text-sm text-surface-500 bg-surface-50 rounded-xl border border-dashed border-surface-200">Showing first 1,500 entries. Use search to find specific content.</div>` : ''}
            </div>`;
        }
      } else {
        const isHljsLoaded = typeof hljs !== 'undefined';
        const rawToDisplay = currentContent.length > 300000 
          ? currentContent.substring(0, 300000) + "\n\n... (File too large, truncated for performance)"
          : currentContent;
        
        const highlighted = isHljsLoaded 
          ? hljs.highlight(rawToDisplay, { language: 'accesslog' }).value // accesslog style looks okay for VTT
          : esc(rawToDisplay);

        contentHtml = `
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-surface-800">Source View</h3>
            <span class="text-xs text-surface-500">${currentContent.length > 300000 ? 'Showing first 300KB' : 'Full source'}</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed text-left"><code>${highlighted}</code></pre>
          </div>`;
      }

      h.render(`
        <div class="max-w-4xl mx-auto p-4 md:p-6">
          ${infoBar}
          ${controls}
          <div id="vtt-main-area">
            ${contentHtml}
          </div>
        </div>
      `);

      // Bind events
      const searchBox = document.getElementById('vtt-search');
      if (searchBox) {
        searchBox.addEventListener('input', (e) => {
          lastSearch = e.target.value;
          _render(h);
          const input = document.getElementById('vtt-search');
          if (input) {
            input.focus();
            input.setSelectionRange(lastSearch.length, lastSearch.length);
          }
        });
      }

      const btnCues = document.getElementById('view-cues');
      if (btnCues) btnCues.onclick = () => { lastView = 'cues'; _render(h); };
      
      const btnRaw = document.getElementById('view-raw');
      if (btnRaw) btnRaw.onclick = () => { lastView = 'raw'; _render(h); };
    }

    function _renderEmpty(h) {
      h.render(`
        <div class="max-w-4xl mx-auto p-6 text-center">
          <div class="bg-surface-50 border-2 border-dashed border-surface-200 rounded-3xl p-12">
            <div class="text-surface-400 mb-4">
              <svg class="w-16 h-16 mx-auto opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            </div>
            <h3 class="text-lg font-medium text-surface-900 mb-2">No subtitle cues found</h3>
            <p class="text-surface-500 max-w-sm mx-auto">This file might be empty or missing standard WebVTT formatting (time --> time).</p>
          </div>
        </div>
      `);
    }

    /**
     * WebVTT Parser
     */
    function parseVTT(text) {
      const cues = [];
      const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);
      let sequence = 1;

      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].trim().split('\n');
        let timeIndex = -1;

        // Skip metadata/header block if it doesn't contain a timestamp
        for (let j = 0; j < lines.length; j++) {
          if (lines[j].includes('-->')) {
            timeIndex = j;
            break;
          }
        }

        if (timeIndex !== -1) {
          const timeLine = lines[timeIndex];
          const parts = timeLine.split('-->');
          if (parts.length < 2) continue;

          const startStr = parts[0].trim();
          // Extract end time (ignoring settings like position:10% that may follow)
          const endFull = parts[1].trim();
          const endStr = endFull.split(/[ \t]/)[0];

          // Text lines follow the time line
          const textLines = lines.slice(timeIndex + 1).map(l => l.trim()).filter(l => l !== '');

          // Try to get the index if it was on the line before the timestamp
          let cueIndex = sequence;
          if (timeIndex > 0) {
            const possibleIndex = parseInt(lines[timeIndex - 1]);
            if (!isNaN(possibleIndex)) cueIndex = possibleIndex;
          }

          cues.push({
            index: cueIndex,
            start: startStr,
            end: endStr,
            text: textLines
          });
          sequence++;
        }
      }
      return cues;
    }

    /**
     * Convert to SRT format
     */
    function convertToSrt(cues) {
      if (!cues || cues.length === 0) throw new Error('No cues to convert.');

      return cues.map((cue, idx) => {
        const srtTime = (t) => {
          // VTT: HH:MM:SS.mmm or MM:SS.mmm
          // SRT: HH:MM:SS,mmm
          let res = t.replace('.', ',');
          const parts = res.split(':');
          if (parts.length === 2) res = '00:' + res;
          // Ensure milliseconds have 3 digits
          const m = res.split(',');
          if (m.length === 2 && m[1].length < 3) {
            res = m[0] + ',' + m[1].padEnd(3, '0');
          }
          return res;
        };

        return (idx + 1) + '\n' +
               srtTime(cue.start) + ' --> ' + srtTime(cue.end) + '\n' +
               cue.text.join('\n') + '\n';
      }).join('\n');
    }

    function highlightMatch(text, search) {
      const safeText = esc(text);
      if (!search || search.trim() === '') return safeText;
      try {
        const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${pattern})`, 'gi');
        return safeText.replace(regex, '<mark class="bg-yellow-200 text-yellow-900 px-0.5 rounded-sm">$1</mark>');
      } catch (e) {
        return safeText;
      }
    }

    function formatSize(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  };
})();
