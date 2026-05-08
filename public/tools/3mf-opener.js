(function() {
  'use strict';

  /**
   * OmniOpener 3MF Viewer
   * A production-grade 3D manufacturing format viewer using Three.js and the OmniTool SDK.
   */

  window.initTool = function(toolConfig, mountEl) {
    let renderer, scene, camera, controls, animationId, resizeObserver;

    function cleanup() {
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
      camera = null;
      controls = null;
    }

    OmniTool.create(mountEl, toolConfig, {
      accept: '.3mf',
      binary: true,
      dropLabel: 'Drop a .3mf 3D model here',
      
      onInit: function(h) {
        return h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/3MFLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onDestroy: function() {
        cleanup();
      },

      onFile: function _onFile(file, content, h) {
        cleanup();

        // Check if dependencies are ready
        const LoaderClass = (typeof THREE !== 'undefined') ? (THREE.ThreeMFLoader || THREE.3MFLoader) : null;
        if (typeof THREE === 'undefined' || !LoaderClass || typeof JSZip === 'undefined' || typeof THREE.OrbitControls === 'undefined') {
          h.showLoading('Initializing 3D Engine...');
          setTimeout(function() { _onFile(file, content, h); }, 300);
          return;
        }

        // JSZip must be global for the loader
        window.JSZip = JSZip;
        h.showLoading('Parsing 3D Geometry...');

        try {
          const loader = new LoaderClass();
          const object = loader.parse(content);
          
          if (!object) throw new Error('Could not find valid 3D geometry in this 3MF file.');

          // Scene Stats
          let vertices = 0;
          let faces = 0;
          object.traverse(node => {
            if (node.isMesh) {
              const geo = node.geometry;
              if (geo.attributes && geo.attributes.position) {
                vertices += geo.attributes.position.count;
                faces += geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
              }
            }
          });

          const box = new THREE.Box3().setFromObject(object);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          h.setState('stats', { vertices, faces, size });

          h.render(`
            <div class="flex flex-col h-full space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-4 bg-surface-50 p-4 rounded-xl border border-surface-100 text-sm">
                <div class="flex gap-4">
                  <span class="text-surface-600"><strong>Faces:</strong> ${Math.round(faces).toLocaleString()}</span>
                  <span class="text-surface-600"><strong>Dimensions:</strong> ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} mm</span>
                </div>
                <div class="flex gap-2">
                  <button id="view-reset" class="px-3 py-1 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">Reset View</button>
                  <button id="toggle-wireframe" class="px-3 py-1 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors">Wireframe</button>
                </div>
              </div>
              
              <div id="three-container" class="relative flex-1 min-h-[500px] bg-slate-900 rounded-2xl overflow-hidden shadow-inner border border-surface-200">
                <div id="canvas-target" class="w-full h-full cursor-move"></div>
              </div>
            </div>
          `);

          const container = document.getElementById('canvas-target');
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

          scene.add(new THREE.AmbientLight(0xffffff, 0.6));
          const sun = new THREE.DirectionalLight(0xffffff, 1.0);
          sun.position.set(100, 200, 150);
          scene.add(sun);

          // Center model
          object.position.sub(center);
          scene.add(object);

          // Initial Camera Placement
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const dist = maxDim * 2;
          camera.position.set(dist, dist, dist);
          camera.lookAt(0, 0, 0);
          controls.update();

          // UI Interactivity
          let isWireframe = false;
          document.getElementById('toggle-wireframe').onclick = () => {
            isWireframe = !isWireframe;
            object.traverse(n => {
              if (n.isMesh && n.material) {
                const mats = Array.isArray(n.material) ? n.material : [n.material];
                mats.forEach(m => m.wireframe = isWireframe);
              }
            });
          };

          document.getElementById('view-reset').onclick = () => {
            camera.position.set(dist, dist, dist);
            controls.target.set(0, 0, 0);
            controls.update();
          };

          const animate = () => {
            if (!renderer) return;
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          };
          animate();

          resizeObserver = new ResizeObserver(() => {
            if (!container.clientWidth || !container.clientHeight) return;
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
          });
          resizeObserver.observe(container);

        } catch (err) {
          h.showError('3MF Parser Error', err.message || 'Failed to parse 3D model.');
          console.error('[3MF Viewer]', err);
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
              `Dimensions: ${stats.size.x.toFixed(2)} x ${stats.size.y.toFixed(2)} x ${stats.size.z.toFixed(2)} mm`
            ].join('\n');
            h.copyToClipboard(text, btn);
          }
        },
        {
          label: '📥 Download',
          id: 'download',
          onClick: function(h) {
            h.download(h.getFile().name, h.getContent());
          }
        }
      ]
    });
  };
})();
