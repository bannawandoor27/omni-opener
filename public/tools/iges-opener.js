(function() {
  'use strict';

  var scene, camera, renderer, controls, animationId;
  var modelGroup;

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

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.iges,.igs,.step,.stp',
      binary: true,
      infoHtml: '<strong>CAD Viewer:</strong> High-performance IGES and STEP file viewer powered by OpenCascade (occt-import-js). All processing is done locally in your browser.',
      
      onInit: function(helpers) {
        helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
        ]);
      },

      onDestroy: function() {
        cleanup();
      },

      actions: [
        {
          label: '📋 Copy Name',
          id: 'copy-name',
          onClick: function(helpers, btn) {
            helpers.copyToClipboard(helpers.getFile().name, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],

      onFile: function(file, content, helpers) {
        processCadFile(file, content, helpers);
      }
    });
  };

  async function processCadFile(file, content, helpers) {
    helpers.showLoading('Initializing CAD engine...');
    
    // Ensure dependencies are loaded
    if (typeof THREE === 'undefined' || typeof occtImportJs === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
      setTimeout(() => processCadFile(file, content, helpers), 500);
      return;
    }

    const linearDeflection = helpers.getState().linearDeflection || 0.1;
    helpers.showLoading('Parsing ' + file.name + '...');

    try {
      const occt = await occtImportJs();
      const ext = file.name.split('.').pop().toLowerCase();
      const buffer = new Uint8Array(content);
      
      let result;
      if (ext === 'step' || ext === 'stp') {
        result = occt.ReadStep(buffer, linearDeflection);
      } else {
        result = occt.ReadIges(buffer, linearDeflection);
      }

      if (!result || !result.success) {
        throw new Error('OCCT failed to parse the file. It might be corrupt or unsupported.');
      }

      render3D(result, file, helpers);
    } catch (e) {
      helpers.showError('CAD Parsing Error', e.message);
    }
  }

  function render3D(result, file, helpers) {
    cleanup();
    
    const deflection = helpers.getState().linearDeflection || 0.1;
    const materialColor = helpers.getState().materialColor || '#6366f1';

    helpers.render(`
      <div class="flex flex-col h-[600px] font-sans">
        <div class="shrink-0 p-3 bg-surface-50 border-b flex justify-between items-center text-sm">
          <div class="flex items-center gap-3">
             <span class="font-bold text-surface-900">${esc(file.name)}</span>
             <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-[10px] font-bold uppercase">${result.meshes.length} Meshes</span>
          </div>
          <div class="flex gap-4 items-center">
             <div class="flex items-center gap-2">
                <label class="text-[10px] font-bold text-surface-400 uppercase">Quality</label>
                <select id="cad-quality" class="text-[10px] border border-surface-200 rounded px-1.5 py-0.5 outline-none font-bold">
                   <option value="0.5" ${deflection === 0.5 ? 'selected' : ''}>Low</option>
                   <option value="0.1" ${deflection === 0.1 ? 'selected' : ''}>Medium</option>
                   <option value="0.02" ${deflection === 0.02 ? 'selected' : ''}>High</option>
                </select>
             </div>
             <div class="flex items-center gap-2">
                <label class="text-[10px] font-bold text-surface-400 uppercase">Color</label>
                <input type="color" id="cad-color" value="${materialColor}" class="w-6 h-6 rounded cursor-pointer border-0 bg-transparent">
             </div>
          </div>
        </div>
        <div id="cad-mount" class="flex-1 w-full bg-[#0f172a] relative overflow-hidden rounded-b-xl">
           <div class="absolute bottom-4 right-4 text-[10px] text-surface-400 pointer-events-none bg-black/20 px-2 py-1 rounded">
              LMB: Rotate | RMB: Pan | Scroll: Zoom
           </div>
        </div>
      </div>
    `);

    const mountEl = document.getElementById('cad-mount');
    const width = mountEl.clientWidth;
    const height = mountEl.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(1, 1, 1);
    scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-1, -0.5, -1);
    scene.add(fillLight);

    modelGroup = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ 
      color: materialColor, 
      shininess: 30, 
      side: THREE.DoubleSide 
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

    const box = new THREE.Box3().setFromObject(modelGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 2.5;

    camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.update();

    document.getElementById('cad-quality').onchange = (e) => {
       helpers.setState('linearDeflection', parseFloat(e.target.value));
       processCadFile(file, content, helpers);
    };

    document.getElementById('cad-color').oninput = (e) => {
       helpers.setState('materialColor', e.target.value);
       material.color.set(e.target.value);
    };

    function animate() {
      if (!document.getElementById('cad-mount')) return;
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!mountEl || !renderer || !camera) return;
      const w = mountEl.clientWidth;
      const h = mountEl.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(mountEl);
  }
})();
