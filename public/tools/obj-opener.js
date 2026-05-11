/**
 * OmniOpener — OBJ 3D Viewer Toolkit
 * Uses OmniTool SDK and Three.js.
 */
(function () {
  'use strict';

  // Three.js version and dependencies
  const THREE_VERSION = '0.144.0';
  const LIBS = [
    `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.min.js`,
    `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/js/loaders/OBJLoader.js`,
    `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/js/controls/OrbitControls.js`
  ];

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.obj',
      binary: false,
      infoHtml: '<strong>OBJ 3D Toolkit:</strong> Professional client-side viewer with bounding box analysis, wireframe mode, and auto-rotation. No data is uploaded.',

      actions: [
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            const state = h.getState();
            if (!state.object) return;
            
            const box = new THREE.Box3().setFromObject(state.object);
            const size = box.getSize(new THREE.Vector3());
            let meshes = 0;
            state.object.traverse(n => { if (n.isMesh) meshes++; });

            const stats = [
              `File: ${state.file.name}`,
              `Meshes: ${meshes}`,
              `Dimensions: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`,
              `Center: ${box.getCenter(new THREE.Vector3()).toArray().map(v => v.toFixed(2)).join(', ')}`
            ].join('\n');
            
            h.copyToClipboard(stats, btn);
          }
        },
        {
          label: '📸 Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            const canvas = h.getRenderEl().querySelector('canvas');
            if (canvas) {
              canvas.toBlob((blob) => {
                h.download(h.getFile().name + '.png', blob, 'image/png');
              });
            }
          }
        },
        {
          label: '📥 Download OBJ',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'text/plain');
          }
        }
      ],

      onInit: function (h) {
        // Pre-load dependencies
        return h.loadScripts(LIBS);
      },

      onFile: function (file, content, h) {
        h.showLoading('Parsing 3D model...');
        
        // Ensure scripts are ready (in case user drops file before onInit finishes)
        h.loadScripts(LIBS).then(() => {
          try {
            const loader = new THREE.OBJLoader();
            const object = loader.parse(content);
            
            // Set state for actions
            h.setState({ object: object, file: file });
            
            // Initialize viewer
            initViewer(object, file, h);
          } catch (err) {
            console.error(err);
            h.showError('Parsing Failed', 'The OBJ file could not be parsed. Please ensure it is a valid Wavefront OBJ file.');
          }
        }).catch(err => {
          h.showError('Dependency Error', 'Failed to load 3D rendering engine.');
        });
      }
    });
  };

  /**
   * Main rendering logic
   */
  function initViewer(object, file, h) {
    // Calculate bounds
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    let meshCount = 0;
    object.traverse(n => { if (n.isMesh) meshCount++; });

    // Render basic UI frame
    h.render(`
      <div class="flex flex-col h-[85vh] font-sans">
        <div class="flex items-center gap-3 px-4 py-2 bg-surface-50 rounded-xl text-[10px] text-surface-500 mb-2 border border-surface-200">
          <span class="font-bold text-surface-900 uppercase truncate max-w-[200px]">${esc(file.name)}</span>
          <span class="text-surface-300">|</span>
          <span>${meshCount} Meshes</span>
          <span class="text-surface-300">|</span>
          <span class="text-brand-600 font-bold">${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} Units</span>
        </div>
        
        <div class="relative flex-1 bg-slate-900 rounded-2xl overflow-hidden border border-surface-200 shadow-inner">
          <div id="three-canvas-container" class="w-full h-full cursor-move"></div>
          
          <!-- Float Controls -->
          <div class="absolute top-4 right-4 w-44 bg-white/95 backdrop-blur shadow-xl rounded-xl border border-surface-200 p-3 space-y-3">
             <section>
                <label class="block text-[9px] font-bold text-surface-400 uppercase mb-1.5">Environment</label>
                <select id="obj-env" class="w-full text-xs p-1 bg-surface-50 border border-surface-200 rounded outline-none cursor-pointer">
                   <option value="studio">Studio Dark</option>
                   <option value="slate">Slate Blue</option>
                   <option value="void">Pitch Black</option>
                </select>
             </section>
             <div class="h-px bg-surface-100"></div>
             <section class="space-y-1.5">
                <label class="flex items-center justify-between cursor-pointer group">
                   <span class="text-[9px] font-bold text-surface-400 uppercase group-hover:text-brand-600">Wireframe</span>
                   <input type="checkbox" id="obj-wire" class="w-3 h-3 accent-brand-500">
                </label>
                <label class="flex items-center justify-between cursor-pointer group">
                   <span class="text-[9px] font-bold text-surface-400 uppercase group-hover:text-brand-600">Auto-Rotate</span>
                   <input type="checkbox" id="obj-rotate" class="w-3 h-3 accent-brand-500">
                </label>
             </section>
             <button id="obj-reset" class="w-full py-1 bg-surface-100 text-surface-600 text-[9px] font-bold rounded hover:bg-surface-200 transition-colors">Reset View</button>
          </div>
        </div>
      </div>
    `);

    const container = h.getRenderEl().querySelector('#three-canvas-container');
    
    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    
    const direct1 = new THREE.DirectionalLight(0xffffff, 1);
    direct1.position.set(5, 10, 7);
    scene.add(direct1);
    
    const direct2 = new THREE.DirectionalLight(0xffffff, 0.3);
    direct2.position.set(-5, -2, -5);
    scene.add(direct2);

    // Center and frame object
    object.position.sub(center);
    scene.add(object);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
    camera.lookAt(0, 0, 0);
    controls.saveState();

    // UI Events
    const el = h.getRenderEl();
    const envs = {
      studio: 0x0f172a,
      slate: 0x1e293b,
      void: 0x020617
    };

    el.querySelector('#obj-env').onchange = (e) => { scene.background = new THREE.Color(envs[e.target.value]); };
    el.querySelector('#obj-wire').onchange = (e) => {
      object.traverse(n => { if (n.isMesh) n.material.wireframe = e.target.checked; });
    };
    el.querySelector('#obj-rotate').onchange = (e) => { controls.autoRotate = e.target.checked; };
    el.querySelector('#obj-reset').onclick = () => { controls.reset(); };

    // Animation Loop
    const animate = () => {
      if (!container.isConnected) {
        renderer.dispose();
        return;
      }
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handling
    const ro = new ResizeObserver(() => {
      if (container.clientWidth === 0) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    ro.observe(container);
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
