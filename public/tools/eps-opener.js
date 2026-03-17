(function () {
  'use strict';

  const MAX_DISPLAY_SIZE = 1024 * 512;
  const PRISM_THEME = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css';
  const PRISM_CORE = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js';
  const PRISM_PS = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-postscript.min.js';

  window.initTool = function (toolConfig, mountEl) {
    let currentPsContent = '';

    OmniTool.create(mountEl, toolConfig, {
      accept: '.eps',
      dropLabel: 'Drop a .eps file here',
      binary: true,
      onInit: function (helpers) {
        helpers.loadCSS(PRISM_THEME);
        helpers.loadScript(PRISM_CORE, function () {
          helpers.loadScript(PRISM_PS);
        });
      },
      onFile: function (file, arrayBuffer, helpers) {
        helpers.showLoading('Analyzing PostScript data...');

        setTimeout(function () {
          try {
            const data = new Uint8Array(arrayBuffer);
            let psContent = '';
            let isBinaryHeader = false;

            // Check for DOS EPS binary header: 0xC5D0D3C6
            if (data.length > 30 && data[0] === 0xC5 && data[1] === 0xD0 && data[2] === 0xD3 && data[3] === 0xC6) {
              isBinaryHeader = true;
              const psStart = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
              const psLength = data[8] | (data[9] << 8) | (data[10] << 16) | (data[11] << 24);
              const psBytes = data.slice(psStart, psStart + psLength);
              psContent = new TextDecoder('ascii').decode(psBytes);
            } else {
              psContent = new TextDecoder('utf-8').decode(data);
            }

            if (!psContent.trim()) {
              helpers.showError('Empty File', 'This EPS file contains no PostScript data.');
              return;
            }

            currentPsContent = psContent;
            const meta = parseEpsMetadata(psContent);
            renderEpsView(file, psContent, meta, helpers, isBinaryHeader);

            if (window.Prism && psContent.length < MAX_DISPLAY_SIZE) {
              const codeEl = helpers.getRenderEl().querySelector('code');
              if (codeEl) window.Prism.highlightElement(codeEl);
            }
          } catch (err) {
            console.error(err);
            helpers.showError('Parsing Failed', err.message);
          }
        }, 100);
      },
      actions: [
        {
          label: '📋 Copy PostScript',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(currentPsContent, btn);
          }
        },
        {
          label: '📥 Save as .ps',
          id: 'dl',
          onClick: function (helpers) {
            helpers.download(helpers.getFile().name.replace(/\.eps$/i, '.ps'), currentPsContent, 'application/postscript');
          }
        }
      ]
    });
  };

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
  }

  function parseEpsMetadata(content) {
    const meta = {
      title: 'Untitled',
      creator: 'Unknown',
      date: 'Unknown',
      pages: '1',
      level: 'Unknown',
      bbox: null,
      width: 0,
      height: 0,
      preview: 'None'
    };

    const lines = content.split(/\r?\n/).slice(0, 500);
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('%%Title:')) meta.title = line.split(':').slice(1).join(':').trim() || 'Untitled';
      else if (line.startsWith('%%Creator:')) meta.creator = line.split(':').slice(1).join(':').trim() || 'Unknown';
      else if (line.startsWith('%%CreationDate:')) meta.date = line.split(':').slice(1).join(':').trim() || 'Unknown';
      else if (line.startsWith('%%Pages:')) meta.pages = line.split(':').slice(1).join(':').trim() || '1';
      else if (line.startsWith('%%LanguageLevel:')) meta.level = line.split(':').slice(1).join(':').trim() || 'Unknown';
      else if (line.startsWith('%%BoundingBox:')) {
        const parts = line.replace('%%BoundingBox:', '').trim().split(/\s+/);
        if (parts.length === 4) {
          meta.bbox = {
            llx: parseFloat(parts[0]), lly: parseFloat(parts[1]),
            urx: parseFloat(parts[2]), ury: parseFloat(parts[3])
          };
          meta.width = Math.abs(meta.bbox.urx - meta.bbox.llx);
          meta.height = Math.abs(meta.bbox.ury - meta.bbox.lly);
        }
      }
    }
    return meta;
  }

  function renderEpsView(file, content, meta, helpers, hasBinaryHeader) {
    const isTooLarge = content.length > MAX_DISPLAY_SIZE;
    const displayContent = isTooLarge ? content.substring(0, MAX_DISPLAY_SIZE) : content;
    const dimensions = meta.width ? `${Math.round(meta.width)} × ${Math.round(meta.height)} pt` : 'Auto / Unknown';

    const html = `
      <div class="p-6 max-w-6xl mx-auto">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.eps file</span>
          ${hasBinaryHeader ? '<span class="ml-auto text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Binary Header Detected</span>' : ''}
        </div>

        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-surface-800">Document Metadata</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">DSC v3.0 Compatible</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          ${renderMetaCard('Title', meta.title)}
          ${renderMetaCard('Creator', meta.creator)}
          ${renderMetaCard('Creation Date', meta.date)}
          ${renderMetaCard('Dimensions', dimensions)}
          ${renderMetaCard('Lang Level', meta.level)}
          ${renderMetaCard('Pages', meta.pages)}
        </div>

        <div class="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
          <div class="flex items-center gap-3">
            <h3 class="font-semibold text-surface-800">PostScript Source</h3>
            <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${content.split('\n').length.toLocaleString()} lines</span>
          </div>
          
          <div class="relative min-w-[240px]">
            <input type="text" id="source-search" placeholder="Search code..." 
              class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all">
            <svg class="w-4 h-4 absolute left-3 top-2.5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
        </div>

        <div class="rounded-xl overflow-hidden border border-surface-200 shadow-sm">
          ${isTooLarge ? `
            <div class="bg-amber-50 border-b border-amber-100 px-4 py-2 text-xs text-amber-700 flex items-center gap-2">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"></path></svg>
              File is large. Showing first ${formatSize(MAX_DISPLAY_SIZE)} of code for performance.
            </div>
          ` : ''}
          <pre id="code-container" class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[600px]"><code class="language-postscript">${escapeHtml(displayContent)}</code></pre>
        </div>

        <div id="no-results" class="hidden p-12 text-center text-surface-400">
          No matches found for your search.
        </div>
      </div>
    `;

    helpers.render(html);

    const searchInput = document.getElementById('source-search');
    const codeContainer = document.getElementById('code-container');
    const noResults = document.getElementById('no-results');

    if (searchInput) {
      searchInput.oninput = function () {
        const query = this.value.toLowerCase();
        if (!query) {
          codeContainer.classList.remove('hidden');
          noResults.classList.add('hidden');
          return;
        }

        const lines = displayContent.split('\n');
        const matches = lines.filter(l => l.toLowerCase().includes(query));

        if (matches.length === 0) {
          codeContainer.classList.add('hidden');
          noResults.classList.remove('hidden');
        } else {
          codeContainer.classList.remove('hidden');
          noResults.classList.add('hidden');
        }
      };
    }
  }

  function renderMetaCard(label, value) {
    return `
      <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
        <div class="text-[10px] text-surface-400 uppercase font-black tracking-widest mb-1">${label}</div>
        <div class="text-sm font-semibold text-surface-800 truncate" title="${escapeHtml(value)}">${escapeHtml(value)}</div>
      </div>
    `;
  }

})();
