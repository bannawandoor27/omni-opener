(function() {
  'use strict';

  /**
   * OmniOpener 3MF Viewer
   * A production-perfect 3D manufacturing format viewer using Three.js
   */

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

  window.initTool = function(toolConfig, mountEl) {
    let renderer, scene, camera, controls, animationId, resizeObserver;
    let currentObject = null;

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
        if (renderer.domElement && renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
        renderer = null;
      }
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
        scene = null;
      }
      currentObject = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.3mf',
      dropLabel: 'Drop a .3mf 3D model',
      binary: true,
      onInit: function(h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => {
            // JSZip must be global for 3MFLoader
            window.JSZip = window.JSZip || JSZip;
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/3MFLoader.js', () => {
              h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
            });
          });
        });
      },
      onDestroy: function() {
        cleanupThree();
      },
      onFile: function _onFile(file, content, h) {
        cleanupThree();

        // Check if dependencies are loaded
        if (typeof THREE === 'undefined' || typeof THREE.ThreeMFLoader === 'undefined' || typeof JSZip === 'undefined') {
          h.showLoading('Initializing 3D engine...');
          setTimeout(function() { _onFile(file, content, h); }, 300);
          return;
        }

        // Large file protection
        if (file.size > 50 * 1024 * 1024 && !h.getState().confirmedLargeFile) {
          h.render(`
            <div class="flex flex-col items-center justify-center p-12 text-center h-full">
              <div class="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
                <svg class="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 class="text-xl font-bold text-surface-900 mb-2">Large 3D Model</h2>
              <p class="text-surface-500 mb-8 max-w-sm">
                This file is ${formatSize(file.size)}. Parsing and rendering complex 3D geometry may slow down your browser.
              </p>
              <button id="btn-proceed" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-semibold shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all transform hover:-translate-y-0.5 active:translate-y-0">
                Proceed Anyway
              </button>
            </div>
          `);
          document.getElementById('btn-proceed').onclick = () => {
            h.setState('confirmedLargeFile', true);
            _onFile(file, content, h);
          };
          return;
        }

        h.showLoading('Parsing 3D Manufacturing Format...');

        try {
          const loader = new THREE.ThreeMFLoader();
          const object = loader.parse(content);
          
          if (!object) {
            throw new Error('The 3MF file appears to be empty or contains no valid 3D geometry.');
          }

          // Stats calculation
          let vertices = 0;
          let faces = 0;
          let meshCount = 0;

          object.traverse(node => {
            if (node.isMesh) {
              meshCount++;
              const geo = node.geometry;
              if (geo.attributes && geo.attributes.position) {
                vertices += geo.attributes.position.count;
                if (geo.index) {
                  faces += geo.index.count / 3;
                } else {
                  faces += geo.attributes.position.count / 3;
                }
              }
            }
          });

          if (meshCount === 0) {
            h.render(`
              <div class="p-12 text-center">
                <p class="text-surface-500 italic">No meshes found in this 3MF file.</p>
              </div>
            `);
            return;
          }

          const box = new THREE.Box3().setFromObject(object);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          h.setState('stats', { vertices, faces, size, meshCount });
          currentObject = object;

          // Render UI
          h.render(`
            <div class="flex flex-col h-full max-h-[90vh]">
              <!-- U1. File info bar -->
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
                <span class="font-semibold text-surface-800">${escapeHtml(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="text-surface-500">.3mf file</span>
                <div class="ml-auto hidden sm:flex items-center gap-2">
                  <span class="px-2 py-0.5 bg-brand-50 text-brand-700 text-[10px] font-bold uppercase rounded-md border border-brand-100">
                    ${Math.round(faces).toLocaleString()} Faces
                  </span>
                </div>
              </div>

              <div class="relative flex-1 min-h-[500px] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-surface-200">
                <div id="three-container" class="w-full h-full cursor-move"></div>
                
                <!-- Overlay Controls -->
                <div class="absolute top-4 left-4 flex flex-col gap-2">
                   <div class="bg-black/40 backdrop-blur-md p-1 rounded-lg flex items-center border border-white/10">
                      <button id="view-reset" class="p-2 text-white/80 hover:text-white transition-colors" title="Reset Camera">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </button>
                      <div class="w-px h-4 bg-white/10 mx-1"></div>
                      <button id="toggle-wireframe" class="p-2 text-white/80 hover:text-white transition-colors" title="Toggle Wireframe">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                      </button>
                      <button id="toggle-rotate" class="p-2 text-white/80 hover:text-white transition-colors" title="Auto-Rotate">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </button>
                   </div>
                </div>

                <!-- Scene Info -->
                <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
                  <div class="bg-black/60 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 text-[11px] text-white/90 font-mono space-y-0.5">
                    <div class="opacity-60 uppercase text-[9px] font-bold tracking-tighter">Dimensions</div>
                    <div>X: ${size.x.toFixed(2)}mm</div>
                    <div>Y: ${size.y.toFixed(2)}mm</div>
                    <div>Z: ${size.z.toFixed(2)}mm</div>
                  </div>

                  <div class="flex flex-col gap-2 pointer-events-auto">
                    <select id="theme-select" class="bg-black/60 backdrop-blur-md text-white text-[11px] px-3 py-1.5 rounded-lg border border-white/10 outline-none hover:bg-black/80 transition-all cursor-pointer">
                      <option value="slate">Deep Slate</option>
                      <option value="studio">Studio Light</option>
                      <option value="blueprint">Blueprint</option>
                      <option value="ghost">Ghost Mode</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- U10. Section headers with counts -->
              <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="bg-surface-50 p-4 rounded-2xl border border-surface-100">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Total Vertices</div>
                  <div class="text-xl font-bold text-surface-900">${Math.round(vertices).toLocaleString()}</div>
                </div>
                <div class="bg-surface-50 p-4 rounded-2xl border border-surface-100">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Total Faces</div>
                  <div class="text-xl font-bold text-surface-900">${Math.round(faces).toLocaleString()}</div>
                </div>
                <div class="bg-surface-50 p-4 rounded-2xl border border-surface-100">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Meshes</div>
                  <div class="text-xl font-bold text-surface-900">${meshCount}</div>
                </div>
                <div class="bg-surface-50 p-4 rounded-2xl border border-surface-100">
                  <div class="text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-1">Units</div>
                  <div class="text-xl font-bold text-surface-900">mm</div>
                </div>
              </div>
            </div>
          `);

          // Initialize Three.js
          const container = document.getElementById('three-container');
          renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          renderer.setSize(container.clientWidth, container.clientHeight);
          renderer.outputEncoding = THREE.sRGBEncoding;
          container.appendChild(renderer.domElement);

          scene = new THREE.Scene();
          scene.background = new THREE.Color(0x0f172a);

          camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);
          
          controls = new THREE.OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;

          // Lights
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
          scene.add(ambientLight);

          const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
          mainLight.position.set(100, 200, 150);
          scene.add(mainLight);

          const fillLight = new THREE.DirectionalLight(0x6366f1, 0.4);
          fillLight.position.set(-100, -100, -100);
          scene.add(fillLight);

          // Position model
          object.position.sub(center);
          scene.add(object);

          // Camera Positioning
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const camDist = maxDim * 2;
          camera.position.set(camDist, camDist, camDist);
          camera.lookAt(0, 0, 0);
          controls.update();

          // Event Listeners
          let isWireframe = false;
          document.getElementById('toggle-wireframe').onclick = () => {
            isWireframe = !isWireframe;
            object.traverse(n => {
              if (n.isMesh && n.material) {
                if (Array.isArray(n.material)) {
                  n.material.forEach(m => m.wireframe = isWireframe);
                } else {
                  n.material.wireframe = isWireframe;
                }
              }
            });
          };

          document.getElementById('toggle-rotate').onclick = (e) => {
            controls.autoRotate = !controls.autoRotate;
            e.currentTarget.classList.toggle('bg-brand-500/20', controls.autoRotate);
            e.currentTarget.classList.toggle('text-brand-400', controls.autoRotate);
          };

          document.getElementById('view-reset').onclick = () => {
            camera.position.set(camDist, camDist, camDist);
            controls.target.set(0, 0, 0);
            controls.reset();
          };

          const themes = {
            slate: { bg: 0x0f172a, ambient: 0.6, main: 1.0, fill: 0.4 },
            studio: { bg: 0xf8fafc, ambient: 0.8, main: 1.2, fill: 0.2 },
            blueprint: { bg: 0x1e3a8a, ambient: 0.5, main: 0.8, fill: 0.6 },
            ghost: { bg: 0x000000, ambient: 0.2, main: 0.5, fill: 0.3 }
          };

          document.getElementById('theme-select').onchange = (e) => {
            const t = themes[e.target.value];
            scene.background = new THREE.Color(t.bg);
            ambientLight.intensity = t.ambient;
            mainLight.intensity = t.main;
            fillLight.intensity = t.fill;
          };

          // Animation Loop
          const animate = () => {
            if (!container || !container.isConnected) return;
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          };
          animate();

          // Resize Handler
          resizeObserver = new ResizeObserver(() => {
            if (!container.clientWidth || !container.clientHeight) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
          });
          resizeObserver.observe(container);

        } catch (err) {
          h.showError('3MF Viewer Error', 'Failed to parse the 3D model. ' + (err.message || 'The file might be corrupted or incompatible.'));
          console.error('[3MF]', err);
        }
      },
      actions: [
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function(h, btn) {
            const stats = h.getState().stats;
            if (!stats) return;
            const text = [
              `File: ${h.getFile().name}`,
              `Vertices: ${Math.round(stats.vertices).toLocaleString()}`,
              `Faces: ${Math.round(stats.faces).toLocaleString()}`,
              `Meshes: ${stats.meshCount}`,
              `Bounds: ${stats.size.x.toFixed(2)} x ${stats.size.y.toFixed(2)} x ${stats.size.z.toFixed(2)} mm`
            ].join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function(h) {
            h.download(h.getFile().name, h.getContent(), 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml');
          }
        }
      ]
    });
  };
})();
