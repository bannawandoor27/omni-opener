(function () {
  'use strict';

  /**
   * OmniOpener — Production-Grade GLTF/GLB 3D Viewer
   * Built with Three.js and OmniTool SDK.
   */

  const LIBRARIES = {
    three: 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
    gltfLoader: 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js',
    orbitControls: 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
  };

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
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
      infoHtml: '<strong>Privacy:</strong> 3D models are processed entirely in your browser. No data is sent to any server.',

      onInit: function (h) {
        // Pre-load core library
        h.loadScript(LIBRARIES.three);
      },

      onFile: function (file, content, h) {
        // Clear previous state and cleanup
        const oldCleanup = h.getState().cleanup;
        if (typeof oldCleanup === 'function') {
          try { oldCleanup(); } catch (e) { console.error('Cleanup error:', e); }
        }
        h.setState('cleanup', null);
        h.setState('scene', null);
        h.setState('controls', null);
        h.setState('isWireframe', false);

        h.showLoading('Initializing 3D Engine...');

        // Ensure all dependencies are loaded
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
          h.showLoading('Parsing 3D model geometry...');
          const loader = new THREE.GLTFLoader();
          
          // Use a timeout to let the UI update the loading message
          setTimeout(() => {
            loader.parse(content, '', (gltf) => {
              renderViewer(gltf, file, h);
            }, (error) => {
              console.error('GLTF Parse Error:', error);
              h.showError('Could not open 3D model', 'The file may be corrupted or in an unsupported GLTF version. Ensure it is a valid .gltf or .glb file.');
            });
          }, 50);
        };

        loadDependencies();
      },

      actions: [
        {
          label: '📸 Screenshot',
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
              h.showError('Screenshot failed', 'Could not capture the 3D view.');
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
          label: '🔄 Auto-Rotate',
          id: 'rotate',
          onClick: function (h) {
            const controls = h.getState().controls;
            if (controls) controls.autoRotate = !controls.autoRotate;
          }
        },
        {
          label: '📊 Stats',
          id: 'stats-toggle',
          onClick: function (h) {
            const el = document.getElementById('gltf-stats-panel');
            if (el) el.classList.toggle('hidden');
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

    scene.traverse((node) => {
      if (node.isMesh) {
        meshCount++;
        if (node.geometry && node.geometry.attributes.position) {
          vertexCount += node.geometry.attributes.position.count;
        }
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(m => materialCount.add(m.uuid));
        }
      }
    });

    if (meshCount === 0) {
      h.render(`
        <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-xl border-2 border-dashed border-surface-200">
          <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
            <span class="text-2xl">🧊</span>
          </div>
          <h3 class="text-lg font-semibold text-surface-900">Empty Scene</h3>
          <p class="text-surface-500 max-w-xs mx-auto">This 3D model contains no mesh data to display.</p>
        </div>
      `);
      return;
    }

    const stats = {
      meshes: meshCount.toLocaleString(),
      vertices: vertexCount.toLocaleString(),
      materials: materialCount.size.toLocaleString(),
      animations: animationCount.toLocaleString()
    };

    h.render(`
      <div class="flex flex-col h-full animate-in fade-in duration-500">
        <!-- U1: File Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
          <span class="font-semibold text-surface-800">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span class="text-surface-500">${vertexCount.toLocaleString()} vertices</span>
          <span class="text-surface-300">|</span>
          <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-md text-[10px] font-bold uppercase tracking-wider">
            ${file.name.toLowerCase().endsWith('.glb') ? 'GLB (Binary)' : 'GLTF (JSON)'}
          </span>
        </div>

        <!-- 3D Viewer Container -->
        <div class="relative flex-1 min-h-[500px] bg-slate-950 rounded-2xl overflow-hidden border border-surface-200 shadow-inner group">
          <div id="three-canvas-container" class="w-full h-full cursor-move"></div>
          
          <!-- Interaction Hints -->
          <div class="absolute bottom-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div class="flex items-center gap-3 px-3 py-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 text-[11px] text-white/80">
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-brand-400"></span> Rotate: Drag</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-blue-400"></span> Pan: Right Click</span>
              <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-purple-400"></span> Zoom: Scroll</span>
            </div>
          </div>

          <!-- Format-Specific Excellence: Stats Panel -->
          <div id="gltf-stats-panel" class="absolute top-4 right-4 w-48 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 transition-all animate-in slide-in-from-right-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold text-surface-900 text-xs uppercase tracking-tight">Model Stats</h3>
              <span class="text-[10px] bg-surface-100 px-1.5 py-0.5 rounded text-surface-500 font-mono">v2.0</span>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between text-xs border-b border-surface-100 pb-1">
                <span class="text-surface-500">Meshes</span>
                <span class="font-semibold text-surface-800">${stats.meshes}</span>
              </div>
              <div class="flex justify-between text-xs border-b border-surface-100 pb-1">
                <span class="text-surface-500">Vertices</span>
                <span class="font-semibold text-surface-800">${stats.vertices}</span>
              </div>
              <div class="flex justify-between text-xs border-b border-surface-100 pb-1">
                <span class="text-surface-500">Materials</span>
                <span class="font-semibold text-surface-800">${stats.materials}</span>
              </div>
              <div class="flex justify-between text-xs">
                <span class="text-surface-500">Animations</span>
                <span class="font-semibold text-surface-800">${stats.animations}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);

    const container = document.getElementById('three-canvas-container');
    if (!container) return;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true, 
      preserveDrawingBuffer: true // Required for screenshots
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const sceneWrapper = new THREE.Scene();
    sceneWrapper.background = new THREE.Color(0x020617); // slate-950

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 2000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    sceneWrapper.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 10, 7);
    sceneWrapper.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, -2, -5);
    sceneWrapper.add(fillLight);

    sceneWrapper.add(scene);

    // Center and Scale Model
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    scene.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    
    // Fallback for flat or tiny models
    if (cameraZ === 0) cameraZ = 1;

    camera.position.set(cameraZ, cameraZ / 2, cameraZ);
    camera.lookAt(0, 0, 0);
    controls.update();

    h.setState('scene', scene);
    h.setState('controls', controls);

    // Animation Loop
    let animId;
    const animate = () => {
      if (!container.isConnected) return;
      animId = requestAnimationFrame(animate);
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

    // B5: Memory Leaks - Cleanup Logic
    h.setState('cleanup', () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      
      // Dispose renderer resources
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }

      // Dispose scene resources
      sceneWrapper.clear();
      scene.traverse((node) => {
        if (node.isMesh) {
          if (node.geometry) node.geometry.dispose();
          if (node.material) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(m => {
              // Dispose textures
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
