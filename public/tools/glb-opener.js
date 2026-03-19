(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let animationId, renderer, scene, camera, controls;

    OmniTool.create(mountEl, toolConfig, {
      actions: [
        { label: "📥 Download Original", id: "dl-orig", onClick: (h) => h.download(h.getFile().name, h.getContent()) },
        { label: "📋 Copy Filename", id: "copy-name", onClick: (h, b) => h.copyToClipboard(h.getFile().name, b) }
      ],
      accept: '.glb,.gltf',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
          });
        });
      },
      onFile: function (file, content, h) {
        if (!window.THREE || !THREE.GLTFLoader || !THREE.OrbitControls) {
          h.showLoading('Loading engine...');
          setTimeout(() => this.onFile(file, content, h), 1000);
          return;
        }

        h.showLoading('Rendering...');
        const loader = new THREE.GLTFLoader();
        loader.parse(content, '', (gltf) => {
          h.render(`
            <div class="p-4">
              <div class="mb-4 font-bold">${esc(file.name)}</div>
              <div id="glb-mount" class="w-full h-[60vh] rounded shadow-lg bg-slate-900"></div>
            </div>
          `);

          const mount = document.getElementById('glb-mount');
          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0f172a);
          camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
          camera.position.set(5, 5, 5);
          renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setSize(mount.clientWidth, mount.clientHeight);
          mount.appendChild(renderer.domElement);

          scene.add(new THREE.AmbientLight(0xffffff, 1));
          const dl = new THREE.DirectionalLight(0xffffff, 1);
          dl.position.set(1, 1, 1);
          scene.add(dl);

          const model = gltf.scene;
          scene.add(model);

          controls = new THREE.OrbitControls(camera, renderer.domElement);
          
          function animate() {
            if (!document.getElementById('glb-mount')) return;
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          }
          animate();
        }, (err) => h.showError('Error', err.message));
      }
    });
  };

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
