(function () {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.initTool = function (toolConfig, mountEl) {
    let animationId, renderer, scene, camera, controls;

    OmniTool.create(mountEl, toolConfig, {
      accept: '.3ds',
      dropLabel: 'Drop a .3ds file here',
      binary: true,
      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js', () => {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/TDSLoader.js', () => {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js');
          });
        });
      },
      onFile: function (file, content, h) {
        if (file.size > 20 * 1024 * 1024) {
          h.render(`
            <div class="p-12 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-600 text-2xl mb-4">⚠️</div>
              <p class="text-surface-900 font-bold text-lg mb-2">Large 3D Model</p>
              <p class="text-sm text-surface-500 mb-8 mx-auto max-w-sm">This file is ${formatSize(file.size)}. Parsing large 3DS files directly in the browser may cause performance issues or temporary hangs.</p>
              <button id="btn-proceed" class="px-8 py-3 bg-brand-600 text-white rounded-xl font-bold shadow-xl shadow-brand-500/20 hover:bg-brand-700 hover:-translate-y-0.5 transition-all">Proceed with Parsing</button>
            </div>
          `);
          document.getElementById('btn-proceed').onclick = () => {
            processFile(file, content, h);
          };
          return;
        }

        processFile(file, content, h);
      },
      actions: [
        {
          label: '📋 Copy Stats',
          id: 'copy',
          onClick: function (h, btn) {
            const stats = h.getState().stats;
            if (stats) {
              const text = `Model: ${h.getFile().name}\nVertices: ${stats.vertices.toLocaleString()}\nFaces: ${stats.faces.toLocaleString()}\nDimensions: ${stats.size.x.toFixed(2)} x ${stats.size.y.toFixed(2)} x ${stats.size.z.toFixed(2)}`;
              h.copyToClipboard(text, btn);
            }
          }
        },
        {
          label: '📥 Download',
          id: 'dl',
          onClick: function (h) {
            h.download(h.getFile().name, h.getContent(), 'application/x-3ds');
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> 100% client-side. Your 3D models are processed locally and never leave your device.'
    });

    function processFile(file, content, h) {
      if (typeof THREE === 'undefined' || typeof THREE.TDSLoader === 'undefined') {
        h.showLoading('Initializing 3D engine...');
        setTimeout(() => processFile(file, content, h), 500);
        return;
      }

      h.showLoading('Parsing 3DS model...');
      try {
        const loader = new THREE.TDSLoader();
        const object = loader.parse(content);
        if (!object) throw new Error('Parsed object is null');
        renderViewer(object, file, h);
      } catch (err) {
        h.showError('Could not parse 3DS file', err.message || 'The file format might be invalid or corrupted.');
      }
    }

    function renderViewer(object, file, h) {
      // Calculate Stats
      let vertices = 0;
      let faces = 0;
      object.traverse(node => {
        if (node.isMesh) {
          const geo = node.geometry;
          if (geo.attributes && geo.attributes.position) {
            vertices += geo.attributes.position.count;
            if (geo.index) faces += geo.index.count / 3;
            else faces += geo.attributes.position.count / 3;
          }
        }
      });

      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      h.setState('stats', { vertices, faces, size });

      h.render(`
        <div class="flex flex-col h-[85vh] font-sans">
          <!-- File Info Bar -->
          <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-200">
            <span class="font-bold text-surface-900 truncate">${escapeHtml(file.name)}</span>
            <span class="text-surface-400">·</span>
            <span>${formatSize(file.size)}</span>
            <div class="ml-auto flex items-center gap-4">
              <span class="text-xs font-mono bg-brand-50 text-brand-600 px-2 py-1 rounded-md border border-brand-100">${Math.round(vertices).toLocaleString()} Vertices</span>
            </div>
          </div>

          <!-- Scene Container -->
          <div class="relative flex-1 bg-[#0f172a] rounded-2xl overflow-hidden border border-surface-200 shadow-2xl">
            <div id="three-mount" class="w-full h-full cursor-move"></div>

            <!-- UI Overlay -->
            <div class="absolute top-4 right-4 w-52 bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl border border-surface-200 p-5 space-y-5">
              <section>
                <label class="block text-[10px] font-bold text-surface-400 uppercase tracking-wider mb-2">Environment</label>
                <select id="env-select" class="w-full text-xs p-2 bg-surface-50 border border-surface-200 rounded-lg outline-none font-medium text-surface-700">
                  <option value="studio">Studio Blue</option>
                  <option value="dark">Total Dark</option>
                  <option value="sunset">Warm Sunset</option>
                </select>
              </section>

              <section class="space-y-3">
                <label class="flex items-center justify-between cursor-pointer group">
                  <span class="text-[10px] font-bold text-surface-500 uppercase group-hover:text-brand-600 transition-colors">Wireframe</span>
                  <input type="checkbox" id="wire-check" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                </label>
                <label class="flex items-center justify-between cursor-pointer group">
                  <span class="text-[10px] font-bold text-surface-500 uppercase group-hover:text-brand-600 transition-colors">Auto-Rotate</span>
                  <input type="checkbox" id="rotate-check" class="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500">
                </label>
              </section>

              <button id="reset-cam" class="w-full py-2.5 bg-brand-600 text-white text-[10px] font-bold rounded-xl hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-500/30 transition-all active:scale-95 uppercase tracking-widest">Reset View</button>
            </div>

            <!-- Bounding Box Info -->
            <div class="absolute bottom-4 left-4 px-4 py-2 bg-black/60 backdrop-blur rounded-xl border border-white/10 text-[10px] text-white/90 font-medium">
              Bounds: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}
            </div>
          </div>
        </div>
      `);

      const mount = document.getElementById('three-mount');
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);

      camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 10000);
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
      mainLight.position.set(50, 100, 70);
      scene.add(mainLight);

      const rimLight = new THREE.PointLight(0x4f46e5, 0.5);
      rimLight.position.set(-50, -20, -50);
      scene.add(rimLight);

      // Model Positioning
      object.position.sub(center);
      scene.add(object);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const camPos = maxDim * 1.8;
      camera.position.set(camPos, camPos, camPos);
      camera.lookAt(0, 0, 0);
      controls.update();

      // UI Events
      const envs = {
        studio: { bg: 0x0f172a, ambient: 0.7, main: 1.0 },
        dark: { bg: 0x020617, ambient: 0.2, main: 0.4 },
        sunset: { bg: 0x451a03, ambient: 0.8, main: 1.5 }
      };

      document.getElementById('env-select').onchange = (e) => {
        const env = envs[e.target.value];
        scene.background = new THREE.Color(env.bg);
        ambientLight.intensity = env.ambient;
        mainLight.intensity = env.main;
      };

      document.getElementById('wire-check').onchange = (e) => {
        object.traverse(n => { if (n.isMesh) n.material.wireframe = e.target.checked; });
      };

      document.getElementById('rotate-check').onchange = (e) => {
        controls.autoRotate = e.target.checked;
      };

      document.getElementById('reset-cam').onclick = () => {
        camera.position.set(camPos, camPos, camPos);
        controls.target.set(0, 0, 0);
        controls.reset();
      };

      function animate() {
        if (!mount.isConnected) {
          renderer.dispose();
          if (animationId) cancelAnimationFrame(animationId);
          return;
        }
        animationId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      const resizeObserver = new ResizeObserver(() => {
        if (!mount.clientWidth || !mount.clientHeight) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight);
      });
      resizeObserver.observe(mount);
    }
  };
})();
