(function() {
  'use strict';

  function formatSize(b) {
    return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
  }

  window.initTool = function(toolConfig, mountEl) {
    OmniTool.create(mountEl, toolConfig, {
      accept: '.glb,.gltf',
      dropLabel: 'Drop a .glb or .gltf file here',
      binary: true,
      onInit: function(helpers) {
        helpers.loadScript('https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.min.js');
        
        // Add import map to handle three.js modules dependency
        if (!document.querySelector('script[type="importmap"]')) {
          const map = document.createElement('script');
          map.type = 'importmap';
          map.textContent = JSON.stringify({
            imports: {
              "three": "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js"
            }
          });
          document.head.appendChild(map);
        }
      },
      onFile: function(file, content, helpers) {
        if (file.size > 20 * 1024 * 1024) {
          const proceed = confirm(`The file "${file.name}" is ${formatSize(file.size)}. Large 3D models may impact performance. Continue?`);
          if (!proceed) {
            helpers.reset();
            return;
          }
        }

        helpers.showLoading('Parsing 3D model...');

        // Wrap the async logic
        (async function() {
          try {
            // Ensure THREE is loaded
            if (typeof THREE === 'undefined') {
              await new Promise((resolve, reject) => {
                let attempts = 0;
                const check = () => {
                  if (typeof THREE !== 'undefined') resolve();
                  else if (attempts++ > 50) reject(new Error('Three.js failed to load'));
                  else setTimeout(check, 100);
                };
                check();
              });
            }

            // Load dependencies via dynamic import (requires the import map added in onInit)
            const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/loaders/GLTFLoader.js');
            const { OrbitControls } = await import('https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/controls/OrbitControls.js');

            helpers.showLoading('Rendering scene...');

            const infoHtml = `
              <div class="flex items-center gap-3 p-3 bg-surface-50 rounded-lg text-sm text-surface-600 mb-4">
                <span class="font-medium">${file.name}</span>
                <span class="text-surface-400">·</span>
                <span>${formatSize(file.size)}</span>
                <span class="text-surface-400">·</span>
                <span id="model-stats">Calculating stats...</span>
              </div>
              <div class="relative w-full h-[600px] bg-slate-900 rounded-xl overflow-hidden shadow-inner">
                <div id="three-container" class="w-full h-full"></div>
                <div class="absolute bottom-4 left-4 flex gap-2">
                  <button id="toggle-rotate" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg backdrop-blur-md transition-all border border-white/10">Pause Rotation</button>
                  <button id="reset-view" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg backdrop-blur-md transition-all border border-white/10">Reset View</button>
                </div>
                <div id="webgl-error" class="hidden absolute inset-0 flex items-center justify-center bg-slate-900 text-white p-8 text-center">
                  <div>
                    <p class="text-red-400 font-medium">WebGL Error</p>
                    <p class="text-sm opacity-70 mt-1">Your browser may not support WebGL or it is disabled.</p>
                  </div>
                </div>
              </div>
            `;
            
            helpers.render(infoHtml);

            const container = document.getElementById('three-container');
            const statsEl = document.getElementById('model-stats');
            
            // Setup Three.js
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0f172a); // slate-900

            const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
            camera.position.set(5, 5, 5);

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.shadowMap.enabled = true;
            container.appendChild(renderer.domElement);

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
            directionalLight.position.set(5, 10, 7.5);
            directionalLight.castShadow = true;
            scene.add(directionalLight);

            // Controls
            const controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.autoRotate = true;
            controls.autoRotateSpeed = 2.0;

            // Loader
            const loader = new GLTFLoader();
            loader.parse(content, '', (gltf) => {
              const model = gltf.scene;
              
              // Center and scale model
              const box = new THREE.Box3().setFromObject(model);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              
              model.position.x += (model.position.x - center.x);
              model.position.y += (model.position.y - center.y);
              model.position.z += (model.position.z - center.z);
              
              const maxDim = Math.max(size.x, size.y, size.z);
              const scale = 5 / maxDim;
              model.scale.setScalar(scale);
              
              scene.add(model);

              // Calculate stats
              let vertices = 0;
              let faces = 0;
              model.traverse((node) => {
                if (node.isMesh) {
                  const geometry = node.geometry;
                  vertices += geometry.attributes.position.count;
                  if (geometry.index) {
                    faces += geometry.index.count / 3;
                  } else {
                    faces += geometry.attributes.position.count / 3;
                  }
                }
              });

              statsEl.textContent = `${vertices.toLocaleString()} vertices · ${Math.floor(faces).toLocaleString()} faces`;
              helpers.setState('modelStats', statsEl.textContent);

              // Animation loop
              let animationId;
              function animate() {
                // Stop the loop if the tool has been unmounted or reset
                if (!document.getElementById('three-container')) {
                  cancelAnimationFrame(animationId);
                  renderer.dispose();
                  return;
                }
                
                animationId = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
              }
              animate();

              // UI Interactions
              const rotateBtn = document.getElementById('toggle-rotate');
              rotateBtn.addEventListener('click', () => {
                controls.autoRotate = !controls.autoRotate;
                rotateBtn.textContent = controls.autoRotate ? 'Pause Rotation' : 'Resume Rotation';
              });

              const resetBtn = document.getElementById('reset-view');
              resetBtn.addEventListener('click', () => {
                controls.reset();
              });

              // Resize handler
              const resizeObserver = new ResizeObserver(() => {
                if (container.clientWidth > 0 && container.clientHeight > 0) {
                  camera.aspect = container.clientWidth / container.clientHeight;
                  camera.updateProjectionMatrix();
                  renderer.setSize(container.clientWidth, container.clientHeight);
                }
              });
              resizeObserver.observe(container);

              // Cleanup on tool destroy
              helpers.setState('cleanup', () => {
                cancelAnimationFrame(animationId);
                resizeObserver.disconnect();
                renderer.dispose();
                scene.clear();
              });

            }, (error) => {
              helpers.showError('Failed to parse 3D model', error.message);
            });

          } catch (err) {
            helpers.showError('Error initializing 3D viewer', err.message);
            console.error(err);
          }
        })();
      },
      actions: [
        {
          label: '📋 Copy Stats',
          id: 'copy-stats',
          onClick: function(helpers, btn) {
            const stats = helpers.getState().modelStats;
            if (stats) {
              helpers.copyToClipboard(`Model Stats for ${helpers.getFile().name}:\n${stats}`, btn);
            }
          }
        },
        {
          label: '📥 Download Original',
          id: 'dl',
          onClick: function(helpers) {
            helpers.download(helpers.getFile().name, helpers.getContent());
          }
        }
      ],
      infoHtml: '<strong>Privacy:</strong> Your 3D models are processed entirely in your browser using Three.js. No data is ever uploaded to our servers.',
      onDestroy: function(helpers) {
        const cleanup = helpers.getState().cleanup;
        if (cleanup) cleanup();
      }
    });
  };
})();
