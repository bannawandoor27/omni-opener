(function() {
  'use strict';

  var scene, camera, renderer, controls, animationId;
  var modelGroup;

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.step,.stp,.iges,.igs',
      binary: true,
      infoHtml: '<strong>CAD Toolkit:</strong> Professional STEP/IGES viewer with adjustable tessellation quality and material customization.',
      
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', function() {
          helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', function() {
            helpers.loadScript('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js');
          });
        });
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing CAD file...');
        if (typeof occtImportJs === 'undefined') {
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }
        
        const linearDeflection = helpers.getState().linearDeflection || 0.1;
        parseAndRender(linearDeflection);

        async function parseAndRender(deflection) {
          try {
            const occt = await occtImportJs();
            const ext = file.name.split('.').pop().toLowerCase();
            const result = (ext === 'step' || ext === 'stp') 
               ? occt.ReadStep(new Uint8Array(content), deflection)
               : occt.ReadIges(new Uint8Array(content), deflection);
               
            if (!result || !result.success) throw new Error('Parse failed');
            render3D(result, file, helpers);
          } catch (e) {
            helpers.showError('CAD Error', e.message);
          }
        }
      }
    });
  };

  function render3D(result, file, helpers) {
    cleanup();
    const deflection = helpers.getState().linearDeflection || 0.1;
    const materialColor = helpers.getState().materialColor || '#6366f1';

    helpers.render(`
      <div class="flex flex-col h-[85vh] font-sans">
        <div class="shrink-0 p-4 bg-surface-50 border-b flex justify-between items-center text-sm">
          <div class="flex items-center gap-3">
             <span class="font-bold text-surface-900">${esc(file.name)}</span>
             <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-[10px] font-bold uppercase">${result.meshes.length} Meshes</span>
          </div>
          <div class="flex gap-4 items-center">
             <div class="flex items-center gap-2">
                <label class="text-[10px] font-bold text-surface-400 uppercase">Quality</label>
                <select id="cad-quality" class="text-[10px] border border-surface-200 rounded px-1.5 py-0.5 outline-none font-bold">
                   <option value="0.5" ${deflection === 0.5 ? 'selected' : ''}>Draft</option>
                   <option value="0.1" ${deflection === 0.1 ? 'selected' : ''}>Medium</option>
                   <option value="0.02" ${deflection === 0.02 ? 'selected' : ''}>High</option>
                </select>
             </div>
             <input type="color" id="cad-color" value="${materialColor}" class="w-6 h-6 rounded cursor-pointer border-0 bg-transparent">
          </div>
        </div>
        <div id="cad-mount" class="flex-1 w-full bg-[#0f172a] cursor-move"></div>
      </div>
    `);

    const mountEl = document.getElementById('cad-mount');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    camera = new THREE.PerspectiveCamera(45, mountEl.clientWidth / mountEl.clientHeight, 0.1, 10000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    modelGroup = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: materialColor, shininess: 30, side: THREE.DoubleSide });
    
    result.meshes.forEach(function(m) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(m.attributes.normal.array, 3));
      else geometry.computeVertexNormals();
      if (m.index) geometry.setIndex(new THREE.BufferAttribute(m.index.array, 1));
      modelGroup.add(new THREE.Mesh(geometry, material));
    });

    const box = new THREE.Box3().setFromObject(modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelGroup.position.set(-center.x, -center.y, -center.z);
    scene.add(modelGroup);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
    camera.lookAt(0, 0, 0);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    document.getElementById('cad-quality').onchange = (e) => {
       helpers.setState('linearDeflection', parseFloat(e.target.value));
       helpers.getMountEl()._onFileUpdate(helpers.getFile(), helpers.getContent());
    };
    document.getElementById('cad-color').oninput = (e) => {
       helpers.setState('materialColor', e.target.value);
       material.color.set(e.target.value);
    };

    function animate() {
      if (!document.getElementById('cad-mount')) { cleanup(); return; }
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  }

  function cleanup() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    scene = null;
  }
})();
