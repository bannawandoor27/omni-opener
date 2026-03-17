(function () {
  'use strict';

  /**
   * Parses a WebVTT file content into an array of cue objects.
   * Handles basic WEBVTT header, timestamps, and multi-line text.
   */
  function parseVTT(content) {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\n+/);
    const cues = [];
    let webvttFound = false;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i].trim();
      if (!block) continue;

      if (block.toUpperCase().startsWith('WEBVTT')) {
        webvttFound = true;
        continue;
      }

      // Skip NOTE or STYLE blocks for now to keep it clean
      if (block.toUpperCase().startsWith('NOTE') || block.toUpperCase().startsWith('STYLE') || block.toUpperCase().startsWith('REGION')) {
        continue;
      }

      const lines = block.split('\n');
      let timeLineIndex = -1;

      // Find the line containing the timestamp arrow
      for (let j = 0; j < lines.length; j++) {
        if (lines[j].includes('-->')) {
          timeLineIndex = j;
          break;
        }
      }

      if (timeLineIndex !== -1) {
        // ID is anything before the timestamp line
        const id = timeLineIndex > 0 ? lines.slice(0, timeLineIndex).join('\n').trim() : '';
        
        // Parse Timestamps and settings
        const timeParts = lines[timeLineIndex].split('-->');
        if (timeParts.length < 2) continue;

        const start = timeParts[0].trim();
        const endWithSettings = timeParts[1].trim();
        const endParts = endWithSettings.split(/\s+/);
        const end = endParts[0];
        const settings = endParts.slice(1).join(' ');

        // Text is everything after the timestamp line
        const text = lines.slice(timeLineIndex + 1).join('\n').trim();

        if (text) {
          cues.push({ id, start, end, settings, text });
        }
      }
    }

    if (!webvttFound && cues.length === 0) {
      throw new Error('This does not appear to be a valid WebVTT file (missing WEBVTT header or cues).');
    }

    return cues;
  }

  /**
   * Converts cues back to SRT format.
   */
  function vttToSrt(cues) {
    return cues.map((c, i) => {
      // SRT uses comma for decimals, VTT uses dot
      const start = c.start.replace('.', ',');
      const end = c.end.replace('.', ',');
      
      // Ensure HH:MM:SS,mmm format
      const fixTime = (t) => {
        const parts = t.split(':');
        if (parts.length === 2) return '00:' + t;
        return t;
      };

      return `${i + 1}\n${fixTime(start)} --> ${fixTime(end)}\n${c.text}`;
    }).join('\n\n');
  }

  /**
   * Formats file size into human-readable string.
   */
  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Escapes HTML to prevent XSS.
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Renders the UI for the parsed cues.
   */
  function renderUI(h, cues, filter = '') {
    const file = h.getState().file;
    const filteredCues = filter 
      ? cues.filter(c => c.text.toLowerCase().includes(filter.toLowerCase()) || c.id.toLowerCase().includes(filter.toLowerCase()))
      : cues;

    let html = '';

    // U1. File info bar
    html += `
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
        <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
        <span class="text-surface-300">|</span>
        <span>${formatSize(file.size)}</span>
        <span class="text-surface-300">|</span>
        <span class="text-surface-500">.vtt file</span>
      </div>
    `;

    // Search Box (Format-Specific Excellence)
    html += `
      <div class="mb-6">
        <div class="relative">
          <input type="text" id="vtt-search" placeholder="Search captions..." 
            class="w-full px-4 py-2 pl-10 bg-white border border-surface-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
            value="${escapeHtml(filter)}">
          <div class="absolute left-3 top-2.5 text-surface-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
          </div>
        </div>
      </div>
    `;

    // U10. Section header with counts
    html += `
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-surface-800">Subtitle Entries</h3>
        <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${filteredCues.length} ${filteredCues.length === 1 ? 'item' : 'items'}</span>
      </div>
    `;

    if (cues.length === 0) {
      // U5. Empty state
      html += `
        <div class="rounded-xl border border-dashed border-surface-300 p-12 text-center">
          <div class="text-4xl mb-3">📝</div>
          <h3 class="text-lg font-medium text-surface-900">No captions found</h3>
          <p class="text-surface-500">This WebVTT file appears to be empty or contains no valid cues.</p>
        </div>
      `;
    } else if (filteredCues.length === 0) {
      html += `
        <div class="p-8 text-center text-surface-500 bg-surface-50 rounded-xl border border-surface-200">
          No captions match your search "${escapeHtml(filter)}"
        </div>
      `;
    } else {
      // U9. Content cards
      html += '<div class="space-y-3">';
      
      // Pagination/Truncation for large files (B7)
      const MAX_RENDER = 500;
      const displayCues = filteredCues.slice(0, MAX_RENDER);
      
      displayCues.forEach(c => {
        const textContent = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(c.text) : escapeHtml(c.text);
        const highlightedText = filter 
          ? textContent.replace(new RegExp(`(${filter})`, 'gi'), '<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">$1</mark>')
          : textContent;

        html += `
          <div class="rounded-xl border border-surface-200 p-4 bg-white hover:border-brand-300 hover:shadow-sm transition-all group">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider font-bold text-surface-400">Time</span>
                <span class="text-xs font-mono bg-surface-100 text-surface-700 px-2 py-0.5 rounded border border-surface-200">
                  ${escapeHtml(c.start)} &rarr; ${escapeHtml(c.end)}
                </span>
              </div>
              ${c.id ? `<span class="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded">ID: ${escapeHtml(c.id)}</span>` : ''}
            </div>
            <div class="text-surface-800 whitespace-pre-wrap leading-relaxed">${highlightedText}</div>
            ${c.settings ? `<div class="mt-2 text-[10px] text-surface-400 font-mono">${escapeHtml(c.settings)}</div>` : ''}
          </div>
        `;
      });

      if (filteredCues.length > MAX_RENDER) {
        html += `
          <div class="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm text-center">
            Showing first ${MAX_RENDER} of ${filteredCues.length} entries. Use search to find specific content.
          </div>
        `;
      }
      
      html += '</div>';
    }

    h.render(html);

    // Setup live search listener
    const searchInput = document.getElementById('vtt-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        h.setState('filter', val);
        renderUI(h, cues, val);
      });
      // Keep focus after re-render
      if (filter) {
        searchInput.focus();
        searchInput.setSelectionRange(filter.length, filter.length);
      }
    }
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.vtt',
      dropLabel: 'Drop WebVTT Subtitles',
      infoHtml: 'Professional WebVTT viewer and converter. Preview captions, search content, and export to SRT format instantly.',

      onInit: function(h) {
        // B1. CDN Load Check
        if (typeof DOMPurify === 'undefined') {
          h.loadScript('https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js');
        }
      },

      actions: [
        {
          label: '📋 Copy All Text',
          id: 'copy-text',
          onClick: function(h, btn) {
            const { cues } = h.getState();
            if (!cues || cues.length === 0) return;
            const text = cues.map(c => c.text).join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download as SRT',
          id: 'dl-srt',
          onClick: function(h) {
            const { cues, file } = h.getState();
            if (!cues || cues.length === 0) return;
            const srt = vttToSrt(cues);
            const filename = file ? file.name.replace(/\.vtt$/i, '.srt') : 'subtitles.srt';
            h.download(filename, srt, 'text/plain');
          }
        },
        {
          label: '📥 Download VTT',
          id: 'dl-vtt',
          onClick: function(h) {
            const { content, file } = h.getState();
            if (!content) return;
            const filename = file ? file.name : 'subtitles.vtt';
            h.download(filename, content, 'text/vtt');
          }
        }
      ],

      onFile: function(file, content, h) {
        // U2, U6. Loading state
        h.showLoading('Parsing subtitle tracks...');
        
        // Small delay to ensure loading state is visible
        setTimeout(() => {
          try {
            const cues = parseVTT(content);
            h.setState({ cues, content, file, filter: '' });
            renderUI(h, cues);
          } catch (err) {
            // U3. Friendly error messages
            h.showError(
              'Could not open VTT file', 
              err.message || 'The file might be corrupted or using an unsupported WebVTT extension. Please check the file format.'
            );
          }
        }, 300);
      }
    });
  };
})();
