(function () {
  'use strict';

  /**
   * OmniOpener — STL 3D Production Toolkit
   * A high-performance, professional-grade STL viewer and analyzer.
   */

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
      accept: '.stl',
      binary: true,
      infoHtml: '<strong>STL Toolkit:</strong> Professional 3D analysis and visualization. View geometry, calculate volume, and export snapshots.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/STLLoader.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
          });
        });
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
        if (typeof THREE === 'undefined' || typeof THREE.STLLoader === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
          h.showLoading('Initializing 3D engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 300);
          return;
        }

        if (!content || (content instanceof ArrayBuffer && content.byteLength === 0)) {
          h.showError('Empty File', 'The STL file appears to be empty.');
          return;
        }

        h.showLoading('Parsing 3D geometry...');
        
        // Small delay to ensure the loading UI is visible
        setTimeout(function() {
          try {
            const loader = new THREE.STLLoader();
            const geometry = loader.parse(content);
            
            if (!geometry || !geometry.attributes.position || geometry.attributes.position.count === 0) {
              throw new Error('Invalid or empty geometry');
            }

            renderViewer(geometry, file, content, h);
          } catch (err) {
            console.error('[STL Opener] Parse Error:', err);
            h.showError('Could not open STL file', 'The file may be corrupted or in an unsupported format. Try a different STL model.');
          }
        }, 50);
      }
    });

    function renderViewer(geometry, file, content, h) {
      // 1. Calculations & Analysis
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      const triangleCount = geometry.attributes.position.count / 3;
      
      // Volume calculation (signed volume of tetrahedra)
      let volume = 0;
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 9) {
        const x1 = pos[i], y1 = pos[i+1], z1 = pos[i+2];
        const x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5];
        const x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
        volume += (-x3 * y2 * z1 + x2 * y3 * z1 + x3 * y1 * z2 - x1 * y3 * z2 - x2 * y1 * z3 + x1 * y2 * z3) / 6;
      }
      const absVolume = Math.abs(volume);
      const surfaceArea = calculateSurfaceArea(geometry);

      // 2. Main UI Layout
      h.render(`
        <div class="flex flex-col h-[85vh] animate-in fade-in duration-500">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.stl file</span>
            <div class="ml-auto flex items-center gap-2">
               <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">${triangleCount.toLocaleString()} Triangles</span>
            </div>
          </div>

          <!-- 3D Container -->
          <div class="relative flex-1 bg-surface-950 rounded-2xl overflow-hidden border border-surface-200 group shadow-lg">
            <div id="stl-canvas-container" class="w-full h-full cursor-move"></div>
            
            <!-- Analysis Panel (U10 pattern) -->
            <div class="absolute top-4 left-4 w-64 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 space-y-4 opacity-90 hover:opacity-100 transition-opacity">
               <div>
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="font-semibold text-surface-800 text-xs uppercase tracking-wider">Dimensions</h3>
                  </div>
                  <div class="grid grid-cols-3 gap-2 text-[11px]">
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400">X</div>
                      <div class="font-mono font-bold text-surface-800">${size.x.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400">Y</div>
                      <div class="font-mono font-bold text-surface-800">${size.y.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400">Z</div>
                      <div class="font-mono font-bold text-surface-800">${size.z.toFixed(2)}</div>
                    </div>
                  </div>
               </div>

               <div>
                  <h3 class="font-semibold text-surface-800 text-xs uppercase tracking-wider mb-2">Physical Properties</h3>
                  <div class="space-y-1.5">
                    <div class="flex justify-between text-[11px] p-2 bg-surface-50 rounded-lg border border-surface-100">
                      <span class="text-surface-500">Volume</span>
                      <span class="font-mono font-bold text-brand-600">${absVolume.toLocaleString(undefined, {maximumFractionDigits: 2})} units³</span>
                    </div>
                    <div class="flex justify-between text-[11px] p-2 bg-surface-50 rounded-lg border border-surface-100">
                      <span class="text-surface-500">Surface Area</span>
                      <span class="font-mono font-bold text-surface-800">${surfaceArea.toLocaleString(undefined, {maximumFractionDigits: 2})} units²</span>
                    </div>
                  </div>
               </div>
            </div>

            <!-- Settings Panel -->
            <div class="absolute top-4 right-4 w-52 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 space-y-4 opacity-90 hover:opacity-100 transition-opacity">
               <div class="space-y-3">
                  <h3 class="font-semibold text-surface-800 text-xs uppercase tracking-wider">Visualization</h3>
                  <select id="stl-theme" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none focus:ring-2 ring-brand-500/20 cursor-pointer">
                     <option value="studio">Studio White</option>
                     <option value="blueprint">Blueprint Dark</option>
                     <option value="clay">Terracotta Clay</option>
                     <option value="chrome">Polished Chrome</option>
                     <option value="wireframe">Technical Wireframe</option>
                  </select>
                  
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-600">Auto-Rotate</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="stl-rotate" class="sr-only peer">
                      <div class="w-8 h-4 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-600">Show Grid</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="stl-grid" class="sr-only peer" checked>
                      <div class="w-8 h-4 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>
               </div>

               <div class="pt-2 grid grid-cols-2 gap-2">
                 <button id="stl-reset" class="py-2 bg-surface-100 text-surface-700 text-[10px] font-bold rounded-lg hover:bg-surface-200 transition-colors border border-surface-200 uppercase tracking-tighter">Reset View</button>
                 <button id="stl-snap" class="py-2 bg-brand-600 text-white text-[10px] font-bold rounded-lg hover:bg-brand-700 transition-shadow shadow-md shadow-brand-500/10 uppercase tracking-tighter">Snapshot</button>
               </div>
            </div>

            <!-- Tooltip/Hint -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 backdrop-blur text-white/90 text-[10px] rounded-full pointer-events-none uppercase tracking-widest font-medium border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              Rotate: Left Click • Pan: Right Click • Zoom: Scroll
            </div>
          </div>
        </div>
      `);

      // 3. Initialize Three.js Engine
      const container = document.getElementById('stl-canvas-container');
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true 
      });
      currentRenderer = renderer;
      
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      currentScene = scene;
      
      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      
      const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
      mainLight.position.set(1, 1, 1);
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
      fillLight.position.set(-1, -0.5, -1);
      scene.add(fillLight);

      // Materials Configuration
      const themes = {
        studio: { 
          bg: 0xf1f5f9, 
          color: 0x94a3b8, 
          emissive: 0x000000, 
          roughness: 0.5, 
          metalness: 0.1, 
          wireframe: false,
          grid: 0xcbd5e1
        },
        blueprint: { 
          bg: 0x0f172a, 
          color: 0x38bdf8, 
          emissive: 0x075985, 
          roughness: 0.3, 
          metalness: 0.2, 
          wireframe: false,
          grid: 0x1e293b
        },
        clay: { 
          bg: 0x27272a, 
          color: 0xd97706, 
          emissive: 0x000000, 
          roughness: 1.0, 
          metalness: 0.0, 
          wireframe: false,
          grid: 0x3f3f46
        },
        chrome: { 
          bg: 0x09090b, 
          color: 0xffffff, 
          emissive: 0x000000, 
          roughness: 0.05, 
          metalness: 0.9, 
          wireframe: false,
          grid: 0x27272a
        },
        wireframe: { 
          bg: 0x020617, 
          color: 0x10b981, 
          emissive: 0x000000, 
          roughness: 0.5, 
          metalness: 0.1, 
          wireframe: true,
          grid: 0x0f172a
        }
      };

      const initialTheme = themes.studio;
      scene.background = new THREE.Color(initialTheme.bg);

      const meshMaterial = new THREE.MeshStandardMaterial({
        color: initialTheme.color,
        emissive: initialTheme.emissive,
        roughness: initialTheme.roughness,
        metalness: initialTheme.metalness,
        wireframe: initialTheme.wireframe,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, meshMaterial);
      mesh.position.sub(center);
      scene.add(mesh);

      // Grid Helper
      const maxDim = Math.max(size.x, size.y, size.z) || 10;
      const gridSize = Math.ceil(maxDim * 2 / 10) * 10;
      const gridHelper = new THREE.GridHelper(gridSize, 20, initialTheme.grid, initialTheme.grid);
      gridHelper.position.y = -size.y / 2;
      scene.add(gridHelper);

      // Camera Setups
      const dist = maxDim * 2.2;
      camera.position.set(dist, dist * 0.8, dist);
      camera.lookAt(0, 0, 0);

      // 4. Interaction Logic
      const themeSelect = document.getElementById('stl-theme');
      const rotateCheck = document.getElementById('stl-rotate');
      const gridCheck = document.getElementById('stl-grid');
      const resetBtn = document.getElementById('stl-reset');
      const snapBtn = document.getElementById('stl-snap');

      themeSelect.onchange = (e) => {
        const t = themes[e.target.value];
        scene.background.setHex(t.bg);
        meshMaterial.color.setHex(t.color);
        meshMaterial.emissive.setHex(t.emissive);
        meshMaterial.roughness = t.roughness;
        meshMaterial.metalness = t.metalness;
        meshMaterial.wireframe = t.wireframe;
        gridHelper.material.color.setHex(t.grid);
      };

      rotateCheck.onchange = (e) => {
        controls.autoRotate = e.target.checked;
      };

      gridCheck.onchange = (e) => {
        gridHelper.visible = e.target.checked;
      };

      resetBtn.onclick = () => {
        camera.position.set(dist, dist * 0.8, dist);
        controls.reset();
      };

      snapBtn.onclick = () => {
        try {
          renderer.render(scene, camera);
          renderer.domElement.toBlob((blob) => {
            const name = file.name.replace(/\.[^/.]+$/, "") + "_preview.png";
            h.download(name, blob, 'image/png');
          }, 'image/png');
        } catch (err) {
          console.error('[STL Opener] Snapshot Error:', err);
          h.showError('Snapshot failed', 'Could not generate a preview image.');
        }
      };

      // Resize Handling
      resizeObserver = new ResizeObserver(() => {
        if (!container.clientWidth || !container.clientHeight) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);

      // 5. Animation Loop
      const animate = () => {
        if (!container.isConnected) return;
        currentRequestRef = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    }

    function calculateSurfaceArea(geometry) {
      let area = 0;
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 9) {
        const v1 = new THREE.Vector3(pos[i], pos[i+1], pos[i+2]);
        const v2 = new THREE.Vector3(pos[i+3], pos[i+4], pos[i+5]);
        const v3 = new THREE.Vector3(pos[i+6], pos[i+7], pos[i+8]);
        
        const edge1 = new THREE.Vector3().subVectors(v2, v1);
        const edge2 = new THREE.Vector3().subVectors(v3, v1);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        area += cross.length() / 2;
      }
      return area;
    }
  };
})();
