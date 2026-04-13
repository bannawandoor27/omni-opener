/**
 * OmniOpener — XPS Opener Tool
 * A high-performance, browser-side XPS/OXPS document viewer.
 */
(function () {
  'use strict';

  // --- Helpers ---

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // --- Tool Definition ---

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.xps,.oxps',
      binary: true,
      dropLabel: 'Drop an XPS or OXPS document here',
      infoHtml: '<strong>Privacy First:</strong> Your XPS documents are parsed locally in your browser. No data ever leaves your device.',

      onInit: (helpers) => {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: async (file, content, helpers) => {
        try {
          helpers.showLoading('Initializing engine...');
          
          // Wait for JSZip to be available
          let retries = 0;
          while (typeof JSZip === 'undefined' && retries < 50) {
            await new Promise(r => setTimeout(r, 100));
            retries++;
          }
          if (typeof JSZip === 'undefined') throw new Error('JSZip failed to load.');

          helpers.showLoading('Parsing XPS package...');
          const zip = await JSZip.loadAsync(content);
          
          const fileList = [];
          const pagePaths = [];

          // Index all files in the package
          zip.forEach((path, entry) => {
            fileList.push({
              path,
              size: entry._data.uncompressedSize || 0,
              date: entry.date
            });
            if (path.toLowerCase().endsWith('.fpage')) {
              pagePaths.push(path);
            }
          });

          // Sort pages numerically by filename
          pagePaths.sort((a, b) => {
            const aName = a.split('/').pop();
            const bName = b.split('/').pop();
            const aNum = parseInt(aName.match(/\d+/) || 0);
            const bNum = parseInt(bName.match(/\d+/) || 0);
            return (aNum - bNum) || a.localeCompare(b);
          });

          if (pagePaths.length === 0) {
            helpers.showError('No pages found', 'The XPS file appears to be empty or in an unsupported format.');
            return;
          }

          helpers.showLoading(`Extracting text from ${pagePaths.length} pages...`);
          const pages = [];
          const parser = new DOMParser();

          for (const path of pagePaths) {
            const xmlText = await zip.file(path).async('string');
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // XPS stores text in Glyphs elements
            const glyphs = xmlDoc.querySelectorAll('Glyphs');
            let pageText = [];
            glyphs.forEach(g => {
              const unicode = g.getAttribute('UnicodeString');
              if (unicode) pageText.push(unicode);
            });

            pages.push({
              path,
              text: pageText.join(' ')
            });
          }

          renderApp(file, pages, fileList, helpers);
        } catch (err) {
          console.error(err);
          helpers.showError('Could not open XPS file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
        }
      },

      actions: [
        {
          label: '📋 Copy All Text',
          id: 'copy-all',
          onClick: (helpers, btn) => {
            const state = helpers.getState('appState');
            if (!state || !state.pages) return;
            const fullText = state.pages.map(p => p.text).join('\n\n');
            helpers.copyToClipboard(fullText, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: (helpers) => {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'application/oxps');
          }
        }
      ]
    });
  };

  function renderApp(file, pages, fileList, helpers) {
    const initialState = {
      pages,
      fileList,
      zoom: 100,
      activeTab: 'document'
    };
    helpers.setState('appState', initialState);

    const render = () => {
      const state = helpers.getState('appState');
      const { zoom, activeTab } = state;
      
      const html = `
        <div class="max-w-5xl mx-auto space-y-4">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${pages.length} Pages • XPS Document</span>
          </div>

          <!-- Tabs & Controls -->
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-200 pb-2">
            <div class="flex gap-2">
              <button id="tab-doc" class="px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'document' ? 'bg-brand-100 text-brand-700' : 'text-surface-500 hover:bg-surface-50'}">
                Document View
              </button>
              <button id="tab-files" class="px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'files' ? 'bg-brand-100 text-brand-700' : 'text-surface-500 hover:bg-surface-50'}">
                Package Files
              </button>
            </div>
            
            ${activeTab === 'document' ? `
              <div class="flex items-center gap-4 bg-surface-50 px-3 py-1.5 rounded-lg border border-surface-100">
                <span class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Zoom</span>
                <input type="range" id="zoom-slider" min="50" max="250" value="${zoom}" class="w-24 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-500">
                <span class="text-xs font-mono text-surface-600 w-10 text-right">${zoom}%</span>
              </div>
            ` : `
              <div class="relative flex-1 max-w-xs">
                <input type="text" id="file-search" placeholder="Filter files..." class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-lg focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
                <span class="absolute left-3 top-2.5 text-surface-400">🔍</span>
              </div>
            `}
          </div>

          <!-- Content Area -->
          <div id="main-content" class="min-h-[400px]">
            ${activeTab === 'document' ? renderDocument(pages, zoom) : renderFileList(fileList)}
          </div>
        </div>
      `;

      helpers.render(html);
      attachEvents(helpers, render);
    };

    render();
  }

  function renderDocument(pages, zoom) {
    if (pages.length === 0) {
      return `
        <div class="flex flex-col items-center justify-center py-20 text-surface-400 bg-white rounded-2xl border-2 border-dashed border-surface-100">
          <span class="text-5xl mb-4">📭</span>
          <p class="text-lg font-medium">No readable text content found</p>
          <p class="text-sm">This document might contain only images or vectors.</p>
        </div>
      `;
    }

    return `
      <div class="space-y-8" id="document-viewer" style="font-size: ${zoom}%">
        ${pages.map((page, i) => `
          <div class="group relative bg-white rounded-2xl border border-surface-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <!-- Page Header -->
            <div class="sticky top-0 z-10 flex items-center justify-between px-6 py-2.5 bg-surface-50/95 backdrop-blur border-b border-surface-100">
              <div class="flex items-center gap-3">
                <span class="flex items-center justify-center w-5 h-5 rounded-full bg-brand-500 text-white text-[9px] font-bold">
                  ${i + 1}
                </span>
                <h3 class="font-semibold text-surface-800 text-xs">Page ${i + 1} of ${pages.length}</h3>
              </div>
              <span class="text-[9px] font-mono text-surface-400 opacity-0 group-hover:opacity-100 transition-opacity">
                ${escapeHtml(page.path)}
              </span>
            </div>
            
            <!-- U9: Content Card Body -->
            <div class="p-10 md:p-16 text-surface-700 leading-relaxed font-serif whitespace-pre-wrap selection:bg-brand-100">
              ${escapeHtml(page.text) || '<div class="text-surface-300 italic text-center py-4">No text content detected on this page.</div>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderFileList(fileList) {
    return `
      <div class="space-y-3">
        <!-- U10: Section Header -->
        <div class="flex items-center justify-between px-1">
          <h3 class="font-semibold text-surface-800">Package Contents</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${fileList.length} items</span>
        </div>

        <!-- U7: Styled Table -->
        <div class="overflow-hidden rounded-xl border border-surface-200 bg-white">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/80">
                  <th class="sticky top-0 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Path</th>
                  <th class="sticky top-0 px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100" id="file-list-body">
                ${fileList.map(f => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                    <td class="px-4 py-2.5 text-surface-700 font-mono text-xs truncate max-w-md">
                      ${escapeHtml(f.path)}
                    </td>
                    <td class="px-4 py-2.5 text-right text-surface-500 font-mono text-xs">
                      ${formatSize(f.size)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function attachEvents(helpers, render) {
    const state = helpers.getState('appState');
    if (!state) return;

    // Tab switching
    const btnDoc = document.getElementById('tab-doc');
    const btnFiles = document.getElementById('tab-files');
    if (btnDoc) btnDoc.onclick = () => {
      state.activeTab = 'document';
      helpers.setState('appState', state);
      render();
    };
    if (btnFiles) btnFiles.onclick = () => {
      state.activeTab = 'files';
      helpers.setState('appState', state);
      render();
    };

    // Zoom slider
    const zoomSlider = document.getElementById('zoom-slider');
    if (zoomSlider) {
      zoomSlider.oninput = (e) => {
        const val = e.target.value;
        const viewer = document.getElementById('document-viewer');
        const display = zoomSlider.nextElementSibling;
        if (viewer) viewer.style.fontSize = `${val}%`;
        if (display) display.textContent = `${val}%`;
      };
      zoomSlider.onchange = (e) => {
        state.zoom = e.target.value;
        helpers.setState('appState', state);
      };
    }

    // File search
    const searchInput = document.getElementById('file-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#file-list-body tr');
        rows.forEach(row => {
          const path = row.cells[0].textContent.toLowerCase();
          row.style.display = path.includes(term) ? '' : 'none';
        });
      };
    }
  }

})();
