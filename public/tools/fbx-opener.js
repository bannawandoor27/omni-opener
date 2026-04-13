(function() {
  window.initTool = function(toolConfig, mountEl) {
    let renderer, scene, camera, controls, model, mixer, clock, animationId;

    function formatSize(b) {
      return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
    }

    function escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.fbx',
      dropLabel: 'Drop a .fbx file here',
      binary: true,
      onInit: function(helpers) {
        // Core Three.js as requested
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.min.js', () => {
          // fflate is required for many binary FBX files (compression)
          helpers.loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/lib/browser.min.js', () => {
            // Load FBXLoader and OrbitControls from a compatible UMD source
            helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/FBXLoader.js', () => {
              helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
            });
          });
        });
      },
      onFile: function(file, content, helpers) {
        if (!window.THREE || !THREE.FBXLoader || !THREE.OrbitControls) {
          helpers.showLoading('Initializing 3D engine...');
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }

        helpers.showLoading('Parsing FBX model...');
        
        try {
          const loader = new THREE.FBXLoader();
          // FBXLoader.parse handles both Binary and ASCII FBX from an ArrayBuffer
          const object = loader.parse(content, '');
          renderViewer(object, file, helpers);
        } catch (e) {
          console.error('[FBX Error]', e);
          helpers.showError('Could not parse FBX file', e.message || 'The file might be corrupted, or uses an incompatible FBX version.');
        }
      },
      actions: [
        { 
          label: '📋 Copy Stats', 
          id: 'copy-stats', 
          onClick: function(helpers, btn) {
            if (!model) return;
            let vertices = 0;
            let meshes = 0;
            model.traverse(n => {
              if (n.isMesh) {
                meshes++;
                vertices += n.geometry.attributes.position.count;
              }
            });
            const stats = `File: ${helpers.getFile().name}\nMeshes: ${meshes}\nVertices: ${vertices.toLocaleString()}\nSize: ${formatSize(helpers.getFile().size)}`;
            helpers.copyToClipboard(stats, btn);
          } 
        },
        { 
          label: '📥 Download', 
          id: 'dl', 
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          } 
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your FBX files are processed entirely in your browser and never leave your device.'
    });

    function renderViewer(object, file, helpers) {
      // Cleanup previous instance
      if (animationId) cancelAnimationFrame(animationId);
      if (renderer) {
        renderer.dispose();
        const oldCanvas = renderer.domElement;
        if (oldCanvas && oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
      }

      model = object;
      clock = new THREE.Clock();

      let vertices = 0;
      model.traverse(n => {
        if (n.isMesh) {
          vertices += n.geometry.attributes.position.count;
        }
      });

      helpers.render(`
        <div class="flex flex-col h-[75vh] w-full font-sans">
          <!-- File Info Bar -->
          <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4 border border-surface-100">
            <span class="font-bold text-surface-900 truncate max-w-[300px]">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">·</span>
            <span>${formatSize(file.size)}</span>
            <span class="text-surface-300">·</span>
            <span class="bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-full text-xs font-semibold">
              ${vertices.toLocaleString()} vertices
            </span>
          </div>
          
          <!-- Viewport -->
          <div class="relative flex-1 bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-surface-200 group">
            <div id="fbx-canvas-container" class="w-full h-full cursor-move"></div>
            
            <!-- Viewport Controls -->
            <div class="absolute bottom-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <button id="toggle-wireframe" class="px-4 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur text-white text-[11px] font-bold uppercase tracking-wider rounded-xl border border-slate-700 transition-all shadow-lg min-w-[140px]">
                Wireframe: Off
              </button>
              <button id="toggle-auto-rotate" class="px-4 py-2 bg-slate-900/90 hover:bg-slate-800 backdrop-blur text-white text-[11px] font-bold uppercase tracking-wider rounded-xl border border-slate-700 transition-all shadow-lg min-w-[140px]">
                Auto-Rotate: Off
              </button>
              <button id="reset-view" class="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all shadow-lg min-w-[140px]">
                Reset View
              </button>
            </div>
            
            <!-- Attribution/Logo if any -->
            <div class="absolute bottom-6 left-6 text-[10px] text-slate-500 font-mono pointer-events-none">
              RENDER: WEBGL 2.0
            </div>
          </div>
        </div>
      `);

      const container = document.getElementById('fbx-canvas-container');
      if (!container) return;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617); // Deep slate background

      camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100000);
      
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Professional Lighting Setup
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
      keyLight.position.set(1, 1, 2);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
      fillLight.position.set(-1, 0.5, -1);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
      rimLight.position.set(0, -1, 0);
      scene.add(rimLight);

      // Scene content
      scene.add(model);

      // Animation Setup
      mixer = new THREE.AnimationMixer(model);
      if (model.animations && model.animations.length > 0) {
        const action = mixer.clipAction(model.animations[0]);
        action.play();
      }

      // Auto-fit Camera
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 2.5; // Padding factor

      camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
      camera.lookAt(center);
      controls.target.copy(center);
      camera.updateProjectionMatrix();

      // Viewport Control Logic
      let wireframe = false;
      const wfBtn = document.getElementById('toggle-wireframe');
      wfBtn.onclick = () => {
        wireframe = !wireframe;
        model.traverse(n => {
          if (n.isMesh) {
            if (Array.isArray(n.material)) {
              n.material.forEach(m => m.wireframe = wireframe);
            } else {
              n.material.wireframe = wireframe;
            }
          }
        });
        wfBtn.textContent = `Wireframe: ${wireframe ? 'On' : 'Off'}`;
        wfBtn.classList.toggle('bg-brand-600', wireframe);
      };

      let autoRotate = false;
      const arBtn = document.getElementById('toggle-auto-rotate');
      arBtn.onclick = () => {
        autoRotate = !autoRotate;
        controls.autoRotate = autoRotate;
        arBtn.textContent = `Auto-Rotate: ${autoRotate ? 'On' : 'Off'}`;
        arBtn.classList.toggle('bg-brand-600', autoRotate);
      };

      document.getElementById('reset-view').onclick = () => {
        camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
        camera.lookAt(center);
        controls.target.copy(center);
        controls.reset();
      };

      // Main Animation Loop
      function animate() {
        if (!container.isConnected) return; // Stop loop if unmounted
        animationId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // Responsive Resizing
      const resizeObserver = new ResizeObserver(() => {
        if (!container || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);
    }
  };
})();
