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
            const vtt = 'WEBVTT\n\n' + h.getContent().replace(/,/g, '.');
            h.download(h.getFile().name.replace('.srt', '.vtt'), vtt);
          }
        },
        {
          label: '📝 Plain Text',
          id: 'export-txt',
          onClick: function (h) {
            const items = parseSRT(h.getContent());
            const txt = items.map(i => i.text.replace(/<br>/g, '\n')).join('\n\n');
            h.download(h.getFile().name.replace('.srt', '.txt'), txt);
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

      onFile: function (file, content, h) {
        renderSRT(content, h);
      }
    });
  };

  function parseSRT(data) {
    const items = [];
    const blocks = data.trim().split(/\r?\n\s*\r?\n/);
    blocks.forEach(block => {
      const lines = block.split(/\r?\n/);
      if (lines.length >= 2) {
        const index = lines[0].trim();
        const times = lines[1].split(' --> ');
        if (times.length === 2) {
          const start = times[0].trim();
          const end = times[1].trim();
          const text = lines.slice(2).join('<br>');
          items.push({ index, start, end, text });
        }
      }
    });
    return items;
  }

  function renderSRT(content, h) {
    const items = parseSRT(content);
    
    const html = `
      <div class="flex flex-col h-[700px]">
        <div class="flex border-b border-surface-200 bg-surface-50 px-4">
          <button id="tab-parsed" class="px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600">Parsed View</button>
          <button id="tab-raw" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700">Raw Source</button>
          <div class="ml-auto flex items-center py-1">
            <input type="text" id="srt-search" placeholder="Search subtitles..." class="text-xs border border-surface-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500">
          </div>
        </div>
        <div id="view-parsed" class="flex-1 overflow-auto p-4 space-y-3 bg-surface-50">
          ${items.map(item => `
            <div class="subtitle-item bg-white p-3 rounded-lg border border-surface-200 shadow-sm hover:border-brand-300 transition-colors">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-mono text-surface-400">#${item.index}</span>
                <span class="text-xs font-semibold px-2 py-0.5 bg-surface-100 rounded text-surface-600">${item.start} → ${item.end}</span>
              </div>
              <div class="text-sm text-surface-800 leading-relaxed">${item.text}</div>
            </div>
          `).join('')}
        </div>
        <div id="view-raw" class="hidden flex-1 overflow-auto">
          <pre class="hljs p-4 min-h-full font-mono text-xs"><code>${typeof hljs !== 'undefined' ? hljs.highlightAuto(content).value : content}</code></pre>
        </div>
      </div>
    `;

    h.render(html);

    // Tab switching
    const btnParsed = document.getElementById('tab-parsed');
    const btnRaw = document.getElementById('tab-raw');
    const viewParsed = document.getElementById('view-parsed');
    const viewRaw = document.getElementById('view-raw');

    btnParsed.onclick = () => {
      btnParsed.className = 'px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600';
      btnRaw.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700';
      viewParsed.classList.remove('hidden');
      viewRaw.classList.add('hidden');
    };

    btnRaw.onclick = () => {
      btnRaw.className = 'px-4 py-2 text-sm font-medium border-b-2 border-brand-500 text-brand-600';
      btnParsed.className = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-surface-500 hover:text-surface-700';
      viewRaw.classList.remove('hidden');
      viewParsed.classList.add('hidden');
    };

    // Search functionality
    const searchInput = document.getElementById('srt-search');
    searchInput.oninput = (e) => {
      const query = e.target.value.toLowerCase();
      const rows = viewParsed.querySelectorAll('.subtitle-item');
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? 'block' : 'none';
      });
    };
  }
})();
