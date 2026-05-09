(function() {
  'use strict';

  /**
   * OmniOpener APK Tool (Production-Grade)
   * Advanced Android Package inspector with manifest analysis and resource preview.
   */

  const LIBS = {
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
  };

  const MAX_PREVIEW_SIZE = 1024 * 512; // 512KB for internal text preview
  const VISIBLE_ENTRIES_LIMIT = 500;

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function(toolConfig, mountEl) {
    let _zipInstance = null;
    let _objectUrls = [];

    const cleanupUrls = () => {
      _objectUrls.forEach(url => URL.revokeObjectURL(url));
      _objectUrls = [];
    };

    OmniTool.create(mountEl, toolConfig, {
      accept: '.apk',
      dropLabel: 'Drop an Android APK to inspect structure and metadata',
      binary: true,

      onInit: function(helpers) {
        helpers.loadScript(LIBS.jszip);
      },

      onDestroy: function() {
        cleanupUrls();
        _zipInstance = null;
      },

      onFile: async function _onFile(file, content, helpers) {
        cleanupUrls();
        helpers.showLoading('Initializing decompression engine...');

        // B1: Robust library check
        if (typeof JSZip === 'undefined') {
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Library Load Failed', 'JSZip could not be loaded. Please check your connection.');
            return;
          }
        }

        helpers.showLoading('Analyzing APK structure...');

        try {
          _zipInstance = await JSZip.loadAsync(content);
          const entries = [];
          let manifestEntry = null;

          _zipInstance.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              date: entry.date,
              isDirectory: entry.dir,
              ext: path.split('.').pop().toLowerCase()
            });
            if (path === 'AndroidManifest.xml') manifestEntry = entry;
          });

          // Metadata extraction
          let pkgInfo = { packageName: 'Unknown', versionName: 'Unknown', permissions: [] };
          if (manifestEntry) {
            try {
              const manifestBuf = await manifestEntry.async('uint8array');
              pkgInfo = parseAXMLHeuristic(manifestBuf);
            } catch (e) {
              console.warn('Manifest parsing failed', e);
            }
          }

          const state = {
            entries,
            pkgInfo,
            filter: '',
            sortKey: 'path',
            sortOrder: 'asc',
            view: 'list' // 'list' or 'manifest'
          };

          helpers.setState(state);
          render(helpers, file, state);
          setupEventListeners(helpers, file);

        } catch (err) {
          helpers.showError('APK Parse Error', 'The file might be encrypted, corrupted, or not a valid APK archive.');
          console.error(err);
        }
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: (helpers, btn) => {
            const { entries } = helpers.getState();
            const text = entries.map(e => `${e.path}\t${formatSize(e.size)}`).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📑 View Permissions',
          id: 'view-perms',
          onClick: (helpers) => {
            const { pkgInfo } = helpers.getState();
            if (!pkgInfo.permissions || pkgInfo.permissions.length === 0) {
              helpers.showError('No Permissions', 'No permissions found in AndroidManifest.xml.');
              return;
            }
            showPermissionsModal(helpers, pkgInfo.permissions);
          }
        }
      ]
    });

    function setupEventListeners(helpers, file) {
      // Event delegation for better performance and less memory usage
      mountEl.onclick = async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const path = btn.dataset.path;

        if (action === 'download' && path) {
          const entry = _zipInstance.file(path);
          if (entry) {
            helpers.showLoading(`Preparing ${path.split('/').pop()}...`);
            const blob = await entry.async('blob');
            helpers.download(path.split('/').pop(), blob);
            helpers.hideLoading();
          }
        }

        if (action === 'preview' && path) {
          showPreview(helpers, path);
        }

        if (action === 'sort') {
          const key = btn.dataset.key;
          const state = helpers.getState();
          if (state.sortKey === key) {
            state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = key;
            state.sortOrder = 'asc';
          }
          helpers.setState(state);
          render(helpers, file, state);
        }
      };

      mountEl.oninput = (e) => {
        if (e.target.id === 'apk-search') {
          const state = helpers.getState();
          state.filter = e.target.value;
          helpers.setState(state);
          render(helpers, file, state);
          // Restore focus
          const input = document.getElementById('apk-search');
          if (input) {
            input.focus();
            input.setSelectionRange(state.filter.length, state.filter.length);
          }
        }
      };
    }

    async function showPreview(helpers, path) {
      const entry = _zipInstance.file(path);
      if (!entry) return;

      const ext = path.split('.').pop().toLowerCase();
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
      
      helpers.showLoading('Loading preview...');
      
      try {
        let contentHtml = '';
        if (isImage) {
          const blob = await entry.async('blob');
          const url = URL.createObjectURL(blob);
          _objectUrls.push(url);
          contentHtml = `<div class="flex justify-center p-8 bg-surface-100 rounded-xl"><img src="${url}" class="max-w-full max-h-[60vh] shadow-lg rounded" /></div>`;
        } else if (entry._data.uncompressedSize > MAX_PREVIEW_SIZE) {
          contentHtml = `<div class="p-8 text-center text-surface-500">File is too large to preview (${formatSize(entry._data.uncompressedSize)})</div>`;
        } else {
          const text = await entry.async('string');
          contentHtml = `
            <div class="rounded-xl overflow-hidden border border-surface-200">
              <pre class="p-4 text-xs font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed">${escapeHtml(text)}</pre>
            </div>
          `;
        }

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200';
        modal.innerHTML = `
          <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50">
              <h3 class="font-bold text-surface-900 truncate mr-4">${escapeHtml(path)}</h3>
              <button class="close-modal p-2 hover:bg-surface-200 rounded-full transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div class="p-6 overflow-y-auto flex-1">
              ${contentHtml}
            </div>
            <div class="px-6 py-4 bg-surface-50 border-t border-surface-100 flex justify-end">
              <button class="close-modal px-6 py-2 bg-surface-900 text-white rounded-lg font-medium hover:bg-surface-800 transition-colors">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        
        const close = () => {
          modal.classList.add('fade-out');
          setTimeout(() => modal.remove(), 200);
        };
        modal.querySelectorAll('.close-modal').forEach(b => b.onclick = close);
        modal.onclick = (e) => { if (e.target === modal) close(); };
      } catch (e) {
        helpers.showError('Preview Failed', 'Could not preview this file type.');
      } finally {
        helpers.hideLoading();
      }
    }

    function showPermissionsModal(helpers, permissions) {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
          <div class="px-6 py-4 border-b border-surface-100 flex items-center justify-between bg-surface-50">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-surface-900">Requested Permissions</h3>
              <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-bold">${permissions.length}</span>
            </div>
            <button class="close-modal p-2 hover:bg-surface-200 rounded-full transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <div class="p-6 overflow-y-auto grid grid-cols-1 gap-2">
            ${permissions.sort().map(p => `
              <div class="flex items-start gap-3 p-3 bg-surface-50 border border-surface-100 rounded-xl hover:border-brand-200 transition-colors group">
                <div class="mt-1 text-brand-500">
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 4.908-3.333 9.277-8 10.125a9.759 9.759 0 01-8-10.125c0-.681.056-1.351.166-2.001zm9.497 3.03a.75.75 0 10-1.326-.708l-3.246 6.088-1.54-1.54a.75.75 0 10-1.061 1.061l2.071 2.07a.75.75 0 001.258-.22l3.844-7.251z" clip-rule="evenodd" /></svg>
                </div>
                <div class="text-sm font-mono text-surface-700 break-all">
                  <span class="text-surface-400">android.permission.</span><span class="font-bold text-surface-900">${escapeHtml(p.replace('android.permission.', ''))}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="px-6 py-4 bg-surface-50 border-t border-surface-100 flex justify-end">
            <button class="close-modal px-6 py-2 bg-surface-900 text-white rounded-lg font-medium hover:bg-surface-800 transition-colors">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.querySelectorAll('.close-modal').forEach(b => b.onclick = close);
      modal.onclick = (e) => { if (e.target === modal) close(); };
    }

    function render(helpers, file, state) {
      const { entries, pkgInfo, filter, sortKey, sortOrder } = state;

      // Filter
      const search = filter.toLowerCase();
      let filtered = entries.filter(e => e.path.toLowerCase().includes(search));

      // Sort
      filtered.sort((a, b) => {
        let va = a[sortKey], vb = b[sortKey];
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return sortOrder === 'asc' ? -1 : 1;
        if (va > vb) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });

      const displayList = filtered.slice(0, VISIBLE_ENTRIES_LIMIT);

      // UI Components
      const infoBar = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">Android Application Package</span>
        </div>
      `;

      const statsCards = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="rounded-2xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all group">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Package Identity</span>
              <div class="p-1.5 bg-brand-50 text-brand-600 rounded-lg group-hover:scale-110 transition-transform">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
              </div>
            </div>
            <p class="text-sm font-mono font-bold text-surface-900 truncate" title="${escapeHtml(pkgInfo.packageName)}">${escapeHtml(pkgInfo.packageName)}</p>
          </div>
          <div class="rounded-2xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all group">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Version</span>
              <div class="p-1.5 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
              </div>
            </div>
            <p class="text-sm font-bold text-surface-900">${escapeHtml(pkgInfo.versionName)}</p>
          </div>
          <div class="rounded-2xl border border-surface-200 p-5 bg-white shadow-sm hover:border-brand-300 transition-all group">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Architecture</span>
              <div class="p-1.5 bg-amber-50 text-amber-600 rounded-lg group-hover:scale-110 transition-transform">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              </div>
            </div>
            <p class="text-sm font-bold text-surface-900">${entries.filter(e => e.path.startsWith('lib/')).length > 0 ? 'Native (JNI)' : 'Pure Java/Kotlin'}</p>
          </div>
        </div>
      `;

      const searchBar = `
        <div class="mb-4 relative">
          <input 
            type="text" 
            id="apk-search" 
            placeholder="Search filenames, paths, or extensions..." 
            value="${escapeHtml(filter)}"
            class="w-full pl-11 pr-4 py-3 bg-white border border-surface-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all shadow-sm"
          />
          <div class="absolute left-4 top-3.5 text-surface-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        </div>
      `;

      let tableHtml = '';
      if (filtered.length === 0) {
        tableHtml = `
          <div class="py-20 text-center bg-surface-50 rounded-3xl border-2 border-dashed border-surface-200">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-200 text-surface-400 mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
            </div>
            <h3 class="text-surface-900 font-bold">No matches found</h3>
            <p class="text-surface-500 text-sm">No files in this APK match your current search.</p>
          </div>
        `;
      } else {
        const sortIndicator = (key) => sortKey === key ? (sortOrder === 'asc' ? '↑' : '↓') : '';
        
        tableHtml = `
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-bold text-surface-800 flex items-center gap-2">
              Archive Entries
              <span class="text-xs font-normal text-surface-400">(${filtered.length} total)</span>
            </h3>
          </div>
          <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="bg-surface-50/80 border-b border-surface-200">
                  <th class="px-5 py-3.5 text-left font-bold text-surface-600 cursor-pointer hover:bg-surface-100 transition-colors" data-action="sort" data-key="path">
                    Path ${sortIndicator('path')}
                  </th>
                  <th class="px-5 py-3.5 text-right font-bold text-surface-600 cursor-pointer hover:bg-surface-100 transition-colors w-32" data-action="sort" data-key="size">
                    Size ${sortIndicator('size')}
                  </th>
                  <th class="px-5 py-3.5 text-right font-bold text-surface-600 w-28">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${displayList.map(e => `
                  <tr class="hover:bg-brand-50/50 transition-colors group">
                    <td class="px-5 py-3 font-mono text-[11px] text-surface-700 break-all">
                      <div class="flex items-center gap-3">
                        <span class="text-lg leading-none">${getFileIcon(e.ext, e.isDirectory)}</span>
                        <span class="${e.isDirectory ? 'font-bold text-brand-700' : 'text-surface-600'}">${escapeHtml(e.path)}</span>
                      </div>
                    </td>
                    <td class="px-5 py-3 text-right text-surface-500 tabular-nums whitespace-nowrap">
                      ${e.isDirectory ? '-' : formatSize(e.size)}
                    </td>
                    <td class="px-5 py-3 text-right whitespace-nowrap">
                      ${!e.isDirectory ? `
                        <div class="flex items-center justify-end gap-2">
                          ${canPreview(e.ext) ? `
                            <button data-action="preview" data-path="${escapeHtml(e.path)}" class="p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all" title="Preview Content">
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                            </button>
                          ` : ''}
                          <button data-action="download" data-path="${escapeHtml(e.path)}" class="p-1.5 text-surface-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-all" title="Download File">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                          </button>
                        </div>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${filtered.length > VISIBLE_ENTRIES_LIMIT ? `
            <div class="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 text-amber-800 text-center text-xs font-medium">
              Showing first ${VISIBLE_ENTRIES_LIMIT} items. Use search to find specific files.
            </div>
          ` : ''}
        `;
      }

      helpers.render(`
        <div class="max-w-6xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          ${infoBar}
          ${statsCards}
          ${searchBar}
          ${tableHtml}
        </div>
      `);
    }

    function getFileIcon(ext, isDir) {
      if (isDir) return '📁';
      const icons = {
        dex: '⚙️', xml: '📜', png: '🖼️', webp: '🖼️', jpg: '🖼️', 
        so: '🔌', arsc: '📦', txt: '📄', json: 'JS', properties: '⚙️'
      };
      return icons[ext] || '📄';
    }

    function canPreview(ext) {
      return ['txt', 'xml', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'properties', 'mf'].includes(ext);
    }

    /**
     * Minimal AXML string pool extractor for heuristics
     */
    function parseAXMLHeuristic(buffer) {
      const info = { packageName: 'Unknown', versionName: 'Unknown', permissions: [] };
      try {
        const text = new TextDecoder('latin1').decode(buffer);
        
        // Match package names: group of lowercase alphanum separated by dots
        const pkgMatches = text.match(/[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}/g);
        if (pkgMatches) {
          const candidates = pkgMatches.filter(p => 
            !p.includes('android') && !p.includes('schema') && !p.includes('google') && p.length > 5
          );
          if (candidates.length > 0) info.packageName = candidates[0];
        }

        // Match permissions
        const permMatches = text.match(/android\.permission\.[A-Z_0-9]+/g);
        if (permMatches) info.permissions = [...new Set(permMatches)];

        // Match versions
        const verMatches = text.match(/\d+\.\d+(\.\d+)?/g);
        if (verMatches) info.versionName = verMatches[0];

      } catch (e) {
        console.warn('AXML decode failed', e);
      }
      return info;
    }
  };

})();
