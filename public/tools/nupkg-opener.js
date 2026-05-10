(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _currentZip = null;
    let _searchQuery = '';

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.nupkg',
      dropLabel: 'Drop a .nupkg file here',
      infoHtml: '<strong>Nuget Package (.nupkg)</strong> is a ZIP-based format used by .NET to distribute libraries. This tool extracts the package metadata (from the .nuspec file) and provides a searchable list of all included files.',

      onInit: function (h) {
        return h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      },

      onDestroy: function () {
        _currentZip = null;
      },

      onFile: function _onFile(file, content, h) {
        if (typeof JSZip === 'undefined') {
          h.showLoading('Loading JSZip...');
          setTimeout(function() { _onFile(file, content, h); }, 200);
          return;
        }

        h.showLoading('Extracting package...');
        
        const zip = new JSZip();
        zip.loadAsync(content)
          .then(async (zipContent) => {
            _currentZip = zipContent;
            await renderNupkg(file, zipContent, h);
          })
          .catch((err) => {
            h.showError('Could not open NuGet package', 'The file might be corrupted or not a valid ZIP-based .nupkg archive. Error: ' + err.message);
          });
      },

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h, btn) {
            const files = h.getState().fileList || [];
            if (files.length === 0) return;
            const text = files.map(f => f.path).sort().join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState().metadata;
            if (!meta) return;
            const text = Object.entries(meta)
              .filter(([_, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download .nuspec',
          id: 'dl-nuspec',
          onClick: function (h) {
            const specText = h.getState().specText;
            const specName = h.getState().specName || 'package.nuspec';
            if (specText) h.download(specName, specText, 'application/xml');
          }
        }
      ]
    });

    async function renderNupkg(file, zip, h, query = '') {
      let nuspecFile = null;
      const allFiles = [];

      zip.forEach((relativePath, zipEntry) => {
        allFiles.push({
          path: relativePath,
          size: zipEntry._data ? (zipEntry._data.uncompressedSize || 0) : 0,
          isDir: zipEntry.dir
        });
        if (relativePath.toLowerCase().endsWith('.nuspec') && !nuspecFile) {
          nuspecFile = zipEntry;
        }
      });

      h.setState('fileList', allFiles);

      let meta = {};
      let specText = '';
      let specName = 'package.nuspec';

      if (nuspecFile) {
        specName = nuspecFile.name.split('/').pop();
        specText = await nuspecFile.async('string');
        h.setState('specText', specText);
        h.setState('specName', specName);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(specText, 'text/xml');
        const metadata = xmlDoc.getElementsByTagName('metadata')[0];

        if (metadata) {
          const keys = ['id', 'version', 'authors', 'description', 'projectUrl', 'licenseUrl', 'tags', 'dependencies', 'owners', 'releaseNotes', 'copyright', 'summary', 'iconUrl', 'repository'];
          keys.forEach(key => {
            const el = metadata.getElementsByTagName(key)[0];
            if (el) {
              if (key === 'dependencies') {
                const groups = Array.from(el.getElementsByTagName('group'));
                if (groups.length > 0) {
                  meta[key] = groups.map(g => {
                    const tfm = g.getAttribute('targetFramework') || 'Any';
                    const d = Array.from(g.getElementsByTagName('dependency')).map(dep => 
                      `${dep.getAttribute('id')} (${dep.getAttribute('version') || '*'})`
                    ).join(', ');
                    return `[${tfm}] ${d || 'No dependencies'}`;
                  }).join(' | ');
                } else {
                  meta[key] = Array.from(el.getElementsByTagName('dependency')).map(d => 
                    `${d.getAttribute('id')} (${d.getAttribute('version') || '*'})`
                  ).join(', ');
                }
              } else if (key === 'repository') {
                meta[key] = el.getAttribute('url') || el.textContent.trim();
              } else {
                meta[key] = el.textContent.trim();
              }
            }
          });
        }
      }

      h.setState('metadata', meta);

      const filteredFiles = allFiles.filter(f => 
        !query || f.path.toLowerCase().includes(query.toLowerCase())
      ).sort((a, b) => a.path.localeCompare(b.path));

      const infoBarHtml = `
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">.nupkg (NuGet Package)</span>
        </div>
      `;

      let html = `<div class="p-4 md:p-6 max-w-5xl mx-auto">`;
      html += infoBarHtml;

      // Package Identity Card
      html += `
        <div class="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden mb-8">
          <div class="p-6 flex flex-col md:flex-row gap-6 items-start">
            <div class="w-20 h-20 bg-brand-50 rounded-2xl flex items-center justify-center text-4xl shrink-0 shadow-inner">
              ${meta.iconUrl ? `<img src="${esc(meta.iconUrl)}" class="w-full h-full rounded-2xl object-contain p-1" onerror="this.outerHTML='📦'">` : '📦'}
            </div>
            <div class="flex-grow space-y-2">
              <div class="flex flex-wrap items-center gap-3">
                <h2 class="text-2xl font-bold text-surface-900">${esc(meta.id || file.name.replace('.nupkg', ''))}</h2>
                <span class="px-2.5 py-0.5 bg-brand-100 text-brand-700 rounded-full text-sm font-semibold border border-brand-200">${esc(meta.version || '0.0.0')}</span>
              </div>
              ${meta.description ? `<p class="text-surface-600 text-sm leading-relaxed max-w-3xl">${esc(meta.description)}</p>` : ''}
              <div class="flex flex-wrap gap-4 pt-2">
                ${meta.authors ? `<div class="text-xs text-surface-500"><span class="font-semibold uppercase tracking-wider text-surface-400">Authors:</span> ${esc(meta.authors)}</div>` : ''}
                ${meta.projectUrl ? `<a href="${esc(meta.projectUrl)}" target="_blank" class="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">🔗 Project Site</a>` : ''}
                ${meta.licenseUrl ? `<a href="${esc(meta.licenseUrl)}" target="_blank" class="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">⚖️ License</a>` : ''}
                ${meta.repository ? `<div class="text-xs text-surface-500"><span class="font-semibold uppercase tracking-wider text-surface-400">Repo:</span> <span class="break-all">${esc(meta.repository)}</span></div>` : ''}
              </div>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6 bg-surface-50/50 border-t border-surface-100">
            ${meta.tags ? `<div><h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Tags</h4><div class="flex flex-wrap gap-1">${meta.tags.split(/\s+/).map(t => `<span class="px-2 py-0.5 bg-white border border-surface-200 rounded-md text-[10px] text-surface-600">${esc(t)}</span>`).join('')}</div></div>` : ''}
            ${meta.copyright ? `<div><h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Copyright</h4><p class="text-xs text-surface-600">${esc(meta.copyright)}</p></div>` : ''}
            ${meta.dependencies ? `<div class="md:col-span-2 lg:col-span-1"><h4 class="text-xs font-bold text-surface-400 uppercase tracking-widest mb-1">Dependencies</h4><p class="text-[11px] text-surface-500 leading-snug">${esc(meta.dependencies)}</p></div>` : ''}
          </div>
        </div>
      `;

      // File List Section
      html += `
        <div class="space-y-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <h3 class="text-lg font-bold text-surface-800">Package Contents</h3>
              <span class="px-2 py-0.5 bg-surface-100 text-surface-600 rounded-full text-xs font-medium">${allFiles.length} items</span>
            </div>
            <div class="relative w-full sm:w-64">
              <input type="text" id="nupkg-search" placeholder="Search files..." value="${esc(query)}" 
                class="w-full pl-9 pr-4 py-2 bg-white border border-surface-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">🔍</span>
            </div>
          </div>

          <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white">
            <div class="overflow-x-auto max-h-[500px]">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50/80 backdrop-blur-sm sticky top-0 z-10 border-b border-surface-200">
                    <th class="px-4 py-3 text-left font-semibold text-surface-700">Path</th>
                    <th class="px-4 py-3 text-right font-semibold text-surface-700 w-24">Size</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-surface-100">
                  ${filteredFiles.length > 0 ? filteredFiles.map(f => `
                    <tr class="hover:bg-brand-50/30 transition-colors group">
                      <td class="px-4 py-2.5 font-mono text-xs text-surface-600 group-hover:text-surface-900 break-all flex items-center gap-2">
                        <span class="text-lg leading-none">${f.isDir ? '📁' : getFileIcon(f.path)}</span>
                        ${esc(f.path)}
                      </td>
                      <td class="px-4 py-2.5 text-right text-surface-400 font-medium">${f.isDir ? '-' : formatSize(f.size)}</td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="2" class="px-4 py-12 text-center text-surface-400 italic">
                        No files matching your search
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      // Spec Text (Bottom)
      if (specText) {
        html += `
          <div class="mt-12 space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-surface-500 uppercase tracking-widest">Metadata Source (.nuspec)</h3>
              <button id="toggle-spec" class="text-xs text-brand-600 font-semibold hover:underline">Show XML Source</button>
            </div>
            <div id="spec-container" class="hidden rounded-2xl overflow-hidden border border-surface-200">
              <pre class="p-6 text-[11px] font-mono bg-surface-900 text-surface-100 overflow-x-auto leading-relaxed max-h-96">${esc(specText)}</pre>
            </div>
          </div>
        `;
      }

      html += `</div>`;

      h.render(html);

      // Event Listeners
      const searchInput = document.getElementById('nupkg-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(query.length, query.length);
        searchInput.addEventListener('input', (e) => {
          _searchQuery = e.target.value;
          renderNupkg(file, zip, h, _searchQuery);
        });
      }

      const toggleBtn = document.getElementById('toggle-spec');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const container = document.getElementById('spec-container');
          const isHidden = container.classList.toggle('hidden');
          toggleBtn.textContent = isHidden ? 'Show XML Source' : 'Hide XML Source';
        });
      }
    }

    function getFileIcon(path) {
      const ext = path.split('.').pop().toLowerCase();
      if (['dll', 'exe'].includes(ext)) return '⚙️';
      if (['xml', 'json', 'config', 'nuspec'].includes(ext)) return '📄';
      if (['md', 'txt'].includes(ext)) return '📝';
      if (['png', 'jpg', 'jpeg', 'ico'].includes(ext)) return '🖼️';
      if (['ps1', 'sh', 'bat'].includes(ext)) return '📜';
      return '📄';
    }

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function esc(str) {
      if (!str) return '';
      return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      }[m]));
    }
  };
})();
