(function () {
  'use strict';

  /**
   * OmniOpener — Flatpak Opener (Production Perfect)
   * Handles .flatpak (bundles), .flatpakref (references), and .flatpakrepo.
   */

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function parseIni(text) {
    const lines = text.split(/\r?\n/);
    const result = {};
    let currentSection = null;

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;

      const sectionMatch = line.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        result[currentSection] = result[currentSection] || {};
      } else if (currentSection) {
        const eqIdx = line.indexOf('=');
        if (eqIdx > -1) {
          const key = line.substring(0, eqIdx).trim();
          const val = line.substring(eqIdx + 1).trim();
          result[currentSection][key] = val;
        }
      }
    }
    return result;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.flatpak,.flatpakref,.flatpakrepo',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/libarchive.js@1.3.0/main.min.js');
      },
      onFile: async function (file, content, h) {
        const ext = file.name.split('.').pop().toLowerCase();
        h.setState('file', file);
        h.setState('searchQuery', '');

        if (ext === 'flatpakref' || ext === 'flatpakrepo') {
          h.showLoading('Parsing Flatpak reference...');
          try {
            const text = new TextDecoder().decode(content);
            const metadata = parseIni(text);
            if (Object.keys(metadata).length === 0) {
              return h.showError('Empty or Invalid File', 'The Flatpak reference file contains no valid sections.');
            }
            h.setState('metadata', metadata);
            h.setState('type', 'reference');
            render(h);
          } catch (err) {
            h.showError('Parse Error', 'Could not decode the reference file. Ensure it is a valid text-based Flatpak reference.');
          }
          return;
        }

        // Binary Bundle (.flatpak)
        h.showLoading('Analyzing Flatpak bundle...');
        try {
          // B1 & B4: Ensure LibArchive is ready
          if (typeof Archive === 'undefined') {
            await new Promise((resolve, reject) => {
              let attempts = 0;
              const interval = setInterval(() => {
                if (typeof Archive !== 'undefined') {
                  clearInterval(interval);
                  resolve();
                }
                if (++attempts > 50) {
                  clearInterval(interval);
                  reject(new Error('LibArchive failed to load. Please check your internet connection.'));
                }
              }, 100);
            });
          }

          const archive = await Archive.open(file);
          const entries = await archive.getFilesArray();
          h.setState('entries', entries);
          
          let metadata = null;
          const metaEntry = entries.find(e => e.path === 'metadata' || e.path === './metadata');
          
          if (metaEntry) {
            h.showLoading('Extracting metadata...');
            const blob = await metaEntry.extract();
            const text = await blob.text();
            metadata = parseIni(text);
          }

          h.setState('metadata', metadata);
          h.setState('type', metadata ? 'bundle' : 'bundle-ostree');
          render(h);
        } catch (err) {
          console.error(err);
          h.showError('Bundle Error', 'This file might be an OSTree delta bundle or a corrupted Flatpak. These formats are currently difficult to parse in-browser.');
        }
      },
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const m = h.getState().metadata;
            if (!m) return;
            h.copyToClipboard(JSON.stringify(m, null, 2), btn);
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const m = h.getState().metadata;
            if (!m) return;
            h.download('metadata.json', JSON.stringify(m, null, 2), 'application/json');
          }
        }
      ]
    });
  };

  function render(h) {
    const { file, metadata, type, entries, searchQuery = '' } = h.getState();
    const q = searchQuery.toLowerCase();

    // U1: File Info Bar
    let html = `
      <div class="max-w-5xl mx-auto p-6">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatSize(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500 uppercase text-[10px] font-bold tracking-wider">${esc(type.replace('-', ' '))}</span>
        </div>
    `;

    // Search Box
    html += `
      <div class="mb-6">
        <div class="relative">
          <input type="text" 
                 placeholder="Search metadata or files..." 
                 value="${esc(searchQuery)}"
                 class="w-full pl-10 pr-4 py-2 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                 oninput="window.OmniTool.h.setState('searchQuery', this.value); window.OmniTool.h.render()">
          <div class="absolute left-3 top-2.5 text-surface-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        </div>
      </div>
    `;

    if (metadata) {
      const filteredMetadata = {};
      let totalKeys = 0;
      Object.entries(metadata).forEach(([section, data]) => {
        const filteredSection = {};
        Object.entries(data).forEach(([k, v]) => {
          if (section.toLowerCase().includes(q) || k.toLowerCase().includes(q) || v.toLowerCase().includes(q)) {
            filteredSection[k] = v;
            totalKeys++;
          }
        });
        if (Object.keys(filteredSection).length > 0 || section.toLowerCase().includes(q)) {
          filteredMetadata[section] = filteredSection;
        }
      });

      // U10: Section Header
      html += `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Metadata Configuration</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${totalKeys} properties</span>
        </div>
        <div class="grid grid-cols-1 gap-4 mb-8">
      `;

      if (Object.keys(filteredMetadata).length === 0) {
        html += `<div class="p-8 text-center bg-surface-50 rounded-xl text-surface-400">No metadata matching "${esc(searchQuery)}"</div>`;
      } else {
        Object.entries(filteredMetadata).forEach(([section, data]) => {
          // U9: Content Cards (for sections)
          html += `
            <div class="rounded-xl border border-surface-200 overflow-hidden bg-white shadow-sm">
              <div class="px-4 py-2 bg-surface-50 border-b border-surface-200 flex justify-between items-center">
                <span class="text-xs font-bold text-surface-500 uppercase tracking-widest">${esc(section)}</span>
              </div>
              <div class="overflow-x-auto">
                <table class="min-w-full text-sm">
                  <tbody class="divide-y divide-surface-100">
                    ${Object.entries(data).map(([k, v]) => `
                      <tr class="hover:bg-brand-50/50 transition-colors">
                        <td class="px-4 py-2 text-surface-500 font-mono text-xs w-1/3 border-r border-surface-50">${esc(k)}</td>
                        <td class="px-4 py-2 text-surface-700 break-all">${esc(v)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        });
      }
      html += `</div>`;
    }

    if (entries && entries.length > 0) {
      const filteredEntries = entries.filter(e => e.path.toLowerCase().includes(q));
      
      html += `
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-surface-800">Bundle Contents</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredEntries.length} files</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50 border-b border-surface-200">
                <th class="px-4 py-3 text-left font-semibold text-surface-700">Path</th>
                <th class="px-4 py-3 text-right font-semibold text-surface-700">Size</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${filteredEntries.length === 0 ? `<tr><td colspan="2" class="p-8 text-center text-surface-400">No files matching "${esc(searchQuery)}"</td></tr>` : ''}
              ${filteredEntries.map(e => `
                <tr class="hover:bg-brand-50 transition-colors">
                  <td class="px-4 py-2 text-surface-700 font-mono text-xs">${esc(e.path)}</td>
                  <td class="px-4 py-2 text-surface-500 text-right text-xs">${formatSize(e.size)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'bundle-ostree') {
      html += `
        <div class="p-12 text-center bg-surface-50 rounded-2xl border border-dashed border-surface-200">
          <div class="text-4xl mb-4">⚓</div>
          <h3 class="text-lg font-bold text-surface-800 mb-2">OSTree Static Delta</h3>
          <p class="text-surface-500 text-sm max-w-md mx-auto">
            This bundle uses the OSTree delta format, which is optimized for deployment but difficult to explore directly in a browser. 
            Metadata might still be available in the section above if it could be extracted.
          </p>
        </div>
      `;
    }

    html += `</div>`;
    h.render(html);
    window.OmniTool.h = h; // Store h for the oninput handler
  }

})();
