/**
 * OmniOpener — 3D (GLB/GLTF) Toolkit
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
    let animationId, renderer, scene, camera, controls, model, onResize;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.glb,.gltf',
      binary: true,
      infoHtml: '<strong>3D Toolkit:</strong> Professional GLB/GLTF viewer with lighting controls, wireframe mode, and mesh statistics.',
      
      actions: [
        {
          label: '📸 Screenshot',
          id: 'screenshot',
          onClick: function (h) {
            if (renderer && scene && camera) {
              renderer.render(scene, camera);
              const dataUrl = renderer.domElement.toDataURL('image/png');
              h.download('screenshot.png', dataUrl, 'image/png');
            }
          }
        },
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            const stats = h.getState().stats;
            if (stats) {
              const text = `Model: ${h.getFile().name}\nVertices: ${stats.vertices.toLocaleString()}\nFaces: ${stats.faces.toLocaleString()}`;
              h.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '📥 Download GLB',
          id: 'download',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/octet-stream');
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function _onFileFn(file, content, h) {
        if (!window.THREE || !THREE.GLTFLoader || !THREE.OrbitControls) {
          h.showLoading('Loading 3D engine...');
          setTimeout(() => _onFileFn(file, content, h), 100);
          return;
        }

        h.showLoading('Parsing 3D model...');
        const loader = new THREE.GLTFLoader();
        
        loader.parse(content, '', (gltf) => {
          // Calculate Stats
          let vertices = 0;
          let faces = 0;
          gltf.scene.traverse(node => {
             if (node.isMesh) {
                const geo = node.geometry;
                vertices += geo.attributes.position.count;
                if (geo.index) faces += geo.index.count / 3;
                else faces += geo.attributes.position.count / 3;
             }
          });
          
          h.setState('stats', { vertices, faces });

          h.render(`
            <div class="flex flex-col h-[80vh] min-h-[500px] border border-surface-200 rounded-xl overflow-hidden bg-[#0f172a] shadow-2xl relative font-sans">
              <!-- Controls Overlay -->
              <div class="absolute top-4 left-4 z-10 space-y-4">
                 <div class="bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-xl space-y-4 w-52">
                    <h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Model Info</h3>
                    <div class="space-y-1">
                       <p class="text-xs font-bold text-white truncate">${escapeHtml(file.name)}</p>
                       <p class="text-[10px] text-slate-400">${vertices.toLocaleString()} vertices • ${Math.round(faces).toLocaleString()} faces</p>
                    </div>
                    <div class="h-px bg-slate-800"></div>
                    <div class="space-y-3">
                       <div class="flex flex-col gap-1">
                          <label class="text-[9px] font-bold text-slate-500 uppercase">Ambient Light</label>
                          <input type="range" id="light-amb" min="0" max="3" step="0.1" value="1" class="w-full accent-brand-500">
                       </div>
                       <label class="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" id="check-wire" class="w-3 h-3 accent-brand-500">
                          <span class="text-[10px] font-bold text-slate-300 uppercase">Wireframe</span>
                       </label>
                    </div>
                 </div>
              </div>

              <!-- Canvas Mount -->
              <div id="glb-mount" class="flex-1 w-full h-full"></div>
              
              <!-- Bottom Toolbar -->
              <div class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700 shadow-xl flex gap-4 items-center whitespace-nowrap">
                 <button id="btn-reset-cam" class="text-[10px] font-bold text-slate-300 hover:text-white uppercase transition-colors">Reset Camera</button>
                 <div class="w-px h-4 bg-slate-700"></div>
                 <button id="btn-auto-rot" class="text-[10px] font-bold text-slate-300 hover:text-white uppercase transition-colors">Auto-Rotate: Off</button>
              </div>
            </div>
          `);

          const renderEl = h.getRenderEl();
          const mount = renderEl.querySelector('#glb-mount');
          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0f172a);
          
          camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 1000);
          
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(mount.clientWidth, mount.clientHeight);
          mount.appendChild(renderer.domElement);

          const ambientLight = new THREE.AmbientLight(0xffffff, 1);
          scene.add(ambientLight);
          
          const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
          directionalLight.position.set(5, 10, 7);
          scene.add(directionalLight);

          model = gltf.scene;
          scene.add(model);

          // Center model and scale it
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          
          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
          cameraZ *= 2.0; // Distance

          camera.position.set(cameraZ, cameraZ, cameraZ);
          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();

          model.position.sub(center);

          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          
          let autoRotate = false;

          renderEl.querySelector('#light-amb').oninput = (e) => { ambientLight.intensity = e.target.value; };
          renderEl.querySelector('#check-wire').onchange = (e) => {
             model.traverse(node => { if(node.isMesh) node.material.wireframe = e.target.checked; });
          };
          renderEl.querySelector('#btn-reset-cam').onclick = () => { 
            camera.position.set(cameraZ, cameraZ, cameraZ); 
            controls.target.set(0,0,0); 
          };
          renderEl.querySelector('#btn-auto-rot').onclick = (e) => {
             autoRotate = !autoRotate;
             controls.autoRotate = autoRotate;
             e.target.textContent = `Auto-Rotate: ${autoRotate ? 'On' : 'Off'}`;
          };

          if (animationId) cancelAnimationFrame(animationId);
          function animate() {
            if (!document.getElementById('glb-mount')) return;
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          }
          animate();

          if (onResize) window.removeEventListener('resize', onResize);
          onResize = () => {
             if (!mount || !mount.clientWidth) return;
             camera.aspect = mount.clientWidth / mount.clientHeight;
             camera.updateProjectionMatrix();
             renderer.setSize(mount.clientWidth, mount.clientHeight);
          };
          window.addEventListener('resize', onResize);

        }, (err) => h.showError('3D Error', err.message));
      },
      onDestroy: function() {
         if(animationId) cancelAnimationFrame(animationId);
         if(renderer) renderer.dispose();
         if(onResize) window.removeEventListener('resize', onResize);
      }
    });
  };
})();
