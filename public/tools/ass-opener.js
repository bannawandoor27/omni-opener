(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let currentSections = null;

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
     * Escapes HTML to prevent XSS and optionally highlights search terms
     */
    function sanitize(str, query = '') {
      if (str === undefined || str === null) return '';
      let escaped = String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\{[^}]+\}/g, ''); // Strip ASS override tags

      if (query && query.trim().length > 1) {
        const q = query.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${q})`, 'gi');
        escaped = escaped.replace(regex, '<mark class="bg-brand-100 text-brand-900 px-0.5 rounded border-b border-brand-200">$1</mark>');
      }
      return escaped;
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

    /**
     * Renders the subtitles dialogue table
     */
    function renderSubtitlesTable(items, query = '') {
      const filtered = items.filter(item => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (item.Text || '').toLowerCase().includes(q) || 
               (item.Style || '').toLowerCase().includes(q) ||
               (item.Start || '').toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        return `
          <div class="flex flex-col items-center justify-center p-12 text-center text-surface-400 bg-surface-50 rounded-xl border border-dashed border-surface-200">
            <p>No subtitle entries found matching "${sanitize(query)}".</p>
          </div>
        `;
      }

      const limit = 500;
      const displayItems = filtered.slice(0, limit);

      return `
        <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="bg-surface-50">
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-28">Time</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 w-32">Style</th>
                <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Text</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-surface-100">
              ${displayItems.map(item => `
                <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                  <td class="px-4 py-2 text-surface-500 font-mono text-[11px] border-b border-surface-100">
                    <div class="flex flex-col">
                      <span>${sanitize(item.Start, query)}</span>
                      <span class="opacity-50">${sanitize(item.End, query)}</span>
                    </div>
                  </td>
                  <td class="px-4 py-2 border-b border-surface-100">
                    <span class="inline-block px-2 py-0.5 rounded bg-surface-100 text-surface-600 text-[10px] font-bold uppercase tracking-wider">${sanitize(item.Style, query)}</span>
                  </td>
                  <td class="px-4 py-2 text-surface-700 border-b border-surface-100 leading-relaxed">${sanitize(item.Text, query)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${filtered.length > limit ? `
            <div class="p-3 text-center text-xs text-surface-500 bg-surface-50 border-t border-surface-200 italic">
              Showing first ${limit} of ${filtered.length} entries.
            </div>
          ` : ''}
        </div>
      `;
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
        if (!content || content.trim() === '') {
          helpers.showError('Empty File', 'This file appears to be empty.');
          return;
        }

        helpers.showLoading('Parsing subtitle structure...');

        setTimeout(function() {
          try {
            currentSections = parseASS(content);
            const events = currentSections['Events']?.items || [];
            const styles = currentSections['V4+ Styles']?.items || currentSections['V4 Styles']?.items || [];
            const info = currentSections['Script Info']?.items || [];

            const renderUI = function (activeTab = 'dialogue', searchQuery = '') {
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
                  <button class="px-4 py-2 -mb-px text-sm font-medium transition-colors border-b-2 ${activeTab === 'dialogue' ? 'border-brand-500 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}" data-tab="dialogue">
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
              if (activeTab === 'dialogue') {
                contentHtml = `
                  <div class="space-y-4">
                    <div class="relative">
                      <input type="text" id="assSearch" placeholder="Filter subtitles..." value="${searchQuery}" class="w-full pl-10 pr-4 py-2 rounded-lg border border-surface-200 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all text-sm">
                      <div class="absolute left-3 top-2.5 text-surface-400">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                      </div>
                    </div>
                    <div id="subtitlesList">
                      ${renderSubtitlesTable(events, searchQuery)}
                    </div>
                  </div>
                `;
              } else if (activeTab === 'styles') {
                contentHtml = `
                  <div class="overflow-x-auto rounded-xl border border-surface-200">
                    <table class="min-w-full text-sm">
                      <thead>
                        <tr class="bg-surface-50">
                          <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Name</th>
                          <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Font</th>
                          <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Size</th>
                          <th class="sticky top-0 bg-white/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200 text-right">Colors</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-100">
                        ${styles.map(s => `
                          <tr class="hover:bg-surface-50 transition-colors">
                            <td class="px-4 py-2 font-medium text-surface-800 border-b border-surface-100">${sanitize(s.Name)}</td>
                            <td class="px-4 py-2 text-surface-600 border-b border-surface-100">${sanitize(s.Fontname)}</td>
                            <td class="px-4 py-2 text-surface-600 border-b border-surface-100">${sanitize(s.Fontsize)}</td>
                            <td class="px-4 py-2 border-b border-surface-100 text-right space-x-1">
                              ${s.PrimaryColour ? `<span class="inline-block w-3 h-3 rounded-full border border-surface-200" style="background:#${s.PrimaryColour.substring(2)}" title="Primary"></span>` : ''}
                              ${s.SecondaryColour ? `<span class="inline-block w-3 h-3 rounded-full border border-surface-200" style="background:#${s.SecondaryColour.substring(2)}" title="Secondary"></span>` : ''}
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                `;
              } else if (activeTab === 'info') {
                contentHtml = `
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${info.map(i => `
                      <div class="rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all">
                        <div class="text-[10px] uppercase tracking-widest font-bold text-surface-400 mb-1">${sanitize(i._type)}</div>
                        <div class="text-sm text-surface-700 font-medium break-words">${sanitize(i._raw)}</div>
                      </div>
                    `).join('')}
                  </div>
                `;
              } else if (activeTab === 'source') {
                const limit = 100000;
                const isTruncated = content.length > limit;
                const displayContent = isTruncated ? content.slice(0, limit) : content;
                const highlighted = (typeof hljs !== 'undefined') 
                  ? hljs.highlightAuto(displayContent).value 
                  : sanitize(displayContent);

                contentHtml = `
                  <div class="rounded-xl overflow-hidden border border-surface-200">
                    <pre class="p-4 text-sm font-mono bg-gray-950 text-gray-100 overflow-x-auto leading-relaxed max-h-[70vh]"><code>${highlighted}</code></pre>
                  </div>
                  ${isTruncated ? `<div class="mt-2 text-center text-xs text-surface-400 italic">Source truncated to 100KB. Download for full content.</div>` : ''}
                `;
              }

              helpers.render(`
                <div class="p-1 animate-in fade-in duration-300">
                  ${infoBar}
                  ${tabs}
                  <div id="ass-content-area">
                    ${contentHtml}
                  </div>
                </div>
              `);

              // Event listeners
              mountEl.querySelectorAll('[data-tab]').forEach(btn => {
                btn.onclick = function() { renderUI(this.dataset.tab, searchQuery); };
              });

              const searchInput = mountEl.querySelector('#assSearch');
              if (searchInput) {
                searchInput.oninput = function(e) {
                  const val = e.target.value;
                  const listArea = mountEl.querySelector('#subtitlesList');
                  if (listArea) {
                    listArea.innerHTML = renderSubtitlesTable(events, val);
                  }
                };
              }
            };

            renderUI();

          } catch (err) {
            console.error(err);
            helpers.showError('Could not open .ass file', 'The file format may be invalid or corrupted.');
          }
        }, 10);
      }
    });
  };
})();