/**
 * OmniOpener — PVR Opener Tool
 * A production-grade PVR texture viewer using Three.js and PVRLoader.
 * Supports PVRTC, ETC, DXT, and uncompressed formats.
 */
(function () {
  'use strict';

  // Closure variables to avoid global pollution
  let _lastBlobUrl = null;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.pvr',
      infoHtml: 'Professional PVR texture viewer. Supports PVR v2/v3, including compressed formats (PVRTC, ETC, DXT) and uncompressed RGBA. Renders via WebGL for maximum fidelity.',
      
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            const state = h.getState();
            if (state && state.meta) {
              h.copyToClipboard(JSON.stringify(state.meta, null, 2), btn);
            }
          }
        },
        {
          label: '📥 Download PNG',
          id: 'download-png',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('#pvr-main-canvas');
            if (canvas) {
              h.showLoading('Preparing download...');
              canvas.toBlob(function(blob) {
                const fileName = h.getFile().name.replace(/\.pvr$/i, '') || 'texture';
                h.download(`${fileName}.png`, blob, 'image/png');
                h.hideLoading();
              }, 'image/png');
            }
          }
        },
        {
          label: '🌓 Toggle Theme',
          id: 'toggle-bg',
          onClick: function (h) {
            const container = h.getRenderEl().querySelector('#pvr-preview-container');
            if (container) {
              container.classList.toggle('bg-checkerboard');
              container.classList.toggle('bg-gray-900');
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/PVRLoader.js'
        ]);
        
        const style = document.createElement('style');
        style.id = 'pvr-opener-styles';
        style.textContent = `
          .bg-checkerboard {
            background-image: linear-gradient(45deg, #e5e7eb 25%, transparent 25%), 
                              linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), 
                              linear-gradient(45deg, transparent 75%, #e5e7eb 75%), 
                              linear-gradient(-45deg, transparent 75%, #e5e7eb 75%);
            background-size: 20px 20px;
            background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
            background-color: #ffffff;
          }
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        `;
        document.head.appendChild(style);
      },

      onDestroy: function() {
        if (_lastBlobUrl) {
          URL.revokeObjectURL(_lastBlobUrl);
          _lastBlobUrl = null;
        }
        const style = document.getElementById('pvr-opener-styles');
        if (style) style.remove();
      },

      onFile: async function _onFile(file, content, h) {
        h.showLoading('Loading rendering engine...');
        
        // Ensure dependencies are loaded
        const checkDeps = () => typeof THREE !== 'undefined' && !!THREE.PVRLoader;
        if (!checkDeps()) {
          let attempts = 0;
          while (!checkDeps() && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
        }

        if (!checkDeps()) {
          h.showError('Dependency Error', 'Failed to load Three.js or PVRLoader. Please check your connection.');
          return;
        }

        h.showLoading('Parsing PVR data...');
        
        try {
          const loader = new THREE.PVRLoader();
          const texData = loader.parse(content, true);
          
          if (!texData || !texData.mipmaps || texData.mipmaps.length === 0) {
            h.showError('Invalid PVR', 'The file could not be parsed. It may be an unsupported PVR variant.');
            return;
          }

          const { width, height, format, mipmaps } = texData;
          const formatName = getFormatName(format);
          
          const humanSize = (file.size / 1024).toFixed(1) + (file.size >= 1048576 ? ' MB' : ' KB');
          if (file.size >= 1048576) {
             const mb = (file.size / (1024 * 1024)).toFixed(1);
             h.setState('humanSize', `${mb} MB`);
          } else {
             h.setState('humanSize', `${(file.size / 1024).toFixed(1)} KB`);
          }

          const meta = {
            filename: file.name,
            dimensions: `${width} × ${height}`,
            format: formatName,
            mipmaps: mipmaps.length,
            rawFormat: format,
            size: h.getState().humanSize
          };
          h.setState('meta', meta);

          h.render(`
            <!-- U1. File info bar -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${file.name}</span>
              <span class="text-surface-300">|</span>
              <span>${h.getState().humanSize}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">${width} × ${height} • .pvr</span>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-4">
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold text-surface-800 text-lg">Texture Preview</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-1 rounded-full uppercase tracking-wider font-bold">${formatName}</span>
                </div>
                
                <div id="pvr-preview-container" class="relative group border border-surface-200 rounded-2xl shadow-sm bg-checkerboard overflow-auto flex items-center justify-center p-8 min-h-[400px] transition-all duration-300">
                   <canvas id="pvr-main-canvas" class="max-w-full h-auto shadow-2xl rounded-lg bg-transparent"></canvas>
                </div>
                
                <p class="text-center text-xs text-surface-400 italic">
                  Tip: Toggle background theme to verify transparency. Compressed formats are transcoded via WebGL.
                </p>
              </div>

              <div class="space-y-6">
                <!-- U10. Section header with count -->
                <div>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Metadata</h3>
                    <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">File Properties</span>
                  </div>
                  <!-- U7. Table styling -->
                  <div class="overflow-hidden rounded-xl border border-surface-200">
                    <table class="min-w-full text-sm">
                      <tbody class="divide-y divide-surface-100">
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-2.5 font-medium text-surface-500 bg-surface-50/50 w-1/3">Resolution</td>
                          <td class="px-4 py-2.5 text-surface-800 font-mono">${width} × ${height}</td>
                        </tr>
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-2.5 font-medium text-surface-500 bg-surface-50/50">Format</td>
                          <td class="px-4 py-2.5 text-surface-800">${formatName}</td>
                        </tr>
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-2.5 font-medium text-surface-500 bg-surface-50/50">Mipmaps</td>
                          <td class="px-4 py-2.5 text-surface-800">${mipmaps.length} levels</td>
                        </tr>
                        <tr class="hover:bg-brand-50/50 transition-colors">
                          <td class="px-4 py-2.5 font-medium text-surface-500 bg-surface-50/50">Size</td>
                          <td class="px-4 py-2.5 text-surface-800">${h.getState().humanSize}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Mipmap Pyramid</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${mipmaps.length} Levels</span>
                  </div>
                  <div class="space-y-2 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                    ${mipmaps.map((m, i) => {
                      const w = Math.max(1, width >> i);
                      const hVal = Math.max(1, height >> i);
                      return `
                        <!-- U9. Content cards -->
                        <div class="flex items-center justify-between p-3 rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded bg-surface-100 flex items-center justify-center text-xs font-bold text-surface-400">#${i}</div>
                            <div>
                              <div class="text-sm font-semibold text-surface-800">${w} × ${hVal}</div>
                              <div class="text-xs text-surface-400">Level ${i}</div>
                            </div>
                          </div>
                          <div class="text-xs font-mono text-brand-600">${(m.data.length / 1024).toFixed(1)} KB</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              </div>
            </div>
          `);

          h.showLoading('Rendering texture to canvas...');
          renderPvrToCanvas(texData, h);

        } catch (err) {
          console.error('[PVR Opener]', err);
          h.showError('Render Failed', `Could not render this PVR texture. ${err.message}. Ensure your browser supports WebGL and this specific compression format.`);
        }
      }
    });
  };

  /**
   * Renders the parsed Three.js texture data to a 2D canvas via a hidden WebGL renderer
   */
  function renderPvrToCanvas(texData, h) {
    const { width, height, format, mipmaps } = texData;
    const canvas = h.getRenderEl().querySelector('#pvr-main-canvas');
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Create a temporary WebGL renderer
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: false, 
      preserveDrawingBuffer: true 
    });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    let texture;
    // Compressed formats supported by Three.js (standard values)
    const compressedFormats = [
      35840, 35841, 35842, 35843, // PVRTC
      33776, 33777, 33778, 33779, // DXT
      36196, 37488, 37492, 37496  // ETC
    ];

    try {
      if (compressedFormats.includes(format)) {
        texture = new THREE.CompressedTexture(mipmaps, width, height, format, THREE.UnsignedByteType);
      } else {
        texture = new THREE.DataTexture(mipmaps[0].data, width, height, format || THREE.RGBAFormat);
      }
      
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true,
        side: THREE.DoubleSide
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      renderer.render(scene, camera);
      
      // Draw result to visible canvas
      ctx.drawImage(renderer.domElement, 0, 0);
      
      // Cleanup WebGL resources
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      
      h.hideLoading();
    } catch (e) {
      h.hideLoading();
      throw new Error(`WebGL rendering error: ${e.message}`);
    }
  }

  function getFormatName(f) {
    const map = {
      35840: 'PVRTC RGB 4BPP',
      35841: 'PVRTC RGB 2BPP',
      35842: 'PVRTC RGBA 4BPP',
      35843: 'PVRTC RGBA 2BPP',
      33776: 'DXT1 RGB',
      33777: 'DXT1 RGBA',
      33778: 'DXT3 RGBA',
      33779: 'DXT5 RGBA',
      36196: 'ETC1 RGB',
      37488: 'ETC2 RGB',
      37492: 'ETC2 RGBA (1-bit Alpha)',
      37496: 'ETC2 RGBA (8-bit Alpha)',
      1023: 'RGBA8888',
      1022: 'RGB888',
      32856: 'RGBA4444',
      32854: 'RGB565'
    };
    return map[f] || `0x${f.toString(16).toUpperCase()}`;
  }

})();
