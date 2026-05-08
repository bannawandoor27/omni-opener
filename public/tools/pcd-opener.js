(function () {
  'use strict';

  window.initTool = function (toolConfig, mountEl) {
    let scene, camera, renderer, controls, points, animationId;
    let currentFile = null;

    OmniTool.create(mountEl, toolConfig, {
      binary: true,
      accept: '.pcd',
      dropLabel: 'Drop a .pcd file here',
      infoHtml: '<strong>Point Cloud Viewer:</strong> Renders .pcd files (ASCII or Binary) using Three.js. Supports zoom, pan, and rotate.',

      actions: [
        {
          label: '📸 Save Image',
          id: 'screenshot',
          onClick: function (h) {
            if (!renderer || !scene || !camera) return;
            h.showLoading('Generating image...');
            renderer.render(scene, camera);
            renderer.domElement.toBlob(function (blob) {
              h.hideLoading();
              if (blob) {
                h.download((currentFile ? currentFile.name.replace(/\.[^/.]+$/, "") : 'pointcloud') + '.png', blob, 'image/png');
              } else {
                h.showError('Capture Failed', 'Could not generate image blob.');
              }
            }, 'image/png');
          }
        },
        {
          label: '📊 Copy Stats',
          id: 'copy-stats',
          onClick: function (h, btn) {
            if (!points || !points.geometry) return;
            const attr = points.geometry.attributes;
            const count = attr.position.count;
            const box = new THREE.Box3().setFromObject(points);
            const size = box.getSize(new THREE.Vector3());
            const stats = [
              `File: ${currentFile?.name || 'Unknown'}`,
              `Points: ${count.toLocaleString()}`,
              `Bounds: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`,
              `Fields: ${Object.keys(attr).join(', ')}`
            ].join('\n');
            h.copyToClipboard(stats, btn);
          }
        },
        {
          label: '➕ Larger',
          id: 'size-up',
          onClick: function () {
            if (points?.material) {
              points.material.size *= 1.25;
              points.material.needsUpdate = true;
            }
          }
        },
        {
          label: '➖ Smaller',
          id: 'size-down',
          onClick: function () {
            if (points?.material) {
              points.material.size /= 1.25;
              points.material.needsUpdate = true;
            }
          }
        },
        {
          label: '🎯 Reset View',
          id: 'reset',
          onClick: function () {
            controls?.reset();
          }
        }
      ],

      onInit: function (h) {
        h.loadScripts([
          'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/PCDLoader.js',
          'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'
        ]);
      },

      onFile: function _onFile(file, content, h) {
        currentFile = file;
        h.showLoading('Initializing 3D Engine...');

        const checkScripts = () => {
          if (typeof THREE !== 'undefined' && THREE.PCDLoader && THREE.OrbitControls) {
            renderCloud();
          } else {
            setTimeout(checkScripts, 100);
          }
        };

        const renderCloud = () => {
          try {
            h.showLoading('Parsing point cloud data...');
            const loader = new THREE.PCDLoader();
            
            // PCDLoader.parse handles both ArrayBuffer and String
            const mesh = loader.parse(content);
            if (!mesh || !mesh.geometry) {
              throw new Error('Failed to parse PCD geometry.');
            }

            const count = mesh.geometry.attributes.position.count;
            if (count === 0) {
              h.showError('Empty File', 'This PCD file contains no points.');
              return;
            }

            // UI Header
            const infoBar = `
              <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-50 rounded-xl text-sm text-surface-600 mb-4 border border-surface-100">
                <span class="font-semibold text-surface-800">${h.escape(file.name)}</span>
                <span class="text-surface-300">|</span>
                <span>${h.formatSize(file.size)}</span>
                <span class="text-surface-300">|</span>
                <span class="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full text-xs font-medium">${count.toLocaleString()} points</span>
              </div>
              <div id="pcd-container" class="relative group rounded-2xl overflow-hidden border border-surface-200 bg-black shadow-inner" style="height: 600px;">
                <div id="pcd-canvas-target" class="w-full h-full"></div>
                <div class="absolute bottom-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div class="bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded border border-white/10 uppercase tracking-widest">
                    LMB: Rotate | RMB: Pan | Scroll: Zoom
                  </div>
                </div>
              </div>
            `;

            h.render(infoBar);
            const mountPoint = document.getElementById('pcd-canvas-target');

            // Setup Scene
            if (!renderer) {
              scene = new THREE.Scene();
              scene.background = new THREE.Color(0x0c0c0e);

              camera = new THREE.PerspectiveCamera(45, mountPoint.clientWidth / mountPoint.clientHeight, 0.1, 10000);
              
              renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
              renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
              renderer.setSize(mountPoint.clientWidth, mountPoint.clientHeight);
              
              controls = new THREE.OrbitControls(camera, renderer.domElement);
              controls.enableDamping = true;
              controls.dampingFactor = 0.05;

              const animate = () => {
                animationId = requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
              };
              animate();
            }

            // Cleanup previous points
            if (points) {
              scene.remove(points);
              points.geometry.dispose();
              points.material.dispose();
            }

            points = mesh;
            
            // Material styling
            if (!points.material.vertexColors) {
              points.material.color.setHex(0x3b82f6); // Brand blue
            }
            points.material.size = 0.005;
            points.material.sizeAttenuation = true;
            points.material.transparent = true;
            points.material.opacity = 0.9;
            
            scene.add(points);

            // Center and Scale
            const box = new THREE.Box3().setFromObject(points);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;

            points.position.set(-center.x, -center.y, -center.z);

            camera.position.set(maxDim * 1.2, maxDim * 1.2, maxDim * 1.2);
            camera.lookAt(0, 0, 0);
            camera.near = maxDim / 1000;
            camera.far = maxDim * 100;
            camera.updateProjectionMatrix();

            controls.reset();
            controls.update();

            mountPoint.appendChild(renderer.domElement);

            const onResize = () => {
              const container = document.getElementById('pcd-container');
              if (!container || !renderer) return;
              const w = container.clientWidth;
              const h = container.clientHeight;
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
              renderer.setSize(w, h);
            };

            window.removeEventListener('resize', onResize);
            window.addEventListener('resize', onResize);
            onResize();
            
            h.hideLoading();
          } catch (err) {
            console.error(err);
            h.showError('Visualization Error', 'Could not render point cloud: ' + err.message);
          }
        };

        checkScripts();
      },

      onDestroy: function () {
        if (animationId) cancelAnimationFrame(animationId);
        if (points) {
          points.geometry?.dispose();
          points.material?.dispose();
        }
        if (renderer) {
          renderer.dispose();
          renderer.forceContextLoss?.();
          renderer.domElement?.remove();
          renderer = null;
        }
        scene = null;
        camera = null;
        controls = null;
        currentFile = null;
      }
    });
  };
})();
