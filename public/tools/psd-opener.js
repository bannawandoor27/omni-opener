(function() {
  'use strict';

  /**
   * OmniOpener PSD Tool
   * A production-grade browser-based PSD viewer and metadata extractor.
   */

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.psd',
      dropLabel: 'Drop a .psd file here',
      binary: true,
      onInit: function(helpers) {
        // Load PSD.js from CDN
        helpers.loadScript('https://cdn.jsdelivr.net/npm/psd@3.4.0/dist/psd.min.js');
      },
      onFile: async function(file, content, helpers) {
        // B2: Ensure we have a Uint8Array from the ArrayBuffer
        const data = new Uint8Array(content);

        // U6: Immediate loading feedback
        helpers.showLoading('Reading PSD structure...');

        // B1: Wait for library to be ready if not already
        const waitForLib = async (retries = 10) => {
          if (window.PSD) return true;
          if (retries <= 0) return false;
          await new Promise(r => setTimeout(r, 100));
          return waitForLib(retries - 1);
        };

        const libReady = await waitForLib();
        if (!libReady) {
          helpers.showError('Library Load Failed', 'The PSD processing library could not be loaded. Please check your internet connection and try again.');
          return;
        }

        // B7: Large file handling - use a small delay to let UI update
        await new Promise(r => setTimeout(r, 100));

        try {
          const psd = new window.PSD(data);
          
          // U2: Descriptive loading message
          helpers.showLoading('Parsing layers and metadata...');
          
          // B3: Heavy operation wrapped in try/catch
          const success = psd.parse();
          if (!success) throw new Error('Failed to parse PSD file.');

          const header = psd.header;
          const tree = psd.tree();
          
          const getColorMode = (mode) => {
            const modes = {
              0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 
              4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab'
            };
            return modes[mode] || `Unknown (${mode})`;
          };

          const metadata = {
            width: header.width,
            height: header.height,
            channels: header.channels,
            depth: header.depth,
            colorMode: getColorMode(header.colorMode),
            layerCount: 0
          };

          // Count layers and prepare tree data
          const layers = [];
          const processNode = (node, depth = 0) => {
            const children = node.children ? node.children() : [];
            children.forEach(child => {
              metadata.layerCount++;
              layers.push({
                name: child.name || 'Unnamed Layer',
                type: child.isFolder() ? 'folder' : 'layer',
                visible: child.visible(),
                depth: depth,
                opacity: child.layer ? child.layer.opacity : 255,
                blendMode: child.layer ? child.layer.blendMode.key : 'norm'
              });
              if (child.isFolder()) {
                processNode(child, depth + 1);
              }
            });
          };
          processNode(tree);

          helpers.setState('metadata', metadata);
          helpers.setState('fileName', file.name);

          // U2: Next stage of loading
          helpers.showLoading('Generating preview...');
          
          // B3: psd.image.toCanvas() can be slow for large files
          const canvas = psd.image.toCanvas();
          canvas.id = 'psd-preview-canvas';
          canvas.className = 'max-w-full h-auto mx-auto shadow-2xl rounded-lg border border-surface-200';
          
          // Build UI
          const html = `
            <div class="max-w-6xl mx-auto p-4 md:p-6">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.psd file</span>
                <span class="text-surface-300">|</span>
                <span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded text-xs font-medium">${metadata.width} × ${metadata.height}</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <!-- Main Preview Area -->
                <div class="lg:col-span-8 space-y-6">
                  <div class="bg-surface-100 rounded-2xl p-4 md:p-8 flex items-center justify-center min-h-[400px] border-2 border-dashed border-surface-200 overflow-hidden">
                    <div id="canvas-container" class="transition-transform duration-300 hover:scale-[1.01]"></div>
                  </div>

                  <!-- Metadata Table (U7) -->
                  <div class="overflow-x-auto rounded-xl border border-surface-200">
                    <table class="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th colspan="2" class="bg-surface-50 px-4 py-3 text-left font-bold text-surface-800 border-b border-surface-200 uppercase tracking-wider text-xs">Technical Specifications</th>
                        </tr>
                      </thead>
                      <tbody class="bg-white">
                        <tr class="hover:bg-brand-50 transition-colors">
                          <td class="px-4 py-3 text-surface-500 border-b border-surface-100 font-medium w-1/3">Dimensions</td>
                          <td class="px-4 py-3 text-surface-900 border-b border-surface-100">${metadata.width} × ${metadata.height} px</td>
                        </tr>
                        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                          <td class="px-4 py-3 text-surface-500 border-b border-surface-100 font-medium">Color Mode</td>
                          <td class="px-4 py-3 text-surface-900 border-b border-surface-100">${metadata.colorMode}</td>
                        </tr>
                        <tr class="hover:bg-brand-50 transition-colors">
                          <td class="px-4 py-3 text-surface-500 border-b border-surface-100 font-medium">Color Depth</td>
                          <td class="px-4 py-3 text-surface-900 border-b border-surface-100">${metadata.depth}-bit</td>
                        </tr>
                        <tr class="even:bg-surface-50 hover:bg-brand-50 transition-colors">
                          <td class="px-4 py-3 text-surface-500 border-b border-surface-100 font-medium">Channels</td>
                          <td class="px-4 py-3 text-surface-900 border-b border-surface-100">${metadata.channels}</td>
                        </tr>
                        <tr class="hover:bg-brand-50 transition-colors">
                          <td class="px-4 py-3 text-surface-500 font-medium">Total Layers</td>
                          <td class="px-4 py-3 text-surface-900 font-semibold">${metadata.layerCount}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Sidebar: Layer Tree -->
                <div class="lg:col-span-4 space-y-4">
                  <!-- U10: Section Header -->
                  <div class="flex items-center justify-between mb-1 px-1">
                    <h3 class="font-bold text-surface-800 text-sm uppercase tracking-widest">Layer Inspector</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2.5 py-1 rounded-full font-semibold">${metadata.layerCount} Items</span>
                  </div>

                  <div class="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden flex flex-col max-h-[700px]">
                    <div class="p-3 bg-surface-50 border-b border-surface-200">
                       <input type="text" id="layer-search" placeholder="Filter layers..." class="w-full px-3 py-2 text-sm rounded-lg border border-surface-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all" />
                    </div>
                    <div class="overflow-y-auto p-2 space-y-1 bg-surface-50/30" id="layer-list">
                      ${layers.length === 0 ? '<div class="p-8 text-center text-surface-400 text-sm italic">No layers detected in this file.</div>' : layers.map((l, i) => `
                        <div class="layer-item flex items-center gap-2 p-2 rounded-lg border border-transparent hover:border-brand-200 hover:bg-white transition-all group ${l.visible ? '' : 'opacity-40'}" 
                             data-name="${escapeHtml(l.name.toLowerCase())}"
                             style="margin-left: ${l.depth * 16}px">
                          <span class="text-lg leading-none">${l.type === 'folder' ? '📁' : '📄'}</span>
                          <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium text-surface-800 truncate">${escapeHtml(l.name)}</div>
                            <div class="text-[10px] text-surface-400 flex gap-2">
                              <span class="uppercase">${l.blendMode}</span>
                              <span>·</span>
                              <span>${Math.round((l.opacity / 255) * 100)}%</span>
                            </div>
                          </div>
                          ${l.visible ? '' : '<span class="text-[10px] font-bold text-surface-400 uppercase">Hidden</span>'}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;

          helpers.render(html);
          
          // Attach canvas
          const container = document.getElementById('canvas-container');
          if (container) container.appendChild(canvas);

          // Add search functionality (Part 4: Data/Archive excellence)
          const searchInput = document.getElementById('layer-search');
          const layerItems = document.querySelectorAll('.layer-item');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              const term = e.target.value.toLowerCase();
              layerItems.forEach(item => {
                const name = item.getAttribute('data-name');
                item.style.display = name.includes(term) ? 'flex' : 'none';
              });
            });
          }

        } catch (err) {
          console.error('[PSD Tool Error]', err);
          // U3: Friendly error message
          helpers.showError(
            'Could not process PSD', 
            'This file might be using an unsupported feature, a newer version of Photoshop, or is corrupted. ' + (err.message || '')
          );
        }
      },
      actions: [
        {
          label: '📥 Download as PNG',
          id: 'export-png',
          // U4: Action button with correct context
          onClick: function(helpers) {
            const canvas = document.getElementById('psd-preview-canvas');
            if (!canvas) return;
            
            canvas.toBlob(function(blob) {
              const fileName = helpers.getState().fileName || 'exported-image';
              const name = fileName.replace(/\.psd$/i, '') + '.png';
              helpers.download(name, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function(helpers, btn) {
            const meta = helpers.getState().metadata;
            if (!meta) return;
            
            const text = [
              `File: ${helpers.getState().fileName}`,
              `Dimensions: ${meta.width} x ${meta.height} px`,
              `Color Mode: ${meta.colorMode}`,
              `Depth: ${meta.depth}-bit`,
              `Channels: ${meta.channels}`,
              `Layers: ${meta.layerCount}`
            ].join('\n');
            
            helpers.copyToClipboard(text, btn);
          }
        }
      ],
      infoHtml: `
        <div class="flex items-center gap-2 text-surface-500">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>
          <span>Client-side Processing: Your file never leaves your browser.</span>
        </div>
      `
    });
  };
})();
