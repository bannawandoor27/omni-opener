(function () {
  'use strict';

  /**
   * OmniOpener — STL 3D Production Toolkit
   * A professional-grade STL viewer and geometry analyzer.
   */

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
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
    let renderer = null;
    let scene = null;
    let camera = null;
    let controls = null;
    let animationId = null;
    let resizeObserver = null;
    let currentMesh = null;
    let gridHelper = null;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.stl',
      binary: true,
      infoHtml: '<strong>STL Toolkit:</strong> Professional 3D analysis and visualization. View geometry, calculate physical properties, and export snapshots.',

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/loaders/STLLoader.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/controls/OrbitControls.js');
          });
        });
      },

      onDestroy: function () {
        if (animationId) cancelAnimationFrame(animationId);
        if (resizeObserver) resizeObserver.disconnect();
        
        if (renderer) {
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.remove();
          }
        }
        
        if (scene) {
          scene.traverse((object) => {
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
        // B1. Race conditions & B4. Load order check
        if (typeof THREE === 'undefined' || !THREE.STLLoader || !THREE.OrbitControls) {
          h.showLoading('Initializing 3D engine...');
          setTimeout(function () { _onFileFn(file, content, h); }, 300);
          return;
        }

        // B2. ArrayBuffer misuse & U5. Empty state
        if (!content || (content instanceof ArrayBuffer && content.byteLength === 0)) {
          h.showError('Empty File', 'The STL file contains no data.');
          return;
        }

        // U6. Loading state
        h.showLoading('Parsing 3D geometry...');
        
        setTimeout(function() {
          try {
            const loader = new THREE.STLLoader();
            const geometry = loader.parse(content);
            
            if (!geometry || !geometry.attributes.position || geometry.attributes.position.count === 0) {
              throw new Error('Invalid geometry');
            }

            renderSTL(geometry, file, h);
          } catch (err) {
            console.error('[STL] Parse error:', err);
            h.showError('Could not open STL file', 'The file may be corrupted or in an unsupported format.');
          }
        }, 50);
      }
    });

    function renderSTL(geometry, file, h) {
      // 1. Calculations
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
      
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      const triangleCount = geometry.attributes.position.count / 3;
      
      const volume = calculateVolume(geometry);
      const surfaceArea = calculateSurfaceArea(geometry);

      // 2. UI Layout (U1, U7-U10 patterns)
      h.render(`
        <div class="flex flex-col h-[85vh] animate-in fade-in duration-500">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">.stl 3D model</span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 overflow-hidden">
            <!-- Sidebar / Stats (U10 pattern) -->
            <div class="lg:col-span-1 flex flex-col gap-4 overflow-y-auto pr-2">
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <div class="flex items-center justify-between mb-3">
                  <h3 class="font-semibold text-surface-800">Geometry</h3>
                  <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${triangleCount.toLocaleString()} faces</span>
                </div>
                <div class="space-y-3">
                  <div class="p-2 bg-surface-50 rounded-lg border border-surface-100">
                    <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider">Dimensions (X, Y, Z)</div>
                    <div class="font-mono text-sm text-surface-800 mt-1">
                      ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}
                    </div>
                  </div>
                  <div class="p-2 bg-surface-50 rounded-lg border border-surface-100">
                    <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider">Estimated Volume</div>
                    <div class="font-mono text-sm text-brand-600 font-bold mt-1">
                      ${Math.abs(volume).toLocaleString(undefined, {maximumFractionDigits: 2})} units³
                    </div>
                  </div>
                  <div class="p-2 bg-surface-50 rounded-lg border border-surface-100">
                    <div class="text-[10px] text-surface-400 uppercase font-bold tracking-wider">Surface Area</div>
                    <div class="font-mono text-sm text-surface-800 mt-1">
                      ${surfaceArea.toLocaleString(undefined, {maximumFractionDigits: 2})} units²
                    </div>
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <h3 class="font-semibold text-surface-800 mb-3 text-sm">Display Settings</h3>
                <div class="space-y-3">
                  <div>
                    <label class="text-[11px] text-surface-500 block mb-1">Theme</label>
                    <select id="stl-theme" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none focus:ring-2 ring-brand-500/20">
                       <option value="studio">Professional Studio</option>
                       <option value="blueprint">Technical Blueprint</option>
                       <option value="clay">Matte Clay</option>
                       <option value="gold">Polished Gold</option>
                       <option value="wireframe">Wireframe Mode</option>
                    </select>
                  </div>
                  
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-600">Auto-Rotation</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="stl-rotate" class="sr-only peer">
                      <div class="w-7 h-4 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-600">Show Ground Grid</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="stl-grid" class="sr-only peer" checked>
                      <div class="w-7 h-4 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div class="mt-auto grid grid-cols-2 gap-2">
                <button id="stl-reset" class="px-3 py-2 bg-surface-100 text-surface-700 text-xs font-semibold rounded-lg hover:bg-surface-200 transition-colors border border-surface-200">Reset View</button>
                <button id="stl-snap" class="px-3 py-2 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition-all shadow-sm">Snapshot</button>
              </div>
            </div>

            <!-- 3D Canvas -->
            <div class="lg:col-span-3 relative bg-surface-950 rounded-2xl overflow-hidden border border-surface-300 shadow-inner group">
              <div id="stl-canvas-mount" class="w-full h-full cursor-grab active:cursor-grabbing"></div>
              
              <!-- Interaction Hint -->
              <div class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/40 backdrop-blur-md text-white/80 text-[10px] rounded-full pointer-events-none uppercase tracking-widest font-medium border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                Left: Rotate • Right: Pan • Scroll: Zoom
              </div>
            </div>
          </div>
        </div>
      `);

      // 3. Initialize Engine
      const container = document.getElementById('stl-canvas-mount');
      renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true, 
        preserveDrawingBuffer: true 
      });
      
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      container.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 10000);
      
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      const lights = setupLighting(scene);
      const themes = getThemes();
      const initialTheme = themes.studio;
      
      scene.background = new THREE.Color(initialTheme.bg);

      const material = new THREE.MeshStandardMaterial({
        color: initialTheme.color,
        emissive: initialTheme.emissive,
        roughness: initialTheme.roughness,
        metalness: initialTheme.metalness,
        wireframe: initialTheme.wireframe,
        side: THREE.DoubleSide
      });

      currentMesh = new THREE.Mesh(geometry, material);
      currentMesh.position.sub(center);
      currentMesh.castShadow = true;
      currentMesh.receiveShadow = true;
      scene.add(currentMesh);

      // Ground Grid
      const maxDim = Math.max(size.x, size.y, size.z) || 10;
      const gridSize = Math.ceil(maxDim * 2.5 / 10) * 10;
      gridHelper = new THREE.GridHelper(gridSize, 20, initialTheme.grid, initialTheme.grid);
      gridHelper.position.y = -size.y / 2;
      gridHelper.material.opacity = 0.5;
      gridHelper.material.transparent = true;
      scene.add(gridHelper);

      // Camera Position
      const dist = maxDim * 2.5;
      camera.position.set(dist, dist * 0.7, dist);
      camera.lookAt(0, 0, 0);

      // 4. Interaction Bindings
      const themeSelect = document.getElementById('stl-theme');
      const rotateCheck = document.getElementById('stl-rotate');
      const gridCheck = document.getElementById('stl-grid');
      const resetBtn = document.getElementById('stl-reset');
      const snapBtn = document.getElementById('stl-snap');

      themeSelect.onchange = (e) => {
        const t = themes[e.target.value];
        scene.background.setHex(t.bg);
        material.color.setHex(t.color);
        material.emissive.setHex(t.emissive);
        material.roughness = t.roughness;
        material.metalness = t.metalness;
        material.wireframe = t.wireframe;
        gridHelper.material.color.setHex(t.grid);
        
        // Adjust lights for specific themes
        lights.main.intensity = t.wireframe ? 0 : 1;
        lights.ambient.intensity = t.wireframe ? 1.5 : 0.6;
      };

      rotateCheck.onchange = (e) => {
        controls.autoRotate = e.target.checked;
      };

      gridCheck.onchange = (e) => {
        gridHelper.visible = e.target.checked;
      };

      resetBtn.onclick = () => {
        camera.position.set(dist, dist * 0.7, dist);
        controls.reset();
      };

      snapBtn.onclick = () => {
        // B10. Use toBlob instead of toDataURL
        try {
          renderer.render(scene, camera);
          renderer.domElement.toBlob((blob) => {
            const name = file.name.replace(/\.[^/.]+$/, "") + "_capture.png";
            h.download(name, blob, 'image/png');
          }, 'image/png');
        } catch (err) {
          h.showError('Snapshot failed', 'Could not capture the 3D viewport.');
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

      // Animation Loop
      const animate = () => {
        if (!container.isConnected) return;
        animationId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    }

    function setupLighting(scene) {
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);
      
      const main = new THREE.DirectionalLight(0xffffff, 1.0);
      main.position.set(100, 100, 100);
      main.castShadow = true;
      scene.add(main);

      const fill = new THREE.DirectionalLight(0xffffff, 0.4);
      fill.position.set(-100, 0, -100);
      scene.add(fill);
      
      return { ambient, main, fill };
    }

    function getThemes() {
      return {
        studio: { 
          bg: 0xf8fafc, 
          color: 0x64748b, 
          emissive: 0x000000, 
          roughness: 0.4, 
          metalness: 0.2, 
          wireframe: false,
          grid: 0xe2e8f0
        },
        blueprint: { 
          bg: 0x020617, 
          color: 0x38bdf8, 
          emissive: 0x075985, 
          roughness: 0.3, 
          metalness: 0.5, 
          wireframe: false,
          grid: 0x1e293b
        },
        clay: { 
          bg: 0x18181b, 
          color: 0xa8a29e, 
          emissive: 0x000000, 
          roughness: 1.0, 
          metalness: 0.0, 
          wireframe: false,
          grid: 0x27272a
        },
        gold: { 
          bg: 0x0c0a09, 
          color: 0xf59e0b, 
          emissive: 0x451a03, 
          roughness: 0.1, 
          metalness: 1.0, 
          wireframe: false,
          grid: 0x1c1917
        },
        wireframe: { 
          bg: 0x000000, 
          color: 0x10b981, 
          emissive: 0x000000, 
          roughness: 1.0, 
          metalness: 0.0, 
          wireframe: true,
          grid: 0x111111
        }
      };
    }

    function calculateVolume(geometry) {
      let volume = 0;
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 9) {
        const x1 = pos[i], y1 = pos[i+1], z1 = pos[i+2];
        const x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5];
        const x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
        volume += (-x3 * y2 * z1 + x2 * y3 * z1 + x3 * y1 * z2 - x1 * y3 * z2 - x2 * y1 * z3 + x1 * y2 * z3) / 6;
      }
      return volume;
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
