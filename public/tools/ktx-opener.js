/**
 * OmniOpener — KTX Texture Viewer (KTX1 / KTX2)
 * High-performance browser-based viewer for KTX and Basis Universal textures.
 */
(function () {
  'use strict';

  // Closure variables to prevent global namespace pollution (B9)
  let renderer, scene, camera, controls, mesh, texture, animationId, ktx2Loader;
  let resizeHandler, currentMetadata = {};

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ktx,.ktx2',
      binary: true,
      infoHtml: '<strong>KTX Viewer:</strong> High-performance viewer for KTX1 and KTX2 (Basis Universal) textures. Supports compressed formats and Basis Universal transcoding. All processing happens in your browser.',

      actions: [
        {
          label: '🖼️ Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            if (!renderer || !scene || !camera) {
              h.showError('Rendering Error', 'The texture has not been loaded yet.');
              return;
            }
            h.showLoading('Generating high-quality export...');
            // Ensure we render the current frame before capture
            renderer.render(scene, camera);
            // B10: Use toBlob instead of toDataURL for downloads to prevent corruption/size issues
            renderer.domElement.toBlob(function(blob) {
              const fileName = (currentMetadata.filename || 'texture').replace(/\.[^/.]+$/, "");
              h.download(fileName + '.png', blob, 'image/png');
              h.showLoading(false);
            }, 'image/png');
          }
        },
        {
          label: '🎯 Reset View',
          id: 'reset-view',
          onClick: function () {
            if (controls) controls.reset();
          }
        },
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            if (!currentMetadata || Object.keys(currentMetadata).length === 0) {
              h.showError('No Metadata', 'No texture metadata available to copy.');
              return;
            }
            h.copyToClipboard(JSON.stringify(currentMetadata, null, 2), btn);
          }
        }
      ],

      onInit: function (h) {
        // B1: Load scripts with proper sequence
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/KTXLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/KTX2Loader.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function _onFileFn(file, content, h) {
        // B1 & B4: Race condition and dependency check
        if (!window.THREE || !THREE.KTXLoader || !THREE.KTX2Loader || !THREE.OrbitControls) {
          h.showLoading('Initializing graphics engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        // U5: Empty state check
        if (!content || content.byteLength < 12) {
          h.showError('Empty or Invalid File', 'The provided file is too small to be a valid KTX texture.');
          return;
        }

        h.showLoading('Analyzing texture header...');

        try {
          // B2: ArrayBuffer handling - slice is safe for binary data
          const header = new Uint8Array(content.slice(0, 12));
          // Magic: 0xAB 0x4B 0x54 0x58 0x20 ( \xAB K T X \x20 )
          const isKTX = header[1] === 0x4B && header[2] === 0x54 && header[3] === 0x58;
          const isKTX2 = isKTX && header[5] === 0x32; // '2' at index 5
          
          if (isKTX2) {
            loadKTX2(content, file, h);
          } else if (isKTX) {
            loadKTX1(content, file, h);
          } else {
            throw new Error('Not a valid KTX file (missing magic identifier)');
          }
        } catch (err) {
          h.showError('Parsing Error', 'The file could not be identified as a KTX or KTX2 texture. ' + (err.message || ''));
        }
      },

      onDestroy: function () {
        cleanup();
      }
    });

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
      if (renderer) {
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer.dispose();
        renderer = null;
      }
      if (mesh) {
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
        mesh = null;
      }
      if (texture) {
        texture.dispose();
        texture = null;
      }
      if (ktx2Loader) {
        // B5: Cleanup KTX2 loader workers to prevent memory leaks
        if (typeof ktx2Loader.dispose === 'function') ktx2Loader.dispose();
        ktx2Loader = null;
      }
      scene = null;
      camera = null;
      controls = null;
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function loadKTX1(content, file, h) {
      h.showLoading('Parsing KTX1 texture container...');
      const loader = new THREE.KTXLoader();
      try {
        const tex = loader.parse(content);
        renderTexture(tex, 1, file, h);
      } catch (err) {
        h.showError('KTX1 Error', 'The KTX1 variant in this file is not supported or the file is corrupted.');
      }
    }

    function loadKTX2(content, file, h) {
      h.showLoading('Transcoding Basis Universal / KTX2 texture...');
      
      // KTX2Loader needs a renderer to detect supported compression formats
      const tempRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      
      if (!ktx2Loader) {
        ktx2Loader = new THREE.KTX2Loader();
        // Use a reliable CDN for transcoder workers
        ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/libs/basis/');
      }
      
      ktx2Loader.detectSupport(tempRenderer);

      ktx2Loader.parse(content, function(tex) {
        renderTexture(tex, 2, file, h);
        tempRenderer.dispose();
      }, function(err) {
        h.showError('KTX2 Transcoding Failed', 'Your browser or GPU does not support the compression format in this KTX2 file. (Format: Basis Universal)');
        tempRenderer.dispose();
      });
    }

    function renderTexture(tex, version, file, h) {
      cleanup();
      texture = tex;

      const width = texture.image ? (texture.image.width || 0) : 0;
      const height = texture.image ? (texture.image.height || 0) : 0;
      const mipmapsCount = texture.mipmaps ? texture.mipmaps.length : 1;

      currentMetadata = {
        filename: file.name,
        size: formatBytes(file.size),
        version: 'KTX' + version,
        resolution: width + ' × ' + height,
        mipmaps: mipmapsCount,
        format: texture.format || 'Unknown',
        encoding: texture.encoding === 3001 ? 'sRGB' : 'Linear',
        anisotropy: texture.anisotropy || 1
      };

      // U1, U7-U10: Professional UI implementation
      h.render(`
        <div class="space-y-6 font-sans animate-in fade-in duration-700">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-200 shadow-sm">
            <span class="font-bold text-surface-900">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span class="font-medium">${currentMetadata.size}</span>
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-lg text-[10px] font-black uppercase tracking-wider border border-brand-200">KTX${version}</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left: Viewport (8/12) -->
            <div class="lg:col-span-8 space-y-4">
              <div class="relative group rounded-3xl overflow-hidden border border-surface-200 bg-slate-950 shadow-2xl">
                <div id="ktx-viewport" class="w-full h-[600px] cursor-move"></div>
                
                <!-- Overlay: Interaction Hint -->
                <div class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-xl px-6 py-3 rounded-full border border-white/10 shadow-2xl flex gap-6 items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0 pointer-events-none">
                   <div class="flex items-center gap-2">
                     <span class="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
                     <span class="text-[10px] font-bold text-white uppercase tracking-widest">Orbit</span>
                   </div>
                   <div class="w-px h-3 bg-white/20"></div>
                   <div class="flex items-center gap-2">
                     <span class="text-[10px] font-bold text-white uppercase tracking-widest">Right-Click Pan</span>
                   </div>
                   <div class="w-px h-3 bg-white/20"></div>
                   <div class="flex items-center gap-2">
                     <span class="text-[10px] font-bold text-white uppercase tracking-widest">Scroll Zoom</span>
                   </div>
                </div>
              </div>
              
              <!-- Bottom status bar -->
              <div class="flex items-center justify-between px-2 text-[11px] font-bold text-surface-400 uppercase tracking-tighter">
                <div class="flex items-center gap-4">
                  <span class="flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    Hardware Accelerated
                  </span>
                  <span class="text-surface-200">/</span>
                  <span>WebGL 2.0 Context</span>
                </div>
                <div class="flex items-center gap-2 text-brand-500 bg-brand-50 px-3 py-1 rounded-full">
                  <span class="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
                  ${width} × ${height} px
                </div>
              </div>
            </div>

            <!-- Right: Details (4/12) -->
            <div class="lg:col-span-4 space-y-6">
              <!-- Section: Properties -->
              <section>
                <div class="flex items-center justify-between mb-4">
                  <h3 class="font-bold text-surface-900 tracking-tight flex items-center gap-2">
                    <svg class="w-5 h-5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Technical Specs
                  </h3>
                  <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-1 rounded-md font-black">V${version}</span>
                </div>
                
                <div class="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm">
                  <table class="min-w-full text-sm">
                    <tbody class="divide-y divide-surface-100">
                      <tr class="hover:bg-brand-50/40 transition-colors">
                        <td class="px-5 py-3.5 text-surface-500 font-semibold">Dimensions</td>
                        <td class="px-5 py-3.5 text-surface-950 font-mono text-right font-bold">${currentMetadata.resolution}</td>
                      </tr>
                      <tr class="hover:bg-brand-50/40 transition-colors">
                        <td class="px-5 py-3.5 text-surface-500 font-semibold">Mipmaps</td>
                        <td class="px-5 py-3.5 text-surface-950 font-mono text-right font-bold">${currentMetadata.mipmaps} levels</td>
                      </tr>
                      <tr class="hover:bg-brand-50/40 transition-colors">
                        <td class="px-5 py-3.5 text-surface-500 font-semibold">GPU Format</td>
                        <td class="px-5 py-3.5 text-right">
                          <span class="inline-block max-w-[140px] truncate text-surface-950 font-mono text-xs font-bold" title="${currentMetadata.format}">
                            ${currentMetadata.format}
                          </span>
                        </td>
                      </tr>
                      <tr class="hover:bg-brand-50/40 transition-colors">
                        <td class="px-5 py-3.5 text-surface-500 font-semibold">Color Space</td>
                        <td class="px-5 py-3.5 text-surface-950 font-mono text-right font-bold">${currentMetadata.encoding}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <!-- Section: Channel Toggles (Interactive UX) -->
              <section class="p-5 bg-surface-900 rounded-2xl border border-surface-800 shadow-xl text-white">
                <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                  Quick Settings
                </h4>
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-surface-300">Auto-Rotate</span>
                    <button id="toggle-rotate" class="w-10 h-5 rounded-full bg-surface-700 relative transition-colors">
                      <div class="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-all"></div>
                    </button>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-surface-300">Dark Mode BG</span>
                    <button id="toggle-bg-local" class="w-10 h-5 rounded-full bg-brand-500 relative transition-colors">
                      <div class="absolute top-1 right-1 w-3 h-3 bg-white rounded-full transition-all"></div>
                    </button>
                  </div>
                </div>
              </section>

              <!-- Section: Educational Insight -->
              <div class="relative group p-6 rounded-2xl border border-brand-100 bg-brand-50/30 overflow-hidden">
                <div class="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <svg class="w-24 h-24 text-brand-600" fill="currentColor" viewBox="0 0 24 24"><path d="M13 14h-2v-4h2v4zm0-6h-2V6h2v2zM1 1v22h22V1H1zm20 20H3V3h18v18z"></path></svg>
                </div>
                <p class="text-[13px] text-brand-900 leading-relaxed font-medium relative z-10">
                  <span class="font-bold">Pro Tip:</span> KTX files maintain texture compression directly on the GPU, significantly reducing VRAM usage and improving load times compared to standard PNG/JPG textures in 3D applications.
                </p>
              </div>
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('ktx-viewport');
      if (!container) return;

      // Initialize Three.js scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617); // Slate 950 default

      const aspect = container.clientWidth / container.clientHeight;
      camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
      camera.position.z = 2;

      renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true // Required for high-quality PNG export
      });
      renderer.setPixelRatio(window.devicePixelRatio > 1 ? 2 : 1);
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Texture optimization and metadata enrichment
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      // Plane geometry sized to texture aspect ratio to prevent distortion
      const texAspect = width / height || 1;
      const geometry = new THREE.PlaneGeometry(
        texAspect > 1 ? 1.5 : 1.5 * texAspect, 
        texAspect > 1 ? 1.5 / texAspect : 1.5
      );
      
      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        side: THREE.DoubleSide 
      });
      
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Orbit controls for interactive inspection
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = true;

      // Event Listeners for UI toggles
      const rotateBtn = document.getElementById('toggle-rotate');
      if (rotateBtn) {
        rotateBtn.addEventListener('click', function() {
          controls.autoRotate = !controls.autoRotate;
          rotateBtn.classList.toggle('bg-brand-500');
          rotateBtn.classList.toggle('bg-surface-700');
          const dot = rotateBtn.querySelector('div');
          dot.style.left = controls.autoRotate ? 'calc(100% - 16px)' : '4px';
        });
      }

      const bgBtn = document.getElementById('toggle-bg-local');
      if (bgBtn) {
        bgBtn.addEventListener('click', function() {
          const isDark = scene.background.getHex() === 0x020617;
          scene.background.set(isDark ? 0xffffff : 0x020617);
          bgBtn.classList.toggle('bg-brand-500');
          bgBtn.classList.toggle('bg-surface-700');
          const dot = bgBtn.querySelector('div');
          dot.style.left = !isDark ? 'calc(100% - 16px)' : '4px';
        });
      }

      // Responsive Resize Handling
      resizeHandler = function() {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', resizeHandler);

      function animate() {
        if (!renderer || !scene || !camera) return;
        animationId = requestAnimationFrame(animate);
        if (controls) controls.update();
        renderer.render(scene, camera);
      }
      
      animate();
      h.showLoading(false);
    }
  };

  // B6: XSS Sanitization helper for user-provided data
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
