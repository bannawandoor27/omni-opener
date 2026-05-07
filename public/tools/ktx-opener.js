/**
 * OmniOpener — KTX Texture Viewer (KTX1 / KTX2)
 * High-performance browser-based viewer for KTX and Basis Universal textures.
 */
(function () {
  'use strict';

  // Closure variables to prevent global namespace pollution (B9)
  let renderer, scene, camera, controls, mesh, animationId, ktx2Loader;
  let resizeHandler, currentMetadata = {};

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.ktx,.ktx2',
      binary: true,
      infoHtml: '<strong>KTX Viewer:</strong> High-performance viewer for KTX1 and KTX2 (Basis Universal) textures. Supports compressed formats and mipmaps. All processing happens in your browser.',

      actions: [
        {
          label: '🖼️ Save as PNG',
          id: 'save-png',
          onClick: function (h) {
            if (!renderer || !scene || !camera) {
              h.showError('Rendering Error', 'The texture hasn\'t been loaded yet.');
              return;
            }
            h.showLoading('Generating high-quality export...');
            // Ensure we render the current frame
            renderer.render(scene, camera);
            // B10: Use toBlob instead of toDataURL for downloads
            renderer.domElement.toBlob(function(blob) {
              const fileName = (currentMetadata.filename || 'texture').replace(/\.[^/.]+$/, "");
              h.download(fileName + '.png', blob, 'image/png');
              h.showLoading(false);
            }, 'image/png');
          }
        },
        {
          label: '🌓 Toggle Theme',
          id: 'toggle-bg',
          onClick: function (h) {
            if (!scene) return;
            const dark = 0x020617;
            const light = 0xf1f5f9;
            const current = scene.background.getHex();
            scene.background.set(current === dark ? light : dark);
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
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.137.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/loaders/KTXLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/loaders/KTX2Loader.js',
          'https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/controls/OrbitControls.js'
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
          h.showError('Empty File', 'The provided file is too small to be a valid KTX texture.');
          return;
        }

        h.showLoading('Analyzing texture header...');

        try {
          // B2: ArrayBuffer handling - slice is safe
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
          h.showError('Parsing Error', err.message || 'Could not determine KTX format version.');
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
        if (mesh.material) {
          if (mesh.material.map) mesh.material.map.dispose();
          mesh.material.dispose();
        }
        mesh = null;
      }
      if (ktx2Loader) {
        // B5: Cleanup KTX2 loader workers
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
      h.showLoading('Parsing KTX1 texture...');
      const loader = new THREE.KTXLoader();
      try {
        const texture = loader.parse(content);
        renderTexture(texture, 1, file, h);
      } catch (err) {
        h.showError('KTX1 Error', 'The KTX1 variant in this file is not supported or the file is corrupted.');
      }
    }

    function loadKTX2(content, file, h) {
      h.showLoading('Transcoding Basis Universal texture...');
      
      // KTX2Loader needs a renderer to detect supported compression formats
      const tempRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
      
      if (!ktx2Loader) {
        ktx2Loader = new THREE.KTX2Loader();
        ktx2Loader.setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.137.0/examples/js/libs/basis/');
      }
      
      ktx2Loader.detectSupport(tempRenderer);

      ktx2Loader.parse(content, function(texture) {
        renderTexture(texture, 2, file, h);
        tempRenderer.dispose();
      }, function(err) {
        h.showError('KTX2 Transcoding Failed', 'This device/browser does not support the compression format used in this KTX2 file.');
        tempRenderer.dispose();
      });
    }

    function renderTexture(texture, version, file, h) {
      cleanup();

      const width = texture.image ? (texture.image.width || 0) : 0;
      const height = texture.image ? (texture.image.height || 0) : 0;
      const mipmaps = texture.mipmaps ? texture.mipmaps.length : 1;

      currentMetadata = {
        filename: file.name,
        size: formatBytes(file.size),
        version: 'KTX' + version,
        resolution: width + ' × ' + height,
        mipmaps: mipmaps,
        format: texture.format || 'Unknown',
        encoding: texture.encoding === 3001 ? 'sRGB' : 'Linear'
      };

      // U1, U7, U10: Beautiful UI implementation
      h.render(`
        <div class="space-y-4 font-sans animate-in fade-in duration-500">
          <!-- U1: File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${esc(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${currentMetadata.size}</span>
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-md text-[10px] font-bold uppercase tracking-wider">KTX${version}</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left: Viewport -->
            <div class="lg:col-span-2 space-y-3">
              <div class="relative rounded-2xl overflow-hidden border border-surface-200 bg-slate-950 shadow-xl group">
                <div id="ktx-viewport" class="w-full h-[520px] cursor-move"></div>
                
                <!-- Instruction overlay -->
                <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 shadow-2xl flex gap-4 items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0 pointer-events-none">
                   <span class="text-[10px] font-semibold text-white/90 uppercase tracking-widest flex items-center gap-2">
                     <span class="w-2 h-2 rounded-full bg-brand-400 animate-pulse"></span>
                     Drag to Rotate • Right Click to Pan • Scroll to Zoom
                   </span>
                </div>
              </div>
              
              <div class="flex items-center justify-between px-2">
                <span class="text-[10px] text-surface-400 font-medium uppercase tracking-tighter italic">WebGL Accelerated Preview</span>
                <span class="text-[10px] text-surface-400 font-medium uppercase tracking-tighter">${width}px × ${height}px</span>
              </div>
            </div>

            <!-- Right: Metadata & Stats -->
            <div class="space-y-6">
              <section>
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-bold text-surface-800 tracking-tight">Texture Properties</h3>
                  <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full font-bold">RAW DATA</span>
                </div>
                
                <div class="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
                  <table class="min-w-full text-sm">
                    <tbody class="divide-y divide-surface-100">
                      <tr class="group hover:bg-brand-50/30 transition-colors">
                        <td class="px-4 py-3 text-surface-500 font-medium group-hover:text-brand-700">Resolution</td>
                        <td class="px-4 py-3 text-surface-900 font-mono text-right">${currentMetadata.resolution}</td>
                      </tr>
                      <tr class="group hover:bg-brand-50/30 transition-colors">
                        <td class="px-4 py-3 text-surface-500 font-medium group-hover:text-brand-700">Mipmap Levels</td>
                        <td class="px-4 py-3 text-surface-900 font-mono text-right">${currentMetadata.mipmaps}</td>
                      </tr>
                      <tr class="group hover:bg-brand-50/30 transition-colors">
                        <td class="px-4 py-3 text-surface-500 font-medium group-hover:text-brand-700">Internal Format</td>
                        <td class="px-4 py-3 text-surface-900 font-mono text-right text-xs truncate max-w-[120px]" title="${currentMetadata.format}">${currentMetadata.format}</td>
                      </tr>
                      <tr class="group hover:bg-brand-50/30 transition-colors">
                        <td class="px-4 py-3 text-surface-500 font-medium group-hover:text-brand-700">Color Space</td>
                        <td class="px-4 py-3 text-surface-900 font-mono text-right">${currentMetadata.encoding}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section class="p-5 bg-gradient-to-br from-surface-50 to-surface-100 rounded-2xl border border-surface-200 shadow-sm">
                <h4 class="text-[10px] font-black text-surface-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  Format Info
                </h4>
                <p class="text-xs text-surface-600 leading-relaxed font-medium">
                  KTX (Khronos Texture) is a container for efficient GPU texture distribution. 
                  <span class="text-brand-600">Basis Universal</span> (KTX2) uses supercompression to provide significantly smaller files that stay compressed in GPU memory.
                </p>
              </section>

              <div class="pt-2">
                <div class="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-[10px] text-amber-800 leading-tight">
                  <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                  <span>If textures appear distorted or invisible, your hardware may lack support for this specific compression format.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('ktx-viewport');
      if (!container) return;

      // Scene setup
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617); // Slate 950

      const aspect = container.clientWidth / container.clientHeight;
      camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
      camera.position.z = 1.8;

      renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true // Required for Save as PNG
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      // Texture optimization
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;

      // Plane geometry sized to texture aspect ratio
      const texAspect = width / height || 1;
      const geometry = new THREE.PlaneGeometry(
        texAspect > 1 ? 1 : texAspect, 
        texAspect > 1 ? 1 / texAspect : 1
      );
      
      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        side: THREE.DoubleSide 
      });
      
      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Controls
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = false;

      // B10: Resize handler with cleanup check
      resizeHandler = function() {
        if (!container || !renderer || !camera) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
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

  // B6: XSS Sanitization
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }
})();
