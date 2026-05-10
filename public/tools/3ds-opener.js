(function () {
  'use strict';

  function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let animationId, renderer, scene, camera, controls, resizeObserver;
    let currentObject = null;
    let currentFile = null;

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
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              materials.forEach(m => {
                if (m.map) m.map.dispose();
                m.dispose();
              });
            }
          }
        });
        scene = null;
      }
      camera = null;
      controls = null;
      currentObject = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.3ds',
      dropLabel: 'Drop a .3ds model here',
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
        currentFile = file;
        cleanupThree();

        if (file.size > 100 * 1024 * 1024) {
          h.render(`
            <div class="p-12 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-600 text-2xl mb-4">⚠️</div>
              <h3 class="text-surface-900 font-bold text-lg mb-2">Very Large 3D Model</h3>
              <p class="text-sm text-surface-500 mb-8 mx-auto max-w-sm">This file is ${formatSize(file.size)}. Processing large 3DS files in the browser may cause your tab to freeze.</p>
              <button id="btn-proceed" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-bold shadow-lg shadow-brand-500/20 hover:bg-brand-700 hover:-translate-y-0.5 transition-all">Proceed with Caution</button>
            </div>
          `);
          const btn = document.getElementById('btn-proceed');
          if (btn) btn.onclick = () => _startParsing(file, content, h);
          return;
        }

        _startParsing(file, content, h);

        function _startParsing(file, content, h) {
          if (typeof THREE === 'undefined' || !THREE.TDSLoader || !THREE.OrbitControls) {
            h.showLoading('Loading 3D Engine...');
            setTimeout(function () { _startParsing(file, content, h); }, 200);
            return;
          }

          h.showLoading('Parsing 3DS geometry...');
          
          setTimeout(() => {
            try {
              const loader = new THREE.TDSLoader();
              const object = loader.parse(content);
              if (!object) throw new Error('Loader returned no data');
              
              let meshFound = false;
              object.traverse(n => { if (n.isMesh) meshFound = true; });
              if (!meshFound) {
                h.render(`
                  <div class="p-12 text-center">
                    <div class="text-4xl mb-4">📭</div>
                    <h3 class="text-lg font-bold text-surface-900">Empty Model</h3>
                    <p class="text-surface-500">The 3DS file was parsed successfully but contains no renderable meshes.</p>
                  </div>
                `);
                return;
              }

              _renderViewer(object, file, h);
            } catch (err) {
              console.error(err);
              h.showError('Could not open 3DS file', 'The file might be corrupted or using an unsupported variant of the 3DS format. Error: ' + err.message);
            }
          }, 100);
        }

        function _renderViewer(object, file, h) {
          currentObject = object;
          const meshes = [];
          let totalVerts = 0;
          let totalFaces = 0;

          object.traverse(node => {
            if (node.isMesh) {
              const geo = node.geometry;
              let v = 0, f = 0;
              if (geo.isBufferGeometry) {
                const pos = geo.attributes.position;
                if (pos) {
                  v = pos.count;
                  f = geo.index ? geo.index.count / 3 : pos.count / 3;
                }
              }
              meshes.push({
                name: node.name || 'Unnamed Mesh',
                verts: v,
                faces: Math.round(f),
                visible: node.visible
              });
              totalVerts += v;
              totalFaces += f;
            }
          });

          const box = new THREE.Box3().setFromObject(object);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          h.render(`
            <div class="flex flex-col h-full space-y-4">
              <!-- U1: File Info Bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 border border-surface-200">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.3ds model</span>
                <div class="ml-auto hidden sm:flex items-center gap-2">
                  <span class="px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full text-xs font-medium">${Math.round(totalFaces).toLocaleString()} polygons</span>
                </div>
              </div>

              <!-- Main Viewer Stage -->
              <div class="relative flex-1 min-h-[500px] bg-slate-950 rounded-2xl overflow-hidden border border-surface-200 shadow-inner group">
                <div id="three-canvas-container" class="w-full h-full cursor-move outline-none"></div>

                <!-- Overlay Controls -->
                <div class="absolute top-4 right-4 flex flex-col gap-2">
                  <div class="bg-white/90 backdrop-blur p-1 rounded-xl shadow-xl border border-surface-200 flex flex-col">
                    <button id="tool-reset" title="Reset View" class="p-2.5 hover:bg-surface-100 rounded-lg text-surface-600 transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                    </button>
                    <button id="tool-wire" title="Toggle Wireframe" class="p-2.5 hover:bg-surface-100 rounded-lg text-surface-600 transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13h16M12 4v16"/></svg>
                    </button>
                    <div class="h-px bg-surface-200 my-1 mx-2"></div>
                    <button id="tool-rotate" title="Auto Rotate" class="p-2.5 hover:bg-surface-100 rounded-lg text-surface-600 transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    </button>
                  </div>
                </div>

                <!-- Scene Data Overlay -->
                <div class="absolute bottom-4 left-4 pointer-events-none">
                  <div class="bg-black/40 backdrop-blur px-3 py-2 rounded-lg border border-white/10 font-mono text-[10px] text-white/90">
                    <div class="flex gap-4">
                      <span>VERTS: ${totalVerts.toLocaleString()}</span>
                      <span>FACES: ${totalFaces.toLocaleString()}</span>
                    </div>
                    <div class="mt-1 text-white/50">
                      BOX: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div class="absolute bottom-4 right-4 flex items-center gap-2">
                  <select id="env-theme" class="bg-white/90 backdrop-blur border border-surface-200 rounded-lg px-2 py-1.5 text-xs font-medium text-surface-700 shadow-lg cursor-pointer focus:ring-2 focus:ring-brand-500/20 outline-none">
                    <option value="dark">Vantablack</option>
                    <option value="studio">Studio Blue</option>
                    <option value="bright">Clean White</option>
                    <option value="dusk">Deep Purple</option>
                  </select>
                </div>
              </div>

              <!-- U10: Section Header with Count -->
              <div class="flex items-center justify-between mt-6 mb-3">
                <h3 class="font-semibold text-surface-800">Mesh Hierarchy</h3>
                <span class="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">${meshes.length} components</span>
              </div>

              <!-- U7: Table for Meshes -->
              <div class="overflow-x-auto rounded-xl border border-surface-200">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="bg-surface-50">
                      <th class="px-4 py-3 text-left font-semibold text-surface-700 border-b border-surface-200">Mesh Name</th>
                      <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Vertices</th>
                      <th class="px-4 py-3 text-right font-semibold text-surface-700 border-b border-surface-200">Polygons</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${meshes.slice(0, 100).map(m => `
                      <tr class="even:bg-surface-50/50 hover:bg-brand-50 transition-colors">
                        <td class="px-4 py-2 text-surface-700 border-b border-surface-100 font-medium">${escapeHtml(m.name)}</td>
                        <td class="px-4 py-2 text-right text-surface-600 border-b border-surface-100 font-mono text-xs">${m.verts.toLocaleString()}</td>
                        <td class="px-4 py-2 text-right text-surface-600 border-b border-surface-100 font-mono text-xs">${m.faces.toLocaleString()}</td>
                      </tr>
                    `).join('')}
                    ${meshes.length > 100 ? `
                      <tr>
                        <td colspan="3" class="px-4 py-3 text-center text-surface-400 italic border-b border-surface-100 bg-surface-50/20">
                          ... and ${meshes.length - 100} more components
                        </td>
                      </tr>
                    ` : ''}
                  </tbody>
                </table>
              </div>
            </div>
          `);

          const container = document.getElementById('three-canvas-container');
          if (!container) return;

          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          renderer.setSize(container.clientWidth, container.clientHeight);
          container.appendChild(renderer.domElement);

          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x020617);

          camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100000);
          
          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;

          const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
          scene.add(ambientLight);

          const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
          mainLight.position.set(100, 100, 100);
          scene.add(mainLight);

          const backLight = new THREE.DirectionalLight(0xdbeafe, 0.4);
          backLight.position.set(-100, 50, -100);
          scene.add(backLight);

          object.position.sub(center);
          scene.add(object);

          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const fov = camera.fov * (Math.PI / 180);
          let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
          cameraZ *= 2.2; 
          
          camera.position.set(cameraZ * 0.8, cameraZ * 0.5, cameraZ * 0.8);
          camera.lookAt(0, 0, 0);
          controls.update();

          const themes = {
            dark: { bg: 0x020617, amb: 0.6, main: 0.8, back: 0.4 },
            studio: { bg: 0x0f172a, amb: 0.8, main: 1.0, back: 0.6 },
            bright: { bg: 0xffffff, amb: 1.0, main: 1.2, back: 0.4 },
            dusk: { bg: 0x2e1065, amb: 0.4, main: 1.4, back: 1.0 }
          };

          const themeSelect = document.getElementById('env-theme');
          if (themeSelect) {
            themeSelect.onchange = (e) => {
              const t = themes[e.target.value] || themes.dark;
              scene.background = new THREE.Color(t.bg);
              ambientLight.intensity = t.amb;
              mainLight.intensity = t.main;
              backLight.intensity = t.back;
            };
          }

          let isWire = false;
          const wireBtn = document.getElementById('tool-wire');
          if (wireBtn) {
            wireBtn.onclick = () => {
              isWire = !isWire;
              object.traverse(n => {
                if (n.isMesh && n.material) {
                  const mats = Array.isArray(n.material) ? n.material : [n.material];
                  mats.forEach(m => m.wireframe = isWire);
                }
              });
              wireBtn.classList.toggle('bg-brand-50', isWire);
              wireBtn.classList.toggle('text-brand-600', isWire);
            };
          }

          const rotateBtn = document.getElementById('tool-rotate');
          if (rotateBtn) {
            rotateBtn.onclick = () => {
              controls.autoRotate = !controls.autoRotate;
              rotateBtn.classList.toggle('bg-brand-50', controls.autoRotate);
              rotateBtn.classList.toggle('text-brand-600', controls.autoRotate);
            };
          }

          const resetBtn = document.getElementById('tool-reset');
          if (resetBtn) {
            resetBtn.onclick = () => {
              camera.position.set(cameraZ * 0.8, cameraZ * 0.5, cameraZ * 0.8);
              controls.target.set(0, 0, 0);
              controls.reset();
            };
          }

          function _animate() {
            if (!container.isConnected) {
              cleanupThree();
              return;
            }
            animationId = requestAnimationFrame(_animate);
            controls.update();
            renderer.render(scene, camera);
          }
          _animate();

          resizeObserver = new ResizeObserver(() => {
            if (!container.clientWidth || !container.clientHeight || !renderer) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
          });
          resizeObserver.observe(container);
        }
      },
      onDestroy: function () {
        cleanupThree();
      },
      actions: [
        {
          label: '📋 Copy Metadata',
          id: 'copy-meta',
          onClick: function (h, btn) {
            if (!currentObject || !currentFile) return;
            const box = new THREE.Box3().setFromObject(currentObject);
            const size = box.getSize(new THREE.Vector3());
            let v = 0, f = 0, m = 0;
            currentObject.traverse(n => {
              if (n.isMesh) {
                m++;
                if (n.geometry.isBufferGeometry) {
                  const p = n.geometry.attributes.position;
                  if (p) {
                    v += p.count;
                    f += n.geometry.index ? n.geometry.index.count / 3 : p.count / 3;
                  }
                }
              }
            });

            const text = [
              `File: ${currentFile.name}`,
              `Size: ${formatSize(currentFile.size)}`,
              `Vertices: ${v.toLocaleString()}`,
              `Polygons: ${Math.round(f).toLocaleString()}`,
              `Components: ${m}`,
              `Bounding Box: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)} units`
            ].join('\n');
            
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download Original',
          id: 'download-3ds',
          onClick: function (h) {
            const file = h.getFile();
            h.download(file.name, h.getContent(), 'application/x-3ds');
          }
        }
      ],
      infoHtml: '<strong>Secure 3D Inspection:</strong> High-performance 3DS mesh parsing with hierarchical component breakdown and scene statistics. All rendering happens client-side.'
    });
  };
})();
