/**
 * OmniOpener — Python Wheel (.whl) Viewer
 * Uses OmniTool SDK and JSZip.
 * 
 * A Python Wheel is a ZIP archive containing a built distribution of a Python package.
 * This tool extracts metadata and lists all files within the archive.
 */
(function () {
  'use strict';

  // --- Helpers ---
  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const esc = (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const parseMetadata = (text) => {
    const results = {};
    const lines = text.split(/\r?\n/);
    let currentKey = null;

    for (let line of lines) {
      // Metadata headers end at the first empty line. Everything after is Description.
      if (line.trim() === '' && Object.keys(results).length > 0) break;

      const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1];
        const value = match[2].trim();
        if (results[currentKey]) {
          if (Array.isArray(results[currentKey])) {
            results[currentKey].push(value);
          } else {
            results[currentKey] = [results[currentKey], value];
          }
        } else {
          results[currentKey] = value;
        }
      } else if (currentKey && line.startsWith('       ')) {
        // Continuation line
        const val = line.trim();
        if (Array.isArray(results[currentKey])) {
          results[currentKey][results[currentKey].length - 1] += ' ' + val;
        } else {
          results[currentKey] += ' ' + val;
        }
      }
    }
    return results;
  };

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.whl',
      dropLabel: 'Drop a Python Wheel (.whl) here',
      infoHtml: '<strong>Python Wheels</strong> are the standard built-package format for Python. This tool extracts the <code>METADATA</code> and lists archive contents securely in your browser.',

      actions: [
        {
          label: '📋 Copy File List',
          id: 'copy-list',
          onClick: function (h) {
            const files = h.getState().files;
            if (!files || files.length === 0) return;
            const list = files.map(f => f.name).join('\n');
            h.copyToClipboard(list, h.getMountEl().querySelector('#omni-action-copy-list'));
          }
        },
        {
          label: '📄 Download METADATA',
          id: 'dl-metadata',
          onClick: function (h) {
            const meta = h.getState().rawMetadata;
            if (meta) {
              h.download('METADATA', meta, 'text/plain');
            } else {
              alert('No METADATA file found in this Wheel.');
            }
          }
        }
      ],

      onInit: function (h) {
        if (typeof JSZip === 'undefined') {
          h.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
      },

      onFile: async function (file, content, h) {
        h.showLoading('Parsing Wheel archive...');

        // B1 & B4: Ensure JSZip is loaded
        if (typeof JSZip === 'undefined') {
          let attempts = 0;
          while (typeof JSZip === 'undefined' && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
        }

        if (typeof JSZip === 'undefined') {
          h.showError('Library Load Issue', 'JSZip could not be loaded from the CDN. Please check your internet connection.');
          return;
        }

        try {
          const zip = new JSZip();
          const zipData = await zip.loadAsync(content);
          
          const files = [];
          let metadataPath = null;
          let rawMetadata = null;

          // Collect file info
          zipData.forEach((relativePath, zipEntry) => {
            files.push({
              name: relativePath,
              size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
              dir: zipEntry.dir
            });

            if (relativePath.endsWith('.dist-info/METADATA')) {
              metadataPath = relativePath;
            }
          });

          // Sort files alphabetically
          files.sort((a, b) => a.name.localeCompare(b.name));

          if (metadataPath) {
            rawMetadata = await zipData.file(metadataPath).async('string');
          }

          h.setState('files', files);
          h.setState('rawMetadata', rawMetadata);
          h.setState('fileName', file.name);
          h.setState('fileSize', file.size);
          h.setState('filter', '');

          this.renderUI(h);

        } catch (err) {
          console.error(err);
          h.showError('Invalid Wheel File', 'This file does not appear to be a valid ZIP archive or Python Wheel. ' + err.message);
        }
      },

      renderUI: function (h) {
        const state = h.getState();
        const files = state.files || [];
        const rawMetadata = state.rawMetadata;
        const metadata = rawMetadata ? parseMetadata(rawMetadata) : null;
        const filter = (state.filter || '').toLowerCase();

        const filteredFiles = files.filter(f => f.name.toLowerCase().includes(filter));

        let html = '<div class="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">';

        // U1: File Info Bar
        html += `
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${esc(state.fileName)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(state.fileSize)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.whl (Python Wheel)</span>
          </div>
        `;

        // Package Information Card
        if (metadata) {
          html += `
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-surface-800">Package Information</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">v${esc(metadata.Version || '?.?.?')}</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-xs font-medium text-surface-400 uppercase mb-1">Name</div>
                  <div class="text-surface-900 font-semibold">${esc(metadata.Name || 'Unknown')}</div>
                </div>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-xs font-medium text-surface-400 uppercase mb-1">Author</div>
                  <div class="text-surface-900 font-semibold">${esc(metadata.Author || 'N/A')}</div>
                </div>
                <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-xs font-medium text-surface-400 uppercase mb-1">License</div>
                  <div class="text-surface-900 font-semibold">${esc(metadata.License || 'N/A')}</div>
                </div>
                <div class="md:col-span-3 rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                  <div class="text-xs font-medium text-surface-400 uppercase mb-1">Summary</div>
                  <div class="text-surface-700">${esc(metadata.Summary || 'No summary provided.')}</div>
                </div>
              </div>
            </div>
          `;
        } else {
          html += `
            <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-sm flex items-start gap-3">
              <svg class="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
              <div>
                <p class="font-semibold">METADATA missing</p>
                <p class="opacity-80">This wheel doesn't seem to contain a standard .dist-info/METADATA file. Core package info could not be displayed.</p>
              </div>
            </div>
          `;
        }

        // Archive Contents with Search (Part 4)
        html += `
          <div class="space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div class="flex items-center gap-3">
                <h3 class="font-semibold text-surface-800">Archive Contents</h3>
                <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">${files.length} items</span>
              </div>
              <div class="relative min-w-[240px]">
                <input 
                  type="text" 
                  id="file-filter" 
                  placeholder="Search files..." 
                  value="${esc(state.filter)}"
                  class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                >
                <div class="absolute left-3 top-2.5 text-surface-400">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
              </div>
            </div>

            <div class="overflow-x-auto rounded-xl border border-surface-200 bg-white">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="bg-surface-50">
                    <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Path</th>
                    <th class="sticky top-0 bg-surface-50/95 backdrop-blur px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200 w-32">Size</th>
                  </tr>
                </thead>
                <tbody>
        `;

        if (filteredFiles.length === 0) {
          html += `
            <tr>
              <td colspan="2" class="px-4 py-8 text-center text-surface-400 italic">
                ${files.length === 0 ? 'Archive is empty' : 'No files matching "' + esc(state.filter) + '"'}
              </td>
            </tr>
          `;
        } else {
          // B7: Limit rendering for extremely large file lists to prevent DOM freeze
          const limit = 500;
          const displayFiles = filteredFiles.slice(0, limit);
          
          displayFiles.forEach(f => {
            html += `
              <tr class="${f.dir ? 'bg-surface-50/30' : ''} even:bg-surface-50/50 hover:bg-brand-50/50 transition-colors group">
                <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-mono text-[13px] break-all">
                  <div class="flex items-center gap-2">
                    ${f.dir 
                      ? '<svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>'
                      : '<svg class="w-4 h-4 text-surface-400 group-hover:text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>'
                    }
                    <span>${esc(f.name)}</span>
                  </div>
                </td>
                <td class="px-4 py-2 text-surface-500 border-b border-surface-100 text-right font-mono text-xs whitespace-nowrap">
                  ${f.dir ? '-' : formatSize(f.size)}
                </td>
              </tr>
            `;
          });

          if (filteredFiles.length > limit) {
            html += `
              <tr class="bg-surface-50">
                <td colspan="2" class="px-4 py-3 text-center text-surface-500 text-xs italic">
                  Showing first ${limit} of ${filteredFiles.length} files. Use search to find specific files.
                </td>
              </tr>
            `;
          }
        }

        html += `
                </tbody>
              </table>
            </div>
          </div>
        `;

        html += '</div>';

        h.render(html);

        // Bind filter event
        const input = h.getMountEl().querySelector('#file-filter');
        if (input) {
          input.addEventListener('input', (e) => {
            h.setState('filter', e.target.value);
            this.renderUI(h);
            // Refocus input since render() might reconstruct the DOM
            const newInput = h.getMountEl().querySelector('#file-filter');
            if (newInput) {
              newInput.focus();
              newInput.setSelectionRange(e.target.value.length, e.target.value.length);
            }
          });
        }
      }
    });
  };

})();
