(function() {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.srt',
      dropLabel: 'Drop a .srt file here',
      binary: false,
      onInit: function(helpers) {
        // No external dependencies needed
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing subtitles...');
        
        // Use a small timeout to allow UI to show loading state if content is large
        setTimeout(() => {
          try {
            if (!content || content.trim().length === 0) {
              renderEmpty(file, helpers);
              return;
            }

            const subs = parseSRT(content);
            if (subs.length === 0) {
              renderEmpty(file, helpers);
            } else {
              renderSubtitles(file, subs, helpers);
            }
          } catch (e) {
            console.error(e);
            helpers.showError('Could not open srt file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
          }
        }, 10);
      },
      actions: [
        {
          label: '📋 Copy Text',
          id: 'copy-text',
          onClick: function(helpers, btn) {
            const subs = helpers.getState().subs;
            if (!subs) return;
            const plainText = subs.map(s => s.text.replace(/<br\s*\/?>/gi, '\n')).join('\n\n');
            helpers.copyToClipboard(plainText, btn);
          }
        },
        {
          label: '📥 Download TXT',
          id: 'download-txt',
          onClick: function(helpers) {
            const subs = helpers.getState().subs;
            if (!subs) return;
            const plainText = subs.map(s => s.text.replace(/<br\s*\/?>/gi, '\n')).join('\n\n');
            const fileName = helpers.getFile().name.replace(/\.srt$/i, '') + '.txt';
            helpers.download(fileName, plainText, 'text/plain');
          }
        }
      ],
      infoHtml: '<strong>Pro Tip:</strong> Use the search box to find specific dialogue or timestamps.'
    });
  };

  function parseSRT(data) {
    const subs = [];
    // Normalize line endings
    const normalized = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split by double newline (or more) to separate blocks
    const blocks = normalized.split(/\n\n+/);
    
    for (let block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length >= 2) {
        // Find line with time range
        let timeIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(' --> ')) {
            timeIndex = i;
            break;
          }
        }

        if (timeIndex !== -1) {
          const timeLine = lines[timeIndex];
          const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,. ]\d{3}) --> (\d{2}:\d{2}:\d{2}[,. ]\d{3})/);
          
          if (timeMatch) {
            const indexLine = timeIndex > 0 ? lines[timeIndex - 1] : '';
            const textLines = lines.slice(timeIndex + 1);
            
            // Basic sanitization: remove HTML-like tags from SRT (some use <i>, <b>, etc.)
            // We'll keep <br> for our internal rendering
            const cleanText = textLines.join('<br>').replace(/<(?!\/?br\s*\/?>)[^>]+>/gi, '');
            
            subs.push({
              index: indexLine.trim() || (subs.length + 1).toString(),
              start: timeMatch[1].replace(/[. ]/g, ','),
              end: timeMatch[2].replace(/[. ]/g, ','),
              text: cleanText.trim()
            });
          }
        }
      }
    }
    return subs;
  }

  function renderEmpty(file, helpers) {
    const html = `
      <div class="p-8 text-center">
        <div class="flex flex-wrap items-center justify-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.srt file</span>
        </div>
        <div class="py-12 border-2 border-dashed border-surface-200 rounded-2xl bg-surface-50/50">
          <div class="text-4xl mb-4">📄</div>
          <h3 class="text-lg font-semibold text-surface-800 mb-1">Empty Subtitle File</h3>
          <p class="text-surface-500">This file contains no valid SubRip (SRT) entries.</p>
        </div>
      </div>
    `;
    helpers.render(html);
  }

  function renderSubtitles(file, subs, helpers) {
    helpers.setState({ subs: subs });
    
    const MAX_VISIBLE = 1000;
    const isTruncated = subs.length > MAX_VISIBLE;
    const displaySubs = isTruncated ? subs.slice(0, MAX_VISIBLE) : subs;

    const html = `
      <div class="p-4 sm:p-6 max-w-6xl mx-auto">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.srt file</span>
        </div>

        <!-- Excellence: Search & Summary -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div class="relative">
            <input type="text" id="srt-search" placeholder="Search dialogue or timestamps..." 
              class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
            >
            <div class="absolute left-3 top-2.5 text-surface-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
          </div>
          
          <div class="flex items-center justify-end">
            <!-- U10: Section header with count -->
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-surface-800">Subtitle Entries</h3>
              <span class="text-xs font-medium bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full border border-brand-200">
                ${subs.length.toLocaleString()} items
              </span>
            </div>
          </div>
        </div>

        ${isTruncated ? `
          <div class="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 flex items-center gap-2">
            <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
            Showing first ${MAX_VISIBLE.toLocaleString()} entries for performance. Use the search to find specific content.
          </div>
        ` : ''}

        <!-- U7: Table -->
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm table-fixed" id="srt-table">
            <thead>
              <tr class="bg-surface-50">
                <th class="w-16 sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">#</th>
                <th class="w-48 sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Timeline</th>
                <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Dialogue</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${displaySubs.map(s => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors srt-row">
                  <td class="px-4 py-3 text-surface-400 font-mono text-xs align-top">${escapeHtml(s.index)}</td>
                  <td class="px-4 py-3 align-top">
                    <div class="flex flex-col gap-1 font-mono text-[11px]">
                      <span class="text-brand-600 font-bold">${escapeHtml(s.start)}</span>
                      <span class="text-surface-300 text-[9px]">──▶</span>
                      <span class="text-surface-500 font-bold">${escapeHtml(s.end)}</span>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-surface-800 leading-relaxed break-words srt-text">
                    ${s.text.split('<br>').map(line => `<div class="mb-0.5">${escapeHtml(line)}</div>`).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div id="no-results" class="hidden py-12 text-center text-surface-500 italic">
            No subtitles matching your search...
          </div>
        </div>
      </div>
    `;

    helpers.render(html);

    // Attach search logic
    const searchInput = document.getElementById('srt-search');
    const table = document.getElementById('srt-table');
    const noResults = document.getElementById('no-results');
    const rows = table.querySelectorAll('.srt-row');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        let foundAny = false;

        rows.forEach(row => {
          const text = row.querySelector('.srt-text').textContent.toLowerCase();
          const timeline = row.cells[1].textContent.toLowerCase();
          const matches = text.includes(term) || timeline.includes(term);
          row.style.display = matches ? '' : 'none';
          if (matches) foundAny = true;
        });

        table.style.display = (foundAny || term === '') ? '' : 'none';
        noResults.classList.toggle('hidden', foundAny || term === '');
      });
    }
  }
})();
