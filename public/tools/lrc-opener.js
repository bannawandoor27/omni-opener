(function() {
  'use strict';

  /**
   * OmniOpener — LRC (Lyrics) File Viewer
   * Production-perfect LRC parser and viewer with search and metadata extraction.
   */

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Parse LRC content into metadata and a list of lyrics with timestamps.
   */
  function parseLRC(text) {
    const lines = text.split(/\r?\n/);
    const metadata = {};
    const lyrics = [];
    
    // Regex for metadata: [key:value]
    const metaRegex = /^\[([a-z]+):(.*)\]$/i;
    // Regex for time tags: [mm:ss.xx] or [mm:ss.xxx]
    const timeRegex = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;

    lines.forEach(line => {
      line = line.trim();
      if (!line) return;

      const metaMatch = line.match(metaRegex);
      if (metaMatch && !line.match(timeRegex)) {
        const key = metaMatch[1].toLowerCase();
        const value = metaMatch[2].trim();
        if (value) metadata[key] = value;
      } else {
        let match;
        const times = [];
        let lastIndex = 0;
        
        // Reset regex index for the line
        timeRegex.lastIndex = 0;
        
        while ((match = timeRegex.exec(line)) !== null) {
          const min = parseInt(match[1], 10);
          const sec = parseFloat(match[2]);
          times.push({
            time: min * 60 + sec,
            raw: match[0].replace(/[\[\]]/g, '')
          });
          lastIndex = timeRegex.lastIndex;
        }
        
        const lyricText = line.substring(lastIndex).trim();
        if (times.length > 0) {
          times.forEach(t => {
            lyrics.push({
              time: t.time,
              displayTime: t.raw,
              text: lyricText
            });
          });
        }
      }
    });

    // Sort lyrics by time
    lyrics.sort((a, b) => a.time - b.time);
    
    return { metadata, lyrics };
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.lrc',
      dropLabel: 'Drop a .lrc file here',
      binary: false,
      onFile: async function(file, content, helpers) {
        // U6. Loading state
        helpers.showLoading('Parsing lyrics...');

        // B7. Large file handling
        if (file.size > 5 * 1024 * 1024) {
          helpers.showError('File too large', 'LRC files are typically small text files. This file exceeds 5MB and may not be a valid lyrics file.');
          return;
        }

        try {
          // Small artificial delay for smoother transitions
          await new Promise(resolve => setTimeout(resolve, 300));

          const data = parseLRC(content);
          
          // U5. Empty state check
          if (data.lyrics.length === 0 && Object.keys(data.metadata).length === 0) {
            helpers.showError('Empty LRC File', 'This file contains no valid lyrics or metadata tags.');
            return;
          }

          renderLRC(file, data, helpers);
        } catch (e) {
          // U3. Friendly error messages
          helpers.showError('Could not open LRC file', 'The file may be corrupted or in an unsupported variant. Error: ' + e.message);
        }
      },
      actions: [
        {
          label: 'Copy Lyrics',
          id: 'copy',
          onClick: function(helpers, btn) {
            const textLines = Array.from(document.querySelectorAll('.lyric-content'))
              .map(el => el.textContent.trim())
              .filter(t => t && t !== 'Empty line')
              .join('\n');
            if (textLines) {
              helpers.copyToClipboard(textLines, btn);
            }
          }
        },
        {
          label: 'Download',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> LRC files are processed entirely in your browser. Your data never leaves your device.'
    });
  };

  function renderLRC(file, data, helpers) {
    const metaMap = {
      ti: 'Title',
      ar: 'Artist',
      al: 'Album',
      au: 'Author',
      by: 'Creator',
      re: 'Editor',
      ve: 'Version',
      offset: 'Offset (ms)'
    };

    const hasMeta = Object.keys(data.metadata).length > 0;
    
    const html = `
      <div class="max-w-5xl mx-auto p-4 md:p-6">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.lrc lyrics file</span>
        </div>

        ${hasMeta ? `
          <div class="mb-6">
            <!-- U10. Section header with count -->
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-surface-800">Metadata</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${Object.keys(data.metadata).length} tags</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              ${Object.entries(data.metadata).map(([k, v]) => `
                <!-- U9. Content card -->
                <div class="rounded-xl border border-surface-200 p-3 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                  <div class="text-[10px] uppercase tracking-wider text-surface-400 font-bold mb-1">${metaMap[k] || k}</div>
                  <div class="text-surface-800 font-medium truncate" title="${escapeHtml(v)}">${escapeHtml(v)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <!-- U10. Section header with count -->
          <div class="flex items-center gap-3">
            <h3 class="font-semibold text-surface-800">Lyrics Timeline</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${data.lyrics.length} lines</span>
          </div>
          
          <!-- Format-specific excellence: Search box -->
          <div class="relative min-w-[280px]">
            <input type="text" id="lyricSearch" placeholder="Search lyrics..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
            <div class="absolute left-3.5 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>

        <!-- U7. Table -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm border-separate border-spacing-0" id="lyricsTable">
            <thead>
              <tr>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10 w-24">Time</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 z-10">Line</th>
              </tr>
            </thead>
            <tbody>
              ${data.lyrics.map((l, i) => `
                <tr class="lyric-row even:bg-surface-50 hover:bg-brand-50 transition-colors group" data-text="${escapeHtml(l.text.toLowerCase())}">
                  <td class="px-4 py-3 text-brand-600 font-mono font-medium border-b border-surface-100 align-top">${escapeHtml(l.displayTime)}</td>
                  <td class="px-4 py-3 text-surface-700 border-b border-surface-100 lyric-content leading-relaxed whitespace-pre-wrap">${l.text ? escapeHtml(l.text) : '<span class="text-surface-300 italic">Empty line</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div id="noResults" class="hidden px-4 py-12 text-center text-surface-400 bg-surface-50">
            No lyrics match your search term.
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Search and Highlight logic
    const searchInput = document.getElementById('lyricSearch');
    const tableRows = document.querySelectorAll('.lyric-row');
    const noResults = document.getElementById('noResults');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        let visibleCount = 0;
        
        tableRows.forEach((row, idx) => {
          const text = row.getAttribute('data-text');
          const contentCell = row.querySelector('.lyric-content');
          const originalText = data.lyrics[idx].text;

          if (text.includes(term)) {
            row.style.display = '';
            visibleCount++;
            
            if (term && originalText) {
              const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              contentCell.innerHTML = escapeHtml(originalText).replace(regex, '<mark class="bg-brand-100 text-brand-900 px-0.5 rounded">$1</mark>');
            } else {
              contentCell.innerHTML = originalText ? escapeHtml(originalText) : '<span class="text-surface-300 italic">Empty line</span>';
            }
          } else {
            row.style.display = 'none';
          }
        });

        if (noResults) {
          noResults.style.display = visibleCount === 0 ? 'block' : 'none';
        }
      });
    }
  }

})();
