(function () {
  'use strict';

  var scene, camera, renderer, controls, animationId;
  var modelGroup;

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.iges,.igs,.step,.stp',
      binary: true,
      infoHtml: '<strong>CAD Viewer:</strong> High-performance browser-based viewer for IGES and STEP files. Powered by <a href="https://github.com/kovacsv/occt-import-js" target="_blank" class="text-brand-600 underline">occt-import-js</a> (OpenCascade). All processing is done locally.',

      onInit: function (helpers) {
        return helpers.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.145.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.145.0/examples/js/controls/OrbitControls.js',
          'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js'
        ]);
      },

      onDestroy: function () {
        cleanup();
      },

      actions: [
        {
          label: '📋 Copy Name',
          id: 'copy-name',
          onClick: function (helpers, btn) {
            helpers.copyToClipboard(helpers.getFile().name, btn);
          }
        },
        {
          label: '📥 Download',
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

  async function processCadFile(file, content, helpers) {
    helpers.showLoading('Initializing 3D Engine...');

    var attempts = 0;
    while (attempts < 50 && (typeof THREE === 'undefined' || typeof occtImportJs === 'undefined')) {
      await new Promise(function(resolve) { setTimeout(resolve, 100); });
      attempts++;
    }

    if (typeof THREE === 'undefined' || typeof occtImportJs === 'undefined') {
      helpers.showError('Dependency Error', 'Failed to load 3D libraries from CDN.');
      return;
    }

    try {
      helpers.showLoading('Parsing geometry...');
      var occt = await occtImportJs();
      var ext = file.name.split('.').pop().toLowerCase();
      var buffer = new Uint8Array(content);
      var deflection = helpers.getState().linearDeflection || 0.1;
      
      var result;
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
      helpers.showError('Parsing Failed', e.message);
    }
  }

  function render3D(result, file, helpers) {
    cleanup();

    var materialColor = helpers.getState().materialColor || '#6366f1';
    var deflection = helpers.getState().linearDeflection || 0.1;

    helpers.render(
      '<div class="flex flex-col h-[600px] bg-slate-900 overflow-hidden rounded-xl font-sans text-white">' +
        '<div class="flex flex-wrap justify-between items-center p-3 bg-slate-800 border-b border-slate-700 gap-3">' +
          '<div class="flex items-center gap-2 overflow-hidden">' +
            '<span class="font-bold truncate text-sm">' + esc(file.name) + '</span>' +
            '<span class="text-[10px] px-2 py-0.5 bg-slate-700 rounded-full text-slate-300 font-mono">' + result.meshes.length + ' MESHES</span>' +
          '</div>' +
          '<div class="flex items-center gap-4 text-xs font-semibold">' +
            '<div class="flex items-center gap-2">' +
              '<label class="text-slate-400 uppercase text-[10px]">Quality</label>' +
              '<select id="cad-quality" class="bg-slate-700 border-none rounded px-2 py-1 outline-none cursor-pointer text-white">' +
                '<option value="0.5"' + (deflection === 0.5 ? ' selected' : '') + '>Low</option>' +
                '<option value="0.1"' + (deflection === 0.1 ? ' selected' : '') + '>Medium</option>' +
                '<option value="0.02"' + (deflection === 0.02 ? ' selected' : '') + '>High</option>' +
              '</select>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              '<label class="text-slate-400 uppercase text-[10px]">Color</label>' +
              '<input type="color" id="cad-color" value="' + materialColor + '" class="w-6 h-6 p-0 bg-transparent border-none cursor-pointer rounded">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="cad-viewport" class="flex-1 relative cursor-move"></div>' +
      '</div>'
    );

    var viewport = document.getElementById('cad-viewport');
    if (!viewport) return;

    var width = viewport.clientWidth;
    var height = viewport.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    viewport.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 2);
    scene.add(dirLight1);

    modelGroup = new THREE.Group();
    var material = new THREE.MeshPhongMaterial({
      color: materialColor,
      side: THREE.DoubleSide,
      flatShading: false,
      shininess: 40
    });

    result.meshes.forEach(function(m) {
      var geometry = new THREE.BufferGeometry();
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

    var box = new THREE.Box3().setFromObject(modelGroup);
    var size = box.getSize(new THREE.Vector3());
    var center = box.getCenter(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z);
    
    var OrbitControlsImpl = THREE.OrbitControls || window.OrbitControls;
    if (!OrbitControlsImpl) {
       helpers.showError('Control Error', 'OrbitControls not found.');
       return;
    }
    controls = new OrbitControlsImpl(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;

    var fov = camera.fov * (Math.PI / 180);
    var cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.5;
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

    document.getElementById('cad-quality').addEventListener('change', function(e) {
      helpers.setState('linearDeflection', parseFloat(e.target.value));
      processCadFile(file, helpers.getContent(), helpers);
    });

    document.getElementById('cad-color').addEventListener('input', function(e) {
      helpers.setState('materialColor', e.target.value);
      material.color.set(e.target.value);
    });

    var resizeObserver = new ResizeObserver(function() {
      if (!viewport || !renderer || !camera) return;
      var w = viewport.clientWidth;
      var h = viewport.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(viewport);
  }

  function cleanup() {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    if (controls) controls.dispose();
    scene = camera = renderer = controls = modelGroup = null;
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
