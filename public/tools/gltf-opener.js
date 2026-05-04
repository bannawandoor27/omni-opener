(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  window.initTool = function (toolConfig, mountEl) {
    let renderer, scene, camera, controls, animationId, model;
    let resizeHandler = null;
    let lastBlobUrl = null;

    function cleanup() {
      if (animationId) cancelAnimationFrame(animationId);
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
      }
      if (controls) controls.dispose();
      if (scene) {
        scene.traverse(node => {
          if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach(m => m.dispose());
              } else {
                node.material.dispose();
              }
            }
          }
        });
      }
      if (resizeHandler) {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
      }
      if (lastBlobUrl) {
        URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = null;
      }
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.glb,.gltf',
      binary: true,
      infoHtml: 'Professional 3D viewer for GLB and GLTF files with lighting, wireframe, and mesh statistics.',
      actions: [
        {
          label: 'Download Original',
          icon: '📥',
          onClick: (file, content, h) => {
            h.download(file.name, content);
          }
        },
        {
          label: 'Take Screenshot',
          icon: '📸',
          onClick: (file, content, h) => {
            if (!renderer) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob((blob) => {
              h.download(file.name.replace(/\.(glb|gltf)$/, '') + '-screenshot.png', blob, 'image/png');
            }, 'image/png');
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/loaders/GLTFLoader.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/controls/OrbitControls.js');
          });
        });
      },

      onFile: function _onFileFn(file, content, h) {
        cleanup();

        if (!window.THREE || !THREE.GLTFLoader || !THREE.OrbitControls) {
          h.showLoading('Initializing 3D engine...');
          setTimeout(function() { _onFileFn(file, content, h); }, 300);
          return;
        }

        h.showLoading('Parsing 3D assets...');

        const loader = new THREE.GLTFLoader();
        // Handle potential GLTF JSON as ArrayBuffer or GLB
        loader.parse(content, '', (gltf) => {
          model = gltf.scene;
          
          let vertices = 0;
          let faces = 0;
          let meshes = 0;
          let materials = new Set();

          model.traverse(node => {
            if (node.isMesh) {
              meshes++;
              const geo = node.geometry;
              if (geo.attributes.position) {
                vertices += geo.attributes.position.count;
              }
              if (geo.index) {
                faces += geo.index.count / 3;
              } else if (geo.attributes.position) {
                faces += geo.attributes.position.count / 3;
              }
              if (node.material) {
                if (Array.isArray(node.material)) {
                  node.material.forEach(m => materials.add(m.name || 'Unnamed'));
                } else {
                  materials.add(node.material.name || 'Unnamed');
                }
              }
            }
          });

          h.render(`
            <div class="space-y-4">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500 capitalize">${file.name.split('.').pop()} model</span>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <!-- Sidebar Controls -->
                <div class="lg:col-span-1 space-y-4">
                  <!-- U10: Section Header -->
                  <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm space-y-4">
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="font-semibold text-surface-800 text-sm">Statistics</h3>
                      <span class="text-[10px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full uppercase font-bold">${meshes} Meshes</span>
                    </div>
                    
                    <div class="space-y-2 text-xs">
                      <div class="flex justify-between py-1 border-b border-surface-50">
                        <span class="text-surface-500">Vertices</span>
                        <span class="font-mono font-medium">${vertices.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between py-1 border-b border-surface-50">
                        <span class="text-surface-500">Triangles</span>
                        <span class="font-mono font-medium">${Math.round(faces).toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between py-1 border-b border-surface-50">
                        <span class="text-surface-500">Materials</span>
                        <span class="font-mono font-medium">${materials.size}</span>
                      </div>
                    </div>

                    <div class="pt-2 space-y-4 border-t border-surface-100 mt-4">
                      <div class="space-y-2">
                        <label class="text-[10px] font-bold text-surface-400 uppercase tracking-wider">Lighting Intensity</label>
                        <input type="range" id="param-light" min="0" max="3" step="0.1" value="1" class="w-full h-1.5 bg-surface-100 rounded-lg appearance-none cursor-pointer accent-brand-600">
                      </div>

                      <div class="flex flex-col gap-2">
                        <label class="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" id="param-wireframe" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                          <span class="text-xs text-surface-600 group-hover:text-surface-900 transition-colors font-medium">Wireframe Mode</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer group">
                          <input type="checkbox" id="param-autorotate" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                          <span class="text-xs text-surface-600 group-hover:text-surface-900 transition-colors font-medium">Auto-Rotate</span>
                        </label>
                      </div>

                      <button id="param-reset" class="w-full py-2 px-3 bg-surface-50 hover:bg-surface-100 text-surface-700 text-xs font-semibold rounded-lg border border-surface-200 transition-colors">
                        Reset View
                      </button>
                    </div>
                  </div>

                  <!-- Materials List -->
                  <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm overflow-hidden">
                    <h3 class="font-semibold text-surface-800 text-sm mb-3">Materials</h3>
                    <div class="max-h-48 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      ${Array.from(materials).map(mat => `
                        <div class="text-[11px] px-2 py-1.5 bg-surface-50 rounded border border-surface-100 text-surface-600 truncate" title="${escapeHtml(mat)}">
                          ${escapeHtml(mat)}
                        </div>
                      `).join('') || '<div class="text-xs text-surface-400 italic">No materials found</div>'}
                    </div>
                  </div>
                </div>

                <!-- 3D Viewport -->
                <div class="lg:col-span-3 h-[600px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-inner relative group">
                  <div id="three-viewport" class="w-full h-full cursor-grab active:cursor-grabbing"></div>
                  <div class="absolute bottom-4 right-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="bg-black/50 backdrop-blur px-3 py-1.5 rounded-full text-[10px] text-white font-medium border border-white/10">
                      Left Click: Rotate • Right Click: Pan • Scroll: Zoom
                    </span>
                  </div>
                </div>
              </div>
            </div>
          `);

          const container = document.getElementById('three-viewport');
          if (!container) return;

          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0f172a);

          camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 2000);
          
          renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(container.clientWidth, container.clientHeight);
          renderer.outputEncoding = THREE.sRGBEncoding;
          container.appendChild(renderer.domElement);

          const ambLight = new THREE.AmbientLight(0xffffff, 1);
          scene.add(ambLight);

          const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
          dirLight.position.set(5, 10, 7);
          scene.add(dirLight);

          scene.add(model);

          // Center and scale camera
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          
          const maxSize = Math.max(size.x, size.y, size.z);
          const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
          const fitWidthDistance = fitHeightDistance / camera.aspect;
          const distance = 1.2 * Math.max(fitHeightDistance, fitWidthDistance);

          camera.position.set(center.x, center.y, center.z + distance);
          camera.lookAt(center);

          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.target.copy(center);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;

          // UI Interactivity
          const wireCheck = document.getElementById('param-wireframe');
          const autoCheck = document.getElementById('param-autorotate');
          const lightSlider = document.getElementById('param-light');
          const resetBtn = document.getElementById('param-reset');

          wireCheck.onchange = (e) => {
            model.traverse(node => {
              if (node.isMesh && node.material) {
                if (Array.isArray(node.material)) node.material.forEach(m => m.wireframe = e.target.checked);
                else node.material.wireframe = e.target.checked;
              }
            });
          };

          autoCheck.onchange = (e) => {
            controls.autoRotate = e.target.checked;
          };

          lightSlider.oninput = (e) => {
            ambLight.intensity = parseFloat(e.target.value);
            dirLight.intensity = parseFloat(e.target.value) * 0.8;
          };

          resetBtn.onclick = () => {
            camera.position.set(center.x, center.y, center.z + distance);
            controls.target.copy(center);
            controls.update();
          };

          function animate() {
            if (!document.getElementById('three-viewport')) return;
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          }
          animate();

          resizeHandler = () => {
            if (!container) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
          };
          window.addEventListener('resize', resizeHandler);

        }, (err) => {
          h.showError('Rendering Failed', 'Could not parse the 3D model. The file might be corrupted or in an unsupported GLTF version. Error: ' + err.message);
        });
      },

      onDestroy: function () {
        cleanup();
      }
    });
  };
})();
