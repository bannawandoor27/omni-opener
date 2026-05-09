(function () {
  'use strict';

  function formatSize(b) {
    if (b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let animationId, renderer, scene, camera, controls, resizeObserver;
    let currentModel = null;

    function cleanupThree() {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
      }
      if (scene) {
        scene.traverse(node => {
          if (node.isMesh) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach(m => {
                  if (m.map) m.map.dispose();
                  m.dispose();
                });
              } else {
                if (node.material.map) node.material.map.dispose();
                node.material.dispose();
              }
            }
          }
        });
        scene = null;
      }
      camera = null;
      controls = null;
      currentModel = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.3ds',
      dropLabel: 'Drop a .3ds file here',
      binary: true,
      onInit: function (h) {
        const threeVer = '0.147.0';
        const baseUrl = `https://cdn.jsdelivr.net/npm/three@${threeVer}`;
        h.loadScript(`${baseUrl}/build/three.min.js`, () => {
          h.loadScript(`${baseUrl}/examples/js/loaders/TDSLoader.js`, () => {
            h.loadScript(`${baseUrl}/examples/js/controls/OrbitControls.js`);
          });
        });
      },
      onFile: function _onFile(file, content, h) {
        cleanupThree();

        if (file.size > 50 * 1024 * 1024) {
          h.render(`
            <div class="p-12 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-600 text-2xl mb-4">⚠️</div>
              <h3 class="text-surface-900 font-bold text-lg mb-2">Large 3D Model</h3>
              <p class="text-sm text-surface-500 mb-8 mx-auto max-w-sm">This file is ${formatSize(file.size)}. Parsing large 3DS files in the browser may be slow.</p>
              <button id="btn-proceed" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 hover:bg-brand-700 hover:-translate-y-0.5 transition-all">Proceed Anyway</button>
            </div>
          `);
          const btn = document.getElementById('btn-proceed');
          if (btn) btn.onclick = () => _processFile(file, content, h);
          return;
        }

        _processFile(file, content, h);

        function _processFile(file, content, h) {
          if (typeof THREE === 'undefined' || typeof THREE.TDSLoader === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
            h.showLoading('Initializing 3D engine...');
            setTimeout(() => _processFile(file, content, h), 200);
            return;
          }

          h.showLoading('Parsing 3DS model structures...');
          
          // Use a small delay to allow the loading state to render
          setTimeout(() => {
            try {
              const loader = new THREE.TDSLoader();
              // TDSLoader.parse expects an ArrayBuffer
              const object = loader.parse(content);
              if (!object) throw new Error('Could not extract 3D data from file.');
              _renderViewer(object, file, h);
            } catch (err) {
              console.error(err);
              h.showError('Could not open 3DS file', 'The file may be corrupted, encrypted, or in an unsupported sub-format. Error: ' + err.message);
            }
          }, 50);
        }

        function _renderViewer(object, file, h) {
          let vertices = 0;
          let faces = 0;
          let meshCount = 0;

          object.traverse(node => {
            if (node.isMesh) {
              meshCount++;
              const geo = node.geometry;
              if (geo.isBufferGeometry) {
                const pos = geo.attributes.position;
                if (pos) {
                  vertices += pos.count;
                  faces += geo.index ? geo.index.count / 3 : pos.count / 3;
                }
              }
            }
          });

          const box = new THREE.Box3().setFromObject(object);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          currentModel = object;

          h.render(`
            <div class="flex flex-col h-full min-h-[600px] font-sans">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
                <span class="font-semibold text-surface-800 truncate max-w-[200px]">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.3ds model</span>
                <div class="ml-auto flex items-center gap-3">
                  <span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs font-medium">
                    ${Math.round(faces).toLocaleString()} polygons
                  </span>
                </div>
              </div>

              <!-- Main Stage -->
              <div class="relative flex-1 min-h-0 bg-slate-950 rounded-2xl overflow-hidden border border-surface-200 group shadow-inner">
                <div id="three-mount" class="w-full h-full cursor-move outline-none"></div>

                <!-- Floating Toolbar -->
                <div class="absolute top-4 right-4 flex flex-col gap-2">
                  <div class="bg-white/90 backdrop-blur-md p-1.5 rounded-xl shadow-xl border border-surface-200 flex flex-col gap-1">
                    <button id="view-reset" title="Reset Camera" class="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-600">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                    </button>
                    <button id="view-wire" title="Toggle Wireframe" class="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-600">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13h16M12 4v16"/></svg>
                    </button>
                    <div class="h-px bg-surface-200 mx-2"></div>
                    <button id="view-rotate" title="Auto Rotate" class="p-2 hover:bg-surface-100 rounded-lg transition-colors text-surface-600">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                  </div>
                </div>

                <!-- Scene Stats & Config -->
                <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
                  <div class="bg-black/40 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 text-[10px] text-white/80 font-mono pointer-events-auto">
                    <div class="flex gap-4">
                      <span>VERTS: ${vertices.toLocaleString()}</span>
                      <span>FACES: ${faces.toLocaleString()}</span>
                      <span>MESHES: ${meshCount}</span>
                    </div>
                    <div class="mt-1 text-white/40">
                      DIM: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}
                    </div>
                  </div>

                  <div class="bg-white/90 backdrop-blur-md p-2 rounded-xl border border-surface-200 shadow-lg pointer-events-auto flex items-center gap-3">
                    <select id="env-mode" class="text-xs font-medium bg-transparent border-none focus:ring-0 text-surface-700 cursor-pointer">
                      <option value="studio">Studio Light</option>
                      <option value="dusk">Cyber Dusk</option>
                      <option value="bright">Daylight</option>
                      <option value="dark">Vantablack</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Footer Stats / Details -->
              <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Scale Profile</div>
                    <div class="text-sm font-semibold text-surface-700">${size.x > 100 ? 'Large Scale' : size.x < 1 ? 'Micro Scale' : 'Standard'}</div>
                 </div>
                 <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Complexity</div>
                    <div class="text-sm font-semibold text-surface-700">${faces > 100000 ? 'High Poly' : faces > 10000 ? 'Mid Poly' : 'Low Poly'}</div>
                 </div>
                 <div class="p-3 bg-surface-50 rounded-xl border border-surface-100">
                    <div class="text-[10px] font-bold text-surface-400 uppercase mb-1">Center Offset</div>
                    <div class="text-sm font-semibold text-surface-700">${center.length().toFixed(2)} units</div>
                 </div>
              </div>
            </div>
          `);

          const mount = document.getElementById('three-mount');
          if (!mount) return;

          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(mount.clientWidth, mount.clientHeight);
          mount.appendChild(renderer.domElement);

          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x020617);

          const aspect = mount.clientWidth / mount.clientHeight;
          camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 20000);
          
          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;

          // Lighting Setup
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
          scene.add(ambientLight);

          const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
          sunLight.position.set(100, 100, 100);
          scene.add(sunLight);

          const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.4);
          fillLight.position.set(-100, 50, -100);
          scene.add(fillLight);

          // Position Model
          object.position.sub(center);
          scene.add(object);

          // Fit Camera
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const dist = maxDim * 1.5 / Math.tan(Math.PI * 45 / 360);
          camera.position.set(dist * 0.8, dist * 0.5, dist * 0.8);
          camera.lookAt(0, 0, 0);
          controls.update();

          // Environment Presets
          const envs = {
            studio: { bg: 0x0f172a, ambient: 0.6, sun: 0.8, fill: 0.4 },
            dusk: { bg: 0x1e1b4b, ambient: 0.4, sun: 1.2, fill: 0.8 },
            bright: { bg: 0xf8fafc, ambient: 0.8, sun: 1.0, fill: 0.2 },
            dark: { bg: 0x020617, ambient: 0.2, sun: 0.5, fill: 0.1 }
          };

          const envSelect = document.getElementById('env-mode');
          if (envSelect) {
            envSelect.onchange = (e) => {
              const theme = envs[e.target.value] || envs.studio;
              scene.background = new THREE.Color(theme.bg);
              ambientLight.intensity = theme.ambient;
              sunLight.intensity = theme.sun;
              fillLight.intensity = theme.fill;
            };
          }

          let isWire = false;
          const wireBtn = document.getElementById('view-wire');
          if (wireBtn) {
            wireBtn.onclick = () => {
              isWire = !isWire;
              object.traverse(n => {
                if (n.isMesh && n.material) {
                  if (Array.isArray(n.material)) n.material.forEach(m => m.wireframe = isWire);
                  else n.material.wireframe = isWire;
                }
              });
              wireBtn.classList.toggle('bg-brand-50', isWire);
              wireBtn.classList.toggle('text-brand-600', isWire);
            };
          }

          const rotateBtn = document.getElementById('view-rotate');
          if (rotateBtn) {
            rotateBtn.onclick = () => {
              controls.autoRotate = !controls.autoRotate;
              rotateBtn.classList.toggle('bg-brand-50', controls.autoRotate);
              rotateBtn.classList.toggle('text-brand-600', controls.autoRotate);
            };
          }

          const resetBtn = document.getElementById('view-reset');
          if (resetBtn) {
            resetBtn.onclick = () => {
              camera.position.set(dist * 0.8, dist * 0.5, dist * 0.8);
              controls.target.set(0, 0, 0);
              controls.reset();
            };
          }

          function _animate() {
            if (!mount.isConnected) {
              cleanupThree();
              return;
            }
            animationId = requestAnimationFrame(_animate);
            controls.update();
            renderer.render(scene, camera);
          }
          _animate();

          resizeObserver = new ResizeObserver(() => {
            if (!mount.clientWidth || !mount.clientHeight || !renderer) return;
            camera.aspect = mount.clientWidth / mount.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(mount.clientWidth, mount.clientHeight);
          });
          resizeObserver.observe(mount);
        }
      },
      onDestroy: function () {
        cleanupThree();
      },
      actions: [
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            if (!currentModel) return;
            const box = new THREE.Box3().setFromObject(currentModel);
            const size = box.getSize(new THREE.Vector3());
            
            let v = 0, f = 0;
            currentModel.traverse(n => {
              if (n.isMesh && n.geometry.isBufferGeometry) {
                const p = n.geometry.attributes.position;
                if (p) {
                  v += p.count;
                  f += n.geometry.index ? n.geometry.index.count / 3 : p.count / 3;
                }
              }
            });

            const text = [
              `File: ${h.getFile().name}`,
              `Vertices: ${v.toLocaleString()}`,
              `Polygons: ${Math.round(f).toLocaleString()}`,
              `Dimensions: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)} units`
            ].join('\n');
            
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'dl-file',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/x-3ds');
          }
        }
      ],
      infoHtml: '<strong>Secure 3D Viewer:</strong> Your files stay in the browser. Supports 3ds Mesh data, basic materials, and hierarchy visualization.'
    });
  };
})();
