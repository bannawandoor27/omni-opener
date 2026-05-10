/**
 * OmniOpener — OpenEXR (EXR) Toolkit
 * Professional HDR viewer with tone mapping, exposure controls, and metadata extraction.
 */
(function () {
  'use strict';

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') str = String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    let currentResources = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.exr',
      binary: true,
      dropLabel: 'Drop an EXR image here',
      infoHtml: 'Professional High Dynamic Range (HDR) image viewer with multi-algorithm tone mapping and full metadata inspection. All processing is done locally in your browser.',

      onInit: function (h) {
        h.setState('libsReady', false);
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/EXRLoader.js'
        ], () => {
          h.setState('libsReady', true);
        });
      },

      onFile: async function (file, content, h) {
        if (!h.getState('libsReady')) {
          h.showLoading('Loading HDR engine...');
          let retries = 0;
          while (!h.getState('libsReady') && retries < 50) {
            await new Promise(r => setTimeout(r, 100));
            retries++;
          }
          if (!h.getState('libsReady')) {
            h.showError('Engine Error', 'Could not load rendering engine. Please refresh and try again.');
            return;
          }
        }

        h.showLoading('Decoding EXR data...');
        
        // Small delay to allow UI to update
        await new Promise(r => setTimeout(r, 50));

        try {
          const loader = new THREE.EXRLoader();
          const texData = loader.parse(content);

          if (!texData || !texData.data) {
            throw new Error('Invalid or empty EXR data.');
          }

          renderView(file, texData, h);
        } catch (err) {
          console.error('[EXR] Parse error:', err);
          h.showError('Failed to open EXR', err.message);
        }
      },

      onDestroy: function () {
        if (currentResources) {
          currentResources.dispose();
          currentResources = null;
        }
      },

      actions: [
        {
          label: '📸 Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('#exr-canvas-container canvas');
            if (!canvas) return;
            
            canvas.toBlob((blob) => {
              const filename = h.getFile().name.replace(/\.[^/.]+$/, "") + ".png";
              h.download(filename, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState('metadata');
            if (meta) {
              h.copyToClipboard(JSON.stringify(meta, null, 2), btn);
            }
          }
        }
      ]
    });

    function renderView(file, texData, h) {
      if (currentResources) {
        currentResources.dispose();
      }

      const meta = texData.header || {};
      const stats = {
        name: file.name,
        size: formatBytes(file.size),
        dimensions: `${texData.width} × ${texData.height}`,
        channels: texData.format === 1023 ? 'RGBA' : 'RGB',
        depth: texData.type === 1015 ? '32-bit Float' : '16-bit Half'
      };

      h.setState('metadata', meta);

      h.render(`
        <div class="flex flex-col h-full overflow-hidden p-4">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(stats.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${stats.size}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${stats.dimensions}</span>
            <span class="text-surface-300">|</span>
            <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">${stats.depth}</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            <div class="lg:col-span-8 flex flex-col min-h-0 space-y-4">
              <div id="exr-canvas-container" class="relative flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-surface-200 shadow-lg flex items-center justify-center">
                <div class="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white/95 backdrop-blur shadow-xl rounded-2xl border border-white/40 p-5 space-y-4 z-10 transition-all">
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Exposure</span>
                    <span id="exp-label" class="text-xs font-mono font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">1.0</span>
                  </div>
                  
                  <input type="range" id="exp-slider" min="0.1" max="10" step="0.1" value="1.0" 
                    class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600 mb-4">
                  
                  <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-1.5">
                      <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest">Tone Mapping</label>
                      <select id="tm-select" class="w-full text-xs p-2 bg-white border border-surface-200 rounded-lg outline-none font-medium text-surface-700 focus:ring-2 focus:ring-brand-500/20 transition-all">
                        <option value="reinhard" selected>Reinhard</option>
                        <option value="aces">ACES Filmic</option>
                        <option value="cineon">Cineon</option>
                        <option value="linear">Linear (None)</option>
                      </select>
                    </div>
                    <div class="flex items-end">
                      <button id="reset-view" class="w-full h-[36px] bg-surface-100 hover:bg-surface-200 text-surface-700 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider border border-surface-200">
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="lg:col-span-4 flex flex-col min-h-0 space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-surface-800">EXR Metadata</h3>
                <span class="text-[10px] bg-surface-100 text-surface-500 px-2 py-1 rounded-full uppercase font-bold tracking-tight">${Object.keys(meta).length} tags</span>
              </div>

              <div class="relative">
                <input type="text" id="meta-search" placeholder="Search metadata tags..." 
                  class="w-full pl-9 pr-4 py-2 text-sm bg-white border border-surface-200 rounded-xl outline-none focus:ring-2 focus:ring-brand-500/20 transition-all">
                <svg class="absolute left-3 top-2.5 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </div>

              <div id="meta-container" class="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                ${renderMetadata(meta)}
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
      `);

      setupThree(texData, h);
      setupMetadataFilter(h);
    }

    function renderMetadata(meta) {
      if (!meta || Object.keys(meta).length === 0) {
        return `<div class="p-8 text-center text-surface-400 text-sm bg-surface-50 rounded-2xl border border-dashed border-surface-200">No extended metadata</div>`;
      }

      return Object.entries(meta).map(([key, val]) => {
        let displayVal = val;
        if (typeof val === 'object' && val !== null) {
          try { displayVal = JSON.stringify(val); } catch(e) { displayVal = '[Complex Data]'; }
        }
        
        return `
          <div class="meta-item p-3 rounded-xl border border-surface-100 bg-surface-50/50 hover:bg-white transition-all group" data-key="${key.toLowerCase()}" data-val="${String(displayVal).toLowerCase()}">
            <div class="text-[10px] font-bold text-surface-400 uppercase tracking-tight mb-0.5 group-hover:text-brand-500">${escapeHtml(key)}</div>
            <div class="text-sm font-medium text-surface-700 break-all">${escapeHtml(displayVal)}</div>
          </div>
        `;
      }).join('');
    }

    function setupMetadataFilter(h) {
      const el = h.getRenderEl();
      const searchInput = el.querySelector('#meta-search');
      const items = el.querySelectorAll('.meta-item');
      
      if (!searchInput) return;
      
      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        items.forEach(item => {
          const key = item.getAttribute('data-key');
          const val = item.getAttribute('data-val');
          if (key.includes(term) || val.includes(term)) {
            item.style.display = 'block';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }

    function setupThree(texData, h) {
      const el = h.getRenderEl();
      const container = el.querySelector('#exr-canvas-container');
      if (!container) return;

      const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        preserveDrawingBuffer: true 
      });
      
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.toneMapping = THREE.ReinhardToneMapping;
      renderer.toneMappingExposure = 1.0;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const texture = new THREE.DataTexture(
        texData.data, 
        texData.width, 
        texData.height, 
        texData.format, 
        texData.type
      );
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.flipY = true;
      texture.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({ map: texture });
      const geometry = new THREE.PlaneGeometry(2, 2);
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      currentResources = {
        dispose: () => {
          cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          renderer.dispose();
          texture.dispose();
          geometry.dispose();
          material.dispose();
          if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        }
      };

      function updateScale() {
        if (!container.isConnected) return;
        const vW = container.clientWidth;
        const vH = container.clientHeight;
        const vAspect = vW / vH;
        const iAspect = texData.width / texData.height;

        if (vAspect > iAspect) {
          mesh.scale.set(iAspect / vAspect, 1, 1);
        } else {
          mesh.scale.set(1, vAspect / iAspect, 1);
        }
        renderer.setSize(vW, vH);
      }
      updateScale();

      const resizeObserver = new ResizeObserver(() => updateScale());
      resizeObserver.observe(container);

      const expSlider = el.querySelector('#exp-slider');
      const expLabel = el.querySelector('#exp-label');
      const tmSelect = el.querySelector('#tm-select');
      const resetBtn = el.querySelector('#reset-view');

      expSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        renderer.toneMappingExposure = val;
        expLabel.textContent = val.toFixed(1);
      };

      const toneMappingModes = {
        reinhard: THREE.ReinhardToneMapping,
        aces: THREE.ACESFilmicToneMapping,
        cineon: THREE.CineonToneMapping,
        linear: THREE.NoToneMapping
      };

      tmSelect.onchange = (e) => {
        renderer.toneMapping = toneMappingModes[e.target.value];
        material.needsUpdate = true;
      };

      resetBtn.onclick = () => {
        expSlider.value = 1.0;
        renderer.toneMappingExposure = 1.0;
        expLabel.textContent = '1.0';
        tmSelect.value = 'reinhard';
        renderer.toneMapping = THREE.ReinhardToneMapping;
        material.needsUpdate = true;
      };

      let frameId;
      const animate = () => {
        if (!container.isConnected) return;
        frameId = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();
    }
  };
})();
