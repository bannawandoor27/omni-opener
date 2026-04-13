/**
 * OmniOpener — PVR Opener Tool
 * A production-grade PVR texture viewer using Three.js and PVRLoader.
 * Supports PVRTC, ETC, DXT, and uncompressed formats.
 */
(function () {
  'use strict';

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
            if (state.meta) {
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
              const url = canvas.toDataURL('image/png');
              h.download(`${h.getFile().name.split('.')[0] || 'texture'}.png`, url, 'image/png');
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
          'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
          'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/loaders/PVRLoader.js'
        ]);
        
        // Inject custom styles for checkerboard background
        const style = document.createElement('style');
        style.textContent = `
          .bg-checkerboard {
            background-image: linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
            background-size: 20px 20px;
            background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
            background-color: #ffffff;
          }
        `;
        document.head.appendChild(style);
      },

      onFile: async function (file, content, h) {
        h.showLoading('Initializing WebGL renderer...');
        
        // Wait for dependencies with timeout
        let attempts = 0;
        while ((typeof THREE === 'undefined' || !THREE.PVRLoader) && attempts < 50) {
          await new Promise(r => setTimeout(r, 100));
          attempts++;
        }

        if (typeof THREE === 'undefined' || !THREE.PVRLoader) {
          h.showError('Loading Error', 'Failed to load rendering engine. Please check your internet connection and try again.');
          return;
        }

        h.showLoading('Parsing PVR texture data...');
        
        try {
          const loader = new THREE.PVRLoader();
          const texData = loader.parse(content, true);
          
          if (!texData || !texData.mipmaps || texData.mipmaps.length === 0) {
            h.showError('Invalid PVR', 'The file could not be parsed. It may be corrupt or an unsupported PVR variant.');
            return;
          }

          const { width, height, format, mipmaps } = texData;
          const formatName = getFormatName(format);
          const meta = {
            name: file.name,
            size: `${width} × ${height}`,
            format: formatName,
            mipmaps: mipmaps.length,
            rawFormat: format
          };
          
          h.setState('meta', meta);

          const sizeStr = (file.size / 1024).toFixed(1) + ' KB';
          if (file.size > 1024 * 1024) meta.humanSize = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
          else meta.humanSize = sizeStr;

          // Render UI shell
          h.render(`
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${file.name}</span>
              <span class="text-surface-300">|</span>
              <span>${meta.humanSize}</span>
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
                   <canvas id="pvr-main-canvas" class="max-w-full h-auto shadow-2xl rounded-lg"></canvas>
                </div>
                
                <p class="text-center text-xs text-surface-400 italic">
                  Tip: Use 'Toggle Theme' to check transparency. Compressed textures are rendered via WebGL.
                </p>
              </div>

              <div class="space-y-6">
                <div>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Metadata</h3>
                    <span class="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full">Properties</span>
                  </div>
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
                          <td class="px-4 py-2.5 font-medium text-surface-500 bg-surface-50/50">Data Size</td>
                          <td class="px-4 py-2.5 text-surface-800">${meta.humanSize}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-semibold text-surface-800">Mipmap Details</h3>
                    <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${mipmaps.length} Levels</span>
                  </div>
                  <div class="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    ${mipmaps.map((m, i) => `
                      <div class="flex items-center justify-between p-3 rounded-xl border border-surface-200 hover:border-brand-300 hover:shadow-sm transition-all bg-white">
                        <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded bg-surface-100 flex items-center justify-center text-xs font-bold text-surface-400">#${i}</div>
                          <div>
                            <div class="text-sm font-semibold text-surface-800">${Math.max(1, width >> i)} × ${Math.max(1, height >> i)}</div>
                            <div class="text-xs text-surface-400">Level ${i} offset</div>
                          </div>
                        </div>
                        <div class="text-xs font-mono text-brand-600">${(m.data.length / 1024).toFixed(1)} KB</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          `);

          // Perform actual WebGL to 2D Canvas rendering
          h.showLoading('Rendering texture to canvas...');
          renderToCanvas(texData, h);

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
  function renderToCanvas(texData, h) {
    const { width, height, format, mipmaps } = texData;
    const canvas = h.getRenderEl().querySelector('#pvr-main-canvas');
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Create a temporary WebGL renderer to convert compressed data to pixels
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    
    let texture;
    // Map of compressed formats supported by Three.js PVRLoader
    const compressedFormats = [
      35840, 35841, 35842, 35843, // PVRTC (RGB 4/2, RGBA 4/2)
      33776, 33777, 33778, 33779, // DXT (1, 3, 5)
      36196, 37488, 37492, 37496  // ETC1, ETC2
    ];

    try {
      if (compressedFormats.includes(format)) {
        texture = new THREE.CompressedTexture(mipmaps, width, height, format, THREE.UnsignedByteType);
      } else {
        // Fallback for uncompressed or standard formats
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

      // Trigger render
      renderer.render(scene, camera);
      
      // Copy to our visible canvas
      ctx.drawImage(renderer.domElement, 0, 0);
      
      // Cleanup WebGL
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      
    } catch (e) {
      throw new Error(`WebGL rendering error: ${e.message}`);
    }
  }

  /**
   * Human-readable PVR format mapping
   */
  function getFormatName(f) {
    const map = {
      // PVRTC
      35840: 'PVRTC RGB 4BPP',
      35841: 'PVRTC RGB 2BPP',
      35842: 'PVRTC RGBA 4BPP',
      35843: 'PVRTC RGBA 2BPP',
      // DXT / S3TC
      33776: 'DXT1 RGB',
      33777: 'DXT1 RGBA',
      33778: 'DXT3 RGBA',
      33779: 'DXT5 RGBA',
      // ETC
      36196: 'ETC1 RGB',
      37488: 'ETC2 RGB',
      37492: 'ETC2 RGBA (1-bit Alpha)',
      37496: 'ETC2 RGBA (8-bit Alpha)',
      // Standard
      1023: 'RGBA8888',
      1022: 'RGB888',
      32856: 'RGBA4444',
      32854: 'RGB565'
    };
    return map[f] || `0x${f.toString(16).toUpperCase()}`;
  }

})();
