(function() {
  'use strict';

  var scene, camera, renderer, controls, animationId, resizeObserver;
  var modelGroup;
  var isAutoRotate = true;
  var isWireframe = false;

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.step,.stp',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', function() {
          helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', function() {
            helpers.loadScript('https://cdn.jsdelivr.net/npm/occt-import-js@0.0.12/dist/occt-import-js.js');
          });
        });
      },
      onFile: function(file, content, helpers) {
        helpers.showLoading('Parsing STEP file...');

        if (typeof occtImportJs === 'undefined') {
          setTimeout(() => this.onFile(file, content, helpers), 500);
          return;
        }

        parseAndRender();

        async function parseAndRender() {
          try {
            const occt = await occtImportJs();
            const result = occt.ReadStep(new Uint8Array(content), 0.05);
            if (!result || !result.success) throw new Error('Parse failed');
            render3D(result, file, helpers);
          } catch (e) {
            helpers.showError('Error', e.message);
          }
        }
      }
    });
  };

  function render3D(result, file, helpers) {
    cleanup();
    helpers.render(`
      <div class="p-4 bg-surface-50 border-b flex justify-between items-center text-sm">
        <span class="font-bold">${esc(file.name)}</span>
        <span>${result.meshes.length} meshes</span>
      </div>
      <div id="step-mount" class="w-full h-[60vh] bg-slate-900"></div>
    `);

    const mountEl = document.getElementById('step-mount');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    camera = new THREE.PerspectiveCamera(45, mountEl.clientWidth / mountEl.clientHeight, 0.1, 10000);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
    mountEl.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    modelGroup = new THREE.Group();
    result.meshes.forEach(function(m) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) geometry.setAttribute('normal', new THREE.BufferAttribute(m.attributes.normal.array, 3));
      else geometry.computeVertexNormals();
      if (m.index) geometry.setIndex(new THREE.BufferAttribute(m.index.array, 1));

      const material = new THREE.MeshPhongMaterial({ color: 0x6366f1, shininess: 30, side: THREE.DoubleSide });
      modelGroup.add(new THREE.Mesh(geometry, material));
    });

    const box = new THREE.Box3().setFromObject(modelGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelGroup.position.set(-center.x, -center.y, -center.z);
    scene.add(modelGroup);

    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
    camera.lookAt(0, 0, 0);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    function animate() {
      if (!document.getElementById('step-mount')) return;
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
