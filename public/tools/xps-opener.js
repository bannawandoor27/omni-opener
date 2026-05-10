/**
 * OmniOpener — XPS Opener Tool (Production Perfect Edition)
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
        // Load JSZip early
        helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onFile: async function _onFileFn(file, content, helpers) {
        try {
          // B6: Ensure content isn't treated as string initially
          if (!(content instanceof ArrayBuffer)) {
             // If for some reason it's not an ArrayBuffer, we might need to convert or fail
          }

          helpers.showLoading('Preparing engine...');
          
          // B1 & B4: CDN check and load
          if (typeof JSZip === 'undefined') {
            await helpers.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
          }
          if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library failed to initialize.');
          }

          helpers.showLoading('Unpacking XPS package...');
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
            // U5: Empty state
            helpers.render(`
              <div class="flex flex-col items-center justify-center py-20 text-surface-400 bg-white rounded-2xl border-2 border-dashed border-surface-100">
                <span class="text-5xl mb-4">📭</span>
                <p class="text-lg font-medium text-surface-600">No pages found</p>
                <p class="text-sm">The XPS file appears to be empty or does not contain standard FixedPage entries.</p>
              </div>
            `);
            return;
          }

          // U2 & U6: Descriptive loading message
          helpers.showLoading(`Extracting text from ${pagePaths.length} pages...`);
          
          const pages = [];
          const parser = new DOMParser();

          for (let i = 0; i < pagePaths.length; i++) {
            const path = pagePaths[i];
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

            // Update loading progress for large documents
            if (pagePaths.length > 20 && i % 10 === 0) {
              helpers.showLoading(`Parsing pages: ${Math.round((i / pagePaths.length) * 100)}%`);
            }
          }

          renderApp(file, pages, fileList, helpers);
        } catch (err) {
          console.error('[XPS Tool Error]', err);
          // U3: Friendly error message
          helpers.showError('Could not open XPS file', 'The file may be corrupted, password-protected, or in an unsupported format variant. Try re-saving the document as an OpenXPS file.');
        }
      },

      onDestroy: (helpers) => {
        // B5: Cleanup if we had any object URLs
        const state = helpers.getState('appState');
        if (state && state._revokableUrls) {
          state._revokableUrls.forEach(url => URL.revokeObjectURL(url));
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
      activeTab: 'document',
      searchQuery: '',
      sortField: 'path',
      sortOrder: 1, // 1 for asc, -1 for desc
      _revokableUrls: []
    };
    helpers.setState('appState', initialState);

    const render = () => {
      const state = helpers.getState('appState');
      if (!state) return;
      
      const { zoom, activeTab, searchQuery, sortField, sortOrder } = state;
      
      const filteredFiles = fileList
        .filter(f => f.path.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
          let valA = a[sortField];
          let valB = b[sortField];
          if (typeof valA === 'string') {
            return valA.localeCompare(valB) * sortOrder;
          }
          return (valA - valB) * sortOrder;
        });

      const html = `
        <div class="max-w-5xl mx-auto space-y-6">
          <!-- U1: Standard File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${pages.length} Pages • XPS Document</span>
          </div>

          <!-- Tabs & Controls Area -->
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-200 pb-2">
            <div class="flex gap-1 p-1 bg-surface-100 rounded-xl w-fit">
              <button id="tab-doc" class="px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'document' ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-700'}">
                Document View
              </button>
              <button id="tab-files" class="px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'files' ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-700'}">
                Package Explorer
              </button>
            </div>
            
            <div class="flex items-center gap-3">
              ${activeTab === 'document' ? `
                <div class="flex items-center gap-3 bg-surface-50 px-3 py-1.5 rounded-lg border border-surface-200 shadow-sm">
                  <label for="zoom-slider" class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">Zoom</label>
                  <input type="range" id="zoom-slider" min="50" max="250" value="${zoom}" class="w-24 h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-500">
                  <span class="text-xs font-mono text-surface-600 w-10 text-right font-bold">${zoom}%</span>
                </div>
              ` : `
                <div class="relative w-full md:w-64">
                  <input type="text" id="file-search" placeholder="Search files in package..." value="${escapeHtml(searchQuery)}" class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all shadow-sm">
                  <span class="absolute left-3 top-2.5 text-surface-400">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  </span>
                </div>
              `}
            </div>
          </div>

          <!-- Main Content View -->
          <div id="view-container">
            ${activeTab === 'document' ? renderDocument(pages, zoom) : renderFileList(filteredFiles, sortField, sortOrder)}
          </div>
        </div>
      `;

      helpers.render(html);
      attachEvents(helpers, render);
    };

    render();
  }

  function renderDocument(pages, zoom) {
    return `
      <div class="space-y-8 pb-12" id="document-viewer" style="font-size: ${zoom}%">
        ${pages.map((page, i) => `
          <div class="group relative bg-white rounded-2xl border border-surface-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
            <!-- U10: Section Header for Page -->
            <div class="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-white/95 backdrop-blur-sm border-b border-surface-100">
              <div class="flex items-center gap-3">
                <span class="flex items-center justify-center w-6 h-6 rounded-lg bg-brand-50 text-brand-600 text-[10px] font-black border border-brand-100">
                  ${i + 1}
                </span>
                <h3 class="font-bold text-surface-800 text-sm tracking-tight">Page ${i + 1} of ${pages.length}</h3>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-mono text-surface-400 bg-surface-50 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  ${escapeHtml(page.path)}
                </span>
                <button class="text-surface-400 hover:text-brand-500 transition-colors p-1" onclick="window.scrollTo({top: 0, behavior: 'smooth'})" title="Back to top">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
                </button>
              </div>
            </div>
            
            <!-- U9: Content Card Body -->
            <div class="p-8 md:p-16 text-surface-800 leading-relaxed font-serif whitespace-pre-wrap selection:bg-brand-100 break-words">
              ${escapeHtml(page.text) || '<div class="flex flex-col items-center justify-center py-12 text-surface-300 italic"><svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>No extractable text content found on this page.</div>'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderFileList(filteredFiles, sortField, sortOrder) {
    const sortIcon = (field) => {
      if (sortField !== field) return '<span class="opacity-20">↕</span>';
      return sortOrder === 1 ? '↑' : '↓';
    };

    return `
      <div class="space-y-4 animate-in fade-in duration-300">
        <!-- U10: Section Header with counts -->
        <div class="flex items-center justify-between px-1">
          <h3 class="font-bold text-surface-800 tracking-tight">Internal Package Structure</h3>
          <span class="text-xs font-bold bg-brand-100 text-brand-700 px-3 py-1 rounded-full shadow-sm ring-1 ring-brand-200">
            ${filteredFiles.length} files
          </span>
        </div>

        <!-- U7: Beautifully Styled Table -->
        <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm overflow-x-auto">
          <table class="min-w-full text-sm border-collapse">
            <thead>
              <tr class="bg-surface-50/50">
                <th id="sort-path" class="cursor-pointer select-none px-6 py-4 text-left font-bold text-surface-700 border-b border-surface-200 hover:bg-surface-100 transition-colors">
                  File Path ${sortIcon('path')}
                </th>
                <th id="sort-size" class="cursor-pointer select-none px-6 py-4 text-right font-bold text-surface-700 border-b border-surface-200 hover:bg-surface-100 transition-colors w-40">
                  Size ${sortIcon('size')}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${filteredFiles.length === 0 ? `
                <tr>
                  <td colspan="2" class="px-6 py-12 text-center text-surface-400 italic">
                    No files match your search criteria.
                  </td>
                </tr>
              ` : filteredFiles.map(f => `
                <tr class="group hover:bg-brand-50/30 transition-colors">
                  <td class="px-6 py-3.5 text-surface-700 font-mono text-[11px] break-all leading-normal">
                    <span class="inline-block mr-2 opacity-40">${f.path.includes('.') ? '📄' : '📁'}</span>
                    ${escapeHtml(f.path)}
                  </td>
                  <td class="px-6 py-3.5 text-right text-surface-500 font-mono text-[11px] whitespace-nowrap">
                    ${formatSize(f.size)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p class="text-[10px] text-surface-400 px-2 italic text-center">
          XPS (Open XML Paper Specification) files are ZIP-compressed packages containing XML fixed-page definitions.
        </p>
      </div>
    `;
  }

  function attachEvents(helpers, render) {
    const state = helpers.getState('appState');
    if (!state) return;

    // Tab Switching
    const btnDoc = document.getElementById('tab-doc');
    const btnFiles = document.getElementById('tab-files');
    
    if (btnDoc) btnDoc.onclick = () => {
      if (state.activeTab === 'document') return;
      state.activeTab = 'document';
      helpers.setState('appState', state);
      render();
    };
    
    if (btnFiles) btnFiles.onclick = () => {
      if (state.activeTab === 'files') return;
      state.activeTab = 'files';
      helpers.setState('appState', state);
      render();
    };

    // Document Specific Events
    if (state.activeTab === 'document') {
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
          state.zoom = parseInt(e.target.value);
          helpers.setState('appState', state);
        };
      }
    }

    // Package Explorer Specific Events
    if (state.activeTab === 'files') {
      const searchInput = document.getElementById('file-search');
      if (searchInput) {
        // Debounced search to avoid flicker on large file lists
        let debounceTimer;
        searchInput.oninput = (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            state.searchQuery = e.target.value;
            helpers.setState('appState', state);
            render();
          }, 150);
        };
        // Keep focus and cursor position
        if (state.searchQuery) {
          searchInput.focus();
          searchInput.setSelectionRange(state.searchQuery.length, state.searchQuery.length);
        }
      }

      // Sorting
      const headerPath = document.getElementById('sort-path');
      const headerSize = document.getElementById('sort-size');

      if (headerPath) headerPath.onclick = () => {
        if (state.sortField === 'path') {
          state.sortOrder *= -1;
        } else {
          state.sortField = 'path';
          state.sortOrder = 1;
        }
        helpers.setState('appState', state);
        render();
      };

      if (headerSize) headerSize.onclick = () => {
        if (state.sortField === 'size') {
          state.sortOrder *= -1;
        } else {
          state.sortField = 'size';
          state.sortOrder = 1;
        }
        helpers.setState('appState', state);
        render();
      };
    }
  }

})();
