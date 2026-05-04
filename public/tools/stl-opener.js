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
        if (currentRenderer) {
          currentRenderer.dispose();
          currentRenderer.forceContextLoss();
          currentRenderer.domElement.remove();
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

        h.showLoading('Parsing 3D geometry...');
        
        // Use a small delay to ensure loading screen is visible
        setTimeout(function() {
          try {
            const loader = new THREE.STLLoader();
            const geometry = loader.parse(content);
            
            if (!geometry || !geometry.attributes.position) {
              throw new Error('Invalid geometry');
            }

            renderViewer(geometry, file, h);
          } catch (err) {
            console.error(err);
            h.showError('Could not open STL file', 'The file may be corrupted, empty, or in an unsupported format. Try a different STL file.');
          }
        }, 50);
      }
    });

    function renderViewer(geometry, file, h) {
      // 1. Calculations
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      const center = geometry.boundingBox.getCenter(new THREE.Vector3());
      const triangleCount = geometry.attributes.position.count / 3;
      
      // Volume calculation for closed manifold mesh
      let volume = 0;
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 9) {
        const x1 = pos[i], y1 = pos[i+1], z1 = pos[i+2];
        const x2 = pos[i+3], y2 = pos[i+4], z2 = pos[i+5];
        const x3 = pos[i+6], y3 = pos[i+7], z3 = pos[i+8];
        volume += (-x3 * y2 * z1 + x2 * y3 * z1 + x3 * y1 * z2 - x1 * y3 * z2 - x2 * y1 * z3 + x1 * y2 * z3) / 6;
      }
      const absVolume = Math.abs(volume);

      // 2. Main UI Layout
      h.render(`
        <div class="flex flex-col h-[85vh] animate-in fade-in duration-500">
          <!-- U1. File Info Bar -->
          <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100 shadow-sm">
            <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
            <span class="text-surface-300">|</span>
            <span>${formatBytes(file.size)}</span>
            <span class="text-surface-300">|</span>
            <span class="text-surface-500">${triangleCount.toLocaleString()} triangles</span>
            <span class="text-surface-300">|</span>
            <span class="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-md font-medium">STL Model</span>
          </div>

          <!-- 3D Container -->
          <div class="relative flex-1 bg-surface-950 rounded-2xl overflow-hidden border border-surface-200 group shadow-2xl">
            <div id="stl-canvas-container" class="w-full h-full cursor-move"></div>
            
            <!-- Controls Overlay -->
            <div class="absolute top-4 right-4 w-56 bg-white/90 backdrop-blur-md shadow-2xl rounded-2xl border border-surface-200 p-5 space-y-5 transition-all opacity-90 hover:opacity-100">
               <div>
                  <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-3">Model Analysis</h3>
                  <div class="grid grid-cols-2 gap-2 text-[11px]">
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400 mb-0.5">Width</div>
                      <div class="font-mono font-bold text-surface-800">${size.x.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400 mb-0.5">Height</div>
                      <div class="font-mono font-bold text-surface-800">${size.y.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400 mb-0.5">Depth</div>
                      <div class="font-mono font-bold text-surface-800">${size.z.toFixed(2)}</div>
                    </div>
                    <div class="bg-surface-50 p-2 rounded-lg border border-surface-100">
                      <div class="text-surface-400 mb-0.5">Volume</div>
                      <div class="font-mono font-bold text-brand-600">${absVolume.toFixed(2)}</div>
                    </div>
                  </div>
               </div>

               <div class="space-y-3">
                  <h3 class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Appearance</h3>
                  <select id="stl-theme" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none focus:ring-2 ring-brand-500/20 font-medium cursor-pointer">
                     <option value="blueprint">Blueprint (Dark)</option>
                     <option value="studio">Professional Studio</option>
                     <option value="clay">Matte Clay</option>
                     <option value="gold">Metallic Gold</option>
                     <option value="wire">Wireframe Only</option>
                  </select>
                  
                  <div class="flex items-center justify-between px-1">
                    <span class="text-xs text-surface-600 font-medium">Auto-Rotate</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="stl-rotate" class="sr-only peer">
                      <div class="w-9 h-5 bg-surface-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                    </label>
                  </div>
               </div>

               <div class="pt-2 grid grid-cols-2 gap-2">
                 <button id="stl-reset" class="flex-1 py-2 bg-surface-100 text-surface-700 text-[11px] font-bold rounded-lg hover:bg-surface-200 transition-colors border border-surface-200">Reset View</button>
                 <button id="stl-snap" class="flex-1 py-2 bg-brand-600 text-white text-[11px] font-bold rounded-lg hover:bg-brand-700 transition-shadow shadow-lg shadow-brand-500/20">Snapshot</button>
               </div>
            </div>

            <!-- Hint Overlay -->
            <div class="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/40 backdrop-blur text-white/80 text-[10px] rounded-full pointer-events-none uppercase tracking-widest font-medium border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
              Left Click: Rotate • Right Click: Pan • Scroll: Zoom
            </div>
          </div>
        </div>
      `);

      // 3. Initialize Three.js
      const container = document.getElementById('stl-canvas-container');
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      currentRenderer = renderer;
      
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.outputEncoding = THREE.sRGBEncoding;
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      currentScene = scene;
      
      const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 10000);
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);
      
      const spotLight = new THREE.SpotLight(0xffffff, 0.8);
      spotLight.position.set(50, 100, 50);
      spotLight.castShadow = true;
      scene.add(spotLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(-50, -50, -50);
      scene.add(dirLight);

      // Material and Mesh
      const materials = {
        blueprint: { bg: 0x0f172a, color: 0x38bdf8, emissive: 0x075985, wireframe: false, roughness: 0.3, metalness: 0.2 },
        studio: { bg: 0xf8fafc, color: 0x64748b, emissive: 0x000000, wireframe: false, roughness: 0.5, metalness: 0.1 },
        clay: { bg: 0x451a03, color: 0xd97706, emissive: 0x000000, wireframe: false, roughness: 1.0, metalness: 0.0 },
        gold: { bg: 0x1c1917, color: 0xfacc15, emissive: 0x422006, wireframe: false, roughness: 0.1, metalness: 0.8 },
        wire: { bg: 0x020617, color: 0x10b981, emissive: 0x000000, wireframe: true, roughness: 0.5, metalness: 0.1 }
      };

      const meshMaterial = new THREE.MeshStandardMaterial(materials.blueprint);
      const mesh = new THREE.Mesh(geometry, meshMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Center geometry
      mesh.position.sub(center);
      scene.add(mesh);

      // Camera Positioning
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
      camera.lookAt(0, 0, 0);
      scene.background = new THREE.Color(materials.blueprint.bg);

      // 4. Interactive Events
      const themeSelect = document.getElementById('stl-theme');
      const rotateCheck = document.getElementById('stl-rotate');
      const resetBtn = document.getElementById('stl-reset');
      const snapBtn = document.getElementById('stl-snap');

      themeSelect.onchange = (e) => {
        const theme = materials[e.target.value];
        scene.background = new THREE.Color(theme.bg);
        meshMaterial.color.setHex(theme.color);
        meshMaterial.emissive.setHex(theme.emissive || 0x000000);
        meshMaterial.wireframe = theme.wireframe;
        meshMaterial.roughness = theme.roughness;
        meshMaterial.metalness = theme.metalness;
        meshMaterial.needsUpdate = true;
      };

      rotateCheck.onchange = (e) => {
        controls.autoRotate = e.target.checked;
      };

      resetBtn.onclick = () => {
        camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
        controls.reset();
      };

      snapBtn.onclick = () => {
        try {
          renderer.render(scene, camera);
          const dataUrl = renderer.domElement.toDataURL('image/png');
          
          // Convert dataURL to Blob for helpers.download
          const byteString = atob(dataUrl.split(',')[1]);
          const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([ab], { type: mimeString });
          
          const filename = file.name.replace(/\.[^/.]+$/, "") + "_snapshot.png";
          h.download(filename, blob, 'image/png');
        } catch (e) {
          console.error('Snapshot failed', e);
          h.showError('Snapshot failed', 'Could not generate a screenshot of the 3D model.');
        }
      };

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        if (!container.clientWidth || !container.clientHeight) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });
      resizeObserver.observe(container);

      // 5. Animation Loop
      const animate = () => {
        if (!container.isConnected) {
          renderer.dispose();
          return;
        }
        currentRequestRef = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    }
  };
})();
