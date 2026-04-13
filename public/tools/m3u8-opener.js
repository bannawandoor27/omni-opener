/**
 * OmniOpener — Production-Ready M3U8/M3U Playlist Tool
 * Provides manifest analysis, stream filtering, and detailed segment inspection.
 */
(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.m3u8,.m3u',
      dropLabel: 'Drop an M3U8 or M3U playlist here',
      infoHtml: '<strong>Privacy:</strong> All playlist parsing is done locally in your browser.',

      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-metadata',
          onClick: function (helpers, btn) {
            const file = helpers.getFile();
            const state = helpers.getState();
            const metadata = {
              filename: file.name,
              size: file.size,
              type: 'M3U8 Playlist',
              streams: state.manifest?.playlists?.length || 0,
              segments: state.manifest?.segments?.length || 0,
              version: state.manifest?.version || 3
            };
            helpers.copyToClipboard(JSON.stringify(metadata, null, 2), btn);
          }
        },
        {
          label: '📋 Copy Raw',
          id: 'copy-raw',
          onClick: (h, btn) => h.copyToClipboard(h.getState().content, btn)
        },
        {
          label: "📥 Download", id: "download",
          id: 'download-m3u8',
          onClick: (h) => h.download(h.getFile().name, h.getState().content, 'application/vnd.apple.mpegurl')
        },
        {
          label: '📊 Export JSON',
          id: 'export-json',
          onClick: (h) => {
            const state = h.getState();
            if (state.manifest) {
              const name = h.getFile().name.replace(/\.[^.]+$/, '') + '.json';
              h.download(name, JSON.stringify(state.manifest, null, 2), 'application/json');
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/m3u8-parser@7.1.0/dist/m3u8-parser.min.js');
      },

      onFile: async function (file, content, h) {
        h.showLoading('Parsing manifest and analyzing streams...');

        try {
          await ensureLibrary(50);
          
          const parser = new window.m3u8Parser.Parser();
          parser.push(content);
          parser.end();

          const manifest = parser.manifest;
          
          if (!manifest || (Object.keys(manifest).length === 0 && content.trim().length > 0)) {
            throw new Error('Invalid manifest structure');
          }

          // U5: Empty state
          if (Object.keys(manifest).length === 0 && content.trim().length === 0) {
            h.render(`
              <div class="flex flex-col items-center justify-center p-12 text-center">
                <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
                  <svg class="w-8 h-8 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <h3 class="text-lg font-medium text-surface-900">Empty Playlist</h3>
                <p class="text-surface-500 mt-1">This M3U8 file contains no entries or configuration.</p>
              </div>
            `);
            return;
          }

          h.setState({ manifest, content, sortCol: null, sortDir: 1 });
          renderUI(h);

        } catch (err) {
          h.showError('Could not open m3u8 file', 'The file may be corrupted or use an unsupported M3U8 variant. Ensure it follows HLS specifications.');
        }
      },
      onDestroy: function() {}
    });
  };

  async function ensureLibrary(retries) {
    for (let i = 0; i < retries; i++) {
      if (window.m3u8Parser) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Library load timeout');
  }

  function renderUI(h) {
    const { manifest, content } = h.getState();
    const file = h.getFile();
    const isMaster = !!(manifest.playlists && manifest.playlists.length > 0);
    const isMedia = !!(manifest.segments && manifest.segments.length > 0);

    let html = `<div class="p-6 max-w-7xl mx-auto">`;

    // U1: File info bar
    html += `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
        <span class="font-semibold text-surface-800">${esc(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatBytes(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">${isMaster ? 'Master Playlist' : (isMedia ? 'Media Playlist' : 'Playlist')}</span>
        ${isMaster ? `<span class="text-surface-300">|</span><span class="text-brand-600 font-medium">${manifest.playlists.length} Streams</span>` : ''}
        ${isMedia ? `<span class="text-surface-300">|</span><span class="text-brand-600 font-medium">${manifest.segments.length} Segments</span>` : ''}
      </div>
    `;

    // Summary Grid
    html += `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        ${renderStat('Version', manifest.version || '3', 'indigo')}
        ${renderStat('Independent Segments', manifest.independentSegments ? 'Yes' : 'No', 'blue')}
        ${isMedia ? renderStat('Target Duration', (manifest.targetDuration || 0) + 's', 'emerald') : renderStat('Media Groups', Object.keys(manifest.mediaGroups || {}).length, 'emerald')}
        ${isMedia ? renderStat('Sequence', manifest.mediaSequence || 0, 'orange') : renderStat('I-Frame Only', manifest.iframeKeyFiles ? 'Yes' : 'No', 'orange')}
      </div>
    `;

    // Live Search
    html += `
      <div class="mb-6">
        <div class="relative">
          <input type="text" id="tool-search" placeholder="Filter by URI, Bandwidth, Resolution, or Codecs..." 
            class="w-full pl-10 pr-4 py-2.5 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-sm">
          <div class="absolute left-3 top-3 text-surface-400">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
      </div>
    `;

    if (isMaster) {
      html += renderTable(h, 'Streams', manifest.playlists, [
        { label: 'Bandwidth', key: 'bandwidth', sort: (a, b) => a.attributes.BANDWIDTH - b.attributes.BANDWIDTH },
        { label: 'Resolution', key: 'resolution', sort: (a, b) => (a.attributes.RESOLUTION?.width || 0) - (b.attributes.RESOLUTION?.width || 0) },
        { label: 'Codecs', key: 'codecs' },
        { label: 'URI', key: 'uri' }
      ], (p) => `
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors search-row">
          <td class="px-4 py-3 text-surface-900 font-medium font-mono">${formatBandwidth(p.attributes.BANDWIDTH)}</td>
          <td class="px-4 py-3 text-surface-600">${p.attributes.RESOLUTION ? `${p.attributes.RESOLUTION.width}×${p.attributes.RESOLUTION.height}` : '—'}</td>
          <td class="px-4 py-3 text-surface-500 font-mono text-xs">${esc(p.attributes.CODECS || '—')}</td>
          <td class="px-4 py-3 text-surface-400 font-mono text-xs truncate max-w-xs" title="${esc(p.uri)}">${esc(p.uri)}</td>
        </tr>
      `);
    } else if (isMedia) {
      html += renderTable(h, 'Segments', manifest.segments, [
        { label: '#', key: 'index' },
        { label: 'Duration', key: 'duration', sort: (a, b) => a.duration - b.duration },
        { label: 'URI', key: 'uri' }
      ], (s, i) => `
        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors search-row">
          <td class="px-4 py-3 text-surface-400 font-mono text-xs">${i + 1}</td>
          <td class="px-4 py-3 text-surface-900 font-medium">${s.duration.toFixed(3)}s</td>
          <td class="px-4 py-3 text-surface-400 font-mono text-xs truncate max-w-md" title="${esc(s.uri)}">${esc(s.uri)}</td>
        </tr>
      `);
    }

    // U8: Raw content
    html += `
      <div class="mt-8 space-y-3">
        <h3 class="font-semibold text-surface-800">Raw Playlist</h3>
        <div class="rounded-xl overflow-hidden border border-surface-200">
          <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[400px]">${esc(truncateContent(content, 50000))}</pre>
        </div>
        ${content.length > 50000 ? `<p class="text-xs text-surface-400 italic">Showing first 50KB. Use 'Copy Raw' for full content.</p>` : ''}
      </div>
    `;

    html += `</div>`;
    h.render(html);

    // Attach Search
    const search = document.getElementById('tool-search');
    if (search) {
      search.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('.search-row').forEach(row => {
          row.style.display = row.textContent.toLowerCase().includes(val) ? '' : 'none';
        });
      });
    }

    // Attach Sorting
    document.querySelectorAll('[data-sort]').forEach(th => {
      th.onclick = () => {
        const key = th.dataset.sort;
        let { manifest, sortCol, sortDir } = h.getState();
        if (sortCol === key) sortDir *= -1;
        else { sortCol = key; sortDir = 1; }
        
        h.setState({ sortCol, sortDir });
        
        // Sorting logic based on key
        if (isMaster) {
          const col = [
            { key: 'bandwidth', sort: (a, b) => a.attributes.BANDWIDTH - b.attributes.BANDWIDTH },
            { key: 'resolution', sort: (a, b) => (a.attributes.RESOLUTION?.width || 0) - (b.attributes.RESOLUTION?.width || 0) },
            { key: 'uri', sort: (a, b) => a.uri.localeCompare(b.uri) }
          ].find(c => c.key === key);
          if (col) manifest.playlists.sort((a, b) => col.sort(a, b) * sortDir);
        } else if (isMedia) {
          const col = [
            { key: 'duration', sort: (a, b) => a.duration - b.duration },
            { key: 'uri', sort: (a, b) => a.uri.localeCompare(b.uri) }
          ].find(c => c.key === key);
          if (col) manifest.segments.sort((a, b) => col.sort(a, b) * sortDir);
        }
        
        renderUI(h);
      };
    });
  }

  function renderStat(label, value, color) {
    const colors = {
      blue: 'bg-blue-50 text-blue-700 border-blue-100',
      indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      orange: 'bg-orange-50 text-orange-700 border-orange-100'
    };
    return `
      <div class="rounded-xl border p-4 ${colors[color] || colors.blue} transition-all shadow-sm">
        <div class="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">${label}</div>
        <div class="text-xl font-bold">${value}</div>
      </div>
    `;
  }

  function renderTable(h, title, items, cols, rowFn) {
    const { sortCol, sortDir } = h.getState();
    return `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-surface-800">${title}</h3>
          <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-medium">${items.length} items</span>
        </div>
        <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
          <table class="min-w-full text-sm">
            <thead>
              <tr>
                ${cols.map(c => `
                  <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 ${c.sort ? 'cursor-pointer hover:bg-surface-50' : ''}" 
                      ${c.sort ? `data-sort="${c.key}"` : ''}>
                    <div class="flex items-center gap-1">
                      ${c.label}
                      ${sortCol === c.key ? `<span class="text-brand-500">${sortDir === 1 ? '▲' : '▼'}</span>` : ''}
                    </div>
                  </th>
                `).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${items.map((item, i) => rowFn(item, i)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function formatBandwidth(bits) {
    if (!bits) return '—';
    if (bits >= 1000000) return (bits / 1000000).toFixed(1) + ' Mbps';
    if (bits >= 1000) return (bits / 1000).toFixed(0) + ' Kbps';
    return bits + ' bps';
  }

  function formatBytes(b) {
    if (b === 0) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  }

  function truncateContent(str, max) {
    return str.length > max ? str.slice(0, max) + '\n\n... [Content Truncated] ...' : str;
  }

  function esc(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(str).replace(/[&<>"']/g, m => map[m]);
  }

})();
