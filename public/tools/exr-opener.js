/**
 * OmniOpener — OpenEXR (EXR) Toolkit
 * Professional HDR viewer with tone mapping and exposure controls.
 */
(function () {
  'use strict';

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.exr',
      binary: true,
      dropLabel: 'Drop an EXR HDR file here',
      infoHtml: 'Professional High Dynamic Range (HDR) image viewer with real-time tone mapping, exposure control, and metadata extraction.',

      onInit: function (h) {
        h.setState('libsLoaded', false);
        // Load Three.js first, then EXRLoader
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/EXRLoader.js', () => {
            h.setState('libsLoaded', true);
          });
        });
      },

      onFile: async function (file, content, h) {
        // Wait for libs if not yet loaded
        if (!h.getState('libsLoaded')) {
          h.showLoading('Initialising HDR engine...');
          let checks = 0;
          while (!h.getState('libsLoaded') && checks < 20) {
            await new Promise(r => setTimeout(r, 250));
            checks++;
          }
          if (!h.getState('libsLoaded')) {
            h.showError('Failed to load viewer engine', 'Please check your internet connection and try again.');
            return;
          }
        }

        h.showLoading('Decoding HDR data...');

        // Large file warning handling
        if (file.size > 50 * 1024 * 1024) {
          h.showLoading('Processing large file (' + formatBytes(file.size) + ')...');
        }

        try {
          // Wrap in timeout to ensure UI updates before heavy CPU work
          setTimeout(() => {
            try {
              const loader = new THREE.EXRLoader();
              const texData = loader.parse(content);
              
              if (!texData || !texData.data) {
                throw new Error('Incomplete or corrupted EXR data.');
              }

              renderEXR(file, texData, h);
            } catch (err) {
              console.error(err);
              h.showError('Could not render EXR', 'The file format might be unsupported or corrupted. ' + err.message);
            }
          }, 50);
        } catch (err) {
          h.showError('Parsing error', err.message);
        }
      },

      actions: [
        {
          label: '📸 Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            const canvas = document.querySelector('#exr-viewport canvas');
            if (!canvas) return;
            const link = document.createElement('a');
            link.download = h.getFile().name.replace(/\.exr$/i, '') + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const meta = h.getState('exr_meta');
            if (meta) {
              h.copyToClipboard(JSON.stringify(meta, null, 2), btn);
            }
          }
        }
      ]
    });
  };

  function renderEXR(file, texData, h) {
    // Basic EXR info
    const isRGBA = texData.format === 1023; // THREE.RGBAFormat
    const isFloat = texData.type === 1015;  // THREE.FloatType
    
    const meta = {
      filename: file.name,
      width: texData.width,
      height: texData.height,
      channels: isRGBA ? 'RGBA' : 'RGB',
      depth: isFloat ? '32-bit Float' : '16-bit Half-Float',
      aspectRatio: (texData.width / texData.height).toFixed(3)
    };
    
    h.setState('exr_meta', meta);

    h.render(`
      <div class="flex flex-col h-full animate-in fade-in duration-500">
        <!-- U1. File info bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
          <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${meta.width} × ${meta.height}px</span>
          <span class="text-surface-300">|</span>
          <span class="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">${meta.depth}</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          <!-- Main Viewport -->
          <div class="lg:col-span-3 flex flex-col min-h-0 space-y-4">
            <div id="exr-viewport" class="relative flex-1 bg-slate-950 rounded-2xl overflow-hidden border border-surface-200 shadow-inner flex items-center justify-center group">
              <!-- Canvas will be injected here -->
              
              <!-- Floating Overlay Controls -->
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-white/90 backdrop-blur-md shadow-2xl rounded-2xl border border-white/20 p-5 space-y-4 z-10 transition-all opacity-90 hover:opacity-100 ring-1 ring-black/5">
                <div class="flex justify-between items-center">
                  <span class="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Exposure Control</span>
                  <span id="exp-val" class="text-xs font-mono font-black text-brand-600 bg-brand-50 px-2 py-0.5 rounded">1.0</span>
                </div>
                <input type="range" id="exr-exposure" min="0.1" max="8" step="0.1" value="1.0" 
                  class="w-full h-1.5 bg-surface-200 rounded-lg appearance-none cursor-pointer accent-brand-600">
                
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1.5">Tone Mapping</label>
                    <select id="exr-tonemap" class="w-full text-xs p-2 bg-white border border-surface-200 rounded-lg outline-none font-semibold text-surface-700 focus:ring-2 focus:ring-brand-500/20 transition-all cursor-pointer">
                      <option value="none">Linear (Raw)</option>
                      <option value="reinhard" selected>Reinhard</option>
                      <option value="cineon">Cineon</option>
                      <option value="aces">ACES Filmic</option>
                    </select>
                  </div>
                  <div class="flex items-end">
                    <button id="exr-reset" class="w-full h-[34px] bg-surface-100 hover:bg-surface-200 text-surface-700 text-[10px] font-bold rounded-lg transition-all uppercase tracking-wider border border-surface-200">
                      Reset View
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Sidebar Info -->
          <div class="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            <div>
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-surface-800 flex items-center gap-2">
                  <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Specifications
                </h3>
              </div>
              <div class="space-y-2">
                ${Object.entries(meta).map(([key, val]) => `
                  <div class="p-3 rounded-xl border border-surface-100 bg-surface-50/50 flex flex-col gap-1">
                    <span class="text-[10px] font-bold text-surface-400 uppercase tracking-tighter">${key.replace(/([A-Z])/g, ' $1')}</span>
                    <span class="text-sm font-semibold text-surface-700 truncate">${escapeHtml(val)}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <h4 class="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                HDR Notice
              </h4>
              <p class="text-[11px] text-amber-700 leading-relaxed">
                EXR is a High Dynamic Range format. We use tone mapping to compress the luminosity for standard displays. Adjust exposure to see details in shadows or highlights.
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      </style>
    `);

    // Three.js Integration
    const viewport = document.getElementById('exr-viewport');
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      preserveDrawingBuffer: true 
    });
    
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;
    viewport.appendChild(renderer.domElement);

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

    function updateScale() {
      if (!viewport.isConnected) return;
      const vW = viewport.clientWidth;
      const vH = viewport.clientHeight;
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

    // Interaction Listeners
    const expRange = document.getElementById('exr-exposure');
    const expVal = document.getElementById('exp-val');
    const tmSelect = document.getElementById('exr-tonemap');
    const resetBtn = document.getElementById('exr-reset');

    expRange.oninput = (e) => {
      const val = parseFloat(e.target.value);
      renderer.toneMappingExposure = val;
      expVal.textContent = val.toFixed(1);
    };

    const toneMapMap = {
      none: THREE.NoToneMapping,
      reinhard: THREE.ReinhardToneMapping,
      cineon: THREE.CineonToneMapping,
      aces: THREE.ACESFilmicToneMapping
    };

    tmSelect.onchange = (e) => {
      renderer.toneMapping = toneMapMap[e.target.value];
      material.needsUpdate = true;
    };

    resetBtn.onclick = () => {
      expRange.value = 1.0;
      renderer.toneMappingExposure = 1.0;
      expVal.textContent = '1.0';
      tmSelect.value = 'reinhard';
      renderer.toneMapping = THREE.ReinhardToneMapping;
      material.needsUpdate = true;
    };

    let frameId;
    const animate = () => {
      if (!viewport.isConnected) {
        cancelAnimationFrame(frameId);
        renderer.dispose();
        texture.dispose();
        geometry.dispose();
        material.dispose();
        return;
      }
      frameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => updateScale());
    resizeObserver.observe(viewport);
    
    // Clean up observer on disconnect
    const cleanup = () => {
      if (!viewport.isConnected) {
        resizeObserver.disconnect();
        window.removeEventListener('unload', cleanup);
      }
    };
    window.addEventListener('unload', cleanup);
  }
})();
