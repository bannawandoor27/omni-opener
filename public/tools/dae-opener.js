/**
 * OmniOpener — DAE (Collada) 3D Viewer
 * Professional 3D visualization and conversion for Collada models.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let currentRenderer = null;
    let currentScene = null;
    let currentRequestRef = null;
    let resizeObserver = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.dae',
      binary: false,
      infoHtml: '<strong>DAE Viewer:</strong> Professional Collada 3D viewer with mesh analysis, environment presets, and STL export. Everything runs 100% locally.',

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/ColladaLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/exporters/STLExporter.js'
        ]);
      },

      onDestroy: function () {
        if (currentRequestRef) cancelAnimationFrame(currentRequestRef);
        if (resizeObserver) resizeObserver.disconnect();
        if (currentRenderer) {
          currentRenderer.dispose();
          if (currentRenderer.domElement && currentRenderer.domElement.parentNode) {
            currentRenderer.domElement.remove();
          }
        }
        if (currentScene) {
          currentScene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(m => m.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
        }
      },

      onFile: function _onFileFn(file, content, h) {
        if (typeof THREE === 'undefined' || typeof THREE.ColladaLoader === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
          h.showLoading('Initializing 3D engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Parsing Collada model...');
        
        setTimeout(function() {
          try {
            const loader = new THREE.ColladaLoader();
            const collada = loader.parse(content);
            if (!collada || !collada.scene) {
              throw new Error('No scene found in Collada file');
            }
            renderViewer(collada.scene, file, h);
          } catch (err) {
            console.error('[DAE Opener] Parse Error:', err);
            h.showError('Could not open DAE file', err.message || 'The file may be corrupted or in an unsupported Collada version.');
          }
        }, 50);
      },

      actions: [
        {
          label: '📋 Copy XML',
          id: 'copy-xml',
          onClick: function (h, btn) {
            const content = h.getContent();
            if (content) h.copyToClipboard(content, btn);
          }
        },
        {
          label: '📥 Export STL',
          id: 'export-stl',
          onClick: function (h, btn) {
            if (typeof THREE.STLExporter === 'undefined') {
              h.showError('Exporter not loaded yet');
              return;
            }
            const state = h.getState();
            if (state.sceneObject) {
              const exporter = new THREE.STLExporter();
              const result = exporter.parse(state.sceneObject, { binary: true });
              h.download(h.getFile().name.replace('.dae', '.stl'), result, 'application/octet-stream');
            } else {
              h.showError('No scene available to export');
            }
          }
        }
      ]
    });

    function renderViewer(sceneObject, file, h) {
      // 1. Scene Analysis
      let meshCount = 0;
      let vertexCount = 0;
      sceneObject.traverse(n => { 
        if (n.isMesh) {
          meshCount++;
          if (n.geometry.attributes.position) {
            vertexCount += n.geometry.attributes.position.count;
          }
        }
      });

      const box = new THREE.Box3().setFromObject(sceneObject);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      h.setState({ sceneObject: sceneObject });

      // 2. UI Layout
      h.render(`
        <div class="flex flex-col h-[85vh] animate-in fade-in duration-500">
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <div class="ml-auto flex items-center gap-2">
               <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">${meshCount} Meshes</span>
               <span class="px-2 py-0.5 bg-surface-200 text-surface-700 rounded-full text-xs font-medium">${vertexCount.toLocaleString()} Vertices</span>
            </div>
          </div>

          <div class="relative flex-1 bg-surface-950 rounded-2xl overflow-hidden border border-surface-200 group shadow-lg">
            <div id="dae-canvas-container" class="w-full h-full cursor-move"></div>
            
            <!-- Info Panel -->
            <div class="absolute top-4 left-4 w-60 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 space-y-4 opacity-90 hover:opacity-100 transition-opacity">
               <div>
                  <h3 class="font-semibold text-surface-800 text-xs uppercase tracking-wider mb-2">Dimensions</h3>
                  <div class="grid grid-cols-3 gap-2 text-[11px]">
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100 text-center">
                      <div class="text-surface-400">X</div>
                      <div class="font-mono font-bold text-surface-800">${size.x.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100 text-center">
                      <div class="text-surface-400">Y</div>
                      <div class="font-mono font-bold text-surface-800">${size.y.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100 text-center">
                      <div class="text-surface-400">Z</div>
                      <div class="font-mono font-bold text-surface-800">${size.z.toFixed(2)}</div>
                    </div>
                  </div>
               </div>
               <div class="pt-2">
                 <button id="dae-reset" class="w-full py-2 bg-surface-100 text-surface-700 text-[10px] font-bold rounded-lg hover:bg-surface-200 transition-colors border border-surface-200 uppercase tracking-wider">Reset Camera</button>
               </div>
            </div>

            <!-- Settings Panel -->
            <div class="absolute top-4 right-4 w-48 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 space-y-4 opacity-90 hover:opacity-100 transition-opacity">
               <div class="space-y-3">
                  <h3 class="font-semibold text-surface-800 text-xs uppercase tracking-wider">Environment</h3>
                  <select id="dae-env" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none cursor-pointer">
                     <option value="dark">Space Dark</option>
                     <option value="studio">Studio Light</option>
                     <option value="sunset">Sunset Glow</option>
                  </select>
                  
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-600">Wireframe</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="dae-wireframe" class="sr-only peer">
                      <div class="w-8 h-4 bg-surface-200 rounded-full peer peer-checked:bg-brand-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full"></div>
                    </label>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-600">Auto-Rotate</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="dae-rotate" class="sr-only peer">
                      <div class="w-8 h-4 bg-surface-200 rounded-full peer peer-checked:bg-brand-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full"></div>
                    </label>
                  </div>
               </div>
               <button id="dae-snap" class="w-full py-2 bg-brand-600 text-white text-[10px] font-bold rounded-lg hover:bg-brand-700 transition-shadow shadow-md shadow-brand-500/10 uppercase">Snapshot</button>
            </div>

            <!-- Interaction Hint -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur text-white/90 text-[10px] rounded-full pointer-events-none uppercase tracking-widest font-medium border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              Left: Rotate • Right: Pan • Scroll: Zoom
            </div>
          </div>
        </div>
      `);

      // 3. Three.js Initialization
      const container = document.getElementById('dae-canvas-container');
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      currentRenderer = renderer;
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      currentScene = scene;
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
      mainLight.position.set(10, 10, 10);
      scene.add(mainLight);
      const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
      backLight.position.set(-10, -5, -10);
      scene.add(backLight);

      // Environment Presets
      const envs = {
        dark: { bg: 0x0f172a, light: 1.0 },
        studio: { bg: 0xf1f5f9, light: 1.5 },
        sunset: { bg: 0x451a03, light: 1.8 }
      };
      scene.background = new THREE.Color(envs.dark.bg);

      // Add Model
      sceneObject.position.sub(center);
      scene.add(sceneObject);

      // Camera Setup
      const maxDim = Math.max(size.x, size.y, size.z) || 10;
      const dist = maxDim * 2.5;
      camera.position.set(dist, dist * 0.7, dist);
      camera.lookAt(0, 0, 0);

      // 4. Interaction Handlers
      document.getElementById('dae-env').onchange = (e) => {
        const p = envs[e.target.value];
        scene.background.setHex(p.bg);
        mainLight.intensity = p.light;
      };
      document.getElementById('dae-wireframe').onchange = (e) => {
        sceneObject.traverse(n => { if (n.isMesh) n.material.wireframe = e.target.checked; });
      };
      document.getElementById('dae-rotate').onchange = (e) => { controls.autoRotate = e.target.checked; };
      document.getElementById('dae-reset').onclick = () => {
        camera.position.set(dist, dist * 0.7, dist);
        controls.reset();
      };
      document.getElementById('dae-snap').onclick = () => {
        renderer.render(scene, camera);
        renderer.domElement.toBlob((blob) => {
          h.download(file.name.replace('.dae', '_snapshot.png'), blob, 'image/png');
        });
      };

      // Resize Logic
      resizeObserver = new ResizeObserver(() => {
        if (!container.clientWidth || !container.clientHeight) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);

      // Animation Loop
      const animate = () => {
        if (!container.isConnected) return;
        currentRequestRef = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    }
  };
})();
