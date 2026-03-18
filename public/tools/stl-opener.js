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
      accept: '.stl',
      binary: true,
      dropLabel: 'Drop an STL file here',
      infoHtml: '<strong>STL Viewer:</strong> This tool renders 3D STL files (ASCII or Binary) using WebGL. <strong>Converter:</strong> Supports exporting to OBJ format. Everything is processed locally in your browser.',

      actions: [
        {
          label: '🌓 Wireframe',
          id: 'wireframe',
          onClick: function (h, btn) {
            wireframe = !wireframe;
            if (mesh) mesh.material.wireframe = wireframe;
            btn.style.backgroundColor = wireframe ? 'rgb(239 246 255)' : '';
            btn.style.borderColor = wireframe ? 'rgb(59 130 246)' : '';
            btn.style.color = wireframe ? 'rgb(29 78 216)' : '';
          }
        },
        {
          label: '🔄 Auto-Rotate',
          id: 'rotate',
          onClick: function (h, btn) {
            autoRotate = !autoRotate;
            btn.style.backgroundColor = autoRotate ? 'rgb(239 246 255)' : '';
            btn.style.borderColor = autoRotate ? 'rgb(59 130 246)' : '';
            btn.style.color = autoRotate ? 'rgb(29 78 216)' : '';
          }
        },
        {
          label: '📷 Snapshot',
          id: 'snap',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              h.download('stl-snapshot.png', blob, 'image/png');
            });
          }
        },
        {
          label: '📤 Export OBJ',
          id: 'export',
          onClick: function (h) {
            if (!window.THREE || !THREE.OBJExporter) {
              h.showError('Exporter not loaded', 'The OBJ exporter is still loading. Please try again.');
              return;
            }
            if (mesh) {
              const exporter = new THREE.OBJExporter();
              const result = exporter.parse(scene);
              h.download('model.obj', result, 'text/plain');
            }
          }
        }
      ],

      onInit: function (h) {
        h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js', function () {
          h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/loaders/STLLoader.js', function () {
            h.loadScript('https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js', function () {
              h.loadScript('https://cdn.jsdelivr.net/npm/three@0.149.0/examples/js/exporters/OBJExporter.js');
            });
          });
        });
      },

      onFile: async function (file, content, h) {
        h.showLoading('Initializing 3D engine...');

        // Ensure dependencies are loaded
        const checkDeps = () => {
          return new Promise((resolve) => {
            const interval = setInterval(() => {
              if (window.THREE && THREE.STLLoader && THREE.OrbitControls && THREE.OBJExporter) {
                clearInterval(interval);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(interval);
              resolve();
            }, 5000);
          });
        };

        await checkDeps();

        if (!window.THREE || !THREE.STLLoader) {
          h.showError('Could not load 3D engine', 'Please check your internet connection and try again.');
          return;
        }

        h.showLoading('Parsing STL geometry...');

        try {
          if (!content || content.byteLength === 0) {
            h.render(`
              <div class="flex flex-col items-center justify-center p-12 text-center bg-surface-50 rounded-2xl border-2 border-dashed border-surface-200">
                <div class="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4 text-surface-400">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                </div>
                <h3 class="text-lg font-semibold text-surface-900 mb-1">Empty STL File</h3>
                <p class="text-surface-500 max-w-xs">This file contains no 3D geometry data. Please try another file.</p>
              </div>
            `);
            return;
          }

          const loader = new THREE.STLLoader();
          const geometry = loader.parse(content);
          
          if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
            throw new Error('No geometry found in file');
          }

          const stats = {
            vertices: geometry.attributes.position.count,
            faces: geometry.attributes.position.count / 3,
            size: formatBytes(file.size)
          };

          h.render(`
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4">
              <span class="font-semibold text-surface-800">${file.name}</span>
              <span class="text-surface-300">|</span>
              <span>${stats.size}</span>
              <span class="text-surface-300">|</span>
              <span class="text-surface-500">.stl file</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <div class="text-xs text-surface-500 uppercase tracking-wider font-semibold mb-1">Vertices</div>
                <div class="text-lg font-bold text-surface-900">${stats.vertices.toLocaleString()}</div>
              </div>
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <div class="text-xs text-surface-500 uppercase tracking-wider font-semibold mb-1">Triangles</div>
                <div class="text-lg font-bold text-surface-900">${stats.faces.toLocaleString()}</div>
              </div>
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <div class="text-xs text-surface-500 uppercase tracking-wider font-semibold mb-1">Type</div>
                <div class="text-lg font-bold text-surface-900">${geometry.index ? 'Indexed' : 'Direct'}</div>
              </div>
              <div class="rounded-xl border border-surface-200 p-4 bg-white shadow-sm">
                <div class="text-xs text-surface-500 uppercase tracking-wider font-semibold mb-1">Status</div>
                <div class="text-lg font-bold text-green-600">Ready</div>
              </div>
            </div>

            <div id="stl-viewer-container" class="relative group rounded-2xl overflow-hidden border border-surface-200 bg-surface-50 shadow-inner" style="height: 600px;">
              <div id="stl-canvas-mount" class="w-full h-full cursor-move"></div>
              <div class="absolute bottom-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="px-3 py-1.5 bg-black/60 backdrop-blur text-white text-[10px] rounded-lg uppercase tracking-widest font-bold">
                  Hold Left Click to Rotate • Right Click to Pan • Scroll to Zoom
                </div>
              </div>
            </div>
          `);

          const mountEl = document.getElementById('stl-canvas-mount');
          const container = document.getElementById('stl-viewer-container');
          
          initScene(mountEl, container, geometry);
          
        } catch (err) {
          console.error(err);
          h.showError('Could not open STL file', 'The file may be corrupted or in an unsupported format. Error: ' + err.message);
        }
      }
    });
  };

  function initScene(mount, container, geometry) {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 10000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-1, -1, -1);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(0, 100, 0);
    scene.add(pointLight);

    // Mesh
    const material = new THREE.MeshPhongMaterial({ 
      color: 0x4f46e5, 
      specular: 0x111111, 
      shininess: 30,
      wireframe: wireframe
    });
    
    mesh = new THREE.Mesh(geometry, material);

    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    mesh.position.set(-center.x, -center.y, -center.z);
    scene.add(mesh);

    // Camera setup
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 2.5; // Zoom out a bit
    camera.position.set(cameraZ, cameraZ, cameraZ);
    camera.lookAt(0, 0, 0);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;

    function animate() {
      if (!document.getElementById('stl-canvas-mount')) return;
      animationId = requestAnimationFrame(animate);
      
      if (controls) controls.update();
      if (autoRotate && mesh) mesh.rotation.y += 0.01;
      
      renderer.render(scene, camera);
    }
    
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (mount.clientWidth === 0 || mount.clientHeight === 0) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    });
    resizeObserver.observe(mount);
    
    // Cleanup on remove
    const cleanupInterval = setInterval(() => {
      if (!document.getElementById('stl-canvas-mount')) {
        clearInterval(cleanupInterval);
        cancelAnimationFrame(animationId);
        if (renderer) renderer.dispose();
        if (geometry) geometry.dispose();
        if (material) material.dispose();
        resizeObserver.disconnect();
      }
    }, 1000);
  }
})();
