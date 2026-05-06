(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let lastSearch = '';
    let lastView = 'cues';
    let currentFile = null;
    let currentContent = '';
    let parsedCues = [];

    OmniTool.create(mountEl, toolConfig, {
      accept: '.vtt',
      dropLabel: 'Drop WebVTT Subtitles',
      binary: false,
      infoHtml: '<strong>VTT Viewer:</strong> Professional WebVTT subtitle viewer and converter. View, search, and convert to SRT format instantly in your browser.',
      
      onInit: function(h) {
        h.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      actions: [
        {
          label: '📋 Copy SRT',
          id: 'copy-srt',
          onClick: function (h, btn) {
            try {
              const srt = vttToSrt(h.getContent());
              h.copyToClipboard(srt, btn);
            } catch (e) {
              h.showError('Conversion failed', 'Could not convert VTT to SRT. ' + e.message);
            }
          }
        },
        {
          label: '📥 Download SRT',
          id: 'download-srt',
          onClick: function (h) {
            try {
              const file = h.getFile();
              const name = file ? file.name.replace(/\.vtt$/i, '.srt') : 'subtitles.srt';
              h.download(name, vttToSrt(h.getContent()));
            } catch (e) {
              h.showError('Download failed', 'Could not generate SRT file.');
            }
          }
        }
      ],

      onFile: function (file, content, h) {
        currentFile = file;
        currentContent = content;
        lastSearch = ''; // Reset search on new file
        h.showLoading('Parsing WebVTT...');

        setTimeout(function() {
          try {
            parsedCues = parseVTT(content);
            
            if (parsedCues.length === 0 && !content.includes('WEBVTT')) {
               h.showError('Invalid Format', 'This does not look like a valid WebVTT file. Ensure it starts with "WEBVTT".');
               return;
            }

            render(h);
          } catch (err) {
            h.showError('Parse Error', err.message);
          }
        }, 50);
      }
    });

    function render(h) {
      const filteredCues = lastSearch.trim() === '' 
        ? parsedCues 
        : parsedCues.filter(c => c.text.some(t => t.toLowerCase().includes(lastSearch.toLowerCase())));

      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(currentFile.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(currentFile.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">WebVTT</span>
        </div>
      `;

      const header = `
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div class="flex bg-surface-100 p-1 rounded-xl w-fit">
            <button id="tab-cues" class="px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${lastView === 'cues' ? 'bg-white shadow-sm text-brand-700' : 'text-surface-600 hover:text-surface-900'}">Cues</button>
            <button id="tab-raw" class="px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${lastView === 'raw' ? 'bg-white shadow-sm text-brand-700' : 'text-surface-600 hover:text-surface-900'}">Raw Source</button>
          </div>
          
          ${lastView === 'cues' ? `
          <div class="relative flex-1 max-w-sm">
            <input id="vtt-search" type="text" placeholder="Search subtitles..." value="${esc(lastSearch)}" 
              class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>` : ''}
        </div>
      `;

      let body = '';
      if (lastView === 'cues') {
        if (parsedCues.length === 0) {
          body = `
            <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
              <div class="text-surface-400 mb-2">No cues found</div>
              <div class="text-xs text-surface-500 text-balance">The file might contain only metadata or headers. WebVTT cues require a timestamp arrow (-->).</div>
            </div>`;
        } else if (filteredCues.length === 0) {
           body = `
            <div class="p-12 text-center text-surface-500 bg-surface-50 rounded-2xl border border-surface-200">
              No results matching "<span class="font-medium text-surface-800">${esc(lastSearch)}</span>"
            </div>`;
        } else {
          const displayCues = filteredCues.slice(0, 1000);
          body = `
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Subtitle Cues</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                ${filteredCues.length} ${filteredCues.length === parsedCues.length ? 'items' : 'matches'}
              </span>
            </div>
            <div class="grid gap-3">
              ${displayCues.map((cue) => `
                <div class="group rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white text-left">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-surface-400">#${cue.index}</span>
                      <span class="text-xs font-mono font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">${esc(cue.start)} &rarr; ${esc(cue.end)}</span>
                    </div>
                  </div>
                  <div class="text-surface-700 leading-relaxed whitespace-pre-wrap">${highlightText(cue.text.join('\n'), lastSearch)}</div>
                </div>
              `).join('')}
              ${filteredCues.length > 1000 ? `<div class="p-4 text-center text-xs text-surface-500">Showing first 1,000 matches...</div>` : ''}
            </div>`;
        }
      } else {
        const maxRaw = 200000;
        const displayContent = currentContent.length > maxRaw 
          ? currentContent.slice(0, maxRaw) + '\n\n... (file truncated for performance)' 
          : currentContent;
        
        const highlighted = (typeof hljs !== 'undefined') 
            ? hljs.highlightAuto(displayContent).value 
            : esc(displayContent);
        
        body = `
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-surface-800">Raw Content</h3>
            <span class="text-xs text-surface-500">${currentContent.length > maxRaw ? 'Showing first 200KB' : 'Full source'}</span>
          </div>
          <div class="rounded-xl overflow-hidden border border-surface-200">
            <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed text-left"><code>${highlighted}</code></pre>
          </div>`;
      }

      h.render(`
        <div class="max-w-5xl mx-auto p-4 md:p-6">
          ${infoBar}
          ${header}
          <div id="vtt-content-area" class="pb-8">
            ${body}
          </div>
        </div>
      `);

      // Event Handlers
      const searchInput = document.getElementById('vtt-search');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          lastSearch = e.target.value;
          render(h);
          const reFocus = document.getElementById('vtt-search');
          if (reFocus) {
            reFocus.focus();
            reFocus.setSelectionRange(lastSearch.length, lastSearch.length);
          }
        });
      }

      document.getElementById('tab-cues').onclick = () => { lastView = 'cues'; render(h); };
      document.getElementById('tab-raw').onclick = () => { lastView = 'raw'; render(h); };
    }
  };

  /**
   * Robust WebVTT Parser
   */
  function parseVTT(content) {
    // Split by double newline to separate blocks
    const blocks = content.trim().split(/\n\s*\n/);
    const cues = [];
    let sequence = 1;

    blocks.forEach(block => {
      const lines = block.trim().split('\n');
      let timeLineIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLineIndex = i;
          break;
        }
      }

      if (timeLineIndex !== -1) {
        const timeLine = lines[timeLineIndex];
        const parts = timeLine.split('-->');
        if (parts.length < 2) return;

        const start = parts[0].trim();
        // End time might have settings after it (e.g. position:10%)
        const end = parts[1].trim().split(/[ \t]/)[0];
        
        const textLines = lines.slice(timeLineIndex + 1).map(l => l.trim()).filter(l => l !== '');
        
        cues.push({
          index: sequence++,
          start: start,
          end: end,
          text: textLines
        });
      }
    });

    return cues;
  }

  /**
   * Convert WebVTT content to SRT
   */
  function vttToSrt(vtt) {
    const cues = parseVTT(vtt);
    if (cues.length === 0) throw new Error('No valid subtitle cues found.');
    
    return cues.map(function(cue) {
      const fixTime = function(t) {
        // SRT uses comma for decimals, VTT uses dot
        let formatted = t.replace('.', ',');
        // SRT always requires HH:MM:SS,mmm
        const parts = formatted.split(':');
        if (parts.length === 2) formatted = '00:' + formatted;
        else if (parts.length === 1) formatted = '00:00:' + formatted;
        return formatted;
      };
      
      return cue.index + '\n' + 
             fixTime(cue.start) + ' --> ' + fixTime(cue.end) + '\n' + 
             cue.text.join('\n') + '\n';
    }).join('\n');
  }

  function highlightText(text, search) {
    const e = esc(text);
    if (!search || search.trim() === '') return e;
    try {
      const regex = new RegExp('(' + search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return e.replace(regex, '<mark class="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">$1</mark>');
    } catch (err) {
      return e;
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
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
