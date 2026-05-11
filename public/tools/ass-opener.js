(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let _parsedData = null;
    let _searchQuery = '';
    let _activeTab = 'events';
    let _searchDebounce = null;

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
     * Escapes HTML and handles highlighting
     */
    function sanitize(str, query = '', stripTags = true) {
      if (str === undefined || str === null) return '';
      let text = String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      if (stripTags) {
        text = text.replace(/\{[^}]+\}/g, ''); // Strip ASS override tags like {\pos(400,570)}
      }

      if (query && query.trim().length >= 2) {
        try {
          const q = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`(${q})`, 'gi');
          text = text.replace(regex, '<mark class="bg-brand-100 text-brand-900 px-0.5 rounded border-b border-brand-200 font-semibold">$1</mark>');
        } catch (e) { /* ignore invalid regex */ }
      }
      return text;
    }

    /**
     * Parses ASS/SSA subtitle structure
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
      infoHtml: 'Professional-grade viewer for Advanced Substation Alpha subtitles with styles and metadata support.',

      onInit: function (helpers) {
        helpers.loadCSS('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css');
        helpers.loadScript('https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
      },

      onDestroy: function() {
        _parsedData = null;
        if (_searchDebounce) clearTimeout(_searchDebounce);
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

        // Allow UI to update before parsing
        setTimeout(function() {
          try {
            _parsedData = parseASS(content);
            const events = _parsedData['Events']?.items || [];
            const styles = (_parsedData['V4+ Styles'] || _parsedData['V4 Styles'])?.items || [];
            const info = _parsedData['Script Info']?.items || [];

            if (events.length === 0 && styles.length === 0 && info.length === 0) {
              helpers.showError('Invalid Format', 'No valid subtitle sections found. Ensure this is a standard .ass or .ssa file.');
              return;
            }

            const renderUI = function() {
              const infoBar = `
                <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
                  <span class="font-semibold text-surface-800">${sanitize(file.name, '', false)}</span>
                  <span class="text-surface-300">|</span>
                  <span>${formatSize(file.size)}</span>
                  <span class="text-surface-300">|</span>
                  <span class="text-surface-500">Advanced Substation Alpha</span>
                </div>
              `;

              const tabs = `
                <div class="flex flex-wrap gap-2 mb-6 border-b border-surface-200">
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${_activeTab === 'events' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="events">
                    Events <span class="ml-1 opacity-50 text-xs">${events.length}</span>
                  </button>
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${_activeTab === 'styles' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="styles">
                    Styles <span class="ml-1 opacity-50 text-xs">${styles.length}</span>
                  </button>
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${_activeTab === 'info' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="info">
                    Metadata
                  </button>
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${_activeTab === 'source' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="source">
                    Source
                  </button>
                </div>
              `;

              let innerHtml = '';

              if (_activeTab === 'events') {
                const filtered = events.filter(ev => {
                  if (!_searchQuery) return true;
                  const q = _searchQuery.toLowerCase();
                  return (ev.Text || '').toLowerCase().includes(q) || (ev.Style || '').toLowerCase().includes(q);
                });

                innerHtml = `
                  <div class="space-y-4 animate-in fade-in duration-300">
                    <div class="relative">
                      <input type="text" id="assSearch" placeholder="Search dialogues or styles..." value="${sanitize(_searchQuery, '', false)}" class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-200 focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all text-sm shadow-sm">
                      <div class="absolute left-3.5 top-3 text-surface-400">
                        <svg class="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      </div>
                    </div>

                    <div class="flex items-center justify-between">
                      <h3 class="font-semibold text-surface-800">Dialogue Events</h3>
                      <span class="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-100">${filtered.length} entries</span>
                    </div>

                    ${filtered.length === 0 ? `
                      <div class="flex flex-col items-center justify-center py-16 px-4 text-center bg-surface-50 rounded-2xl border border-dashed border-surface-200">
                        <div class="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mb-3 text-surface-400">
                          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        </div>
                        <p class="text-surface-500 font-medium">No subtitles match your search</p>
                        <p class="text-xs text-surface-400 mt-1">Try a different keyword or clear the search.</p>
                      </div>
                    ` : `
                      <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
                        <div class="overflow-x-auto">
                          <table class="min-w-full text-sm border-separate border-spacing-0">
                            <thead>
                              <tr class="bg-surface-50">
                                <th class="sticky top-0 bg-surface-50/95 backdrop-blur z-10 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32 whitespace-nowrap">Time</th>
                                <th class="sticky top-0 bg-surface-50/95 backdrop-blur z-10 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32 whitespace-nowrap">Style</th>
                                <th class="sticky top-0 bg-surface-50/95 backdrop-blur z-10 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Dialogue</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-surface-100">
                              ${filtered.slice(0, 500).map(ev => `
                                <tr class="even:bg-surface-50/30 hover:bg-brand-50/50 transition-colors group">
                                  <td class="px-4 py-3 align-top font-mono text-[11px]">
                                    <div class="text-surface-700 font-medium">${sanitize(ev.Start)}</div>
                                    <div class="text-surface-400 opacity-60">${sanitize(ev.End)}</div>
                                  </td>
                                  <td class="px-4 py-3 align-top">
                                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-100 text-surface-600 border border-surface-200 group-hover:bg-white transition-colors">
                                      ${sanitize(ev.Style, _searchQuery)}
                                    </span>
                                  </td>
                                  <td class="px-4 py-3 text-surface-700 leading-relaxed break-words font-sans selection:bg-brand-100">${sanitize(ev.Text, _searchQuery)}</td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                        ${filtered.length > 500 ? `
                          <div class="p-4 text-center bg-surface-50 border-t border-surface-200">
                            <p class="text-xs text-surface-500 font-medium italic">Showing first 500 of ${filtered.length.toLocaleString()} entries. Use search to find specific lines.</p>
                          </div>
                        ` : ''}
                      </div>
                    `}
                  </div>
                `;
              } else if (_activeTab === 'styles') {
                innerHtml = `
                  <div class="space-y-4 animate-in fade-in duration-300">
                    <div class="flex items-center justify-between">
                      <h3 class="font-semibold text-surface-800">Visual Styles</h3>
                      <span class="text-xs font-medium bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full border border-brand-100">${styles.length} definitions</span>
                    </div>
                    <div class="overflow-hidden rounded-xl border border-surface-200 shadow-sm bg-white">
                      <div class="overflow-x-auto">
                        <table class="min-w-full text-sm border-separate border-spacing-0">
                          <thead>
                            <tr class="bg-surface-50">
                              <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                              <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Font & Size</th>
                              <th class="px-4 py-3 text-center font-semibold text-surface-700 border-b border-surface-200">Colors</th>
                              <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Margins</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-surface-100">
                            ${styles.map(s => `
                              <tr class="hover:bg-surface-50/50 transition-colors">
                                <td class="px-4 py-4 font-bold text-surface-900">${sanitize(s.Name)}</td>
                                <td class="px-4 py-4">
                                  <div class="text-surface-700 font-medium">${sanitize(s.Fontname)}</div>
                                  <div class="text-xs text-surface-400">${sanitize(s.Fontsize)}px</div>
                                </td>
                                <td class="px-4 py-4">
                                  <div class="flex items-center justify-center gap-3">
                                    ${s.PrimaryColour ? `
                                      <div class="flex flex-col items-center gap-1 group">
                                        <div class="w-7 h-7 rounded-lg border-2 border-white shadow-sm ring-1 ring-surface-200" style="background:#${s.PrimaryColour.replace(/&H[0-9A-F]{2}/, '')}"></div>
                                        <span class="text-[9px] font-bold text-surface-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity">Pri</span>
                                      </div>` : ''}
                                    ${s.SecondaryColour ? `
                                      <div class="flex flex-col items-center gap-1 group">
                                        <div class="w-7 h-7 rounded-lg border-2 border-white shadow-sm ring-1 ring-surface-200" style="background:#${s.SecondaryColour.replace(/&H[0-9A-F]{2}/, '')}"></div>
                                        <span class="text-[9px] font-bold text-surface-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity">Sec</span>
                                      </div>` : ''}
                                    ${s.OutlineColour ? `
                                      <div class="flex flex-col items-center gap-1 group">
                                        <div class="w-7 h-7 rounded-lg border-2 border-white shadow-sm ring-1 ring-surface-200" style="background:#${s.OutlineColour.replace(/&H[0-9A-F]{2}/, '')}"></div>
                                        <span class="text-[9px] font-bold text-surface-400 uppercase opacity-0 group-hover:opacity-100 transition-opacity">Out</span>
                                      </div>` : ''}
                                  </div>
                                </td>
                                <td class="px-4 py-4 text-right font-mono text-xs text-surface-500">
                                  L:${s.MarginL} R:${s.MarginR} V:${s.MarginV}
                                </td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                `;
              } else if (_activeTab === 'info') {
                innerHtml = `
                  <div class="space-y-4 animate-in fade-in duration-300">
                    <div class="flex items-center justify-between">
                      <h3 class="font-semibold text-surface-800">Script Metadata</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      ${info.map(i => `
                        <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-md transition-all bg-white group">
                          <div class="text-[10px] uppercase tracking-widest font-bold text-surface-400 mb-1 group-hover:text-brand-500 transition-colors">${sanitize(i._type)}</div>
                          <div class="text-sm text-surface-700 font-medium break-words leading-relaxed">${sanitize(i._raw)}</div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                `;
              } else if (_activeTab === 'source') {
                const limit = 60000;
                const isTruncated = content.length > limit;
                const displayContent = isTruncated ? content.slice(0, limit) : content;
                
                let highlighted = sanitize(displayContent, '', false);
                const hasHljs = typeof hljs !== 'undefined';
                
                if (hasHljs) {
                  try {
                    highlighted = hljs.highlight(displayContent, { language: 'ini' }).value;
                  } catch (e) { /* fallback to sanitized */ }
                }

                innerHtml = `
                  <div class="space-y-4 animate-in fade-in duration-300">
                    <div class="flex items-center justify-between">
                      <h3 class="font-semibold text-surface-800">Raw Source Code</h3>
                      ${hasHljs ? '<span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Syntax: ASS/INI</span>' : ''}
                    </div>
                    <div class="rounded-2xl overflow-hidden border border-surface-300 shadow-lg">
                      <pre class="p-5 text-[13px] font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[70vh] selection:bg-brand-500/30"><code>${highlighted}</code></pre>
                    </div>
                    ${isTruncated ? `
                      <div class="flex items-center justify-center p-4 bg-amber-50 rounded-xl border border-amber-200">
                        <span class="text-xs text-amber-700 font-medium italic">Showing first 60KB. Use the "Download" button to view the full ${formatSize(file.size)} file.</span>
                      </div>
                    ` : ''}
                  </div>
                `;
              }

              helpers.render(`
                <div class="p-1">
                  ${infoBar}
                  ${tabs}
                  <div id="ass-content-view">
                    ${innerHtml}
                  </div>
                </div>
              `);

              // Bind Tab Clicks
              mountEl.querySelectorAll('[data-tab]').forEach(btn => {
                btn.onclick = function() {
                  const tab = this.dataset.tab;
                  if (tab === _activeTab) return;
                  _activeTab = tab;
                  renderUI();
                };
              });

              // Bind Search with Debounce
              const searchInput = mountEl.querySelector('#assSearch');
              if (searchInput) {
                searchInput.oninput = function(e) {
                  const val = e.target.value;
                  if (_searchDebounce) clearTimeout(_searchDebounce);
                  _searchDebounce = setTimeout(() => {
                    _searchQuery = val;
                    renderUI();
                    // Refocus and cursor management
                    const freshInput = mountEl.querySelector('#assSearch');
                    if (freshInput) {
                      freshInput.focus();
                      freshInput.setSelectionRange(val.length, val.length);
                    }
                  }, 250);
                };
              }
            };

            renderUI();

          } catch (err) {
            console.error('[OmniOpener] ASS Error:', err);
            helpers.showError('Parsing Failed', 'The subtitle structure is invalid or uses an unsupported encoding. Ensure the file follows the ASS/SSA specification.');
          }
        }, 80);
      }
    });
  };
})();
