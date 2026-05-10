(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let parsedData = null;
    let searchDebounce = null;

    /**
     * Formats bytes into a human-readable string
     */
    function formatSize(bytes) {
      if (!bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Escapes HTML and removes ASS tags, with optional highlighting
     */
    function sanitize(str, query = '') {
      if (str === undefined || str === null) return '';
      let escaped = String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\{[^}]+\}/g, ''); // Strip ASS override tags like {\pos(400,570)}

      if (query && query.trim().length >= 2) {
        const q = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${q})`, 'gi');
        escaped = escaped.replace(regex, '<mark class="bg-brand-100 text-brand-900 px-0.5 rounded border-b border-brand-200">$1</mark>');
      }
      return escaped;
    }

    /**
     * Parses ASS/SSA subtitle structure into sections
     */
    function parseASS(content) {
      const sections = {};
      let currentSection = null;
      const lines = content.split(/\r?\n/);

      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';')) return;

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
              const formatLen = sections[currentSection].format.length;
              const tempParts = value.split(',');
              let parts = [];
              
              if (tempParts.length > formatLen) {
                // Handle cases where the last field (usually Text) contains commas
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

    OmniTool.create(mountEl, toolConfig, {
      accept: '.ass,.ssa',
      dropLabel: 'Drop an .ass subtitle file here',
      binary: false,
      infoHtml: '<strong>ASS Preview:</strong> Professional-grade viewer for Advanced Substation Alpha subtitles with styles and metadata support.',

      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      onDestroy: function() {
        parsedData = null;
        if (searchDebounce) clearTimeout(searchDebounce);
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
        if (!content || content.trim() === '') {
          helpers.showError('Empty File', 'This file appears to be empty or could not be read as text.');
          return;
        }

        helpers.showLoading('Parsing subtitle structure...');

        // Use setTimeout to ensure the loading state is visible before heavy parsing
        setTimeout(function() {
          try {
            parsedData = parseASS(content);
            const events = parsedData['Events']?.items || [];
            const styles = (parsedData['V4+ Styles'] || parsedData['V4 Styles'])?.items || [];
            const info = parsedData['Script Info']?.items || [];

            if (events.length === 0 && styles.length === 0 && info.length === 0) {
              helpers.showError('Invalid Format', 'No valid subtitle sections found in this file. It might not be a standard .ass/.ssa file.');
              return;
            }

            const renderView = function (activeTab = 'events', query = '') {
              const infoBar = `
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
                  <span class="font-semibold text-surface-800">${sanitize(file.name)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">.ass file</span>
                </div>
              `;

              const tabs = `
                <div class="flex flex-wrap gap-2 mb-6 border-b border-surface-200">
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${activeTab === 'events' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="events">
                    Events <span class="ml-1 opacity-50 text-xs">${events.length}</span>
                  </button>
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${activeTab === 'styles' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="styles">
                    Styles <span class="ml-1 opacity-50 text-xs">${styles.length}</span>
                  </button>
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${activeTab === 'info' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="info">
                    Metadata
                  </button>
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${activeTab === 'source' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="source">
                    Source
                  </button>
                </div>
              `;

              let contentHtml = '';

              if (activeTab === 'events') {
                const filteredEvents = events.filter(ev => {
                  if (!query) return true;
                  const q = query.toLowerCase();
                  return (ev.Text || '').toLowerCase().includes(q) || (ev.Style || '').toLowerCase().includes(q);
                });

                contentHtml = `
                  <div class="space-y-4">
                    <div class="relative">
                      <input type="text" id="assSearch" placeholder="Search events..." value="${sanitize(query)}" class="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-sm">
                      <div class="absolute left-3 top-2.5 text-surface-400">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      </div>
                    </div>
                    
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-surface-800">Subtitles</h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredEvents.length} entries</span>
                    </div>

                    ${filteredEvents.length === 0 ? `
                      <div class="flex flex-col items-center justify-center p-12 text-center text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">
                        <p>No matches found for "${sanitize(query)}".</p>
                      </div>
                    ` : `
                      <div class="overflow-x-auto rounded-xl border border-surface-200">
                        <table class="min-w-full text-sm">
                          <thead>
                            <tr class="bg-surface-50">
                              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32">Time</th>
                              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32">Style</th>
                              <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Dialogue</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-surface-100">
                            ${filteredEvents.slice(0, 1000).map(ev => `
                              <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                                <td class="px-4 py-3 text-surface-500 font-mono text-xs align-top">
                                  <div class="flex flex-col">
                                    <span class="text-surface-700">${sanitize(ev.Start)}</span>
                                    <span class="text-[10px] opacity-60">${sanitize(ev.End)}</span>
                                  </div>
                                </td>
                                <td class="px-4 py-3 align-top">
                                  <span class="inline-block px-2 py-0.5 rounded bg-surface-200 text-surface-700 text-[10px] font-bold uppercase tracking-wider">${sanitize(ev.Style, query)}</span>
                                </td>
                                <td class="px-4 py-3 text-surface-700 leading-relaxed break-words">${sanitize(ev.Text, query)}</td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                        ${filteredEvents.length > 1000 ? `
                          <div class="p-3 text-center text-xs text-surface-500 bg-surface-50 border-t border-surface-200 italic">
                            Showing first 1,000 of ${filteredEvents.length} entries. Use search to find specific lines.
                          </div>
                        ` : ''}
                      </div>
                    `}
                  </div>
                `;
              } else if (activeTab === 'styles') {
                contentHtml = `
                  <div class="space-y-4">
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-surface-800">Formatting Styles</h3>
                      <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${styles.length} items</span>
                    </div>
                    <div class="overflow-x-auto rounded-xl border border-surface-200">
                      <table class="min-w-full text-sm">
                        <thead>
                          <tr class="bg-surface-50">
                            <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                            <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Font Family</th>
                            <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Size</th>
                            <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200">Colors</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-surface-100">
                          ${styles.map(s => `
                            <tr class="hover:bg-surface-50 transition-colors">
                              <td class="px-4 py-3 font-semibold text-surface-800 border-b border-surface-100">${sanitize(s.Name)}</td>
                              <td class="px-4 py-3 text-surface-600 border-b border-surface-100">${sanitize(s.Fontname)}</td>
                              <td class="px-4 py-3 text-surface-600 border-b border-surface-100">${sanitize(s.Fontsize)} px</td>
                              <td class="px-4 py-3 border-b border-surface-100 text-center">
                                <div class="flex items-center justify-center gap-2">
                                  ${s.PrimaryColour ? `
                                    <div class="group relative">
                                      <div class="w-6 h-6 rounded border border-surface-300 shadow-sm" style="background:#${s.PrimaryColour.replace(/&H[0-9A-F]{2}/, '')}"></div>
                                      <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-surface-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Primary</span>
                                    </div>` : ''}
                                  ${s.OutlineColour || s.SecondaryColour ? `
                                    <div class="group relative">
                                      <div class="w-6 h-6 rounded border border-surface-300 shadow-sm" style="background:#${(s.OutlineColour || s.SecondaryColour).replace(/&H[0-9A-F]{2}/, '')}"></div>
                                      <span class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] bg-surface-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Outline</span>
                                    </div>` : ''}
                                </div>
                              </td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                  </div>
                `;
              } else if (activeTab === 'info') {
                contentHtml = `
                  <div class="space-y-4">
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-surface-800">Script Metadata</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      ${info.map(i => `
                        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                          <div class="text-[10px] uppercase tracking-widest font-bold text-surface-400 mb-1">${sanitize(i._type)}</div>
                          <div class="text-sm text-surface-700 font-medium break-words">${sanitize(i._raw)}</div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                `;
              } else if (activeTab === 'source') {
                const limit = 50000;
                const isTruncated = content.length > limit;
                const displayContent = isTruncated ? content.slice(0, limit) : content;
                
                let highlighted = sanitize(displayContent);
                if (typeof hljs !== 'undefined') {
                  try {
                    highlighted = hljs.highlight(displayContent, { language: 'ini' }).value;
                  } catch (e) {
                    highlighted = sanitize(displayContent);
                  }
                }

                contentHtml = `
                  <div class="space-y-4">
                    <div class="flex items-center justify-between mb-3">
                      <h3 class="font-semibold text-surface-800">Raw Source</h3>
                    </div>
                    <div class="rounded-xl overflow-hidden border border-surface-200">
                      <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[70vh]"><code>${highlighted}</code></pre>
                    </div>
                    ${isTruncated ? `
                      <div class="flex items-center justify-center p-4 bg-surface-50 rounded-xl border border-surface-200">
                        <span class="text-xs text-surface-500 italic">Showing first 50KB. Download the file to view all ${formatSize(file.size)}.</span>
                      </div>
                    ` : ''}
                  </div>
                `;
              }

              helpers.render(`
                <div class="p-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  ${infoBar}
                  ${tabs}
                  <div id="ass-view-container">
                    ${contentHtml}
                  </div>
                </div>
              `);

              // Bind events
              mountEl.querySelectorAll('[data-tab]').forEach(btn => {
                btn.onclick = function() {
                  renderView(this.dataset.tab);
                };
              });

              const searchInput = mountEl.querySelector('#assSearch');
              if (searchInput) {
                searchInput.oninput = function(e) {
                  const val = e.target.value;
                  if (searchDebounce) clearTimeout(searchDebounce);
                  searchDebounce = setTimeout(() => {
                    renderView('events', val);
                    // Refocus and set cursor to end
                    const newInp = mountEl.querySelector('#assSearch');
                    if (newInp) {
                      newInp.focus();
                      newInp.setSelectionRange(val.length, val.length);
                    }
                  }, 200);
                };
              }
            };

            renderView();

          } catch (err) {
            console.error('[ASS Tool Error]', err);
            helpers.showError('Parsing Failed', 'The .ass file could not be parsed. It may be corrupted or using an incompatible encoding.');
          }
        }, 50);
      }
    });
  };
})();
