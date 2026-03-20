/**
 * OmniOpener — Production-Grade GLTF/GLB 3D Toolkit
 * Powered by Three.js and OmniTool SDK.
 */
(function () {
  'use strict';

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
      infoHtml: '<strong>3D Toolkit:</strong> Professional-grade GLTF viewer with environment lighting, mesh inspector, and animation controls.',

      onInit: function (h) {
        h.loadScript(LIBRARIES.three);
      },

      onFile: function (file, content, h) {
        const oldCleanup = h.getState().cleanup;
        if (typeof oldCleanup === 'function') try { oldCleanup(); } catch (e) {}
        
        h.setState('cleanup', null);
        h.showLoading('Preparing 3D Engine...');

        const loadDependencies = () => {
          if (typeof THREE === 'undefined') { h.loadScript(LIBRARIES.three, () => loadDependencies()); return; }
          if (typeof THREE.GLTFLoader === 'undefined') { h.loadScript(LIBRARIES.gltfLoader, () => loadDependencies()); return; }
          if (typeof THREE.OrbitControls === 'undefined') { h.loadScript(LIBRARIES.orbitControls, () => loadDependencies()); return; }
          parseModel();
        };

        const parseModel = () => {
          h.showLoading('Parsing 3D geometry...');
          const loader = new THREE.GLTFLoader();
          requestAnimationFrame(() => {
            try {
              loader.parse(content, '', (gltf) => {
                renderViewer(gltf, file, h);
              }, (error) => {
                h.showError('Unable to open 3D model', error.message);
              });
            } catch (err) {
              h.showError('Parsing Error', err.message);
            }
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
            if (canvas) canvas.toBlob((blob) => h.download(`${h.getFile().name.split('.')[0]}-preview.png`, blob, 'image/png'), 'image/png');
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
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach(m => m.wireframe = isWire);
              }
            });
          }
        }
      ]
    });
  };

  function renderViewer(gltf, file, h) {
    const scene = gltf.scene;
    let vertexCount = 0;
    let meshes = [];

    scene.traverse((node) => {
      if (node.isMesh) {
        meshes.push(node);
        if (node.geometry && node.geometry.attributes.position) {
          vertexCount += node.geometry.attributes.position.count;
        }
      }
    });

    h.render(`
      <div class="flex flex-col h-[85vh] animate-in fade-in duration-500">
        <!-- Info Bar -->
        <div class="flex flex-wrap items-center gap-3 px-4 py-2 bg-surface-50 rounded-xl text-[10px] text-surface-500 mb-2 border border-surface-200">
          <span class="font-bold text-surface-900 uppercase tracking-tight">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${formatBytes(file.size)}</span>
          <span class="text-surface-300">|</span>
          <span>${meshes.length} Meshes</span>
          <span class="text-surface-300">|</span>
          <span>${vertexCount.toLocaleString()} Verts</span>
        </div>

        <div class="relative flex-1 bg-slate-900 rounded-2xl overflow-hidden border border-surface-200 shadow-xl group">
          <div id="three-canvas-container" class="w-full h-full cursor-move"></div>
          
          <!-- Inspector UI -->
          <div class="absolute top-4 right-4 bottom-4 w-64 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-surface-200 flex flex-col overflow-hidden">
            <div class="p-3 border-b border-surface-100 flex items-center justify-between">
              <h3 class="font-bold text-[10px] uppercase tracking-widest text-surface-400">Inspector</h3>
              <div class="flex gap-1">
                 <button id="btn-reset-cam" class="p-1 hover:bg-surface-100 rounded" title="Reset Camera">🏠</button>
              </div>
            </div>

            <div class="flex-1 overflow-auto p-3 space-y-6">
              <!-- Lighting Presets -->
              <section>
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Environment</label>
                <select id="env-preset" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/20">
                  <option value="studio">Studio (White)</option>
                  <option value="night">Night (Deep Blue)</option>
                  <option value="sunset">Sunset (Warm)</option>
                  <option value="forest">Forest (Cool)</option>
                </select>
              </section>

              <!-- Scene Tree -->
              <section>
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Meshes (${meshes.length})</label>
                <div class="space-y-1 max-h-64 overflow-auto pr-1">
                  ${meshes.map((m, i) => `
                    <div class="flex items-center justify-between p-2 rounded bg-surface-50 border border-surface-100 hover:bg-white transition-colors">
                      <span class="text-[10px] font-mono truncate mr-2 text-surface-600">${esc(m.name || 'Mesh ' + i)}</span>
                      <input type="checkbox" checked onchange="window._omni_toggleMesh(${i}, this.checked)" class="w-3 h-3 accent-brand-500">
                    </div>
                  `).join('')}
                </div>
              </section>

              <!-- Animations -->
              ${gltf.animations.length > 0 ? `
                <section>
                  <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Animations</label>
                  <div class="space-y-1">
                    ${gltf.animations.map((anim, idx) => `
                      <button onclick="window._omni_playAnim(${idx})" class="w-full text-left px-2 py-1.5 text-[10px] rounded bg-surface-50 hover:bg-brand-50 hover:text-brand-700 border border-surface-100 transition-colors truncate">▶ ${esc(anim.name || 'Anim ' + idx)}</button>
                    `).join('')}
                    <button onclick="window._omni_stopAnims()" class="w-full py-1 text-[10px] text-surface-400">Stop All</button>
                  </div>
                </section>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `);

    const container = document.getElementById('three-canvas-container');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const sceneWrapper = new THREE.Scene();
    sceneWrapper.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 5000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    sceneWrapper.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 10, 7);
    sceneWrapper.add(mainLight);

    sceneWrapper.add(scene);

    // Helpers
    const grid = new THREE.GridHelper(10, 10, 0x334155, 0x1e293b);
    sceneWrapper.add(grid);

    // Scaling/Centering
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    scene.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const cameraZ = maxDim * 2.5;
    camera.position.set(cameraZ, cameraZ / 2, cameraZ);
    camera.lookAt(0, 0, 0);
    grid.scale.set(maxDim, 1, maxDim);

    const mixer = new THREE.AnimationMixer(scene);
    window._omni_playAnim = (idx) => { mixer.stopAllAction(); mixer.clipAction(gltf.animations[idx]).play(); };
    window._omni_stopAnims = () => mixer.stopAllAction();
    window._omni_toggleMesh = (idx, visible) => { meshes[idx].visible = visible; };

    document.getElementById('btn-reset-cam').onclick = () => {
      camera.position.set(cameraZ, cameraZ / 2, cameraZ);
      controls.reset();
    };

    const envPresets = {
      studio: { bg: 0xffffff, light: 1.2, ambient: 0.6 },
      night: { bg: 0x020617, light: 0.5, ambient: 0.2 },
      sunset: { bg: 0x451a03, light: 1.5, ambient: 0.4 },
      forest: { bg: 0x064e3b, light: 1.0, ambient: 0.5 }
    };

    document.getElementById('env-preset').onchange = (e) => {
      const p = envPresets[e.target.value];
      sceneWrapper.background = new THREE.Color(p.bg);
      mainLight.intensity = p.light;
      ambientLight.intensity = p.ambient;
    };

    let animId;
    const clock = new THREE.Clock();
    const animate = () => {
      if (!container.isConnected) return;
      animId = requestAnimationFrame(animate);
      mixer.update(clock.getDelta());
      controls.update();
      renderer.render(sceneWrapper, camera);
    };
    animate();

    h.setState('scene', scene);
    h.setState('cleanup', () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      delete window._omni_playAnim;
      delete window._omni_stopAnims;
      delete window._omni_toggleMesh;
    });
  }
})();
