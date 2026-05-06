(function () {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let renderer, scene, camera, controls, animationId, mixer, clock, model;
    let resizeHandler = null;

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;

      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }

      if (controls) {
        controls.dispose();
        controls = null;
      }

      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
        renderer = null;
      }

      if (scene) {
        scene.traverse((node) => {
          if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach((m) => m.dispose());
              } else {
                node.material.dispose();
              }
            }
          }
        });
        scene = null;
      }
      
      mixer = null;
      clock = null;
      model = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.glb,.gltf',
      binary: true,
      infoHtml: 'Professional inspection tool for GLTF and GLB 3D models with mesh statistics, material explorer, and animation support.',
      
      actions: [
        {
          label: '📸 Take Screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob((blob) => {
              const name = h.getFile().name.replace(/\.[^/.]+$/, "") + "-screenshot.png";
              h.download(name, blob, 'image/png');
            }, 'image/png');
          }
        },
        {
          label: '📥 Download Model',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ],

      onInit: function (h) {
        return h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function _onFileFn(file, content, h) {
        cleanup();
        h.showLoading('Initializing 3D Engine...');

        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) {
          h.loadScripts([
            'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
            'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
            'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
          ]).then(function() { _onFileFn(file, content, h); });
          return;
        }

        h.showLoading('Parsing 3D assets...');
        const loader = new THREE.GLTFLoader();
        
        loader.parse(content, '', function (gltf) {
          model = gltf.scene;
          const animations = gltf.animations || [];
          
          let stats = {
            vertices: 0,
            triangles: 0,
            meshes: 0,
            materials: new Set()
          };

          model.traverse((node) => {
            if (node.isMesh) {
              stats.meshes++;
              if (node.geometry) {
                const geo = node.geometry;
                if (geo.attributes.position) stats.vertices += geo.attributes.position.count;
                if (geo.index) stats.triangles += geo.index.count / 3;
                else if (geo.attributes.position) stats.triangles += geo.attributes.position.count / 3;
              }
              if (node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(m => stats.materials.add(m.name || 'Unnamed Material'));
              }
            }
          });

          h.render(`
            <div class="flex flex-col gap-4">
              <!-- U1. File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-100 shadow-sm">
                <span class="font-bold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-brand-600 font-medium uppercase tracking-tight text-[11px] bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">
                  ${file.name.split('.').pop()} MODEL
                </span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <!-- Sidebar -->
                <div class="lg:col-span-3 space-y-5">
                  <!-- Stats Card -->
                  <div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                    <div class="flex items-center justify-between mb-4 border-b border-surface-50 pb-2">
                      <h3 class="font-semibold text-surface-800 text-sm">Model Data</h3>
                      <span class="text-[10px] bg-surface-100 text-surface-700 px-2 py-0.5 rounded-full font-bold uppercase">${stats.meshes} Meshes</span>
                    </div>
                    <div class="space-y-3">
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-surface-500 font-medium">Vertices</span>
                        <span class="font-mono text-surface-900 bg-surface-50 px-2 py-1 rounded">${Math.round(stats.vertices).toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-surface-500 font-medium">Triangles</span>
                        <span class="font-mono text-surface-900 bg-surface-50 px-2 py-1 rounded">${Math.round(stats.triangles).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Controls Card -->
                  <div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                    <h3 class="font-semibold text-surface-800 mb-4 text-sm border-b border-surface-50 pb-2">Viewport Settings</h3>
                    <div class="space-y-4">
                      <div class="space-y-2">
                        <div class="flex justify-between">
                          <label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Lighting</label>
                          <span id="exp-val" class="text-[10px] text-surface-500 font-mono">1.0x</span>
                        </div>
                        <input type="range" id="exp-slider" min="0" max="4" step="0.1" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                      </div>
                      <div class="flex flex-col gap-3 pt-2">
                        <label class="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" id="wire-check" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                          <span class="text-xs text-surface-600 group-hover:text-surface-900 transition-colors font-medium">Wireframe Overlay</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" id="auto-check" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                          <span class="text-xs text-surface-600 group-hover:text-surface-900 transition-colors font-medium">Auto-Rotation</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Animations -->
                  ${animations.length > 0 ? `
                    <div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                      <div class="flex items-center justify-between mb-3 border-b border-surface-50 pb-2">
                        <h3 class="font-semibold text-surface-800 text-sm">Animations</h3>
                        <span class="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">${animations.length} Clips</span>
                      </div>
                      <select id="anim-select" class="w-full text-xs bg-surface-50 border border-surface-200 rounded-lg px-2 py-2.5 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                        <option value="-1">Static (No Animation)</option>
                        ${animations.map((anim, i) => `<option value="${i}">${escapeHtml(anim.name || `Animation ${i}`)}</option>`).join('')}
                      </select>
                    </div>
                  ` : ''}

                  <!-- Materials Card -->
                  <div class="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                    <div class="flex items-center justify-between mb-3 border-b border-surface-50 pb-2">
                      <h3 class="font-semibold text-surface-800 text-sm">Materials</h3>
                      <span class="text-[10px] bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full font-bold">${stats.materials.size}</span>
                    </div>
                    <div class="mb-3">
                      <input type="text" id="mat-filter" placeholder="Search materials..." class="w-full text-xs bg-surface-50 border border-surface-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none transition-all">
                    </div>
                    <div id="mat-list" class="max-h-[140px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      ${Array.from(stats.materials).map(mat => `
                        <div class="mat-item text-[11px] px-2 py-1.5 bg-surface-50 rounded border border-surface-100 text-surface-600 truncate hover:border-brand-200 hover:text-surface-900 transition-colors" data-name="${escapeHtml(mat.toLowerCase())}" title="${escapeHtml(mat)}">
                          ${escapeHtml(mat)}
                        </div>
                      `).join('') || '<div class="text-xs text-surface-400 italic py-2 text-center">No materials found</div>'}
                    </div>
                  </div>
                </div>

                <!-- Viewport -->
                <div class="lg:col-span-9 h-[680px] bg-[#0f172a] rounded-2xl overflow-hidden border border-surface-200 shadow-2xl relative group">
                  <div id="canvas-container" class="w-full h-full cursor-grab active:cursor-grabbing"></div>
                  
                  <div class="absolute top-4 left-4 pointer-events-none">
                    <div class="bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 shadow-lg">
                      <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span class="text-[10px] text-white/80 font-mono uppercase tracking-widest">WebGL Engine</span>
                    </div>
                  </div>

                  <div class="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                    <div class="bg-black/60 backdrop-blur-2xl px-6 py-2.5 rounded-full text-[10px] text-white/90 border border-white/10 flex items-center gap-6 shadow-2xl">
                      <div class="flex items-center gap-2"><span>🖱️</span> Orbit</div>
                      <div class="w-px h-3 bg-white/20"></div>
                      <div class="flex items-center gap-2"><span>🖱️</span> Pan</div>
                      <div class="w-px h-3 bg-white/20"></div>
                      <div class="flex items-center gap-2"><span>🖱️</span> Zoom</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `);

          const container = document.getElementById('canvas-container');
          if (!container) return;

          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0f172a);

          camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 10000);
          
          renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(container.clientWidth, container.clientHeight);
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 1.0;
          renderer.outputEncoding = THREE.sRGBEncoding;
          container.appendChild(renderer.domElement);

          const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
          scene.add(ambientLight);

          const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
          dirLight1.position.set(5, 10, 7);
          scene.add(dirLight1);

          const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
          dirLight2.position.set(-5, -5, -5);
          scene.add(dirLight2);

          scene.add(model);

          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
          cameraZ *= 2.2; 

          camera.position.set(center.x, center.y + (maxDim * 0.1), center.z + cameraZ);
          camera.updateProjectionMatrix();

          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.target.copy(center);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;
          controls.update();

          if (animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            clock = new THREE.Clock();
          }

          // Controls Logic
          const wireCheck = document.getElementById('wire-check');
          const autoCheck = document.getElementById('auto-check');
          const expSlider = document.getElementById('exp-slider');
          const expVal = document.getElementById('exp-val');
          const animSelect = document.getElementById('anim-select');
          const matFilter = document.getElementById('mat-filter');

          wireCheck.onchange = (e) => {
            model.traverse(node => {
              if (node.isMesh && node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(m => m.wireframe = e.target.checked);
              }
            });
          };

          autoCheck.onchange = (e) => {
            controls.autoRotate = e.target.checked;
          };

          expSlider.oninput = (e) => {
            const val = parseFloat(e.target.value);
            renderer.toneMappingExposure = val;
            expVal.textContent = val.toFixed(1) + 'x';
          };

          if (animSelect) {
            animSelect.onchange = (e) => {
              mixer.stopAllAction();
              const idx = parseInt(e.target.value);
              if (idx >= 0) {
                mixer.clipAction(animations[idx]).play();
              }
            };
          }

          if (matFilter) {
            matFilter.oninput = (e) => {
              const query = e.target.value.toLowerCase();
              document.querySelectorAll('.mat-item').forEach(item => {
                const name = item.getAttribute('data-name');
                item.style.display = name.includes(query) ? 'block' : 'none';
              });
            };
          }

          function animate() {
            if (!document.getElementById('canvas-container')) return;
            animationId = requestAnimationFrame(animate);
            if (mixer && clock) mixer.update(clock.getDelta());
            controls.update();
            renderer.render(scene, camera);
          }
          animate();

          resizeHandler = function () {
            if (!container || !renderer || !camera) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
          };
          window.addEventListener('resize', resizeHandler);

        }, undefined, function (error) {
          h.showError('Rendering Error', 'Could not parse the 3D model. The file may be corrupt or in an unsupported GLTF version.');
          console.error(error);
        });
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
