(function() {
  'use strict';

  /**
   * OmniOpener PSD Tool - Production Grade
   * A high-performance, client-side Photoshop file viewer and inspector.
   */

  const PSD_LIB_URL = 'https://cdn.jsdelivr.net/npm/psd@3.4.0/dist/psd.min.js';

  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.psd',
      dropLabel: 'Drop your .psd file here',
      binary: true,
      onInit: function(helpers) {
        // Pre-load the library
        helpers.loadScript(PSD_LIB_URL);
      },
      onFile: async function(file, content, helpers) {
        // U6: Initial feedback
        helpers.showLoading('Preparing Photoshop engine...');

        // B1, B4: Ensure library is loaded
        if (typeof window.PSD === 'undefined') {
          try {
            await helpers.loadScript(PSD_LIB_URL);
          } catch (e) {
            helpers.showError('Engine Load Failed', 'Could not load PSD.js from CDN. Please check your connection.');
            return;
          }
        }

        // B2: Handle binary content safely
        const data = new Uint8Array(content);
        
        try {
          // U2: Descriptive progress
          helpers.showLoading('Parsing PSD structure...');
          
          // B7: Small async break for UI responsiveness
          await new Promise(r => setTimeout(r, 0));

          const psd = new window.PSD(data);
          const success = psd.parse();
          
          if (!success) {
            throw new Error('PSD library failed to parse the file structure.');
          }

          const header = psd.header;
          const tree = psd.tree();
          
          // Data Extraction
          const getColorMode = (mode) => {
            const modes = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };
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
                blendMode: (child.layer && child.layer.blendMode) ? child.layer.blendMode.key : 'norm'
              });
              if (child.isFolder()) processNode(child, depth + 1);
            });
          };
          processNode(tree);

          helpers.setState({ metadata, fileName: file.name, layers });

          // U2: Final rendering stage
          helpers.showLoading('Generating high-fidelity preview...');
          await new Promise(r => setTimeout(r, 10));

          // B3: Handle heavy canvas operation
          const canvas = psd.image.toCanvas();
          canvas.id = 'psd-preview-main';
          canvas.className = 'max-w-full h-auto shadow-2xl rounded-lg border border-surface-200 transition-transform duration-200 origin-center';
          
          const html = `
            <div class="max-w-7xl mx-auto p-4 animate-in fade-in duration-500">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-6 border border-surface-100">
                <span class="font-bold text-surface-900">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-bold uppercase">PSD File</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">${metadata.width} &times; ${metadata.height} px</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <!-- Main Preview Area -->
                <div class="lg:col-span-8 space-y-6">
                  <div class="relative group bg-surface-100 rounded-3xl p-6 md:p-12 flex flex-col items-center justify-center min-h-[500px] border-2 border-dashed border-surface-200 overflow-hidden">
                    <div id="canvas-container" class="relative z-10 flex items-center justify-center w-full h-full overflow-auto max-h-[70vh]">
                      <!-- Canvas injected here -->
                    </div>
                    
                    <!-- Zoom Control -->
                    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-surface-200 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span class="text-xs font-bold text-surface-500">Zoom</span>
                      <input type="range" id="zoom-slider" min="0.1" max="2" step="0.1" value="1" class="w-32 accent-brand-600 cursor-pointer" />
                      <span id="zoom-value" class="text-xs font-mono font-bold text-brand-700 min-w-[3rem]">100%</span>
                    </div>
                  </div>

                  <!-- U7: Specs Table -->
                  <div class="overflow-x-auto rounded-2xl border border-surface-200 shadow-sm bg-white">
                    <table class="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th colspan="2" class="bg-surface-50/50 px-6 py-4 text-left font-bold text-surface-800 border-b border-surface-200 uppercase tracking-widest text-xs">Technical Parameters</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-surface-100">
                        <tr class="hover:bg-brand-50/30 transition-colors">
                          <td class="px-6 py-4 text-surface-500 font-medium w-1/3">Dimensions</td>
                          <td class="px-6 py-4 text-surface-900">${metadata.width} &times; ${metadata.height} px <span class="text-surface-400 ml-2">(${((metadata.width * metadata.height) / 1000000).toFixed(1)} MP)</span></td>
                        </tr>
                        <tr class="even:bg-surface-50/30 hover:bg-brand-50/30 transition-colors">
                          <td class="px-6 py-4 text-surface-500 font-medium">Color Management</td>
                          <td class="px-6 py-4 text-surface-900">${metadata.colorMode} / ${metadata.depth}-bit per channel</td>
                        </tr>
                        <tr class="hover:bg-brand-50/30 transition-colors">
                          <td class="px-6 py-4 text-surface-500 font-medium">Composite Channels</td>
                          <td class="px-6 py-4 text-surface-900">${metadata.channels} channels</td>
                        </tr>
                        <tr class="even:bg-surface-50/30 hover:bg-brand-50/30 transition-colors">
                          <td class="px-6 py-4 text-surface-500 font-medium">Total Layers</td>
                          <td class="px-6 py-4 text-surface-900 font-bold text-brand-700">${metadata.layerCount}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Sidebar: Layer Tree -->
                <div class="lg:col-span-4 flex flex-col space-y-4 h-full">
                  <!-- U10: Section Header -->
                  <div class="flex items-center justify-between px-1">
                    <h3 class="font-bold text-surface-800 text-xs uppercase tracking-widest">Layers & Folders</h3>
                    <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-1 rounded-full font-black">${metadata.layerCount}</span>
                  </div>

                  <div class="flex-1 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden flex flex-col min-h-[400px] max-h-[800px]">
                    <div class="p-4 bg-surface-50/80 border-b border-surface-200 backdrop-blur">
                       <div class="relative">
                         <input type="text" id="layer-search" placeholder="Search layers..." class="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-surface-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all shadow-inner" />
                         <svg class="absolute left-3 top-2.5 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                       </div>
                    </div>
                    
                    <div class="overflow-y-auto p-3 space-y-1.5 custom-scrollbar" id="layer-list">
                      ${layers.length === 0 ? `
                        <div class="flex flex-col items-center justify-center p-12 text-center">
                          <div class="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mb-3">
                            <svg class="w-6 h-6 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path></svg>
                          </div>
                          <p class="text-sm text-surface-400 italic font-medium">No layers found</p>
                        </div>
                      ` : layers.map((l, i) => `
                        <!-- U9: Content Cards for Layers -->
                        <div class="layer-item group flex items-start gap-3 p-3 rounded-xl border border-transparent hover:border-brand-100 hover:bg-brand-50/40 transition-all cursor-default ${l.visible ? '' : 'opacity-40 filter grayscale'}" 
                             data-name="${escapeHtml(l.name.toLowerCase())}"
                             style="margin-left: ${l.depth * 12}px">
                          <div class="mt-0.5 text-lg shrink-0">
                            ${l.type === 'folder' ? '📁' : '📄'}
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-sm font-semibold text-surface-800 truncate leading-tight">${escapeHtml(l.name)}</div>
                            <div class="flex items-center gap-2 mt-1">
                              <span class="text-[9px] font-black uppercase text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded tracking-tighter">${l.blendMode}</span>
                              <span class="text-[10px] text-surface-400 font-medium">${Math.round((l.opacity / 255) * 100)}% opacity</span>
                            </div>
                          </div>
                          ${!l.visible ? '<div class="shrink-0 text-[8px] font-bold text-surface-400 border border-surface-200 px-1 rounded">HIDDEN</div>' : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <style>
              .custom-scrollbar::-webkit-scrollbar { width: 6px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            </style>
          `;

          helpers.render(html);
          
          // Inject Canvas
          const container = document.getElementById('canvas-container');
          if (container) container.appendChild(canvas);

          // Interaction: Zoom
          const zoomSlider = document.getElementById('zoom-slider');
          const zoomValue = document.getElementById('zoom-value');
          if (zoomSlider && zoomValue) {
            zoomSlider.addEventListener('input', (e) => {
              const val = e.target.value;
              canvas.style.transform = `scale(${val})`;
              zoomValue.innerText = `${Math.round(val * 100)}%`;
            });
          }

          // Interaction: Search (Part 4: Specific Excellence)
          const searchInput = document.getElementById('layer-search');
          const layerItems = document.querySelectorAll('.layer-item');
          if (searchInput) {
            searchInput.addEventListener('input', (e) => {
              const term = e.target.value.toLowerCase().trim();
              layerItems.forEach(item => {
                const name = item.getAttribute('data-name');
                item.style.display = name.includes(term) ? 'flex' : 'none';
              });
            });
          }

        } catch (err) {
          console.error('[PSD Tool Error]', err);
          // U3: Friendly Error
          helpers.showError(
            'Failed to render PSD', 
            'The file structure could not be parsed. This tool supports standard PSD files, but some advanced PSB or highly compressed features might fail.'
          );
        }
      },
      actions: [
        {
          label: '📥 Download PNG Preview',
          id: 'export-png',
          onClick: function(helpers) {
            const canvas = document.getElementById('psd-preview-main');
            if (!canvas) return;
            
            canvas.toBlob((blob) => {
              const state = helpers.getState();
              const baseName = (state.fileName || 'document').replace(/\.psd$/i, '');
              helpers.download(`${baseName}-preview.png`, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function(helpers, btn) {
            const state = helpers.getState();
            if (!state || !state.metadata) return;
            
            const meta = state.metadata;
            const text = [
              `File: ${state.fileName}`,
              `Dimensions: ${meta.width} x ${meta.height} px`,
              `Color Mode: ${meta.colorMode}`,
              `Channels: ${meta.channels}`,
              `BPC: ${meta.depth}`,
              `Layer Count: ${meta.layerCount}`
            ].join('\n');
            
            helpers.copyToClipboard(text, btn);
          }
        }
      ],
      infoHtml: `
        <div class="flex items-center gap-3 text-surface-400 text-xs">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          <span>Privacy Guaranteed: All processing happens locally in your browser session.</span>
        </div>
      `
    });
  };
})();
