(function () {
  'use strict';

  /**
   * OmniOpener — Production-Grade GLTF/GLB 3D Viewer
   * Powered by Three.js and OmniTool SDK.
   */

  const LIBRARIES = {
    three: 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
    gltfLoader: 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
    orbitControls: 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
  };

  function formatBytes(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.gltf,.glb',
      binary: true,
      dropLabel: 'Drop a 3D model (.gltf, .glb) here',
      infoHtml: '<strong>Privacy:</strong> Your 3D models are processed locally in your browser and never leave your device.',

      onInit: function (h) {
        // Pre-warm the core engine
        h.loadScript(LIBRARIES.three);
      },

      onFile: function (file, content, h) {
        // B5: Memory leaks - Clear previous state and run cleanup
        const oldCleanup = h.getState().cleanup;
        if (typeof oldCleanup === 'function') {
          try { oldCleanup(); } catch (e) { console.error('Cleanup error:', e); }
        }
        h.setState('cleanup', null);
        h.setState('scene', null);
        h.setState('controls', null);
        h.setState('isWireframe', false);
        h.setState('showGrid', true);

        // U2 & U6: Immediate loading feedback
        h.showLoading('Preparing 3D Engine...');

        // B1 & B4: Sequential dependency loading with race condition protection
        const loadDependencies = () => {
          if (typeof THREE === 'undefined') {
            h.loadScript(LIBRARIES.three, () => loadDependencies());
            return;
          }
          if (typeof THREE.GLTFLoader === 'undefined') {
            h.loadScript(LIBRARIES.gltfLoader, () => loadDependencies());
            return;
          }
          if (typeof THREE.OrbitControls === 'undefined') {
            h.loadScript(LIBRARIES.orbitControls, () => loadDependencies());
            return;
          }
          
          parseModel();
        };

        const parseModel = () => {
          h.showLoading('Parsing 3D geometry...');
          const loader = new THREE.GLTFLoader();
          
          // Use requestAnimationFrame to ensure UI shows loading message before heavy parsing
          requestAnimationFrame(() => {
            // B2: content is ArrayBuffer (binary:true)
            loader.parse(content, '', (gltf) => {
              renderViewer(gltf, file, h);
            }, (error) => {
              console.error('GLTF Parse Error:', error);
              // U3: Friendly error message
              h.showError('Unable to open 3D model', 'The file might be corrupted, using an unsupported GLTF version, or missing external textures. Try a standalone .glb file.');
            });
          });
        };

        loadDependencies();
      },

      actions: [
        {
          label: '📸 Capture',
          id: 'screenshot',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (!canvas) return;
            try {
              canvas.toBlob((blob) => {
                const name = h.getFile().name.replace(/\.[^/.]+$/, "");
                h.download(`${name}-preview.png`, blob, 'image/png');
              }, 'image/png');
            } catch (e) {
              h.showError('Capture failed', 'Could not export the current view.');
            }
          }
        },
        {
          label: '🌐 Wireframe',
          id: 'wireframe',
          onClick: function (h) {
            const scene = h.getState().scene;
            if (!scene) return;
            const isWire = !h.getState().isWireframe;
            h.setState('isWireframe', isWire);
            scene.traverse((node) => {
              if (node.isMesh && node.material) {
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach(m => { m.wireframe = isWire; });
              }
            });
          }
        },
        {
          label: '🔄 Spin',
          id: 'rotate',
          onClick: function (h) {
            const controls = h.getState().controls;
            if (controls) controls.autoRotate = !controls.autoRotate;
          }
        },
        {
          label: '📏 Grid',
          id: 'grid-toggle',
          onClick: function (h) {
            const grid = h.getState().gridHelper;
            const axis = h.getState().axisHelper;
            if (grid && axis) {
              const visible = !grid.visible;
              grid.visible = visible;
              axis.visible = visible;
              h.setState('showGrid', visible);
            }
          }
        },
        {
          label: '🏠 Reset',
          id: 'reset-view',
          onClick: function (h) {
            const reset = h.getState().resetView;
            if (typeof reset === 'function') reset();
          }
        }
      ]
    });
  };

  function renderViewer(gltf, file, h) {
    const scene = gltf.scene;
    let vertexCount = 0;
    let meshCount = 0;
    let materialCount = new Set();
    let animationCount = gltf.animations ? gltf.animations.length : 0;
    let textures = new Set();

    scene.traverse((node) => {
      if (node.isMesh) {
        meshCount++;
        if (node.geometry && node.geometry.attributes.position) {
          vertexCount += node.geometry.attributes.position.count;
        }
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(m => {
            materialCount.add(m.uuid);
            // Count unique textures
            Object.keys(m).forEach(prop => {
              if (m[prop] && m[prop].isTexture) textures.add(m[prop].uuid);
            });
          });
        }
      }
    });

    // U5: Empty State
    if (meshCount === 0 && animationCount === 0) {
      h.render(`
        <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-xl border-2 border-dashed border-surface-200">
          <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
            <span class="text-2xl">🧊</span>
          </div>
          <h3 class="text-lg font-semibold text-surface-900">Empty Scene</h3>
          <p class="text-surface-500 max-w-xs mx-auto">This file contains no displayable 3D geometry or animations.</p>
        </div>
      `);
      return;
    }

    // U1: File Info Bar
    h.render(`
      <div class="flex flex-col h-full animate-in fade-in duration-500">
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${meshCount.toLocaleString()} meshes</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${vertexCount.toLocaleString()} vertices</span>
          <span class="text-surface-300">|</span>
          <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-md text-[10px] font-bold uppercase tracking-wider">
            ${file.name.toLowerCase().endsWith('.glb') ? 'GLB (Binary)' : 'GLTF (JSON)'}
          </span>
        </div>

        <div class="relative flex-1 min-h-[500px] bg-slate-900 rounded-2xl overflow-hidden border border-surface-200 shadow-xl group">
          <div id="three-canvas-container" class="w-full h-full cursor-move"></div>
          
          <!-- Interaction Overlay -->
          <div class="absolute bottom-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div class="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[11px] text-white/90">
              <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span> Orbit: Left Drag</span>
              <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> Pan: Right Drag</span>
              <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Zoom: Scroll</span>
            </div>
          </div>

          <!-- Format-Specific Excellence: Model Inspector -->
          <div id="gltf-inspector" class="absolute top-4 right-4 w-56 max-h-[calc(100%-2rem)] overflow-y-auto bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-surface-200 p-4 transition-all animate-in slide-in-from-right-4">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-bold text-surface-900 text-xs uppercase tracking-tight">Inspector</h3>
              <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">LIVE</span>
            </div>
            
            <div class="space-y-4">
              <!-- Statistics Section -->
              <div class="space-y-2">
                <div class="flex items-center justify-between text-[11px] border-b border-surface-100 pb-1">
                  <span class="text-surface-500 uppercase">Meshes</span>
                  <span class="font-bold text-surface-800">${meshCount.toLocaleString()}</span>
                </div>
                <div class="flex items-center justify-between text-[11px] border-b border-surface-100 pb-1">
                  <span class="text-surface-500 uppercase">Materials</span>
                  <span class="font-bold text-surface-800">${materialCount.size}</span>
                </div>
                <div class="flex items-center justify-between text-[11px] border-b border-surface-100 pb-1">
                  <span class="text-surface-500 uppercase">Textures</span>
                  <span class="font-bold text-surface-800">${textures.size}</span>
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-surface-500 uppercase">Animations</span>
                  <span class="font-bold text-surface-800">${animationCount}</span>
                </div>
              </div>

              <!-- Animation Controls (if any) -->
              ${animationCount > 0 ? `
                <div class="pt-2">
                  <h4 class="text-[10px] font-bold text-surface-400 uppercase mb-2 tracking-widest">Animations</h4>
                  <div class="space-y-1">
                    ${gltf.animations.map((anim, idx) => `
                      <button onclick="window._omni_playAnim(${idx})" class="w-full text-left px-2 py-1.5 text-[10px] rounded bg-surface-50 hover:bg-brand-50 hover:text-brand-700 border border-surface-100 transition-colors truncate">
                        ▶ ${esc(anim.name || 'Animation ' + (idx + 1))}
                      </button>
                    `).join('')}
                    <button onclick="window._omni_stopAnims()" class="w-full text-center px-2 py-1 text-[10px] text-surface-400 hover:text-surface-600">
                      Stop All
                    </button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `);

    const container = document.getElementById('three-canvas-container');
    if (!container) return;

    // Renderer Setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true, 
      preserveDrawingBuffer: true 
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const sceneWrapper = new THREE.Scene();
    sceneWrapper.background = new THREE.Color(0x0f172a); // slate-900

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 5000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 2.0;

    // Helpers
    const gridHelper = new THREE.GridHelper(10, 10, 0x334155, 0x1e293b);
    const axisHelper = new THREE.AxesHelper(1);
    sceneWrapper.add(gridHelper);
    sceneWrapper.add(axisHelper);
    h.setState('gridHelper', gridHelper);
    h.setState('axisHelper', axisHelper);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    sceneWrapper.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 10, 7);
    sceneWrapper.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(-5, 5, -5);
    sceneWrapper.add(rimLight);

    sceneWrapper.add(scene);

    // Animations
    const mixer = new THREE.AnimationMixer(scene);
    window._omni_playAnim = (idx) => {
      mixer.stopAllAction();
      const action = mixer.clipAction(gltf.animations[idx]);
      action.play();
    };
    window._omni_stopAnims = () => mixer.stopAllAction();

    // Center and Scale Model
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    scene.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    if (cameraZ === 0) cameraZ = 1;

    // Scaling helpers to match model
    gridHelper.scale.set(maxDim, 1, maxDim);
    axisHelper.scale.set(maxDim * 0.5, maxDim * 0.5, maxDim * 0.5);

    const resetView = () => {
      camera.position.set(cameraZ, cameraZ / 2, cameraZ);
      camera.lookAt(0, 0, 0);
      controls.reset();
      controls.update();
    };
    resetView();

    h.setState('scene', scene);
    h.setState('controls', controls);
    h.setState('resetView', resetView);

    // Main Animation Loop
    let animId;
    let clock = new THREE.Clock();
    const animate = () => {
      if (!container.isConnected) return;
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer.update(delta);
      controls.update();
      renderer.render(sceneWrapper, camera);
    };
    animate();

    // Responsiveness
    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    resizeObserver.observe(container);

    // B5: Memory Leaks - Robust Cleanup
    h.setState('cleanup', () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      delete window._omni_playAnim;
      delete window._omni_stopAnims;
      
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }

      sceneWrapper.clear();
      scene.traverse((node) => {
        if (node.isMesh) {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(m => {
              Object.keys(m).forEach(prop => {
                if (m[prop] && m[prop].isTexture) m[prop].dispose();
              });
              m.dispose();
            });
          }
        }
      });
    });
  }
})();
