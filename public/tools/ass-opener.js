(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentSections = null;

    /**
     * Formats bytes into human readable string
     */
    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Sanitizes strings for HTML and highlights search queries
     */
    function sanitize(str, query = '') {
      if (str === undefined || str === null) return '';
      let escaped = String(str).replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
      }).replace(/\{[^}]+\}/g, ''); // Strip ASS override tags like {\pos(10,10)}

      if (query && query.trim().length > 1) {
        const q = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${q})`, 'gi');
        escaped = escaped.replace(regex, '<mark class="bg-yellow-100 text-brand-900 px-0.5 rounded border-b border-yellow-300">$1</mark>');
      }
      return escaped;
    }

    /**
     * Parses the ASS/SSA file structure into sections
     */
    function parseASS(content) {
      const sections = {};
      let currentSection = null;
      const lines = content.split(/\r?\n/);

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) return; // Skip comments and empty lines

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          currentSection = trimmed.substring(1, trimmed.length - 1);
          sections[currentSection] = { format: null, items: [] };
          return;
        }

        if (currentSection) {
          if (trimmed.startsWith('Format:')) {
            sections[currentSection].format = trimmed.replace('Format:', '').split(',').map(s => s.trim());
          } else if (trimmed.includes(':')) {
            const colonIndex = trimmed.indexOf(':');
            const type = trimmed.substring(0, colonIndex).trim();
            const value = trimmed.substring(colonIndex + 1).trim();
            
            if (sections[currentSection].format) {
              let parts = [];
              const formatLen = sections[currentSection].format.length;
              const tempParts = value.split(',');
              
              if (tempParts.length > formatLen) {
                // The last field (usually 'Text') can contain commas
                parts = tempParts.slice(0, formatLen - 1);
                parts.push(tempParts.slice(formatLen - 1).join(','));
              } else {
                parts = tempParts;
              }
              
              const item = { _type: type };
              sections[currentSection].format.forEach((key, index) => {
                item[key] = (parts[index] || '').trim();
              });
              sections[currentSection].items.push(item);
            } else {
              sections[currentSection].items.push({ _type: type, _raw: value });
            }
          }
        }
      });
      return sections;
    }

    /**
     * Renders the subtitles table
     */
    function renderSubtitles(items, query = '') {
      const filtered = items.filter(item => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (item.Text || '').toLowerCase().includes(q) || 
               (item.Start || '').toLowerCase().includes(q) ||
               (item.Style || '').toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        return `
          <div class="flex flex-col items-center justify-center p-12 text-center text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">
            <svg class="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <p>No entries match your search criteria.</p>
          </div>
        `;
      }

      const displayItems = filtered.slice(0, 500);
      const remaining = filtered.length - displayItems.length;

      return `
        <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
          <div class="overflow-x-auto overflow-y-auto max-h-[65vh]">
            <table class="min-w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr class="bg-surface-50">
                  <th class="sticky top-0 z-10 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-24">Start</th>
                  <th class="sticky top-0 z-10 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-24">End</th>
                  <th class="sticky top-0 z-10 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32">Style</th>
                  <th class="sticky top-0 z-10 bg-surface-50 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Text</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100">
                ${displayItems.map(item => `
                  <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors">
                    <td class="px-4 py-3 font-mono text-[11px] text-surface-500 whitespace-nowrap border-b border-surface-100">${sanitize(item.Start, query)}</td>
                    <td class="px-4 py-3 font-mono text-[11px] text-surface-500 whitespace-nowrap border-b border-surface-100">${sanitize(item.End, query)}</td>
                    <td class="px-4 py-3 border-b border-surface-100">
                      <div class="flex flex-col gap-1">
                        <span class="px-2 py-0.5 bg-surface-100 text-surface-600 rounded text-[10px] uppercase font-bold tracking-wider w-fit">${sanitize(item.Style, query)}</span>
                        ${item._type !== 'Dialogue' ? `<span class="text-[9px] text-orange-600 font-semibold uppercase tracking-tighter">${sanitize(item._type)}</span>` : ''}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-surface-800 leading-relaxed border-b border-surface-100">${sanitize(item.Text, query)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ${remaining > 0 ? `
            <div class="p-4 text-center text-surface-500 bg-surface-50 border-t border-surface-200 text-xs italic">
              Showing first 500 of ${filtered.length} matching lines. Use search to narrow results.
            </div>
          ` : ''}
        </div>
      `;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ass,.ssa',
      dropLabel: 'Drop an .ass subtitle file here',
      binary: false,
      infoHtml: '<strong>ASS Viewer:</strong> Professional preview for Advanced Substation Alpha subtitles.',

      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      onDestroy: function() {
        currentSections = null;
      },

      actions: [
        {
          label: '📋 Copy Source',
          id: 'copy',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getContent(), btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function (helpers) {
            const file = helpers.getFile();
            helpers.download(file ? file.name : 'subtitles.ass', helpers.getContent());
          }
        }
      ],

      onFile: function _onFileFn(file, content, helpers) {
        if (!content || content.trim().length === 0) {
          helpers.showError('Empty File', 'This subtitle file contains no data.');
          return;
        }

        helpers.showLoading('Parsing subtitle structure...');
        
        // Use a short delay to ensure UI updates before heavy parsing
        setTimeout(function() {
          try {
            currentSections = parseASS(content);
            const events = currentSections['Events']?.items || [];
            const styles = currentSections['V4+ Styles']?.items || currentSections['V4 Styles']?.items || [];
            const info = currentSections['Script Info']?.items || [];

            const renderUI = function(activeTab = 'dialogue', searchQuery = '') {
              const infoBar = `
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100 shadow-sm">
                  <span class="font-semibold text-surface-800">${sanitize(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">.ass file</span>
                </div>
              `;

              const tabItems = [
                { id: 'dialogue', label: 'Dialogue', count: events.length },
                { id: 'styles', label: 'Styles', count: styles.length },
                { id: 'info', label: 'Metadata', count: info.length },
                { id: 'raw', label: 'Raw Source' }
              ];

              const tabs = `
                <div class="flex flex-wrap gap-1 mb-6 p-1 bg-surface-100 rounded-lg w-fit border border-surface-200">
                  ${tabItems.map(tab => `
                    <button class="px-5 py-2 text-sm font-medium rounded-md transition-all ${activeTab === tab.id ? 'bg-white text-brand-600 shadow-sm' : 'text-surface-500 hover:text-surface-700'}" 
                            data-tab-id="${tab.id}">
                      ${tab.label}
                      ${tab.count !== undefined ? `<span class="ml-2 text-[10px] px-1.5 py-0.5 bg-surface-200 text-surface-600 rounded-full font-bold">${tab.count}</span>` : ''}
                    </button>
                  `).join('')}
                </div>
              `;

              let body = '';
              if (activeTab === 'dialogue') {
                body = `
                  <div class="space-y-4">
                    <div class="relative group">
                      <input type="text" id="assSearch" placeholder="Search subtitles by text, style, or timestamp..." value="${searchQuery}" 
                             class="w-full pl-11 pr-4 py-3 rounded-xl border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-sm shadow-sm group-hover:border-surface-300">
                      <div class="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      </div>
                    </div>
                    <div id="subtitlesList">
                      ${renderSubtitles(events, searchQuery)}
                    </div>
                  </div>
                `;
              } else if (activeTab === 'styles') {
                body = `
                  <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white shadow-sm">
                    <table class="min-w-full text-sm">
                      <thead>
                        <tr class="bg-surface-50">
                          <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Style Name</th>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Font</th>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Size</th>
                          <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Alignment</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-100">
                        ${styles.length > 0 ? styles.map(s => `
                          <tr class="hover:bg-surface-50/50 transition-colors">
                            <td class="px-4 py-3 font-semibold text-surface-900">${sanitize(s.Name)}</td>
                            <td class="px-4 py-3 text-surface-600">${sanitize(s.Fontname)}</td>
                            <td class="px-4 py-3 text-surface-600">${sanitize(s.Fontsize)}</td>
                            <td class="px-4 py-3 text-surface-500 italic">${sanitize(s.Alignment)}</td>
                          </tr>
                        `).join('') : '<tr><td colspan="4" class="p-8 text-center text-surface-400">No style definitions found.</td></tr>'}
                      </tbody>
                    </table>
                  </div>
                `;
              } else if (activeTab === 'info') {
                body = `
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${info.length > 0 ? info.map(i => `
                      <div class="p-4 rounded-xl border border-surface-200 bg-white hover:border-brand-300 hover:shadow-md transition-all group">
                        <div class="text-[10px] uppercase font-bold text-brand-500 mb-1.5 tracking-widest group-hover:text-brand-600 transition-colors">${sanitize(i._type)}</div>
                        <div class="text-sm text-surface-800 break-words font-medium leading-relaxed">${sanitize(i._raw)}</div>
                      </div>
                    `).join('') : '<div class="col-span-full p-12 text-center text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">No metadata found.</div>'}
                  </div>
                `;
              } else if (activeTab === 'raw') {
                const limit = 150000;
                const isTruncated = content.length > limit;
                const displayContent = isTruncated ? content.slice(0, limit) : content;
                const highlighted = (typeof hljs !== 'undefined') 
                  ? hljs.highlightAuto(displayContent).value 
                  : sanitize(displayContent);
                
                body = `
                  <div class="rounded-xl overflow-hidden border border-surface-200 shadow-xl bg-[#0d1117]">
                    <div class="bg-[#161b22] px-4 py-2 border-b border-surface-800 flex justify-between items-center">
                      <span class="text-[11px] font-mono text-surface-400 uppercase tracking-widest">Source Viewer</span>
                      <span class="text-[10px] px-2 py-0.5 bg-surface-800 text-surface-300 rounded">UTF-8</span>
                    </div>
                    <pre class="p-5 text-[13px] font-mono text-gray-100 overflow-x-auto leading-relaxed max-h-[75vh] scrollbar-thin scrollbar-thumb-gray-700"><code>${highlighted}</code></pre>
                  </div>
                  ${isTruncated ? `
                    <div class="mt-4 text-center">
                      <span class="px-4 py-1.5 bg-surface-100 text-surface-500 rounded-full text-[12px] border border-surface-200">
                        Truncated to 150KB for performance. Download the file for full source.
                      </span>
                    </div>
                  ` : ''}
                `;
              }

              helpers.render(`
                <div class="max-w-7xl mx-auto px-1 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  ${infoBar}
                  ${tabs}
                  <div id="tabContainer">
                    ${body}
                  </div>
                </div>
              `);

              // Add interactive event listeners
              mountEl.querySelectorAll('[data-tab-id]').forEach(btn => {
                btn.onclick = function() {
                  renderUI(this.dataset.tabId, searchQuery);
                };
              });

              const searchInput = mountEl.querySelector('#assSearch');
              if (searchInput) {
                searchInput.oninput = function(e) {
                  const val = e.target.value;
                  const list = mountEl.querySelector('#subtitlesList');
                  if (list) {
                    list.innerHTML = renderSubtitles(events, val);
                  }
                };
              }
            };

            renderUI();

          } catch (e) {
            console.error('[ASS Opener Error]', e);
            helpers.showError('Parsing Failed', 'The .ass file could not be parsed. Ensure it is a valid Advanced Substation Alpha file.');
          }
        }, 50);
      }
    });
  };
})();