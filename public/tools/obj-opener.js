/**
 * OmniOpener — OBJ 3D Toolkit
 * Uses OmniTool SDK and Three.js.
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.obj',
      binary: false,
      infoHtml: '<strong>OBJ Toolkit:</strong> Professional 3D viewer with environment maps, wireframe toggle, and mesh inspection.',
      
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
           h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/OBJLoader.js', () => {
              h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
           });
        });
      },

      onFile: function (file, content, h) {
        if (typeof THREE === 'undefined' || typeof THREE.OBJLoader === 'undefined') {
          h.showLoading('Loading 3D engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        h.showLoading('Parsing 3D model...');
        try {
          const loader = new THREE.OBJLoader();
          const object = loader.parse(content);
          renderViewer(object, file, h);
        } catch (err) {
           h.render(`<div class="p-12 text-center text-surface-400">Unable to parse this 3D model.</div>`);
        }
      }
    });
  };

  function renderViewer(object, file, h) {
    let meshCount = 0;
    object.traverse(n => { if (n.isMesh) meshCount++; });

    h.render(`
      <div class="flex flex-col h-[85vh]">
        <div class="flex items-center gap-3 px-4 py-2 bg-surface-50 rounded-xl text-[10px] text-surface-500 mb-2 border border-surface-200">
          <span class="font-bold text-surface-900 uppercase">${escapeHtml(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${meshCount} Meshes</span>
        </div>
        <div class="relative flex-1 bg-slate-900 rounded-2xl overflow-hidden border border-surface-200 shadow-xl">
          <div id="three-container" class="w-full h-full cursor-move"></div>
          <div class="absolute top-4 right-4 w-48 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-4 space-y-4">
             <section>
                <label class="block text-[10px] font-bold text-surface-400 uppercase mb-2">Lighting</label>
                <select id="env-preset" class="w-full text-xs p-1.5 bg-surface-50 border border-surface-200 rounded outline-none">
                   <option value="studio">Studio</option>
                   <option value="night">Night</option>
                   <option value="sunset">Sunset</option>
                </select>
             </section>
             <section>
                <div class="flex items-center justify-between">
                   <span class="text-[10px] font-bold text-surface-400 uppercase">Wireframe</span>
                   <input type="checkbox" id="check-wire" class="w-3 h-3 accent-brand-500">
                </div>
             </section>
             <button id="btn-reset" class="w-full py-1.5 bg-surface-100 text-surface-600 text-[10px] font-bold rounded">Reset View</button>
          </div>
        </div>
      </div>
    `);

    const container = document.getElementById('three-container');
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 10, 7);
    scene.add(mainLight);

    scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
    camera.lookAt(0, 0, 0);

    const envs = {
       studio: { bg: 0x0f172a, light: 1.2, amb: 0.5 },
       night: { bg: 0x020617, light: 0.4, amb: 0.2 },
       sunset: { bg: 0x451a03, light: 1.5, amb: 0.4 }
    };

    document.getElementById('env-preset').onchange = (e) => {
       const p = envs[e.target.value];
       scene.background = new THREE.Color(p.bg);
       mainLight.intensity = p.light;
    };
    document.getElementById('check-wire').onchange = (e) => {
       object.traverse(n => { if (n.isMesh) n.material.wireframe = e.target.checked; });
    };
    document.getElementById('btn-reset').onclick = () => { camera.position.set(maxDim*2, maxDim*2, maxDim*2); controls.reset(); };

    const animate = () => {
       if (!container.isConnected) return;
       requestAnimationFrame(animate);
       controls.update();
       renderer.render(scene, camera);
    };
    animate();
  }
})();
