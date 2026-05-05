(function() {
  window.initTool = function(toolConfig, mountEl) {
    let renderer, scene, camera, controls, model, mixer, clock, animationId, resizeObserver;

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

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
        if (!window.THREE || !THREE.FBXLoader || !THREE.OrbitControls || !window.fflate) {
          helpers.showLoading('Preparing 3D engine...');
          setTimeout(function() { _onFileFn(file, content, helpers); }, 300);
          return;
        }

        cleanup();
        helpers.showLoading('Parsing FBX model...');

        try {
          const loader = new THREE.FBXLoader();
          const object = loader.parse(content, '');
          
          if (!object || (object.children && object.children.length === 0 && !object.isMesh)) {
            helpers.showError('Empty Model', 'The FBX file was parsed but contains no visible 3D geometry.');
            return;
          }

          renderViewer(object, file, helpers);
        } catch (err) {
          console.error('[FBX Error]', err);
          helpers.showError('Could not open FBX file', 'The file may be corrupted, in an unsupported format version, or uses features not supported by the browser-based loader.');
        }
      },
      actions: [
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function(helpers, btn) {
            if (!model) return;
            let vertices = 0;
            let faces = 0;
            let meshes = 0;
            model.traverse(n => {
              if (n.isMesh) {
                meshes++;
                vertices += n.geometry.attributes.position.count;
                faces += n.geometry.index ? n.geometry.index.count / 3 : n.geometry.attributes.position.count / 3;
              }
            });
            const stats = `Model: ${helpers.getFile().name}\nMeshes: ${meshes}\nVertices: ${vertices.toLocaleString()}\nPolygons: ${Math.floor(faces).toLocaleString()}\nSize: ${formatSize(helpers.getFile().size)}`;
            helpers.copyToClipboard(stats, btn);
          }
        },
        {
          label: '📸 Take Screenshot',
          id: 'screenshot',
          onClick: function(helpers) {
            if (!renderer) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(blob => {
              const name = helpers.getFile().name.replace(/\.[^/.]+$/, "") + "-preview.png";
              helpers.download(name, blob, 'image/png');
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
      let meshes = 0;
      model.traverse(n => {
        if (n.isMesh) {
          meshes++;
          vertices += n.geometry.attributes.position.count;
        }
      });

      helpers.render(`
        <div class="flex flex-col h-full animate-in fade-in duration-500">
          <!-- U1. File info bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${meshes} meshes · ${vertices.toLocaleString()} vertices</span>
          </div>

          <!-- Viewport Container -->
          <div class="relative flex-1 min-h-[500px] bg-slate-900 rounded-2xl overflow-hidden border border-surface-200 shadow-inner group">
            <div id="fbx-viewport" class="w-full h-full cursor-move"></div>
            
            <!-- Floating Controls -->
            <div class="absolute top-4 right-4 flex flex-col gap-2">
              <button id="btn-reset" class="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-lg border border-white/20 transition-all shadow-lg text-xs font-medium flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Reset View
              </button>
              <button id="btn-wireframe" class="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-lg border border-white/20 transition-all shadow-lg text-xs font-medium flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>
                Wireframe
              </button>
            </div>

            <!-- Bottom Stats -->
            <div class="absolute bottom-4 left-4 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg text-[10px] text-white/70 font-mono pointer-events-none border border-white/10">
              WebGL 2.0 • FPS: <span id="fps-counter">60</span>
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('fbx-viewport');
      if (!container) return;

      // Renderer setup
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a); // slate-900

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000000);
      
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
      mainLight.position.set(10, 20, 10);
      mainLight.castShadow = true;
      scene.add(mainLight);

      const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
      backLight.position.set(-10, 5, -10);
      scene.add(backLight);

      // Add model
      scene.add(model);

      // Auto-center and Scale
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 2.2; // Zoom out factor

      camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.5, center.z + cameraZ);
      camera.lookAt(center);
      controls.target.copy(center);
      controls.update();

      // Animations
      mixer = new THREE.AnimationMixer(model);
      if (model.animations && model.animations.length > 0) {
        model.animations.forEach(clip => mixer.clipAction(clip).play());
      }

      // Interaction
      let isWireframe = false;
      document.getElementById('btn-wireframe').onclick = () => {
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
      };

      document.getElementById('btn-reset').onclick = () => {
        camera.position.set(center.x + cameraZ, center.y + cameraZ * 0.5, center.z + cameraZ);
        camera.lookAt(center);
        controls.target.copy(center);
        controls.reset();
      };

      // Loop
      let lastTime = 0;
      const fpsEl = document.getElementById('fps-counter');
      
      function animate(time) {
        if (!container.isConnected) return;
        animationId = requestAnimationFrame(animate);
        
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        
        controls.update();
        renderer.render(scene, camera);

        if (time - lastTime > 500) {
          if (fpsEl) fpsEl.textContent = Math.round(1 / delta);
          lastTime = time;
        }
      }
      animate(0);

      // Resize handling
      resizeObserver = new ResizeObserver(() => {
        if (!container || !renderer) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      });
      resizeObserver.observe(container);
    }
  };
})();
