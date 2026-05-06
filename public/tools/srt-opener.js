(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.srt',
      dropLabel: 'Drop an SRT file here',
      binary: false,
      infoHtml: '<strong>SRT Tool:</strong> View, search, and convert subtitle files. Everything happens locally in your browser.',

      actions: [
        {
          label: '📋 Copy SRT',
          id: 'copy',
          onClick: function (h, btn) {
            h.copyToClipboard(h.getContent(), btn);
          }
        },
        {
          label: '📄 Export VTT',
          id: 'export-vtt',
          onClick: function (h) {
            const content = h.getContent();
            // Convert SRT timestamps (00:00:00,000) to VTT (00:00:00.000)
            const vtt = 'WEBVTT\n\n' + content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
            h.download(h.getFile().name.replace(/\.srt$/i, '.vtt'), vtt);
          }
        },
        {
          label: '📝 Plain Text',
          id: 'export-txt',
          onClick: function (h) {
            const content = h.getContent();
            const items = parseSRT(content);
            const txt = items.map(i => i.text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).join('\n\n');
            h.download(h.getFile().name.replace(/\.srt$/i, '.txt'), txt);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        h.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css');
        h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      onFile: function _onFile(file, content, h) {
        if (!content || content.trim() === '') {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-surface-500 bg-surface-50 rounded-xl border-2 border-dashed border-surface-200">
              <span class="text-4xl mb-4">📭</span>
              <p class="text-lg font-medium">This SRT file is empty</p>
              <p class="text-sm">There are no subtitle entries to display.</p>
            </div>
          `);
          return;
        }

        h.showLoading('Parsing subtitle entries...');
        
        try {
          const items = parseSRT(content);
          if (items.length === 0) {
            throw new Error('No valid subtitle blocks found');
          }
          renderTool(file, content, items, h);
        } catch (err) {
          h.showError('Could not parse SRT file', 'The file format might be invalid or corrupted. Ensure it follows the standard SubRip format.');
        }
      }
    });
  };

  function parseSRT(data) {
    const items = [];
    // Split by double newline (supporting various newline characters and spaces)
    const blocks = data.trim().split(/\r?\n\s*\r?\n/);
    
    blocks.forEach(block => {
      const lines = block.split(/\r?\n/).map(l => l.trim());
      if (lines.length >= 2) {
        // Find the line containing the arrow
        const timeIndex = lines.findIndex(l => l.includes(' --> '));
        if (timeIndex !== -1) {
          const times = lines[timeIndex].split(' --> ');
          if (times.length === 2) {
            const index = timeIndex > 0 ? lines[timeIndex - 1] : '';
            const start = times[0];
            const end = times[1];
            const text = lines.slice(timeIndex + 1)
              .map(line => line.replace(/<script/gi, '&lt;script').replace(/javascript:/gi, ''))
              .join('<br>');
            if (text) {
              items.push({ index, start, end, text });
            }
          }
        }
      }
    });
    return items;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderTool(file, content, items, h) {
    const html = `
      <div class="flex flex-col gap-4">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-2">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.srt file</span>
          <span class="text-surface-300 ml-auto">|</span>
          <span class="font-medium text-brand-600">${items.length} entries</span>
        </div>

        <div class="flex flex-col border border-surface-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <div class="flex items-center justify-between border-b border-surface-200 bg-surface-50/50 px-4">
            <div class="flex">
              <button id="tab-preview" class="px-4 py-3 text-sm font-medium border-b-2 border-brand-500 text-brand-600 transition-colors">Preview</button>
              <button id="tab-source" class="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 transition-colors">Raw Source</button>
            </div>
            <div id="search-container" class="flex items-center gap-2 py-2">
              <div class="relative">
                <input type="text" id="srt-search" placeholder="Filter subtitles..." 
                  class="w-48 sm:w-64 text-sm border border-surface-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
                <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </span>
              </div>
            </div>
          </div>

          <div id="view-preview" class="p-4 bg-surface-50/30 overflow-y-auto max-h-[600px] space-y-3">
            <div class="grid grid-cols-1 gap-3" id="subtitle-list">
              ${items.map((item, idx) => `
                <div class="subtitle-card bg-white p-4 rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-md transition-all group" data-index="${idx}">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-bold px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded uppercase tracking-wider">${item.index || idx + 1}</span>
                      <span class="text-xs font-mono font-medium text-brand-600 bg-brand-50 px-2 py-1 rounded-md border border-brand-100">
                        ${item.start} <span class="text-brand-300 mx-1">→</span> ${item.end}
                      </span>
                    </div>
                  </div>
                  <div class="subtitle-text text-sm text-surface-800 leading-relaxed font-medium">
                    ${item.text}
                  </div>
                </div>
              `).join('')}
            </div>
            <div id="no-results" class="hidden flex-col items-center justify-center py-12 text-surface-500">
              <span class="text-3xl mb-2">🔍</span>
              <p>No matching subtitles found</p>
            </div>
          </div>

          <div id="view-source" class="hidden bg-gray-950 max-h-[600px] overflow-auto">
            <pre class="p-4 text-xs font-mono leading-relaxed"><code id="raw-code" class="language-srt text-gray-100">${escapeHtml(content)}</code></pre>
          </div>
        </div>
      </div>
    `;

    h.render(html);

    // B1/B4: Ensure highlight.js is loaded before using it
    const highlightCode = () => {
      if (typeof hljs !== 'undefined') {
        const codeEl = document.getElementById('raw-code');
        if (codeEl) hljs.highlightElement(codeEl);
      } else {
        setTimeout(highlightCode, 200);
      }
    };

    // Tab Logic
    const btnPreview = document.getElementById('tab-preview');
    const btnSource = document.getElementById('tab-source');
    const viewPreview = document.getElementById('view-preview');
    const viewSource = document.getElementById('view-source');
    const searchContainer = document.getElementById('search-container');

    btnPreview.onclick = () => {
      btnPreview.className = 'px-4 py-3 text-sm font-medium border-b-2 border-brand-500 text-brand-600 transition-colors';
      btnSource.className = 'px-4 py-3 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 transition-colors';
      viewPreview.classList.remove('hidden');
      viewSource.classList.add('hidden');
      searchContainer.classList.remove('invisible');
    };

    btnSource.onclick = () => {
      btnSource.className = 'px-4 py-3 text-sm font-medium border-b-2 border-brand-500 text-brand-600 transition-colors';
      btnPreview.className = 'px-4 py-3 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700 transition-colors';
      viewSource.classList.remove('hidden');
      viewPreview.classList.add('hidden');
      searchContainer.classList.add('invisible');
      highlightCode();
    };

    // Search Logic with Highlighting
    const searchInput = document.getElementById('srt-search');
    const cards = document.querySelectorAll('.subtitle-card');
    const noResults = document.getElementById('no-results');

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      let visibleCount = 0;

      cards.forEach(card => {
        const textEl = card.querySelector('.subtitle-text');
        const originalHtml = items[card.dataset.index].text;
        
        if (!query) {
          textEl.innerHTML = originalHtml;
          card.classList.remove('hidden');
          visibleCount++;
          return;
        }

        const plainText = textEl.textContent.toLowerCase();
        if (plainText.includes(query)) {
          card.classList.remove('hidden');
          visibleCount++;
          
          // Simple highlighting (escaping HTML first to be safe, then injecting marks)
          // We use the original text which might have <br> tags
          const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
          textEl.innerHTML = originalHtml.replace(regex, '<mark class="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">$1</mark>');
        } else {
          card.classList.add('hidden');
        }
      });

      noResults.classList.toggle('hidden', visibleCount > 0);
    });
  }

})();
