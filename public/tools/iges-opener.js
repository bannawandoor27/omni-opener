(function () {
  'use strict';

  var scene, camera, renderer, controls, animationId;
  var modelGroup;

  /**
   * Cleans up Three.js resources to prevent memory leaks.
   */
  function cleanup() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (controls) controls.dispose();
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    modelGroup = null;
  }

  /**
   * Escapes HTML strings.
   */
  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.iges,.igs,.step,.stp',
      binary: true,
      infoHtml: '<strong>CAD Viewer:</strong> High-performance browser-based viewer for IGES and STEP files. Powered by <a href="https://github.com/kovacsv/occt-import-js" target="_blank" class="text-brand-600 underline">occt-import-js</a> (OpenCascade). All processing is done locally.',

      onInit: function (helpers) {
        return helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
        ]);
      },

      onDestroy: function () {
        cleanup();
      },

      actions: [
        {
          label: '📋 Copy Filename',
          id: 'copy-name',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getFile().name, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function (helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],

      onFile: function (file, content, helpers) {
        processCadFile(file, content, helpers);
      }
    });
  };

  /**
   * Main processing logic for CAD files.
   */
  async function processCadFile(file, content, helpers) {
    helpers.showLoading('Initializing 3D Engine...');

    // Wait for dependencies to be available
    const checkDeps = () => {
      return typeof THREE !== 'undefined' && 
             typeof occtImportJs !== 'undefined' && 
             (THREE.OrbitControls || window.OrbitControls);
    };

    if (!checkDeps()) {
      let attempts = 0;
      while (!checkDeps() && attempts < 25) {
        await new Promise(r => setTimeout(r, 200));
        attempts++;
      }
      if (!checkDeps()) {
        helpers.showError('Dependency Error', 'Failed to load 3D libraries from CDN.');
        return;
      }
    }

    helpers.showLoading('Parsing CAD geometry...');
    try {
      const occt = await occtImportJs();
      const ext = file.name.split('.').pop().toLowerCase();
      const buffer = new Uint8Array(content);
      
      const deflection = helpers.getState().linearDeflection || 0.1;
      
      let result;
      // occt-import-js supports both STEP and IGES
      if (ext === 'step' || ext === 'stp') {
        result = occt.ReadStep(buffer, deflection);
      } else {
        result = occt.ReadIges(buffer, deflection);
      }

      if (!result || !result.success) {
        throw new Error('OCCT engine failed to parse this file. It may be corrupt or an unsupported version.');
      }

      render3D(result, file, helpers);
    } catch (e) {
      console.error('[CAD Parser]', e);
      helpers.showError('Parsing Failed', e.message);
    }
  }

  /**
   * Renders the parsed 3D result using Three.js.
   */
  function render3D(result, file, helpers) {
    cleanup();

    const materialColor = helpers.getState().materialColor || '#6366f1';
    const deflection = helpers.getState().linearDeflection || 0.1;

    helpers.render(`
      <div class="flex flex-col h-[650px] bg-slate-900 overflow-hidden rounded-xl font-sans text-white">
        <div class="flex flex-wrap justify-between items-center p-3 bg-slate-800 border-b border-slate-700 gap-3">
          <div class="flex items-center gap-2 overflow-hidden">
            <span class="font-bold truncate text-sm">${esc(file.name)}</span>
            <span class="text-[10px] px-2 py-0.5 bg-slate-700 rounded-full text-slate-300 font-mono">${result.meshes.length} MESHES</span>
          </div>
          <div class="flex items-center gap-4 text-xs font-semibold">
            <div class="flex items-center gap-2">
              <label class="text-slate-400 uppercase text-[10px]">Quality</label>
              <select id="cad-quality" class="bg-slate-700 border-none rounded px-2 py-1 outline-none cursor-pointer text-white">
                <option value="0.5" ${deflection === 0.5 ? 'selected' : ''}>Low (Fast)</option>
                <option value="0.1" ${deflection === 0.1 ? 'selected' : ''}>Medium</option>
                <option value="0.02" ${deflection === 0.02 ? 'selected' : ''}>High</option>
                <option value="0.005" ${deflection === 0.005 ? 'selected' : ''}>Ultra (Slow)</option>
              </select>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-slate-400 uppercase text-[10px]">Color</label>
              <input type="color" id="cad-color" value="${materialColor}" class="w-6 h-6 p-0 bg-transparent border-none cursor-pointer rounded">
            </div>
          </div>
        </div>
        <div id="cad-viewport" class="flex-1 relative cursor-move">
           <div class="absolute bottom-4 left-4 pointer-events-none opacity-40 text-[10px]">
              Click + Drag: Rotate | Right Click: Pan | Scroll: Zoom
           </div>
        </div>
      </div>
    `);

    const viewport = document.getElementById('cad-viewport');
    if (!viewport) return;

    const width = viewport.clientWidth;
    const height = viewport.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    viewport.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 2);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-1, -1, -1);
    scene.add(dirLight2);

    modelGroup = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
      flatShading: false,
      shininess: 40
    });

    result.meshes.forEach(function(m) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(m.attributes.normal.array, 3));
      } else {
        geometry.computeVertexNormals();
      }
      if (m.index) {
        geometry.setIndex(new THREE.BufferAttribute(m.index.array, 1));
      }
      modelGroup.add(new THREE.Mesh(geometry, material));
    });

    scene.add(modelGroup);

    // Compute bounding box to center camera
    const box = new THREE.Box3().setFromObject(modelGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const OrbitControlsImpl = THREE.OrbitControls || window.OrbitControls;
    controls = new OrbitControlsImpl(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.5;
    if (cameraZ === 0) cameraZ = 10;
    
    camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    camera.lookAt(center);
    camera.updateProjectionMatrix();

    function animate() {
      if (!scene) return;
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // UI event listeners
    document.getElementById('cad-quality').addEventListener('change', function(e) {
      helpers.setState('linearDeflection', parseFloat(e.target.value));
      processCadFile(file, helpers.getContent(), helpers);
    });

    document.getElementById('cad-color').addEventListener('input', function(e) {
      helpers.setState('materialColor', e.target.value);
      material.color.set(e.target.value);
    });

    const resizeObserver = new ResizeObserver(function() {
      if (!viewport || !renderer || !camera) return;
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(viewport);
  }
})();
