(function() {
  'use strict';

  /**
   * Advanced Substation Alpha (.ass) Subtitle Tool
   * Robust parser and viewer for ASS/SSA subtitle files.
   */

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function parseASS(content) {
    const lines = content.split(/\r?\n/);
    const sections = {};
    let currentSection = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) return;

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        sections[currentSection] = [];
      } else if (currentSection) {
        sections[currentSection].push(trimmed);
      }
    });

    const info = {};
    if (sections['Script Info']) {
      sections['Script Info'].forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.substring(0, colonIdx).trim();
          const value = line.substring(colonIdx + 1).trim();
          info[key] = value;
        }
      });
    }

    const dialogues = [];
    if (sections['Events']) {
      let format = [];
      sections['Events'].forEach(line => {
        if (line.startsWith('Format:')) {
          format = line.replace('Format:', '').split(',').map(s => s.trim());
        } else if (line.startsWith('Dialogue:')) {
          const contentIdx = line.indexOf(':');
          if (contentIdx === -1) return;
          const valuesStr = line.substring(contentIdx + 1);
          const values = valuesStr.split(',');
          const entry = {};
          
          format.forEach((key, i) => {
            if (i === format.length - 1) {
              entry[key] = values.slice(i).join(',').trim();
            } else {
              entry[key] = values[i] ? values[i].trim() : '';
            }
          });
          dialogues.push(entry);
        }
      });
    }

    return { info, dialogues };
  }

  function cleanASSText(text) {
    if (!text) return '';
    return text
      .replace(/\{[^}]+\}/g, '')
      .replace(/\\[nN]/g, ' ')
      .replace(/\\h/g, ' ')
      .replace(/\\{1,2}/g, '')
      .trim();
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ass,.ssa',
      dropLabel: 'Drop an .ass subtitle file here',
      binary: false,
      onInit: function(helpers) {},
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing ASS subtitles...');
        
        setTimeout(() => {
          try {
            const { info, dialogues } = parseASS(content);
            if (!dialogues || (dialogues.length === 0 && Object.keys(info).length === 0)) {
              helpers.showError('Empty or invalid file', 'This file doesn\'t seem to contain valid ASS subtitle data.');
              return;
            }

            helpers.setState('info', info);
            helpers.setState('dialogues', dialogues);

            renderUI(file, info, dialogues, helpers);
          } catch (e) {
            helpers.showError('Could not open ASS file', 'The file may be corrupted or in an unsupported variant. Try saving it again and re-uploading.');
          }
        }, 50);
      },
      actions: [
        {
          label: '📋 Copy Clean Text',
          id: 'copy-text',
          onClick: function(helpers, btn) {
            const dialogues = helpers.getState().dialogues;
            if (!dialogues) return;
            const text = dialogues.map(d => cleanASSText(d.Text)).filter(t => t).join('\n');
            helpers.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download TXT',
          id: 'dl-txt',
          onClick: function(helpers) {
            const dialogues = helpers.getState().dialogues;
            if (!dialogues) return;
            const text = dialogues.map(d => cleanASSText(d.Text)).filter(t => t).join('\n');
            const filename = helpers.getFile().name.replace(/\.(ass|ssa)$/i, '') + '.txt';
            helpers.download(filename, text, 'text/plain');
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl-orig',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent(), 'text/plain');
          }
        }
      ]
    });

    function renderUI(file, info, dialogues, helpers, showAll = false) {
      const MAX_INITIAL_ROWS = 2000;
      const isTruncated = !showAll && dialogues.length > MAX_INITIAL_ROWS;
      const displayDialogues = isTruncated ? dialogues.slice(0, MAX_INITIAL_ROWS) : dialogues;

      const html = `
        <div class="p-6 bg-white min-h-full">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.ass file</span>
            <span class="text-surface-300">|</span>
            <span class="text-brand-600 font-medium">${dialogues.length.toLocaleString()} subtitles</span>
          </div>

          <!-- Script Info Card (U9) -->
          ${Object.keys(info).length > 0 ? `
            <div class="mb-6 rounded-xl border border-surface-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all bg-surface-50/30">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-semibold text-surface-800">Script Information</h3>
                <span class="text-xs bg-surface-200 text-surface-600 px-2 py-0.5 rounded-full">${Object.keys(info).length} properties</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-6">
                ${Object.entries(info).map(([k, v]) => `
                  <div class="flex justify-between border-b border-surface-100 py-1">
                    <span class="text-[10px] font-bold text-surface-400 uppercase tracking-tight">${escapeHtml(k)}</span>
                    <span class="text-xs text-surface-700 truncate ml-4" title="${escapeHtml(v)}">${escapeHtml(v)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- U10. Section header with search -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-surface-800">Subtitle Entries</h3>
              <span id="match-count" class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${dialogues.length.toLocaleString()} items</span>
            </div>
            <div class="relative w-full sm:w-64">
              <input type="text" id="ass-search" placeholder="Search subtitles..." 
                class="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-surface-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </span>
            </div>
          </div>

          <!-- U7. Table Wrapper -->
          <div class="overflow-x-auto rounded-xl border border-surface-200 shadow-sm bg-white">
            <table class="min-w-full text-sm" id="subtitles-table">
              <thead class="bg-surface-50/80 backdrop-blur-sm sticky top-0 z-10">
                <tr>
                  <th class="w-24 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Start</th>
                  <th class="w-24 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">End</th>
                  <th class="w-32 px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Style</th>
                  <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Text</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100" id="subtitles-body">
                ${displayDialogues.map(d => `
                  <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors group">
                    <td class="px-4 py-2 text-surface-500 font-mono text-[11px]">${escapeHtml(d.Start || '')}</td>
                    <td class="px-4 py-2 text-surface-500 font-mono text-[11px]">${escapeHtml(d.End || '')}</td>
                    <td class="px-4 py-2 text-surface-400 text-xs italic truncate max-w-[128px]" title="${escapeHtml(d.Style || '')}">${escapeHtml(d.Style || '')}</td>
                    <td class="px-4 py-2 text-surface-700 leading-relaxed break-words">${escapeHtml(cleanASSText(d.Text || ''))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- B7. Large file notice -->
          ${isTruncated ? `
            <div class="mt-4 p-4 bg-brand-50 rounded-xl border border-brand-100 text-center" id="truncation-notice">
              <p class="text-sm text-brand-700">
                Showing first <strong>${MAX_INITIAL_ROWS.toLocaleString()}</strong> of ${dialogues.length.toLocaleString()} subtitles for performance.
                <button id="show-all-btn" class="ml-2 font-bold underline hover:text-brand-900 transition-colors">Show all ${dialogues.length.toLocaleString()} entries</button>
              </p>
            </div>
          ` : ''}
        </div>
      `;

      helpers.render(html);

      // Search Logic
      const searchInput = document.getElementById('ass-search');
      const tableBody = document.getElementById('subtitles-body');
      const matchCount = document.getElementById('match-count');
      
      if (searchInput && tableBody) {
        searchInput.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase().trim();
          const rows = tableBody.querySelectorAll('tr');
          let visibleCount = 0;

          rows.forEach((row, idx) => {
            const text = row.textContent.toLowerCase();
            if (text.includes(query)) {
              row.classList.remove('hidden');
              visibleCount++;
              
              const textCell = row.cells[3];
              const originalCleanText = cleanASSText(displayDialogues[idx]?.Text || '');
              
              if (query && query.length > 1) {
                const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                textCell.innerHTML = escapeHtml(originalCleanText).replace(regex, '<mark class="bg-brand-200 text-brand-900 rounded-sm px-0.5">$1</mark>');
              } else {
                textCell.textContent = originalCleanText;
              }
            } else {
              row.classList.add('hidden');
            }
          });

          matchCount.textContent = `${visibleCount.toLocaleString()} ${visibleCount === 1 ? 'item' : 'items'}`;
        });
      }

      // Show All Logic
      const showAllBtn = document.getElementById('show-all-btn');
      if (showAllBtn) {
        showAllBtn.addEventListener('click', () => {
          helpers.showLoading(`Rendering all ${dialogues.length.toLocaleString()} entries...`);
          setTimeout(() => {
            renderUI(file, info, dialogues, helpers, true);
          }, 50);
        });
      }
    }
  };
})();
