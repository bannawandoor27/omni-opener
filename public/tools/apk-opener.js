(function() {
  'use strict';

  /**
   * OmniOpener APK Tool
   * A production-grade browser-based APK inspector using OmniTool SDK.
   */

  const MAX_VISIBLE_ROWS = 1000;
  const LIBS = {
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
  };

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
    OmniTool.create(mountEl, toolConfig, {
      accept: '.apk',
      dropLabel: 'Drop an Android APK file to inspect',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript(LIBS.jszip);
      },
      onFile: async function(file, content, helpers) {
        // B1: Race condition check for JSZip
        if (typeof JSZip === 'undefined') {
          helpers.showLoading('Initializing decompression engine...');
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
          if (typeof JSZip === 'undefined') {
            helpers.showError('Engine Load Failed', 'Could not load decompression library. Please check your internet connection.');
            return;
          }
        }

        // U2, U6: Descriptive loading
        helpers.showLoading('Analyzing Android Package...');

        try {
          const zip = await JSZip.loadAsync(content);
          const entries = [];
          let manifestEntry = null;
          let certEntry = null;

          zip.forEach((path, entry) => {
            entries.push({
              path,
              size: entry._data.uncompressedSize || 0,
              date: entry.date,
              isDirectory: entry.dir,
              ext: path.split('.').pop().toLowerCase()
            });
            if (path === 'AndroidManifest.xml') manifestEntry = entry;
            if (path.startsWith('META-INF/') && (path.endsWith('.RSA') || path.endsWith('.DSA') || path.endsWith('.SF'))) {
              certEntry = entry;
            }
          });

          // Metadata extraction
          let packageName = 'Unknown';
          let versionName = 'Unknown';
          let permissions = [];

          if (manifestEntry) {
            try {
              const manifestBuf = await manifestEntry.async('uint8array');
              const info = heuristicAXML(manifestBuf);
              packageName = info.packageName || 'Unknown';
              versionName = info.versionName || 'Unknown';
              permissions = info.permissions || [];
            } catch (e) {
              console.warn('Manifest parsing failed', e);
            }
          }

          const state = {
            entries,
            packageName,
            versionName,
            permissions,
            filter: '',
            sortKey: 'path',
            sortOrder: 'asc'
          };

          helpers.setState(state);
          render(helpers, file, state);

        } catch (err) {
          // U3: Friendly error
          helpers.showError('Could not open APK', 'This file may be corrupted or is not a valid Android Package. ' + err.message);
        }
      },
      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-files',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (!state || !state.entries) return;
            const text = state.entries
              .map(e => `${e.path}\t${formatSize(e.size)}`)
              .join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '🛡️ View Permissions',
          id: 'view-perms',
          onClick: function(helpers) {
            const state = helpers.getState();
            if (!state.permissions || state.permissions.length === 0) {
              helpers.showError('No Permissions Found', 'Could not find or decode permissions in AndroidManifest.xml.');
              return;
            }
            
            const permsHtml = `
              <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-xl font-bold text-surface-900">Requested Permissions</h2>
                  <span class="bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-sm font-semibold">${state.permissions.length}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  ${state.permissions.map(p => `
                    <div class="p-3 bg-surface-50 border border-surface-200 rounded-lg text-sm font-mono text-surface-700 break-all">
                      ${escapeHtml(p.replace('android.permission.', ''))}
                    </div>
                  `).join('')}
                </div>
                <button id="close-modal" class="mt-6 w-full py-2 bg-surface-900 text-white rounded-lg hover:bg-surface-800 transition-colors">Close</button>
              </div>
            `;
            
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm';
            modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">${permsHtml}</div>`;
            document.body.appendChild(modal);
            modal.querySelector('#close-modal').onclick = () => modal.remove();
            modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
          }
        }
      ]
    });
  };

  function render(helpers, file, state) {
    const { entries, filter, sortKey, sortOrder, packageName, versionName } = state;

    // Filtering
    const searchTerm = filter.toLowerCase();
    let filtered = entries.filter(e => e.path.toLowerCase().includes(searchTerm));

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const displayEntries = filtered.slice(0, MAX_VISIBLE_ROWS);

    // U1: File Info Bar
    const infoBar = `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-200">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">Android Application Package</span>
      </div>
    `;

    // U9/U10: Metadata Cards
    const metaCards = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Package</h3>
            <span class="text-[10px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded font-mono">ID</span>
          </div>
          <p class="text-sm font-mono font-semibold text-surface-900 truncate" title="${escapeHtml(packageName)}">${escapeHtml(packageName)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Version</h3>
            <span class="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">VER</span>
          </div>
          <p class="text-sm font-semibold text-surface-900">${escapeHtml(versionName)}</p>
        </div>
        <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm hover:border-brand-300 transition-all">
          <div class="flex items-center justify-between mb-1">
            <h3 class="text-xs font-bold text-surface-400 uppercase tracking-wider">Storage</h3>
            <span class="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-mono">ZIP</span>
          </div>
          <p class="text-sm font-semibold text-surface-900">${entries.length.toLocaleString()} files (${formatSize(entries.reduce((a, b) => a + b.size, 0))} uncompressed)</p>
        </div>
      </div>
    `;

    // PART 4: Search/Filter Box
    const searchBar = `
      <div class="mb-4 relative">
        <input 
          type="text" 
          id="apk-filter" 
          placeholder="Search files by name or extension (e.g. classes.dex, .so, .xml)..." 
          value="${escapeHtml(filter)}"
          class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all shadow-sm"
        />
        <div class="absolute left-3 top-3 text-surface-400">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        </div>
      </div>
    `;

    // U7/U10: Table and Header
    let contentHtml = '';
    if (filtered.length === 0) {
      // U5: Empty state
      contentHtml = `
        <div class="flex flex-col items-center justify-center py-16 bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
          <div class="w-12 h-12 bg-surface-200 rounded-full flex items-center justify-center mb-4 text-surface-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </div>
          <h3 class="text-surface-900 font-semibold">No files found</h3>
          <p class="text-surface-500 text-sm mt-1">Try a different search term or check the file structure.</p>
        </div>
      `;
    } else {
      const sortIcon = (key) => {
        if (sortKey !== key) return '<span class="ml-1 text-surface-300">↕</span>';
        return sortOrder === 'asc' ? '<span class="ml-1 text-brand-500">↑</span>' : '<span class="ml-1 text-brand-500">↓</span>';
      };

      contentHtml = `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Archive Contents</h3>
          <span class="text-xs font-medium bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full">${filtered.length} entries</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50/50 backdrop-blur-sm border-b border-surface-200">
                <th class="px-4 py-3 text-left font-semibold text-surface-700 cursor-pointer hover:bg-surface-100 transition-colors" data-sort="path">
                  File Path ${sortIcon('path')}
                </th>
                <th class="px-4 py-3 text-right font-semibold text-surface-700 cursor-pointer hover:bg-surface-100 transition-colors w-24" data-sort="size">
                  Size ${sortIcon('size')}
                </th>
                <th class="px-4 py-3 text-right font-semibold text-surface-700 cursor-pointer hover:bg-surface-100 transition-colors w-32" data-sort="date">
                  Modified ${sortIcon('date')}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${displayEntries.map(e => `
                <tr class="even:bg-surface-50/30 hover:bg-brand-50 transition-colors group">
                  <td class="px-4 py-2.5 font-mono text-xs text-surface-700 break-all flex items-center gap-2">
                    <span class="text-lg opacity-70 leading-none">${getFileIcon(e.ext, e.isDirectory)}</span>
                    <span class="${e.isDirectory ? 'font-semibold text-brand-700' : ''}">${escapeHtml(e.path)}</span>
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-600 whitespace-nowrap tabular-nums font-medium">
                    ${e.isDirectory ? '-' : formatSize(e.size)}
                  </td>
                  <td class="px-4 py-2.5 text-right text-surface-400 text-xs whitespace-nowrap tabular-nums">
                    ${e.date.toLocaleDateString()}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${filtered.length > MAX_VISIBLE_ROWS ? `
          <div class="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-center text-sm font-medium">
            Showing first ${MAX_VISIBLE_ROWS} of ${filtered.length} files. Narrow results using the search box above.
          </div>
        ` : ''}
      `;
    }

    helpers.render(`
      <div class="max-w-6xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
        ${infoBar}
        ${metaCards}
        ${searchBar}
        ${contentHtml}
      </div>
    `);

    // Listeners
    const filterInput = document.getElementById('apk-filter');
    if (filterInput) {
      filterInput.addEventListener('input', (e) => {
        state.filter = e.target.value;
        render(helpers, file, state);
        // Maintain focus after re-render
        const newInput = document.getElementById('apk-filter');
        newInput.focus();
        newInput.setSelectionRange(e.target.value.length, e.target.value.length);
      });
    }

    mountEl.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (state.sortKey === key) {
          state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortOrder = 'asc';
        }
        render(helpers, file, state);
      });
    });
  }

  function getFileIcon(ext, isDir) {
    if (isDir) return '📁';
    switch (ext) {
      case 'dex': return '⚙️';
      case 'xml': return '📝';
      case 'png':
      case 'webp':
      case 'jpg': return '🖼️';
      case 'so': return '🔌';
      case 'arsc': return '📦';
      default: return '📄';
    }
  }

  /**
   * Heuristic AXML parser to extract package name and version
   * AXML is a binary format. We look for the string pool and common attributes.
   */
  function heuristicAXML(buffer) {
    const info = { packageName: '', versionName: '', permissions: [] };
    try {
      // Decode as latin1 to find text chunks
      const text = new TextDecoder('latin1').decode(buffer);
      
      // 1. Find Package Name: Usually com.something.something
      const pkgMatches = text.match(/[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}/g);
      if (pkgMatches) {
        // Filter out common false positives from the string pool
        const candidates = pkgMatches.filter(p => 
          !p.includes('android') && 
          !p.includes('schema') && 
          !p.includes('google') &&
          p.length > 5
        );
        if (candidates.length > 0) info.packageName = candidates[0];
      }

      // 2. Find Permissions: android.permission.XYZ
      const permMatches = text.match(/android\.permission\.[A-Z_0-9]+/g);
      if (permMatches) {
        info.permissions = [...new Set(permMatches)];
      }

      // 3. Find Version Name: Usually x.y.z
      const verMatches = text.match(/\d+\.\d+(\.\d+)?/g);
      if (verMatches) {
        // Take the first one that looks like a version (often near the start)
        info.versionName = verMatches[0];
      }
    } catch (e) {
      console.warn('AXML Heuristics failed', e);
    }
    return info;
  }

})();
