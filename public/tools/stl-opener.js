(function () {
  'use strict';

  let scene, camera, renderer, mesh, controls, animationId;
  let autoRotate = false;
  let wireframe = false;

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.stl',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', function () {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/STLLoader.js', function () {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', function () {
              h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/exporters/OBJExporter.js');
            });
          });
        });
      },

      onFile: function (file, content, h) {
        if (!window.THREE || !THREE.STLLoader || !THREE.OrbitControls) {
          h.showLoading('Loading 3D engine...');
          setTimeout(() => this.onFile(file, content, h), 500);
          return;
        }

        try {
          const loader = new THREE.STLLoader();
          const geometry = loader.parse(content);
          
          h.render(`
            <div class="p-4 bg-surface-50 border-b flex justify-between items-center">
               <span class="font-bold">${esc(file.name)}</span>
               <div class="flex gap-2">
                 <button id="btn-wireframe" class="px-3 py-1 bg-white border rounded text-xs shadow-sm hover:bg-surface-50 transition-colors">Wireframe</button>
                 <button id="btn-rotate" class="px-3 py-1 bg-white border rounded text-xs shadow-sm hover:bg-surface-50 transition-colors">Rotate</button>
                 <button id="btn-export" class="px-3 py-1 bg-brand-500 text-white rounded text-xs shadow-sm hover:bg-brand-600 transition-colors">Export OBJ</button>
               </div>
            </div>
            <div id="stl-mount" class="w-full h-[60vh] bg-[#f8fafc]"></div>
          `);

          const mount = document.getElementById('stl-mount');
          initThree(mount, geometry);

          document.getElementById('btn-wireframe').onclick = () => {
            wireframe = !wireframe;
            if (mesh) mesh.material.wireframe = wireframe;
          };
          document.getElementById('btn-rotate').onclick = () => {
            autoRotate = !autoRotate;
          };
          document.getElementById('btn-export').onclick = () => {
            if (THREE.OBJExporter) {
              const exporter = new THREE.OBJExporter();
              const result = exporter.parse(scene);
              h.download(file.name.replace('.stl', '.obj'), result, 'text/plain');
            }
          };

        } catch (err) {
          h.showError('Error', err.message);
        }
      }
    });
  };

  function initThree(mount, geometry) {
    if (animationId) cancelAnimationFrame(animationId);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 1, 1);
    scene.add(dirLight);

    const material = new THREE.MeshPhongMaterial({ color: 0x4f46e5, shininess: 30, wireframe: wireframe });
    mesh = new THREE.Mesh(geometry, material);
    
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    mesh.position.set(-center.x, -center.y, -center.z);
    scene.add(mesh);

    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(maxDim * 2, maxDim * 2, maxDim * 2);
    camera.lookAt(0, 0, 0);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    function animate() {
      if (!document.getElementById('stl-mount')) return;
      animationId = requestAnimationFrame(animate);
      if (controls) controls.update();
      if (autoRotate && mesh) mesh.rotation.y += 0.01;
      renderer.render(scene, camera);
    }
    animate();
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
