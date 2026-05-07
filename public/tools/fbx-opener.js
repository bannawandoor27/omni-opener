(function() {
  /**
   * FBX Opener Tool for OmniOpener
   * A high-performance, browser-based 3D viewer for FBX files using Three.js.
   */
  window.initTool = function(toolConfig, mountEl) {
    let renderer, scene, camera, controls, model, mixer, clock, animationId, resizeObserver;

    // Helper: Human-readable file size
    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Helper: HTML escaping for safe rendering (B6)
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Cleanup resources to prevent memory leaks (B5)
    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (resizeObserver) resizeObserver.disconnect();
      
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }

      if (scene) {
        scene.traverse(object => {
          if (object.isMesh) {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(m => m.dispose());
              } else {
                object.material.dispose();
              }
            }
          }
        });
      }

      model = null;
      mixer = null;
      scene = null;
      camera = null;
      controls = null;
      renderer = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.fbx',
      dropLabel: 'Drop an FBX model here',
      binary: true,
      
      onInit: function(helpers) {
        // Load dependencies in correct order (B1, B4)
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', () => {
          helpers.loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/lib/browser.min.js', () => {
            helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js', () => {
              helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
            });
          });
        });
      },

      onDestroy: function() {
        cleanup();
      },

      onFile: function _onFileFn(file, content, helpers) {
        // Race condition check and strict mode self-reference fix (B1, B8)
        if (!window.THREE || !THREE.FBXLoader || !THREE.OrbitControls || !window.fflate) {
          helpers.showLoading('Initializing 3D engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 300);
          return;
        }

        cleanup();
        helpers.showLoading('Parsing 3D geometry...');

        try {
          // FBXLoader handles ArrayBuffer correctly (B2)
          const loader = new THREE.FBXLoader();
          const object = loader.parse(content, '');
          
          if (!object || (object.children && object.children.length === 0 && !object.isMesh)) {
            helpers.showError('Empty Model', 'The FBX file was parsed but contains no visible 3D geometry.');
            return;
          }

          renderViewer(object, file, helpers);
        } catch (err) {
          console.error('[FBX Parser Error]', err);
          helpers.showError(
            'Could not open FBX file', 
            'The file may be corrupted, in an unsupported format version (ASCII/Binary mismatch), or uses features not supported by the browser-based loader.'
          );
        }
      },

      actions: [
        {
          label: '📋 Copy Statistics',
          id: 'copy-stats',
          onClick: function(helpers, btn) {
            if (!model) return;
            let vertices = 0;
            let polygons = 0;
            let meshes = 0;
            model.traverse(n => {
              if (n.isMesh) {
                meshes++;
                const pos = n.geometry.attributes.position;
                if (pos) {
                  vertices += pos.count;
                  polygons += n.geometry.index ? n.geometry.index.count / 3 : pos.count / 3;
                }
              }
            });
            const stats = [
              `File: ${helpers.getFile().name}`,
              `Size: ${formatSize(helpers.getFile().size)}`,
              `Meshes: ${meshes}`,
              `Vertices: ${vertices.toLocaleString()}`,
              `Polygons: ${Math.floor(polygons).toLocaleString()}`
            ].join('\n');
            helpers.copyToClipboard(stats, btn);
          }
        },
        {
          label: '📸 Take Screenshot',
          id: 'screenshot',
          onClick: function(helpers) {
            if (!renderer) return;
            // Force a render to ensure drawing buffer is fresh
            renderer.render(scene, camera);
            // Use toBlob instead of toDataURL (B10)
            renderer.domElement.toBlob(blob => {
              const fileName = helpers.getFile().name.replace(/\.[^/.]+$/, "") + "-preview.png";
              helpers.download(fileName, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ]
    });

    function renderViewer(object, file, helpers) {
      model = object;
      clock = new THREE.Clock();

      let vertices = 0;
      let polygons = 0;
      let meshes = 0;
      model.traverse(n => {
        if (n.isMesh) {
          meshes++;
          const pos = n.geometry.attributes.position;
          if (pos) {
            vertices += pos.count;
            polygons += n.geometry.index ? n.geometry.index.count / 3 : pos.count / 3;
          }
        }
      });

      // U1. File info bar + Beautiful UI Layout (U7-U10)
      helpers.render(`
        <div class="flex flex-col h-full animate-in fade-in duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">FBX Model</span>
          </div>

          <!-- Section Header (U10) -->
          <div class="flex items-center justify-between mb-3 px-1">
            <h3 class="font-semibold text-surface-800">Scene Information</h3>
            <div class="flex gap-2">
              <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${meshes} meshes</span>
              <span class="text-xs bg-surface-100 text-surface-700 px-2 py-0.5 rounded-full">${Math.floor(polygons).toLocaleString()} polys</span>
            </div>
          </div>

          <!-- Viewport Container -->
          <div class="relative flex-1 min-h-[500px] bg-slate-900 rounded-2xl overflow-hidden border border-surface-200 shadow-xl group">
            <div id="fbx-viewport" class="w-full h-full cursor-move"></div>
            
            <!-- Floating Controls -->
            <div class="absolute top-4 right-4 flex flex-col gap-2">
              <button id="btn-reset" title="Reset View" class="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-xl border border-white/20 transition-all shadow-lg text-xs font-medium flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              </button>
              <button id="btn-wireframe" title="Toggle Wireframe" class="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-xl border border-white/20 transition-all shadow-lg text-xs font-medium flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
              </button>
              <button id="btn-auto-rotate" title="Auto Rotate" class="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-xl border border-white/20 transition-all shadow-lg text-xs font-medium flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4a8 8 0 018-8v2a6 6 0 106 6h2a8 8 0 01-8 8v-2a6 6 0 10-6-6H4z"></path></svg>
              </button>
            </div>

            <!-- Bottom Stats -->
            <div class="absolute bottom-4 left-4 flex gap-3">
              <div class="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg text-[10px] text-white/70 font-mono border border-white/10">
                FPS: <span id="fps-counter">--</span>
              </div>
              <div id="anim-status" class="hidden bg-brand-500/80 backdrop-blur-sm px-3 py-1.5 rounded-lg text-[10px] text-white font-mono border border-brand-400/50">
                ANIMATING
              </div>
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('fbx-viewport');
      if (!container) return;

      // Renderer setup
      renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true // Required for screenshot functionality
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a); // slate-900

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 2000000);
      
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.autoRotate = false;
      controls.autoRotateSpeed = 2.0;

      // Professional Lighting Rig
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      
      const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
      mainLight.position.set(100, 200, 100);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0xddeeff, 0.6);
      fillLight.position.set(-100, 100, -100);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
      rimLight.position.set(0, -100, 0);
      scene.add(rimLight);

      // Add model to scene
      scene.add(model);

      // Frame the model perfectly
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = camera.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraDistance *= 1.8; // Comfortable padding

      camera.position.set(center.x + cameraDistance, center.y + cameraDistance * 0.4, center.z + cameraDistance);
      camera.lookAt(center);
      controls.target.copy(center);
      controls.update();

      // Handle Animations
      mixer = new THREE.AnimationMixer(model);
      if (model.animations && model.animations.length > 0) {
        document.getElementById('anim-status').classList.remove('hidden');
        model.animations.forEach(clip => {
          mixer.clipAction(clip).play();
        });
      }

      // UI Control Logic
      let isWireframe = false;
      const btnWireframe = document.getElementById('btn-wireframe');
      btnWireframe.addEventListener('click', () => {
        isWireframe = !isWireframe;
        model.traverse(node => {
          if (node.isMesh) {
            if (Array.isArray(node.material)) {
              node.material.forEach(m => m.wireframe = isWireframe);
            } else {
              node.material.wireframe = isWireframe;
            }
          }
        });
        btnWireframe.classList.toggle('bg-brand-500', isWireframe);
        btnWireframe.classList.toggle('bg-white/10', !isWireframe);
      });

      document.getElementById('btn-reset').addEventListener('click', () => {
        camera.position.set(center.x + cameraDistance, center.y + cameraDistance * 0.4, center.z + cameraDistance);
        camera.lookAt(center);
        controls.target.copy(center);
        controls.reset();
      });

      const btnAutoRotate = document.getElementById('btn-auto-rotate');
      btnAutoRotate.addEventListener('click', () => {
        controls.autoRotate = !controls.autoRotate;
        btnAutoRotate.classList.toggle('bg-brand-500', controls.autoRotate);
        btnAutoRotate.classList.toggle('bg-white/10', !controls.autoRotate);
      });

      // Render Loop
      let frameCount = 0;
      let lastTime = performance.now();
      const fpsEl = document.getElementById('fps-counter');
      
      function animate() {
        if (!container.isConnected) return; // Terminate loop if unmounted
        animationId = requestAnimationFrame(animate);
        
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        
        controls.update();
        renderer.render(scene, camera);

        // FPS Calculation
        frameCount++;
        const now = performance.now();
        if (now >= lastTime + 1000) {
          if (fpsEl) fpsEl.textContent = Math.round((frameCount * 1000) / (now - lastTime));
          frameCount = 0;
          lastTime = now;
        }
      }
      animate();

      // Handle Resizing (B1)
      resizeObserver = new ResizeObserver(() => {
        if (!container || !renderer) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width === 0 || height === 0) return;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      });
      resizeObserver.observe(container);
    }
  };
})();
