(function() {
  'use strict';

  /**
   * OmniOpener — LRC (Lyrics) File Viewer
   * A production-perfect, high-performance lyrics viewer with metadata extraction and live search.
   */

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Robust LRC Parser
   * Supports multiple time tags per line and various metadata formats.
   */
  function parseLRC(text) {
    const lines = text.split(/\r?\n/);
    const metadata = {};
    const lyrics = [];
    
    // Metadata: [key:value]
    const metaRegex = /^\[([a-zA-Z]+):(.*)\]$/;
    // Time tags: [mm:ss.xx] or [mm:ss]
    const timeRegex = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Reset regex index for each line
      timeRegex.lastIndex = 0;
      const timeMatches = [...line.matchAll(timeRegex)];

      if (timeMatches.length > 0) {
        // Line has timestamps. Extract text after the last timestamp.
        const lastMatch = timeMatches[timeMatches.length - 1];
        const textStart = lastMatch.index + lastMatch[0].length;
        const lyricText = line.substring(textStart).trim();

        for (const match of timeMatches) {
          const min = parseInt(match[1], 10);
          const sec = parseFloat(match[2]);
          lyrics.push({
            time: min * 60 + sec,
            displayTime: match[1].padStart(2, '0') + ':' + match[2].padStart(2, '0'),
            text: lyricText
          });
        }
      } else {
        // Potential metadata line
        const metaMatch = line.match(metaRegex);
        if (metaMatch) {
          const key = metaMatch[1].toLowerCase();
          const value = metaMatch[2].trim();
          if (value) metadata[key] = value;
        }
      }
    }

    // Sort lyrics by timeline
    lyrics.sort((a, b) => a.time - b.time);
    
    return { metadata, lyrics };
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.lrc',
      dropLabel: 'Drop an LRC lyrics file',
      binary: false,
      onFile: async function(file, content, helpers) {
        // U6. Loading state
        helpers.showLoading('Analyzing lyrics timeline...');

        // B7. Large file handling
        if (file.size > 5 * 1024 * 1024) {
          helpers.showError('File too large', 'LRC files are typically small text files. This file exceeds 5MB and may be invalid.');
          return;
        }

        try {
          // Minimal delay for UX feedback
          await new Promise(r => setTimeout(r, 200));

          const data = parseLRC(content);
          
          // U5. Empty state
          if (data.lyrics.length === 0 && Object.keys(data.metadata).length === 0) {
            helpers.showError('Empty LRC File', 'This file contains no valid lyrics or metadata tags.');
            return;
          }

          renderLRC(file, data, helpers);
        } catch (e) {
          // U3. Friendly error messages
          helpers.showError('Could not open LRC file', 'The file may be corrupted or in an unsupported format.');
        }
      },
      actions: [
        {
          label: 'Copy Lyrics Only',
          id: 'copy-text',
          onClick: function(helpers, btn) {
            const lines = Array.from(document.querySelectorAll('.lyric-text'))
              .map(el => el.innerText.trim())
              .filter(t => t);
            if (lines.length > 0) {
              helpers.copyToClipboard(lines.join('\n'), btn);
            }
          }
        },
        {
          label: 'Download Original',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> LRC files are processed locally. Your data never leaves your computer.'
    });
  };

  function renderLRC(file, data, helpers) {
    const metaLabels = {
      ti: 'Title',
      ar: 'Artist',
      al: 'Album',
      au: 'Author',
      by: 'Created By',
      re: 'Editor',
      ve: 'Version',
      offset: 'Time Offset'
    };

    const metadataEntries = Object.entries(data.metadata);
    
    const html = `
      <div class="max-w-5xl mx-auto p-4 md:p-8">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">LRC Lyrics</span>
        </div>

        ${metadataEntries.length > 0 ? `
          <div class="mb-8">
            <!-- U10. Section header with count -->
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-surface-900 tracking-tight">Metadata Tags</h3>
              <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${metadataEntries.length} items</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              ${metadataEntries.map(([k, v]) => `
                <!-- U9. Content card -->
                <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                  <div class="text-[10px] uppercase tracking-widest text-surface-400 font-bold mb-1.5 group-hover:text-brand-500 transition-colors">${metaLabels[k] || k}</div>
                  <div class="text-surface-800 font-semibold truncate leading-tight" title="${escapeHtml(v)}">${escapeHtml(v)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
          <!-- U10. Section header with count -->
          <div class="flex items-center gap-3">
            <h3 class="font-bold text-surface-900 tracking-tight">Lyrics Timeline</h3>
            <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${data.lyrics.length} lines</span>
          </div>
          
          <!-- Format-specific excellence: Search box -->
          <div class="relative w-full md:w-80">
            <input type="text" id="lrcSearch" placeholder="Search lyrics..." 
              class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm">
            <div class="absolute left-3.5 top-3 text-surface-400">
              <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
        </div>

        <!-- U7. Table -->
        <div class="overflow-x-auto rounded-2xl border border-surface-200 shadow-xl bg-white">
          <table class="min-w-full text-sm border-separate border-spacing-0" id="lrcTable">
            <thead>
              <tr>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-6 py-4 text-left font-bold text-surface-800 border-b border-surface-200 z-10 w-32 tracking-wider uppercase text-[11px]">Time</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-6 py-4 text-left font-bold text-surface-800 border-b border-surface-200 z-10 tracking-wider uppercase text-[11px]">Lyric Line</th>
              </tr>
            </thead>
            <tbody>
              ${data.lyrics.map((line, idx) => `
                <tr class="lrc-row even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors group cursor-default" data-index="${idx}">
                  <td class="px-6 py-4 text-brand-600 font-mono font-bold border-b border-surface-100 align-top tabular-nums whitespace-nowrap">
                    <span class="opacity-40 font-normal mr-1">[</span>${escapeHtml(line.displayTime)}<span class="opacity-40 font-normal ml-1">]</span>
                  </td>
                  <td class="px-6 py-4 text-surface-700 border-b border-surface-100 lyric-text leading-relaxed whitespace-pre-wrap font-medium">${line.text ? escapeHtml(line.text) : '<span class="text-surface-300 italic font-normal">Musical Interlude</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div id="noResults" class="hidden py-24 text-center bg-surface-50">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-100 text-surface-400 mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            <p class="text-surface-500 font-medium">No lyrics match your search.</p>
            <button onclick="document.getElementById('lrcSearch').value=''; document.getElementById('lrcSearch').dispatchEvent(new Event('input'))" class="mt-4 text-brand-600 font-semibold hover:text-brand-700 text-sm">Clear search</button>
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Live search and highlight implementation
    const searchInput = document.getElementById('lrcSearch');
    const tableRows = document.querySelectorAll('.lrc-row');
    const noResults = document.getElementById('noResults');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        let visibleCount = 0;
        
        tableRows.forEach(row => {
          const idx = parseInt(row.getAttribute('data-index'));
          const originalText = data.lyrics[idx].text;
          const textElement = row.querySelector('.lyric-text');
          const rowMatches = originalText.toLowerCase().includes(term);

          if (rowMatches) {
            row.style.display = '';
            visibleCount++;
            
            if (term && originalText) {
              const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
              textElement.innerHTML = escapeHtml(originalText).replace(regex, '<mark class="bg-brand-200/60 text-brand-900 px-0.5 rounded-sm ring-1 ring-brand-300/30">$1</mark>');
            } else {
              textElement.innerHTML = originalText ? escapeHtml(originalText) : '<span class="text-surface-300 italic font-normal">Musical Interlude</span>';
            }
          } else {
            row.style.display = 'none';
          }
        });

        if (noResults) {
          noResults.classList.toggle('hidden', visibleCount > 0);
          document.querySelector('#lrcTable table').classList.toggle('hidden', visibleCount === 0);
        }
      });
    }
  }

})();
