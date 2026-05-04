(function () {
  'use strict';

  var scene, camera, renderer, controls, animationId, modelGroup;

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.step,.stp,.iges,.igs',
      binary: true,
      infoHtml: '<strong>CAD Toolkit:</strong> Professional STEP/IGES viewer with adjustable quality. 100% browser-based.',

      actions: [
        {
          label: '📸 Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            if (renderer) {
              renderer.render(scene, camera);
              const dataUrl = renderer.domElement.toDataURL('image/png');
              h.download('screenshot.png', dataUrl, 'image/png');
            }
          }
        },
        {
          label: '📥 Download JSON',
          id: 'dl-json',
          onClick: function (h) {
            const result = h.getState().cadResult;
            if (result) {
              h.download(h.getFile().name + '.json', JSON.stringify(result, null, 2), 'application/json');
            }
          }
        }
      ],

      onInit: function (h) {
        return h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
        ]);
      },

      onFile: async function handleFile(file, content, h) {
        h.showLoading('Parsing CAD file...');

        try {
          if (typeof occtImportJs === 'undefined') {
            await h.loadScripts([
              'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
              'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
              'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
            ]);
          }

          const occt = await occtImportJs();
          const ext = file.name.split('.').pop().toLowerCase();
          const linearDeflection = h.getState().linearDeflection || 0.1;

          const result = (ext === 'step' || ext === 'stp')
            ? occt.ReadStep(new Uint8Array(content), linearDeflection)
            : occt.ReadIges(new Uint8Array(content), linearDeflection);

          if (!result || !result.success) throw new Error('Parse failed');

          h.setState('cadResult', result);
          render3D(result, file, h, handleFile);
        } catch (e) {
          h.showError('CAD Error', e.message);
        }
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };

  function render3D(result, file, h, handleFile) {
    cleanup();
    const deflection = h.getState().linearDeflection || 0.1;
    const materialColor = h.getState().materialColor || '#6366f1';

    h.render(`
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
                   <option value="0.5" ${deflection === 0.5 ? 'selected' : ''}>Draft</option>
                   <option value="0.1" ${deflection === 0.1 ? 'selected' : ''}>Medium</option>
                   <option value="0.02" ${deflection === 0.02 ? 'selected' : ''}>High</option>
                </select>
             </div>
             <input type="color" id="cad-color" value="${materialColor}" class="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0">
          </div>
        </div>
        <div id="cad-mount" class="flex-1 w-full bg-[#0f172a] relative overflow-hidden"></div>
      </div>
    `);

    const mountEl = document.getElementById('cad-mount');
    if (!mountEl) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    camera = new THREE.PerspectiveCamera(45, mountEl.clientWidth / mountEl.clientHeight, 0.1, 100000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    modelGroup = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: materialColor, shininess: 30, side: THREE.DoubleSide });

    result.meshes.forEach(function (m) {
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
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
    camera.lookAt(center);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;

    document.getElementById('cad-quality').onchange = (e) => {
      h.setState('linearDeflection', parseFloat(e.target.value));
      handleFile(file, h.getContent(), h);
    };

    document.getElementById('cad-color').oninput = (e) => {
      h.setState('materialColor', e.target.value);
      material.color.set(e.target.value);
    };

    function animate() {
      if (!document.getElementById('cad-mount')) { cleanup(); return; }
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    var onResize = function () {
      if (!mountEl) return;
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    };
    window.addEventListener('resize', onResize);
    
    // Store cleanup for resize event
    var oldCleanup = cleanup;
    cleanup = function() {
      window.removeEventListener('resize', onResize);
      oldCleanup();
    };
  }

  function cleanup() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    if (controls) controls.dispose();
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    modelGroup = null;
  }
})();
